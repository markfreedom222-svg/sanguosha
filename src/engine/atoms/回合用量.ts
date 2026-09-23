// 回合用量:view 侧同步"本回合用量计数/限一次标记",供前端禁用超限/已用操作。
//
// 为什么需要它:后端用 state.turn.vars['杀/quotaUsed'+'杀/extraUsed'](出杀计数,合计=slashUsed())与
// state.players[i].vars['制衡/usedThisTurn'](限一次)判断操作合法性。
// 但这两个 vars 的变化不经 atom(技能 execute 直接 mutate),processedView
// (事件流增量)无法感知 → 前端读 view.turn.vars 永远是 baseline 旧值,
// "和后端一致"做不到。本 atom 是纯 view 同步通道:技能 execute 在同步设好
// state 侧 vars 后,紧接着 applyAtom('回合用量') 把同一个值同步到
// view.players[i].turnUsage,经 toViewEvents→广播→client applyView 链路
// 让前端实时拿到正确用量。
//
// 设计约束:
//   - apply 为 no-op:state 侧 vars 由技能 execute 同步维护(限一次标记必须在
//     execute 第一个 await 之前设置以防 dispatch 重入,见制衡.ts 注释)。
//     本 atom 只负责把"已设好的值"投影到 view,不重复改 state。
//   - 通用 key:value 约定:数字 key 表示已用次数('杀/usedCount'),
//     真值 key 表示限一次标记('* /usedThisTurn')。前端 activeWhen 按需读取。
import type { AtomDefinition, GameView, ViewEventSplit, ViewEvent, Json } from '../types';
import { TURN_SCOPED_VIEW_KEYS, VIEW_MIRROR_PREFIX } from '../rules/vars-keys';

export const 回合用量: AtomDefinition<{ player: number; key: string; value: Json }> = {
  type: '回合用量',
  validate(state, atom) {
    if (!state.players[atom.player]) return `player ${atom.player} not found`;
    return null;
  },
  apply(state, atom) {
    // 默认 no-op:限一次标记/用量计数等 state 侧 vars 由技能 execute 同步维护
    // (限一次标记必须在 execute 第一个 await 之前设置以防 dispatch 重入)。
    // 例外:出杀放宽族键('杀/unlimited/*'、'杀/extra/*'、'杀/blocked/*'、'杀/target/*'、
    // '杀/exemptSuit'、'杀/usedCount')的 state 侧真相在 provider 注册表而非 vars,
    // 仅投影 view 会让「初始视图/重连视图」(buildView 从 state 重建)丢失放宽,
    // 重连后玩家/AI 按默认上限 1 判定 → 引擎允许的第 2 张杀发不出动作。
    // 故把这些键镜像进 turn.vars(前缀 '__view/',buildView 据此重建 turnUsage)。
    // 独立前缀而非同名键:同名键在 界弓骑/active、将驰/choice2 上 state 侧存「座次」、
    // view 侧存 true,直接覆盖会让引擎侧谓词(=== 座次)失配、技能整段失效。
    // 回合结束随 turn.vars 自动清空;同一键可反复更新(如 往烈/首张可用 true→false)。
    const mirrorable =
      atom.key.startsWith('杀/') || TURN_SCOPED_VIEW_KEYS.includes(atom.key);
    if (mirrorable) {
      state.turn.vars[VIEW_MIRROR_PREFIX + atom.key] = atom.value;
    }
  },
  toViewEvents(_state, atom): ViewEventSplit {
    const view: ViewEvent = {
      type: '回合用量',
      player: atom.player,
      key: atom.key,
      value: atom.value,
    };
    // 用量信息对所有人可见(出杀次数/限一次是公开信息),用 othersView 广播。
    return { ownerViews: new Map(), othersView: view };
  },
  applyView(view: GameView, event) {
    const p = view.players[event.player as number];
    if (!p) return;
    p.turnUsage ??= {};
    p.turnUsage[event.key as string] = event.value as Json;
  },
};

