// 主公技的主动 use action 只在主公位激活 —— 客户端 activeWhen 必须与引擎 validate 同源。
//
// 引擎侧:激将/界激将/界制霸 的 use action 都带主公位门槛(ownerId===0,
// 即「主公固定 0 号位」的项目约定),非主公位 validate 恒返
// 「现在不能使用激将」/「制霸为主公技,孙策非主公」。
//
// 客户端侧:非主公座次也会把武将自己的主公技装进 skills(孙策带 界制霸、刘备带 激将),
// 若 activeWhen 不校验主公位,无头/AI 客户端会枚举出这个 action → 提交恒被拒。
// AI 的启发式评分是确定性的,反复挑中同一非法动作即永久空转(fuzz 实测
// REJECT:界制霸:use 单局 14 次)。浏览器侧靠 LORD_SKILLS 展示过滤兜底,
// 但无头/AI 与 MCP 对局没有这层过滤 —— 判据必须写在 action 自身。
//
// 注:标版制霸 只实现盟友方向(引擎侧没有主公位的 use action),其客户端也未声明
// use action,故不在本用例的覆盖范围。
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
  identity: string;
  hand?: string[];
  skills: string[];
}): PlayerState {
  return {
    index: opts.index,
    name: opts.name,
    character: opts.character,
    faction: opts.faction,
    identity: opts.identity,
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

/** 组装 state 并按真实客户端路径注册技能 + 枚举 seat 的可执行动作。 */
async function enumerateForSeat(opts: {
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

/** 技能 → 武将与盟友势力(用于构造合法/非法座次场景)。 */
const CASES = [
  { skill: '激将', character: '刘备', faction: '蜀', allyFaction: '蜀' },
  { skill: '界激将', character: '界刘备', faction: '蜀', allyFaction: '蜀' },
  { skill: '界制霸', character: '界孙策', faction: '吴', allyFaction: '吴' },
] as const;

const CARDS = { c1: mkCard('c1', '杀', '♠', '7'), a1: mkCard('a1', '闪', '♥', '3') };

describe('主公技 use action:非主公座次不得枚举(与引擎 validate 同源)', () => {
  beforeEach(() => {
    clearRegistry();
  });

  for (const c of CASES) {
    it(`${c.skill}:非主公座次(座次 1)枚举不出该技能`, async () => {
      const { actions } = await enumerateForSeat({
        players: [
          mkPlayer({ index: 0, name: '主公位', character: '曹操', faction: '魏', identity: '主公', hand: ['a1'], skills: ['回合管理'] }),
          mkPlayer({ index: 1, name: '非主公', character: c.character, faction: c.faction, identity: '反贼', hand: ['c1'], skills: [c.skill, '回合管理'] }),
          mkPlayer({ index: 2, name: '盟友', character: '盟友', faction: c.allyFaction, identity: '忠臣', hand: ['a1'], skills: ['回合管理'] }),
        ],
        cardMap: { ...CARDS },
        seat: 1,
      });
      const mine = actions.filter((a) => a.message.skillId === c.skill);
      expect(mine, `${c.skill} 在非主公座次被枚举出 → 提交必被引擎拒`).toHaveLength(0);
    });

    it(`${c.skill}:主公座次(座次 0)枚举出的 action 被引擎接受`, async () => {
      const { state, actions } = await enumerateForSeat({
        players: [
          mkPlayer({ index: 0, name: '主公', character: c.character, faction: c.faction, identity: '主公', hand: ['c1'], skills: [c.skill, '回合管理'] }),
          mkPlayer({ index: 1, name: '盟友', character: '盟友', faction: c.allyFaction, identity: '忠臣', hand: ['a1'], skills: ['回合管理'] }),
        ],
        cardMap: { ...CARDS },
        seat: 0,
      });
      const mine = actions.filter((a) => a.message.skillId === c.skill);
      expect(mine, `${c.skill} 在主公座次应枚举出 action`).not.toHaveLength(0);
      const action = mine[0];
      const result = await dispatch(state, {
        ...action.message,
        params: {
          ...action.message.params,
          targets: action.validTargets.slice(0, 1),
          target: action.validTargets[0],
        },
        ownerId: 0,
        baseSeq: state.seq,
      });
      expect(result.accepted, `${c.skill} 主公用例必须被引擎接受`).toBe(true);
    });
  }
});
