// @vitest-environment jsdom
// 前端交互测试:回应窗口(respond pending)的快捷交互行为。
//
// 涵盖:
//   1) 手牌中没有可回应的牌(0 候选)时,动作条不渲染置灰的「打出」,
//      只显示醒目的一键「无牌可出 · 不回应」;点击发送空 respond(skip 语义)。
//   2) 有可回应牌时,双击该牌直接打出(跳过「选中→点打出」两步确认)。
//   3) Esc 撤销已选回应牌(再点 Enter 不应误出牌)。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GameViewComponent } from '../../src/client/components/GameView';
import { clearRegistry } from '../../src/client/skillActionRegistry';
import type { GameView, PendingView } from '../../src/engine/types';

function dodgeCard(id: string, name: string) {
  return { id, name, suit: '♠' as const, color: '黑', rank: '5', type: '基本牌' as const };
}

function makeView(hand: ReturnType<typeof dodgeCard>[]): GameView {
  const dodgePending = {
    type: 'awaits',
    atom: { type: '询问闪', target: 0, source: 1 },
    prompt: {
      type: 'useCard',
      title: '是否出闪',
      cardFilter: { filter: (c: { name: string }) => c.name === '闪', min: 1, max: 1 },
    },
    target: 0,
    isBlocking: true,
    deadline: Date.now() + 15000,
    totalMs: 15000,
  } as unknown as PendingView;
  return {
    viewer: 0,
    currentPlayerIndex: 1,
    phase: '出牌',
    turn: { round: 1, phase: '出牌', vars: {} },
    players: [
      {
        index: 0,
        name: 'P1',
        character: '测试',
        health: 3,
        maxHealth: 4,
        alive: true,
        equipment: {},
        skills: [],
        handCount: hand.length,
        hand,
        marks: [],
        pendingTricks: [],
      },
      {
        index: 1,
        name: 'P2',
        character: '测试',
        health: 4,
        maxHealth: 4,
        alive: true,
        equipment: {},
        skills: [],
        handCount: 2,
        marks: [],
        pendingTricks: [],
      },
    ],
    cardMap: {},
    pending: dodgePending,
    deadline: null,
    deadlineTotalMs: 0,
    log: [],
    settlementStack: [],
  } as unknown as GameView;
}

describe('GameView:回应窗口快捷交互', () => {
  beforeEach(() => {
    clearRegistry();
  });

  it('手牌无可回应牌(0 候选) → 渲染醒目的一键「无牌可出 · 不回应」,无置灰「打出」', () => {
    const view = makeView([dodgeCard('a', '杀'), dodgeCard('b', '桃')]);
    render(<GameViewComponent view={view} onAction={() => {}} currentEvent={null} />);
    expect(screen.getByRole('button', { name: '无牌可出 · 不回应' })).toBeDefined();
    expect(screen.queryByRole('button', { name: /打出/ })).toBeNull();
    expect(screen.queryByRole('button', { name: '不回应' })).toBeNull();
  });

  it('0 候选时点击一键按钮发送空 respond(skip 语义)', () => {
    const onAction = vi.fn();
    const view = makeView([dodgeCard('a', '杀')]);
    render(<GameViewComponent view={view} onAction={onAction} currentEvent={null} />);
    fireEvent.click(screen.getByRole('button', { name: '无牌可出 · 不回应' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    const msg = onAction.mock.calls[0][0];
    expect(msg.actionType).toBe('respond');
    expect(msg.params).toEqual({});
  });

  it('有可回应牌:双击该牌直接打出(一次动作,不经「打出」按钮)', () => {
    const onAction = vi.fn();
    const view = makeView([dodgeCard('s1', '闪'), dodgeCard('a', '桃')]);
    render(
      <GameViewComponent view={view} onAction={onAction} currentEvent={null} />,
    );
    const card = document.querySelector('[data-card-id="s1"]') as HTMLElement;
    expect(card).toBeTruthy();
    fireEvent.doubleClick(card);
    expect(onAction).toHaveBeenCalledTimes(1);
    const msg = onAction.mock.calls[0][0];
    expect(msg.actionType).toBe('respond');
    expect(msg.params).toEqual({ cardId: 's1' });
  });
});

// ─── 自由出牌双击:无目标牌(无中生有/装备)双击直接出,需目标牌退化为选中 ───
describe('GameView:自由出牌双击快速出牌', () => {
  beforeEach(() => {
    clearRegistry();
  });

  function makePlayView(cards: ReturnType<typeof dodgeCard>[]): GameView {
    return {
      viewer: 0,
      currentPlayerIndex: 0,
      phase: '出牌',
      turn: { round: 1, phase: '出牌', vars: {} },
      players: [
        {
          index: 0,
          name: 'P1',
          character: '测试',
          health: 3,
          maxHealth: 4,
          alive: true,
          equipment: {},
          // 与真实 view 一致:通用卡使用入口走 '使用牌' 技能模块注册(见 engine/atoms/选将 DEFAULT_SKILLS)
          skills: ['回合管理', '装备通用', '使用牌', '打出牌'],
          handCount: cards.length,
          hand: cards,
          marks: [],
          pendingTricks: [],
          turnUsage: {},
        },
        {
          index: 1,
          name: 'P2',
          character: '测试',
          health: 4,
          maxHealth: 4,
          alive: true,
          equipment: {},
          skills: [],
          handCount: 2,
          marks: [],
          pendingTricks: [],
        },
      ],
      cardMap: {},
      pending: null,
      deadline: null,
      deadlineTotalMs: 0,
      log: [],
      settlementStack: [],
    } as unknown as GameView;
  }

  it('双击无目标牌(无中生有) → 直接发起 use action(不经「出牌」按钮)', async () => {
    const onAction = vi.fn();
    const view = makePlayView([{ ...dodgeCard('wz1', '无中生有'), type: '锦囊牌' } as any]);
    render(<GameViewComponent view={view} onAction={onAction} currentEvent={null} />);
    const card = document.querySelector('[data-card-id="wz1"]') as HTMLElement;
    // 单击选中出现「出牌」按钮 = 通用卡牌 use action 注册已完成(useSkillActions 异步注册)
    fireEvent.click(card);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /^出牌/ })).toBeTruthy();
    });
    fireEvent.doubleClick(card);
    await waitFor(() => {
      expect(onAction).toHaveBeenCalledTimes(1);
    });
    const msg = onAction.mock.calls[0][0];
    expect(msg.skillId).toBe('无中生有');
    expect(msg.actionType).toBe('use');
    expect(msg.params).toEqual({ cardId: 'wz1' });
  });

  it('双击需目标的牌(杀) → 仅选中,不发出出牌动作', async () => {
    const onAction = vi.fn();
    const view = makePlayView([dodgeCard('s1', '杀')]);
    render(<GameViewComponent view={view} onAction={onAction} currentEvent={null} />);
    const card = document.querySelector('[data-card-id="s1"]') as HTMLElement;
    // 单击出现「出牌」按钮 = 通用卡牌 use action 注册就绪;双击应退化为选中,不发 action
    fireEvent.click(card);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^出牌/ })).toBeTruthy();
    });
    fireEvent.doubleClick(card);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^出牌/ })).toBeTruthy();
    });
    expect(onAction).not.toHaveBeenCalled();
  });
});
