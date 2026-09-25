// 契约:客户端「构造的出牌 params」必须被引擎接受。
//
// 浏览器 usePlayInteraction 与无头枚举同源使用 buildPlayParams(gameViewHelpers)构造 params:
//   · 普通牌(杀/决斗/技能代价牌…非延时锦囊)→ { cardId, targets: [idx] }
//   · 延时锦囊 → { cardId, target: idx }
// 引擎各技能的 use validate 必须接受同一形状。回归:断粮/界断粮/审时/驱虎 的 validate
// 只读 params.target,而它们的代价牌通常是黑色基本牌/装备牌/任意手牌 → 客户端发的是
// targets → 恒拒「需要选择目标」,这些技能在浏览器与 AI 客户端整类不可用
// (只有手写 params.target 的技能测试能过)。
//
// 本文件是 transform-action-accepted.test.ts 的姊妹:那里锁转化技的影子卡/主 action 契约,
// 这里锁「出牌 params 形状」契约 —— 用真实技能声明 + buildPlayParams 构造消息再 dispatch。
import { describe, it, expect, beforeEach } from 'vitest';
import { buildPlayParams, derivePlayRules } from '../../src/client/utils/gameViewHelpers';
import {
  registerSkillActions,
  clearRegistry,
  getActionsForPlayer,
} from '../../src/client/skillActionRegistry';
import { registerSkillsFromState } from '../../src/engine/index';
import { enumerateAvailableActions } from '../../src/client/headless/availableActions';
import { SkillTestHarness } from '../engine-harness';
import { dispatch } from '../../src/engine/index';
import { buildView } from '../../src/engine/index';
import { createGameState, suitColor } from '../../src/engine/types';
import type { SkillActionDef } from '../../src/client/skillActionRegistry';
import type { Card, GameState, PlayerState } from '../../src/engine/types';
import '../../src/engine/atoms';

function mkCard(
  id: string,
  name: string,
  suit: Card['suit'],
  rank: string,
  type: Card['type'] = '基本牌',
): Card {
  return { id, name, suit, color: suitColor(suit), rank, type };
}

function mkPlayer(
  index: number,
  name: string,
  hand: string[],
  skills: string[],
  faction: PlayerState['faction'] = '群',
): PlayerState {
  return {
    index,
    name,
    character: name,
    health: 4,
    maxHealth: 4,
    alive: true,
    hand,
    equipment: {},
    skills,
    vars: {},
    marks: [],
    pendingTricks: [],
    tags: [],
    judgeZone: [],
    faction,
  };
}

/** 用客户端声明 + buildPlayParams 构造消息(与浏览器同源),再 dispatch。 */
async function dispatchClientBuiltAction(opts: {
  players: PlayerState[];
  cardMap: Record<string, Card>;
  skillId: string;
  costCardId: string;
  targetIdx: number;
}): Promise<{ accepted: boolean; params: Record<string, unknown> }> {
  const state: GameState = createGameState({
    players: opts.players,
    cardMap: opts.cardMap,
    currentPlayerIndex: 0,
    phase: '出牌',
    turn: { round: 1, phase: '出牌', vars: {} },
  });
  state.zones = { deck: [], discardPile: [], processing: [] };
  await registerSkillsFromState(state);
  clearRegistry();
  for (const p of state.players) await registerSkillActions(p.index, p.skills);

  const view = buildView(state, 0);
  const action = getActionsForPlayer(0).find(
    (a: SkillActionDef) => a.skillId === opts.skillId && a.actionType === 'use',
  );
  if (!action) throw new Error(`客户端未注册 ${opts.skillId}:use`);
  const prompt = action.prompt;
  const targetFilter = prompt.type === 'useCardAndTarget' ? prompt.targetFilter : null;
  const selfTarget = prompt.type === 'useCardAndTarget' ? !!prompt.selfTarget : false;
  const rules = derivePlayRules(targetFilter, selfTarget);

  const card = state.cardMap[opts.costCardId];
  const targetName = view.players[opts.targetIdx]?.name ?? '';
  const params = buildPlayParams(view.players, 0, card, rules, targetName, null);
  if (!params) throw new Error('buildPlayParams 返回 null(客户端无法提交该动作)');

  const res = await dispatch(state, {
    skillId: opts.skillId,
    actionType: 'use',
    ownerId: 0,
    params,
    baseSeq: state.seq,
  });
  return { accepted: res.accepted, params };
}

describe('客户端构造的出牌 params 必须被引擎接受', () => {
  beforeEach(() => {
    clearRegistry();
  });

  // 断粮/界断粮:黑色基本牌当兵粮寸断;代价牌是基本牌 → 客户端发 targets
  it.each(['断粮', '界断粮'])('%s:黑色杀当兵粮寸断(targets 形状)被接受', async (skillId) => {
    const { accepted, params } = await dispatchClientBuiltAction({
      players: [
        mkPlayer(0, 'P0', ['k1', 'd1'], [skillId, '杀', '回合管理']),
        mkPlayer(1, 'P1', ['x1'], ['杀', '回合管理']),
      ],
      cardMap: {
        k1: mkCard('k1', '杀', '♠', '5'),
        d1: mkCard('d1', '闪', '♥', '2'),
        x1: mkCard('x1', '杀', '♣', '3'),
      },
      skillId,
      costCardId: 'k1',
      targetIdx: 1,
    });
    // 客户端构造的形状:非延时锦囊 → targets 数组(不是 target)
    expect(params).toHaveProperty('targets', [1]);
    expect(accepted, `${skillId} 的客户端消息必须被引擎接受`).toBe(true);
  });

  it('审时:任意手牌交人+造成伤害(targets 形状)被接受', async () => {
    const { accepted, params } = await dispatchClientBuiltAction({
      players: [
        mkPlayer(0, 'P0', ['d1'], ['审时', '杀', '回合管理']),
        mkPlayer(1, 'P1', ['x1', 'x2'], ['杀', '回合管理']),
        mkPlayer(2, 'P2', [], ['杀', '回合管理']),
      ],
      cardMap: {
        d1: mkCard('d1', '闪', '♥', '2'),
        x1: mkCard('x1', '杀', '♣', '3'),
        x2: mkCard('x2', '杀', '♦', '4'),
      },
      skillId: '审时',
      costCardId: 'd1',
      targetIdx: 1,
    });
    expect(params).toHaveProperty('targets', [1]);
    expect(accepted, '审时的客户端消息必须被引擎接受').toBe(true);
  });

  it('驱虎:拼点牌 + 目标(targets 形状)被接受', async () => {
    const { accepted, params } = await dispatchClientBuiltAction({
      players: [
        mkPlayer(0, 'P0', ['d1'], ['驱虎', '杀', '回合管理']),
        mkPlayer(1, 'P1', ['x1'], ['杀', '回合管理']),
      ],
      cardMap: {
        d1: mkCard('d1', '闪', '♥', '2'),
        x1: mkCard('x1', '杀', '♣', '3'),
      },
      skillId: '驱虎',
      costCardId: 'd1',
      targetIdx: 1,
    });
    expect(params).toHaveProperty('targets', [1]);
    expect(accepted, '驱虎的客户端消息必须被引擎接受').toBe(true);
  });

  // 对照:同族技能(国色:方块牌当乐不思蜀)按约定读两种形状 → 修复前后都应通过,
  // 证明本文件不是「一律失败」的假阳性测试。
  it('对照 国色:方块牌当乐不思蜀(targets 形状)被接受', async () => {
    const { accepted } = await dispatchClientBuiltAction({
      players: [
        mkPlayer(0, 'P0', ['t2'], ['国色', '杀', '回合管理']),
        mkPlayer(1, 'P1', ['x1'], ['杀', '回合管理']),
      ],
      cardMap: {
        t2: mkCard('t2', '桃', '♦', '4'),
        x1: mkCard('x1', '杀', '♣', '3'),
      },
      skillId: '国色',
      costCardId: 't2',
      targetIdx: 1,
    });
    expect(accepted, '国色的客户端消息必须被引擎接受').toBe(true);
  });
});

// ─── 回应路径 + 反方向(只读 targets 的技能) ───
// 客户端回应 useCardAndTarget 型 pending 时固定发 targets(usePlayInteraction.handleRespond);
// 而只读 targets 的技能(界火计)遇到延时锦囊代价牌会收到单数 target —— 两个方向都要成立。
describe('客户端构造的回应 params 必须被引擎接受', () => {
  beforeEach(() => {
    clearRegistry();
  });

  it('天香(回应):弃红桃手牌 + targets 数组被接受', async () => {
    const harness = new SkillTestHarness();
    const slash = mkCard('k1', '杀', '♠', '7');
    const heart = mkCard('h1', '闪', '♥', '5');
    const state: GameState = createGameState({
      players: [
        mkPlayer(0, 'P0', ['k1'], ['杀', '回合管理']),
        mkPlayer(1, '小乔', ['h1'], ['天香', '回合管理']),
        mkPlayer(2, 'P2', [], ['回合管理']),
      ],
      cardMap: { k1: slash, h1: heart },
      currentPlayerIndex: 0,
      phase: '出牌',
      turn: { round: 1, phase: '出牌', vars: {} },
    });
    state.zones = { deck: [], discardPile: [], processing: [] };
    await harness.setup(state);

    await harness.player('P0').useCardAndTarget('杀', 'k1', [1]);
    await harness.player('小乔').pass(); // 不出闪 → 造成伤害 → 天香触发
    await harness.player('小乔').respond('天香', { choice: true }); // 发动天香

    // 客户端形状:useCardAndTarget 回应 → { cardId, targets: [idx] }
    const res = await dispatch(state, {
      skillId: '天香',
      actionType: 'respond',
      ownerId: 1,
      params: { cardId: 'h1', targets: [2] },
      baseSeq: state.seq,
    });
    expect(res.accepted, '天香 choose 窗口的客户端回应必须被引擎接受').toBe(true);
  });

  it('乱武(回应):杀 + targets 数组被接受', async () => {
    const harness = new SkillTestHarness();
    const slash = mkCard('k1', '杀', '♠', '7');
    const state: GameState = createGameState({
      players: [
        mkPlayer(0, 'P0', [], ['乱武', '回合管理']),
        mkPlayer(1, 'P1', ['k1'], ['杀', '回合管理']),
      ],
      cardMap: { k1: slash },
      currentPlayerIndex: 0,
      phase: '出牌',
      turn: { round: 1, phase: '出牌', vars: {} },
    });
    state.zones = { deck: [], discardPile: [], processing: [] };
    await harness.setup(state);

    await harness.player('P0').triggerAction('乱武', 'use', {});
    harness.player('P1').expectPending('请求回应');

    // 客户端形状:useCardAndTarget 回应 → { cardId, targets: [idx] }(目标=距离最近的 P0)
    const res = await dispatch(state, {
      skillId: '乱武',
      actionType: 'respond',
      ownerId: 1,
      params: { cardId: 'k1', targets: [0] },
      baseSeq: state.seq,
    });
    expect(res.accepted, '乱武询问窗口的客户端回应必须被引擎接受').toBe(true);
  });

  it('界火计(反方向):延时锦囊代价牌 → 单数 target 被接受', async () => {
    const yue = mkCard('y1', '乐不思蜀', '♥', '6', '锦囊牌');
    yue.trickSubtype = '延时锦囊';
    const state: GameState = createGameState({
      players: [
        mkPlayer(0, 'P0', ['y1'], ['界火计', '火攻', '回合管理']),
        mkPlayer(1, 'P1', ['x1'], ['杀', '回合管理']),
      ],
      cardMap: { y1: yue, x1: mkCard('x1', '杀', '♣', '3') },
      currentPlayerIndex: 0,
      phase: '出牌',
      turn: { round: 1, phase: '出牌', vars: {} },
    });
    state.zones = { deck: [], discardPile: [], processing: [] };
    await registerSkillsFromState(state);
    clearRegistry();
    for (const p of state.players) await registerSkillActions(p.index, p.skills);

    const view = buildView(state, 0);
    const action = enumerateAvailableActions(view, 0, getActionsForPlayer(0)).find(
      (a) => a.message.preceding?.[0]?.skillId === '界火计',
    );
    expect(action, '客户端应枚举出界火计转化').toBeDefined();

    // 客户端形状:延时锦囊代价牌 → buildPlayParams 发单数 target
    const res = await dispatch(state, {
      ...action!.message,
      params: { cardId: action!.message.params.cardId, target: action!.validTargets[0] },
      ownerId: 0,
      baseSeq: state.seq,
    });
    expect(res.accepted, '界火计的延时锦囊代价牌(单数 target)必须被引擎接受').toBe(true);
  });
});

// ─── 枚举侧过滤缺失:客户端枚举出的目标必须被引擎接受 ───
// 目标合法性由引擎 validate 权威判定(inAttackRange / 势力 / 非自己…),客户端
// targetFilter 是同一判据的投影;filter 写成占位 return true(或漏写)时,枚举出的
// 目标提交即被拒 —— 玩家点了没反应,AI 反复挑中同一非法目标空转。
describe('客户端枚举的目标必须被引擎接受', () => {
  beforeEach(() => {
    clearRegistry();
  });

  /** 建局 + 枚举指定技能的客户端 action;build() 每次给全新 state(dispatch 会改 state)。 */
  async function enumerateSkillActions(
    skillId: string,
    setup: () => { players: PlayerState[]; cardMap: Record<string, Card> },
  ) {
    const build = async () => {
      const { players, cardMap } = setup();
      const state: GameState = createGameState({
        players,
        cardMap,
        currentPlayerIndex: 0,
        phase: '出牌',
        turn: { round: 1, phase: '出牌', vars: {} },
      });
      state.zones = { deck: [], discardPile: [], processing: [] };
      await registerSkillsFromState(state);
      clearRegistry();
      for (const p of state.players) await registerSkillActions(p.index, p.skills);
      return state;
    };
    const state = await build();
    const actions = enumerateAvailableActions(
      buildView(state, 0),
      0,
      getActionsForPlayer(0),
    ).filter((a) => a.message.skillId === skillId);
    return { build, actions };
  }

  // 4 人圆桌:距离(P2→P0)=2 > 攻击范围 1 → P2 无法用杀攻击到 P0;P1/P3 距离 1 可以。
  // 客户端 filter 旧实现是占位 `return true` → 把 P2 也枚举成合法目标,引擎 validate
  // 恒拒「目标无法用杀攻击到你」。
  it.each(['挑衅', '界挑衅'])('%s:超出目标攻击范围的角色不得被枚举', async (skillId) => {
    const setup = () => ({
      players: [
        mkPlayer(0, 'P0', ['k1'], [skillId, '杀', '回合管理']),
        mkPlayer(1, 'P1', [], ['回合管理']),
        mkPlayer(2, 'P2', [], ['回合管理']),
        mkPlayer(3, 'P3', [], ['回合管理']),
      ],
      cardMap: { k1: mkCard('k1', '杀', '♠', '5') },
    });
    const { build, actions } = await enumerateSkillActions(skillId, setup);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.map((a) => a.message.params.target).sort()).toEqual([1, 3]);

    for (const a of actions) {
      const state = await build();
      const res = await dispatch(state, { ...a.message, ownerId: 0, baseSeq: state.seq });
      expect(res.accepted, `${skillId} 目标 ${String(a.message.params.target)} 应被接受`).toBe(
        true,
      );
    }
  });

  // 激将/界激将:主公技,令**其他蜀势力**角色代为使用杀。客户端 choosePlayer 未声明
  // filter → 无头枚举退化为全体存活角色(含自己与非蜀)→ 引擎 validate 恒拒
  // 「现在不能使用激将」;浏览器按钮同样让主公能点到自己/非蜀角色。
  it.each(['激将', '界激将'])('%s:只枚举其他蜀势力角色', async (skillId) => {
    const setup = () => ({
      players: [
        mkPlayer(0, 'P0', [], [skillId, '杀', '回合管理'], '蜀'),
        mkPlayer(1, 'P1', ['x1'], ['杀', '回合管理'], '蜀'),
        mkPlayer(2, 'P2', [], ['回合管理'], '魏'),
      ],
      cardMap: { x1: mkCard('x1', '杀', '♣', '3') },
    });
    const { build, actions } = await enumerateSkillActions(skillId, setup);
    expect(actions.map((a) => a.message.params.target)).toEqual([1]);

    const state = await build();
    const res = await dispatch(state, { ...actions[0].message, ownerId: 0, baseSeq: state.seq });
    expect(res.accepted, `${skillId} 枚举出的蜀势力目标应被接受`).toBe(true);
  });
});
