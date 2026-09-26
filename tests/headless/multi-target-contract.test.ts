// 多目标技能的枚举契约:AvailableAction 必须给出目标数下界(minTarget)。
//
// 引擎 validate 按 prompt.targetFilter 判定目标数(离间「两名男性角色」min=max=2),
// 而 AvailableAction 此前只有 validTargets(全集)与 maxTarget(上限,未设默认 1)——
// AI/MCP 客户端据此只会填 1 个目标 → 提交恒拒「需要选择两名男性角色」。
// 启发式评分确定性反复挑中同一非法动作即空转:fuzz 实测单局 42 次 REJECT:离间:use。
//
// 本用例锁两条:①枚举出的多目标 action 带 minTarget/maxTarget;
// ②按该下界填满目标数提交被引擎接受,填不满被拒(证明下界不是摆设)。
import { describe, it, expect, beforeEach } from 'vitest';
import { enumerateAvailableActions } from '../../src/client/headless/availableActions';
import {
  registerSkillActions,
  clearRegistry,
  getActionsForPlayer,
} from '../../src/client/skillActionRegistry';
import { buildView, dispatch, registerSkillsFromState } from '../../src/engine/index';
import { createGameState, suitColor } from '../../src/engine/types';
import type { Card, GameState, PlayerState } from '../../src/engine/types';
import type { AvailableAction } from '../../src/client/headless/types';
import '../../src/engine/atoms';

function mkCard(id: string, name: string, suit: Card['suit'], rank: string): Card {
  return { id, name, suit, color: suitColor(suit), rank, type: '基本牌' };
}

function mkPlayer(opts: {
  index: number;
  name: string;
  character: string;
  faction: string;
  hand?: string[];
  skills: string[];
}): PlayerState {
  return {
    index: opts.index,
    name: opts.name,
    character: opts.character,
    faction: opts.faction,
    health: 4,
    maxHealth: 4,
    alive: true,
    hand: opts.hand ?? [],
    equipment: {},
    skills: opts.skills,
    vars: {},
    marks: [],
    pendingTricks: [],
    tags: [],
    judgeZone: [],
  } as PlayerState;
}

/** 离间场景:自己回合出牌阶段,两名男性角色可选。 */
async function enumerateLijian(): Promise<{ state: GameState; action: AvailableAction }> {
  const state = createGameState({
    players: [
      mkPlayer({ index: 0, name: '貂蝉', character: '貂蝉', faction: '群', hand: ['c1'], skills: ['离间', '回合管理'] }),
      mkPlayer({ index: 1, name: '关羽', character: '关羽', faction: '蜀', hand: ['c2'], skills: [] }),
      mkPlayer({ index: 2, name: '张飞', character: '张飞', faction: '蜀', hand: ['c3'], skills: [] }),
    ],
    cardMap: {
      c1: mkCard('c1', '杀', '♠', '7'),
      c2: mkCard('c2', '闪', '♥', '3'),
      c3: mkCard('c3', '闪', '♦', '4'),
    },
    currentPlayerIndex: 0,
    phase: '出牌',
    turn: { round: 1, phase: '出牌', vars: {} },
  });
  state.zones = { deck: [], discardPile: [], processing: [] };
  await registerSkillsFromState(state);
  clearRegistry();
  for (const p of state.players) await registerSkillActions(p.index, p.skills);
  const view = buildView(state, 0);
  const actions = enumerateAvailableActions(view, 0, getActionsForPlayer(0));
  const action = actions.find((a) => a.message.skillId === '离间');
  expect(action, '客户端应枚举出离间').toBeDefined();
  return { state, action: action! };
}

describe('多目标技能的枚举契约(minTarget)', () => {
  beforeEach(() => {
    clearRegistry();
  });

  it('离间:枚举出的 action 带 minTarget=2 / maxTarget=2(与引擎 targetFilter 同源)', async () => {
    const { action } = await enumerateLijian();
    expect(action.minTarget).toBe(2);
    expect(action.maxTarget).toBe(2);
    expect(action.validTargets.length).toBeGreaterThanOrEqual(2);
  });

  it('离间:按 minTarget 填满目标数 → 引擎接受', async () => {
    const { state, action } = await enumerateLijian();
    const targets = action.validTargets.slice(0, action.minTarget ?? 1);
    const result = await dispatch(state, {
      ...action.message,
      params: { ...action.message.params, targets },
      ownerId: 0,
      baseSeq: state.seq,
    });
    expect(result.accepted, '按枚举给出的 minTarget 填目标必须被接受').toBe(true);
  });

  it('离间:只填 1 个目标 → 引擎拒绝(下界不是摆设)', async () => {
    const { state, action } = await enumerateLijian();
    const result = await dispatch(state, {
      ...action.message,
      params: { ...action.message.params, targets: action.validTargets.slice(0, 1) },
      ownerId: 0,
      baseSeq: state.seq,
    });
    expect(result.accepted).toBe(false);
  });

  it('单目标牌(杀)不受影响:不设 minTarget,maxTarget 由出杀放宽规则给出', async () => {
    const state = createGameState({
      players: [
        mkPlayer({ index: 0, name: 'P0', character: 'P0', faction: '群', hand: ['k1'], skills: ['使用牌', '回合管理'] }),
        mkPlayer({ index: 1, name: 'P1', character: 'P1', faction: '蜀', skills: [] }),
      ],
      cardMap: { k1: mkCard('k1', '杀', '♠', '7') },
      currentPlayerIndex: 0,
      phase: '出牌',
      turn: { round: 1, phase: '出牌', vars: {} },
    });
    state.zones = { deck: [], discardPile: [], processing: [] };
    await registerSkillsFromState(state);
    clearRegistry();
    for (const p of state.players) await registerSkillActions(p.index, p.skills);
    const view = buildView(state, 0);
    const kill = enumerateAvailableActions(view, 0, getActionsForPlayer(0)).find(
      (a) => a.message.skillId === '杀',
    );
    expect(kill, '客户端应枚举出杀').toBeDefined();
    expect(kill!.minTarget).toBeUndefined();
    expect(kill!.validTargets).toEqual([1]);
  });
});
