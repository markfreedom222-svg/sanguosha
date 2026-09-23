// tests/engine/pending-broadcast-fallback.test.ts
// buildView(初始视图/重连视图)的 pending 选择必须与事件流(applyView 增量)一致。
//
// Bug:viewer 自己的 slot 处于 paused(该玩家的 respond execute 尚未结束)时,
// buildView 直接丢弃自己 slot 并回退到 observer 分支,而 observer 分支只认
// target>=0 的其他玩家 slot —— 广播型 slot(target=-2,如无懈可击)被跳过,
// 导致该 viewer 的 buildView.pending 为 null,而事件流里广播询问明明开着。
// 后果:玩家在「自己动作触发的无懈可击询问」期间重连,看不到询问、无法回应
// (增量视图/在线客户端能看到)。
import { describe, it, expect, beforeEach } from 'vitest';
import { buildView, dispatch } from '../../src/engine/index';
import { waitForStable } from '../engine-harness';
import '../../src/engine/atoms';
import type { Card, GameState } from '../../src/engine/types';
import { createGameState } from '../../src/engine/types';

function mkCard(
  id: string,
  name: string,
  suit: Card['suit'] = '♠',
  rank = '5',
  type: Card['type'] = '锦囊牌',
): Card {
  return { id, name, suit, color: suit === '♥' || suit === '♦' ? '红' : '黑', rank, type };
}

function mkPlayer(index: number, name: string, hand: string[], skills: string[]) {
  return {
    index,
    name,
    character: '',
    health: 4,
    maxHealth: 4,
    alive: true,
    hand,
    equipment: {} as Record<string, string>,
    skills,
    vars: {},
    marks: [],
    pendingTricks: [],
    tags: [] as string[],
    judgeZone: [] as string[],
  };
}

describe('buildView:paused 专属 slot 时回退广播型 pending', () => {
  let state: GameState;

  beforeEach(async () => {
    const gq = mkCard('gq1', '过河拆桥', '♣', '4');
    const victim = mkCard('v1', '杀', '♠', '7', '基本牌');
    state = createGameState({
      players: [
        mkPlayer(0, 'P0', ['gq1'], ['回合管理', '使用牌', '打出牌', '过河拆桥']),
        mkPlayer(1, 'P1', ['v1'], ['回合管理']),
      ],
      cardMap: { gq1: gq, v1: victim },
      currentPlayerIndex: 0,
      phase: '出牌',
      turn: { round: 1, phase: '出牌', vars: {} },
    });
    // 出牌窗口:非阻塞 slot(target=0),模拟真实出牌阶段
    const { registerSkillsFromState } = await import('../../src/engine/index');
    await registerSkillsFromState(state);
  });

  it('使用者自己的动作触发无懈可击询问时,其 buildView 仍能看到广播询问', async () => {
    // 先建立出牌窗口 slot(非阻塞),使 P0 有自己的 slot
    const { applyAtom } = await import('../../src/engine/core/apply');
    // fire-and-forget:出牌窗口会挂起等待
    void applyAtom(state, { type: '出牌窗口', player: 0, timeout: 30 });
    await waitForStable(state);
    expect(state.pendingSlots.get(0)).toBeDefined();

    // P0 使用过河拆桥 → execute 挂起在无懈可击广播 slot 上,
    // 期间 P0 自己的出牌窗口 slot 被 pause(isPaused=true)
    void dispatch(state, {
      skillId: '过河拆桥',
      actionType: 'use',
      ownerId: 0,
      params: { cardId: 'gq1', targets: [1] },
      baseSeq: state.seq,
    });
    await waitForStable(state);

    const broadcastSlot = [...state.pendingSlots.values()].find(
      (s) => (s.atom as { requestType?: string }).requestType === '无懈可击',
    );
    expect(broadcastSlot, '应存在无懈可击广播 slot').toBeDefined();
    expect(state.pendingSlots.get(0)?.isPaused, 'P0 的出牌窗口 slot 应处于 paused').toBe(true);

    // 权威初始视图(重连路径)必须与事件流一致:显示无懈可击询问
    const view = buildView(state, 0);
    expect(view.pending, 'buildView 应显示广播型无懈可击询问').not.toBeNull();
    expect(
      (view.pending?.atom as { requestType?: string } | undefined)?.requestType,
      'buildView 的 pending 应为无懈可击广播询问',
    ).toBe('无懈可击');
    expect(view.pending?.target).toBe(-2);
  });

  it('回归:无广播 slot 时,paused 专属 slot 仍交给 observer 分支', async () => {
    const { applyAtom } = await import('../../src/engine/core/apply');
    void applyAtom(state, { type: '出牌窗口', player: 0, timeout: 30 });
    await waitForStable(state);

    // 手动 pause 专属 slot(模拟 respond execute 进行中),且无广播 slot
    state.pendingSlots.get(0)?.pause();
    const view = buildView(state, 0);
    // 无其他玩家 slot 可观察 → pending 为 null(不返回自己的 paused slot)
    expect(view.pending).toBeNull();
  });
});
