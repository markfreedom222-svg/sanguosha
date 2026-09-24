// 被拒动作的 preceding 回滚:玩家可见的有序数组(手牌 / 标记)必须回到动作前的状态。
//
// preceding(转化技的 当作/去标记 等)会直接 mutate players[i].hand / marks,
// 而技能的 rollback 回调各自实现恢复:多张牌用 push 追加到末尾、单张用
// `hand[idx] = cardId` 写回影子卡所在位置——两者都把原牌挪到了手牌末尾。
// 手牌顺序是客户端可见状态(UI 排列 + pickTargetCard 盲选的 handIndex),
// 被拒动作把它改掉后,在线客户端(增量视图,看不到被回滚的 preceding 事件)
// 与权威 buildView 的手牌顺序永久不一致 → 玩家按位置选到的牌与点击的不是同一张。
import { describe, it, expect } from 'vitest';
import { SkillTestHarness } from '../engine-harness';
import '../../src/engine/atoms';
import { createGameState, suitColor } from '../../src/engine/types';
import type { Card, GameState, PlayerState } from '../../src/engine/types';

function mkCard(
  id: string,
  name: string,
  suit: '♠' | '♥' | '♣' | '♦',
  rank: string,
  type: Card['type'] = '基本牌',
): Card {
  return { id, name, suit, color: suitColor(suit), rank, type };
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

/** 3 座次:P0 与 P2 座位距离 2(徒手攻击范围 1)→ 对 P2 出杀 validate 必失败 */
function makeState(players: PlayerState[], cardMap: Record<string, Card>): GameState {
  const state = createGameState({
    players,
    cardMap,
    currentPlayerIndex: 0,
    phase: '出牌',
    turn: { round: 1, phase: '出牌', vars: {} },
  });
  state.zones = { deck: [], discardPile: [], processing: [] };
  return state;
}

describe('preceding 回滚:玩家可见的有序数组顺序不变', () => {
  it('武圣转化被拒(目标非法)→ 手牌顺序与内容回到动作前', async () => {
    const harness = new SkillTestHarness();
    const red = mkCard('r1', '闪', '♥', '5'); // 红色牌 → 武圣可转化
    const black = mkCard('b1', '闪', '♠', '6');
    const peach = mkCard('r2', '桃', '♦', '7');
    const state = makeState(
      [
        mkPlayer(0, 'P0', ['r1', 'b1', 'r2'], ['武圣', '杀', '回合管理']),
        mkPlayer(1, 'P1', [], []),
        mkPlayer(2, 'P2', [], []),
      ],
      { r1: red, b1: black, r2: peach },
    );
    await harness.setup(state);
    const P0 = harness.player('P0');

    const before = [...harness.state.players[0].hand];

    // preceding=[武圣 transform] + 主 action=杀.use(目标为自己 → 非法,被拒)
    const accepted = await P0.tryDispatch({
      skillId: '杀',
      actionType: 'use',
      params: { cardId: 'r1#武圣', targets: [0] },
      preceding: [{ skillId: '武圣', actionType: 'transform', params: { cardId: 'r1' } }],
    });
    expect(accepted, '杀不能指定自己为目标,应被拒绝').toBe(false);

    // 内容回到动作前
    expect([...harness.state.players[0].hand].sort()).toEqual([...before].sort());
    // 顺序也必须一致(客户端按位置选牌依赖它)
    expect(harness.state.players[0].hand).toEqual(before);
    // 影子卡已清理
    expect(harness.state.cardMap['r1#武圣']).toBeUndefined();
  });

  it('急袭转化被拒(田当顺手牵羊,目标超出距离)→ 田标记顺序不变', async () => {
    const harness = new SkillTestHarness();
    const jc1 = mkCard('jc1', '杀', '♣', '5');
    const jc2 = mkCard('jc2', '杀', '♠', '3');
    const state = makeState(
      [
        {
          ...mkPlayer(0, 'P0', [], ['急袭', '顺手牵羊', '回合管理']),
          marks: [
            { id: '屯田/田:1', scope: 0, payload: { cardId: 'jc1' } },
            { id: '屯田/田:2', scope: 0, payload: { cardId: 'jc2' } },
          ],
        },
        mkPlayer(1, 'P1', [], []),
        mkPlayer(2, 'P2', [], []),
      ],
      { jc1, jc2 },
    );
    await harness.setup(state);
    const P0 = harness.player('P0');

    const marksBefore = harness.state.players[0].marks.map((m) => m.id);

    // 田当顺手牵羊:目标 P2 距离 2 → 顺手牵羊(距离 1)validate 失败 → 回滚
    const accepted = await P0.tryDispatch({
      skillId: '顺手牵羊',
      actionType: 'use',
      params: { cardId: '屯田/田:1#急袭', targets: [2] },
      preceding: [{ skillId: '急袭', actionType: 'transform', params: { markId: '屯田/田:1' } }],
    });
    expect(accepted, '目标超出顺手牵羊距离,应被拒绝').toBe(false);

    // 田标记恢复,且顺序与动作前一致
    expect(harness.state.players[0].marks.map((m) => m.id)).toEqual(marksBefore);
    expect(harness.state.cardMap['屯田/田:1#急袭']).toBeUndefined();
  });
});
