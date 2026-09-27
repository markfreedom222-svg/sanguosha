// tests/integration/延时锦囊实体牌归属.test.ts
// 延时锦囊(乐不思蜀/兵粮寸断/闪电)的实体牌在「使用时」就已入弃牌堆(见
// use-card.ts 的 delayed 分支 + 乐不思蜀.test.ts 的 toContain 断言),
// 判定区 pendingTricks 只持有牌面快照 { name, source, card }。
//
// 因此所有「清空判定区」路径(获得/弃置/死亡清理)都不得再次把这张实体牌推入
// 某个牌区——否则同一张牌会在弃牌堆出现两次(重洗后同一张牌有两个实例),
// 或同时出现在弃牌堆与某玩家手牌(牌唯一归属不变量被破坏)。
//
// 覆盖(修复前全部失败):
//   1. 顺手牵羊选判定区:实体牌应从弃牌堆移入使用者手牌(不复制)
//   2. 过河拆桥拆判定区:弃牌堆不出现重复
//   3. 死亡清理(系统处理牌):判定区延时锦囊不重复入弃牌堆
//   4. 涅槃:判定区延时锦囊不重复入弃牌堆
//   5. 行殇:判定区延时锦囊从弃牌堆移入发动者手牌(不复制)
//   6. 回归:实体牌不在任何区(历史快照)仍正常补入弃牌堆
//   7-9. 重洗场景:实体牌已被重洗回牌堆(快照过期)——拆/顺/死亡清理
//        都不得转移或复制这张牌(牌堆恰好保留一张)
import { describe, it, expect, beforeEach } from 'vitest';
import { registerSkillsFromState } from '../../src/engine/index';
import { dispatchAndWait, fireTimeoutAndWait, SkillTestHarness } from '../engine-harness';
import { runDeathFlow } from '../../src/engine/flows/death';
import { assertCardInvariants } from '../../src/engine/util/invariants';
import '../../src/engine/atoms';
import type { Card, GameState, PlayerState } from '../../src/engine/types';
import { createGameState } from '../../src/engine/types';

function mkCard(
  id: string,
  name: string,
  suit: Card['suit'] = '♠',
  rank: string = '7',
  type: Card['type'] = '锦囊牌',
): Card {
  return { id, name, suit, color: suit === '♥' || suit === '♦' ? '红' : '黑', rank, type };
}

function mkPlayer(opts: {
  index: number;
  name: string;
  hand?: string[];
  skills?: string[];
  health?: number;
  maxHealth?: number;
  pendingTricks?: PlayerState['pendingTricks'];
  character?: string;
}): PlayerState {
  return {
    index: opts.index,
    name: opts.name,
    character: opts.character ?? '',
    health: opts.health ?? 4,
    maxHealth: opts.maxHealth ?? 4,
    alive: true,
    hand: opts.hand ?? [],
    equipment: {},
    skills: opts.skills ?? ['回合管理'],
    vars: {},
    marks: [],
    pendingTricks: opts.pendingTricks ?? [],
    tags: [],
    judgeZone: [],
  };
}

/** 断言:弃牌堆中每个 cardId 恰好出现一次(牌唯一归属的核心表现) */
function expectNoDuplicateInDiscard(state: GameState): void {
  const seen = new Set<string>();
  const dups: string[] = [];
  for (const id of state.zones.discardPile) {
    if (seen.has(id)) dups.push(id);
    seen.add(id);
  }
  expect(dups, `弃牌堆重复: ${dups.join(',')}`).toEqual([]);
}

describe('延时锦囊实体牌归属(判定区只持快照,实体牌已在弃牌堆)', () => {
  let harness: SkillTestHarness;

  beforeEach(() => {
    harness = new SkillTestHarness();
  });

  // ─────────────────────────────────────────────────────────────
  // 1. 顺手牵羊选判定区(端到端:先真实使用 乐不思蜀,再顺手牵羊取判定区)
  // ─────────────────────────────────────────────────────────────
  it('顺手牵羊取判定区:实体牌从弃牌堆移入使用者手牌,弃牌堆不重复', async () => {
    const lebu = mkCard('lb1', '乐不思蜀');
    const snatch = mkCard('ss1', '顺手牵羊', '♦', '3');
    const state = createGameState({
      players: [
        mkPlayer({
          index: 0,
          name: 'P0',
          hand: ['lb1', 'ss1'],
          skills: ['回合管理', '乐不思蜀', '顺手牵羊'],
        }),
        mkPlayer({ index: 1, name: 'P1' }),
      ],
      cardMap: { lb1: lebu, ss1: snatch },
      currentPlayerIndex: 0,
      phase: '出牌',
      turn: { round: 1, phase: '出牌', vars: {} },
    });
    await harness.setup(state);

    // 真实使用 乐不思蜀:P1 判定区获得快照,实体牌进弃牌堆
    await harness.player('P0').useCardAndTarget('乐不思蜀', 'lb1', [1]);
    await fireTimeoutAndWait(state); // 无人无懈
    expect(state.players[1].pendingTricks).toHaveLength(1);
    expect(state.zones.discardPile).toEqual(['lb1']);

    // P0 顺手牵羊取 P1 判定区的 乐不思蜀
    await harness.player('P0').useCardAndTarget('顺手牵羊', 'ss1', [1]);
    await fireTimeoutAndWait(state); // 无人无懈
    await harness.player('P0').respond('顺手牵羊', { zone: 'judge', cardId: 'lb1' });

    // 判定区清空,实体牌在 P0 手上,弃牌堆不再含该牌
    expect(state.players[1].pendingTricks).toEqual([]);
    expect(state.players[0].hand).toContain('lb1');
    expect(state.zones.discardPile).not.toContain('lb1');
    expectNoDuplicateInDiscard(state);
    assertCardInvariants(state);
  });

  // ─────────────────────────────────────────────────────────────
  // 2. 过河拆桥拆判定区:实体牌已在弃牌堆,不得重复入堆
  // ─────────────────────────────────────────────────────────────
  it('过河拆桥拆判定区:弃牌堆不出现重复的延时锦囊', async () => {
    const lebu = mkCard('lb1', '乐不思蜀');
    const gq = mkCard('gq1', '过河拆桥', '♣', '4');
    const state = createGameState({
      players: [
        mkPlayer({ index: 0, name: 'P0', hand: ['gq1'], skills: ['回合管理', '过河拆桥'] }),
        mkPlayer({ index: 1, name: 'P1' }),
      ],
      cardMap: { lb1: lebu, gq1: gq },
      // 真实使用后的状态:判定区有快照 + 实体牌已在弃牌堆(初值即含,视图基线一致)
      zones: { deck: [], discardPile: ['lb1'], processing: [] },
      currentPlayerIndex: 0,
      phase: '出牌',
      turn: { round: 1, phase: '出牌', vars: {} },
    });
    state.players[1].pendingTricks = [{ name: '乐不思蜀', source: 0, card: lebu }];
    await harness.setup(state);

    await harness.player('P0').useCardAndTarget('过河拆桥', 'gq1', [1]);
    await fireTimeoutAndWait(state);
    await harness.player('P0').respond('过河拆桥', { zone: 'judge', cardId: 'lb1' });

    expect(state.players[1].pendingTricks).toEqual([]);
    expect(state.zones.discardPile.filter((id) => id === 'lb1')).toHaveLength(1);
    expectNoDuplicateInDiscard(state);
    assertCardInvariants(state);
  });

  // ─────────────────────────────────────────────────────────────
  // 3. 死亡清理:判定区延时锦囊不得重复入弃牌堆
  // ─────────────────────────────────────────────────────────────
  it('角色死亡:判定区延时锦囊不重复入弃牌堆', async () => {
    const sd = mkCard('sd1', '闪电', '♠', 'A');
    const state = createGameState({
      players: [mkPlayer({ index: 0, name: 'P0' }), mkPlayer({ index: 1, name: 'P1', health: 1 })],
      cardMap: { sd1: sd },
      zones: { deck: [], discardPile: ['sd1'], processing: [] },
      currentPlayerIndex: 0,
      phase: '出牌',
      turn: { round: 1, phase: '出牌', vars: {} },
    });
    state.players[1].pendingTricks = [{ name: '闪电', source: 0, card: sd }];
    await harness.setup(state);

    await runDeathFlow(state, 1);
    await harness.waitForStable();

    expect(state.players[1].alive).toBe(false);
    expect(state.players[1].pendingTricks).toEqual([]);
    expect(state.zones.discardPile.filter((id) => id === 'sd1')).toHaveLength(1);
    expectNoDuplicateInDiscard(state);
    assertCardInvariants(state);
  });

  // ─────────────────────────────────────────────────────────────
  // 4. 涅槃:判定区延时锦囊不得重复入弃牌堆
  // ─────────────────────────────────────────────────────────────
  it('涅槃弃判定区牌:实体牌不重复入弃牌堆', async () => {
    const slash = mkCard('s1', '杀', '♠', '7', '基本牌');
    const lebu = mkCard('lb1', '乐不思蜀');
    // 涅槃要摸 3 张,牌堆需备牌
    const d1 = mkCard('d1', '闪', '♥', '2', '基本牌');
    const d2 = mkCard('d2', '闪', '♥', '3', '基本牌');
    const d3 = mkCard('d3', '闪', '♥', '4', '基本牌');
    const state = createGameState({
      players: [
        mkPlayer({
          index: 0,
          name: '庞统',
          character: '庞统',
          skills: ['涅槃'],
          health: 1,
          maxHealth: 3,
          pendingTricks: [{ name: '乐不思蜀', source: 1, card: lebu }],
        }),
        mkPlayer({ index: 1, name: 'P1', hand: ['s1'], skills: ['杀'] }),
      ],
      cardMap: { s1: slash, lb1: lebu, d1, d2, d3 },
      zones: { deck: ['d1', 'd2', 'd3'], discardPile: ['lb1'], processing: [] },
      currentPlayerIndex: 1,
      phase: '出牌',
      turn: { round: 1, phase: '出牌', vars: {} },
    });
    await harness.setup(state);

    // 庞统无手牌 → 询问闪被跳过(silent),杀直接命中致濒死 → 弹出涅槃询问
    await harness.player('P1').useCardAndTarget('杀', 's1', [0]);
    await harness.waitForStable();
    await harness.player('庞统').respond('涅槃', { choice: true });
    await harness.waitForStable();

    expect(state.players[0].alive).toBe(true);
    expect(state.players[0].pendingTricks).toEqual([]);
    expect(state.zones.discardPile.filter((id) => id === 'lb1')).toHaveLength(1);
    expectNoDuplicateInDiscard(state);
    assertCardInvariants(state);
  });

  // ─────────────────────────────────────────────────────────────
  // 5. 行殇:判定区延时锦囊的实体牌应从弃牌堆移入发动者手牌
  // ─────────────────────────────────────────────────────────────
  it('行殇取判定区牌:实体牌从弃牌堆移入发动者手牌,不复制', async () => {
    const lebu = mkCard('lb1', '乐不思蜀');
    const hand = mkCard('h1', '杀', '♠', '7', '基本牌');
    const state = createGameState({
      players: [
        mkPlayer({ index: 0, name: 'P0', skills: ['行殇'] }),
        mkPlayer({
          index: 1,
          name: 'P1',
          hand: ['h1'],
          health: 1,
          pendingTricks: [{ name: '乐不思蜀', source: 0, card: lebu }],
        }),
      ],
      cardMap: { lb1: lebu, h1: hand },
      zones: { deck: [], discardPile: ['lb1'], processing: [] },
      currentPlayerIndex: 0,
      phase: '出牌',
      turn: { round: 1, phase: '出牌', vars: {} },
    });
    await harness.setup(state);

    void runDeathFlow(state, 1);
    await harness.waitForStable();
    await harness.player('P0').respond('行殇', { choice: true });
    await harness.waitForStable();

    expect(state.players[0].hand).toEqual(expect.arrayContaining(['h1', 'lb1']));
    expect(state.players[1].pendingTricks).toEqual([]);
    expect(state.zones.discardPile).not.toContain('lb1');
    expectNoDuplicateInDiscard(state);
    assertCardInvariants(state);
  });

  // ─────────────────────────────────────────────────────────────
  // 6. 回归:未实体化的判定区牌(历史快照)仍应正常入弃牌堆
  // ─────────────────────────────────────────────────────────────
  it('回归:实体牌不在任何区时,拆判定区仍把牌置入弃牌堆', async () => {
    const lebu = mkCard('lb1', '乐不思蜀');
    const gq = mkCard('gq1', '过河拆桥', '♣', '4');
    const state = createGameState({
      players: [
        mkPlayer({ index: 0, name: 'P0', hand: ['gq1'], skills: ['回合管理', '过河拆桥'] }),
        mkPlayer({
          index: 1,
          name: 'P1',
          pendingTricks: [{ name: '乐不思蜀', source: 0, card: lebu }],
        }),
      ],
      cardMap: { lb1: lebu, gq1: gq },
      currentPlayerIndex: 0,
      phase: '出牌',
      turn: { round: 1, phase: '出牌', vars: {} },
    });
    await registerSkillsFromState(state);
    await harness.setup(state);
    await dispatchAndWait(state, {
      skillId: '过河拆桥',
      actionType: 'use',
      ownerId: 0,
      params: { cardId: 'gq1', targets: [1] },
      baseSeq: state.seq,
    });
    await fireTimeoutAndWait(state);
    await dispatchAndWait(state, {
      skillId: '过河拆桥',
      actionType: 'respond',
      ownerId: 0,
      params: { zone: 'judge', cardId: 'lb1' },
      baseSeq: state.seq,
    });

    expect(state.players[1].pendingTricks).toEqual([]);
    expect(state.zones.discardPile).toContain('lb1');
  });

  // ─────────────────────────────────────────────────────────────
  // 7-9. 重洗场景:弃牌堆重洗后,实体牌已回到牌堆,判定区只剩过期快照。
  //     清判定区路径不得把这张「快照牌」转移/复制到任何其他牌区
  //     (judge-zone 的「牌在某区时不再动作」与「牌在牌堆时不转移」分支)。
  // ─────────────────────────────────────────────────────────────
  it('重洗场景:实体牌已回牌堆,过河拆桥拆判定区不动牌堆中的实体牌', async () => {
    const lebu = mkCard('lb1', '乐不思蜀');
    const gq = mkCard('gq1', '过河拆桥', '♣', '4');
    const state = createGameState({
      players: [
        mkPlayer({ index: 0, name: 'P0', hand: ['gq1'], skills: ['回合管理', '过河拆桥'] }),
        mkPlayer({ index: 1, name: 'P1' }),
      ],
      cardMap: { lb1: lebu, gq1: gq },
      // 重洗后的状态:实体牌在牌堆(末尾 = 牌堆顶),判定区只剩过期快照
      zones: { deck: ['lb1'], discardPile: [], processing: [] },
      currentPlayerIndex: 0,
      phase: '出牌',
      turn: { round: 1, phase: '出牌', vars: {} },
    });
    state.players[1].pendingTricks = [{ name: '乐不思蜀', source: 0, card: lebu }];
    await harness.setup(state);

    await harness.player('P0').useCardAndTarget('过河拆桥', 'gq1', [1]);
    await fireTimeoutAndWait(state);
    await harness.player('P0').respond('过河拆桥', { zone: 'judge', cardId: 'lb1' });

    expect(state.players[1].pendingTricks).toEqual([]);
    // 实体牌留在牌堆且恰好一张,不被复制进弃牌堆
    expect(state.zones.deck.filter((id) => id === 'lb1')).toHaveLength(1);
    expect(state.zones.discardPile).not.toContain('lb1');
    expectNoDuplicateInDiscard(state);
    assertCardInvariants(state);
  });

  it('重洗场景:实体牌已回牌堆,顺手牵羊取判定区不转移牌堆中的实体牌', async () => {
    const lebu = mkCard('lb1', '乐不思蜀');
    const snatch = mkCard('ss1', '顺手牵羊', '♦', '3');
    const state = createGameState({
      players: [
        mkPlayer({ index: 0, name: 'P0', hand: ['ss1'], skills: ['回合管理', '顺手牵羊'] }),
        mkPlayer({ index: 1, name: 'P1' }),
      ],
      cardMap: { lb1: lebu, ss1: snatch },
      zones: { deck: ['lb1'], discardPile: [], processing: [] },
      currentPlayerIndex: 0,
      phase: '出牌',
      turn: { round: 1, phase: '出牌', vars: {} },
    });
    state.players[1].pendingTricks = [{ name: '乐不思蜀', source: 0, card: lebu }];
    await harness.setup(state);

    await harness.player('P0').useCardAndTarget('顺手牵羊', 'ss1', [1]);
    await fireTimeoutAndWait(state);
    await harness.player('P0').respond('顺手牵羊', { zone: 'judge', cardId: 'lb1' });

    expect(state.players[1].pendingTricks).toEqual([]);
    // 快照过期:实体牌留在牌堆(恰好一张),不进使用者手牌,也不复制进弃牌堆
    expect(state.zones.deck.filter((id) => id === 'lb1')).toHaveLength(1);
    expect(state.players[0].hand).not.toContain('lb1');
    expect(state.zones.discardPile).not.toContain('lb1');
    expectNoDuplicateInDiscard(state);
    assertCardInvariants(state);
  });

  it('重洗场景:实体牌已回牌堆,死亡清理不把过期快照补入弃牌堆', async () => {
    const sd = mkCard('sd1', '闪电', '♠', 'A');
    const state = createGameState({
      players: [mkPlayer({ index: 0, name: 'P0' }), mkPlayer({ index: 1, name: 'P1', health: 1 })],
      cardMap: { sd1: sd },
      zones: { deck: ['sd1'], discardPile: [], processing: [] },
      currentPlayerIndex: 0,
      phase: '出牌',
      turn: { round: 1, phase: '出牌', vars: {} },
    });
    state.players[1].pendingTricks = [{ name: '闪电', source: 0, card: sd }];
    await harness.setup(state);

    await runDeathFlow(state, 1);
    await harness.waitForStable();

    expect(state.players[1].alive).toBe(false);
    expect(state.players[1].pendingTricks).toEqual([]);
    // 实体牌留在牌堆且恰好一张,过期快照不重复入弃牌堆
    expect(state.zones.deck.filter((id) => id === 'sd1')).toHaveLength(1);
    expect(state.zones.discardPile).not.toContain('sd1');
    expectNoDuplicateInDiscard(state);
    assertCardInvariants(state);
  });
});
