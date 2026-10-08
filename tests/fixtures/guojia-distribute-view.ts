import type { Card, DistributePrompt, GameView } from '../../src/engine/types';

export function makeGuojiaDistributeView(boundary = false): GameView {
  const cards: Card[] = [
    { id: 'g-kill', name: '杀', suit: '♠', rank: '7', color: '黑', type: '基本牌' },
    { id: 'g-dodge', name: '闪', suit: '♥', rank: '2', color: '红', type: '基本牌' },
    { id: 'g-peach', name: '桃', suit: '♥', rank: '3', color: '红', type: '基本牌' },
    { id: 'g-wine', name: '酒', suit: '♣', rank: '9', color: '黑', type: '基本牌' },
  ];
  const skill = boundary ? '界遗计' : '遗计';
  const hand = boundary ? cards : cards.slice(2);
  const prompt: DistributePrompt = {
    type: 'distribute', mode: 'allocate', title: '遗计：选择牌并分配',
    ...(boundary ? { source: 'hand' as const } : { cardIds: ['g-kill', 'g-dodge'] }),
    allowSelf: !boundary, minTotal: boundary ? 1 : 2, maxTotal: 2,
    minPerTarget: 1, maxPerTarget: 2, cancelLabel: boundary ? '取消交牌' : '不发动',
  };
  return {
    viewer: 0,
    currentPlayerIndex: 1,
    phase: '出牌',
    turn: { round: 1, phase: '出牌', vars: {} },
    players: [
      { index: 0, name: '郭嘉', username: '测试玩家', character: boundary ? '界郭嘉' : '郭嘉',
        health: 2, maxHealth: 3, alive: true, equipment: {}, skills: [skill], hand, handCount: hand.length, marks: [] },
      { index: 1, name: '孙权', username: '好友', character: '孙权', health: 4, maxHealth: 4,
        alive: true, equipment: {}, skills: [], handCount: 4, marks: [] },
    ],
    cardMap: Object.fromEntries(cards.map((card) => [card.id, card])),
    pending: {
      type: 'awaits', target: 0, isBlocking: true, totalMs: 30000,
      atom: { type: '请求回应', target: 0, requestType: boundary ? '界遗计/giveCard' : '遗计/distribute', prompt },
      prompt,
    },
    deadline: null, deadlineTotalMs: 30000, log: [], settlementStack: [],
  };
}
