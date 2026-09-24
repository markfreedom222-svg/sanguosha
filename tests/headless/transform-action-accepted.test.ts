// 客户端枚举出的转化技 action 必须能被引擎接受。
//
// 契约:影子卡 id 由客户端构造(浏览器 usePlayInteraction 与无头 availableActions 同约定):
//   `${选中牌 id 以 # 连接}#${skillId}`(skillId = 注册该 transform action 的技能 id)。
// 引擎的转化 execute 必须创建**同一个 id** 的影子卡,否则主 action(读 cardMap[影子 id])
// validate 恒失败 → 该转化技在浏览器与 AI 客户端整类不可用(按钮点了没反应/动作恒被拒)。
//
// 本用例不走技能测试 harness 的手写 id,而是先让客户端枚举出 action,再原样 dispatch,
// 从而锁死「客户端构造的 id == 引擎创建的 id」这条端到端契约。
import { describe, it, expect, beforeEach } from 'vitest';
import { enumerateAvailableActions } from '../../src/client/headless/availableActions';
import { registerSkillActions, clearRegistry, getActionsForPlayer } from '../../src/client/skillActionRegistry';
import { buildView, dispatch } from '../../src/engine/index';
import { registerSkillsFromState } from '../../src/engine/index';
import { createGameState, suitColor } from '../../src/engine/types';
import type { AvailableAction } from '../../src/client/headless/types';
import type { Card, GameState, PlayerState } from '../../src/engine/types';
import '../../src/engine/atoms';

function mkCard(id: string, name: string, suit: Card['suit'], rank: string): Card {
  return { id, name, suit, color: suitColor(suit), rank, type: '基本牌' };
}

function mkPlayer(index: number, name: string, hand: string[], skills: string[]): PlayerState {
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
    faction: '群',
  };
}

/** 组装 state + 注册技能 + 注册客户端 action,返回当前座次枚举出的转化 action 列表 */
async function enumerateTransforms(opts: {
  players: PlayerState[];
  cardMap: Record<string, Card>;
  seat: number;
}): Promise<{ state: GameState; actions: AvailableAction[] }> {
  const state = createGameState({
    players: opts.players,
    cardMap: opts.cardMap,
    currentPlayerIndex: opts.seat,
    phase: '出牌',
    turn: { round: 1, phase: '出牌', vars: {} },
  });
  state.zones = { deck: [], discardPile: [], processing: [] };
  await registerSkillsFromState(state);
  clearRegistry();
  for (const p of state.players) await registerSkillActions(p.index, p.skills);
  const view = buildView(state, opts.seat);
  const actions = enumerateAvailableActions(view, opts.seat, getActionsForPlayer(opts.seat));
  return { state, actions };
}

describe('客户端枚举的转化技 action 引擎可接受(影子 id 约定)', () => {
  beforeEach(() => {
    clearRegistry();
  });

  it('界武圣:枚举出的红牌转化杀 action 被接受', async () => {
    const red = mkCard('r1', '闪', '♥', '5');
    const { state, actions } = await enumerateTransforms({
      players: [
        mkPlayer(0, 'P0', ['r1'], ['界武圣', '杀', '回合管理']),
        mkPlayer(1, 'P1', [], []),
      ],
      cardMap: { r1: red },
      seat: 0,
    });

    const transform = actions.find((a) => a.message.preceding?.[0]?.skillId === '界武圣');
    expect(transform, '客户端应枚举出界武圣转化杀').toBeDefined();
    // 客户端构造的影子 id 约定:${cardId}#${skillId}
    expect(transform!.message.params.cardId).toBe('r1#界武圣');

    const result = await dispatch(state, {
      ...transform!.message,
      params: { ...transform!.message.params, targets: [1] },
      ownerId: 0,
      baseSeq: state.seq,
    });
    expect(result.accepted, '客户端枚举的界武圣转化必须被引擎接受').toBe(true);
  });

  it('界疠火:枚举出的非火杀转化 action 被接受', async () => {
    const kill = mkCard('k1', '杀', '♠', '7');
    const { state, actions } = await enumerateTransforms({
      players: [
        mkPlayer(0, 'P0', ['k1'], ['界疠火', '杀', '回合管理']),
        mkPlayer(1, 'P1', [], []),
      ],
      cardMap: { k1: kill },
      seat: 0,
    });

    const transform = actions.find((a) => a.message.preceding?.[0]?.skillId === '界疠火');
    expect(transform, '客户端应枚举出界疠火转化杀').toBeDefined();
    expect(transform!.message.params.cardId).toBe('k1#界疠火');

    const result = await dispatch(state, {
      ...transform!.message,
      params: { ...transform!.message.params, targets: [1] },
      ownerId: 0,
      baseSeq: state.seq,
    });
    expect(result.accepted, '客户端枚举的界疠火转化必须被引擎接受').toBe(true);
  });

  it('界父魂(granted 武圣):枚举出的单张红牌转化杀 action 被接受', async () => {
    const red = mkCard('r1', '闪', '♥', '5');
    const { state } = await enumerateTransforms({
      players: [
        mkPlayer(0, 'P0', ['r1'], ['界父魂', '杀', '回合管理']),
        mkPlayer(1, 'P1', [], []),
      ],
      cardMap: { r1: red },
      seat: 0,
    });
    // 授予武圣(父魂杀造成伤害后的本回合状态):state 侧标记 + view 侧投影镜像
    state.turn.vars['父魂/granted'] = 0;
    state.turn.vars['__view/杀/unlimited/父魂'] = true;

    const view = buildView(state, 0);
    const granted = enumerateAvailableActions(view, 0, getActionsForPlayer(0)).find(
      (a) => a.message.preceding?.[0]?.actionType === '武圣transform',
    );
    expect(granted, '授予武圣后客户端应枚举出 武圣transform 动作').toBeDefined();
    expect(granted!.message.params.cardId).toBe('r1#界父魂');

    const result = await dispatch(state, {
      ...granted!.message,
      params: { ...granted!.message.params, targets: [1] },
      ownerId: 0,
      baseSeq: state.seq,
    });
    expect(result.accepted, '客户端枚举的 granted 武圣转化必须被引擎接受').toBe(true);
  });

  it('界父魂:枚举出的两张牌转化杀 action 被接受', async () => {
    const c1 = mkCard('c1', '闪', '♥', '5');
    const c2 = mkCard('c2', '杀', '♠', '6');
    const { state, actions } = await enumerateTransforms({
      players: [
        mkPlayer(0, 'P0', ['c1', 'c2'], ['界父魂', '杀', '回合管理']),
        mkPlayer(1, 'P1', [], []),
      ],
      cardMap: { c1, c2 },
      seat: 0,
    });

    const transform = actions.find((a) => a.message.preceding?.[0]?.skillId === '界父魂');
    expect(transform, '客户端应枚举出界父魂转化杀').toBeDefined();
    expect(transform!.message.params.cardId).toBe('c1#c2#界父魂');

    const result = await dispatch(state, {
      ...transform!.message,
      params: { ...transform!.message.params, targets: [1] },
      ownerId: 0,
      baseSeq: state.seq,
    });
    expect(result.accepted, '客户端枚举的界父魂转化必须被引擎接受').toBe(true);
  });
});
