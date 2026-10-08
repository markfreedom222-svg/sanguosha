import { css, cx } from '@linaria/core';
import { CardFace } from './CardFace';
import { useGameView } from './GameViewCtx';
import type { PlayInteractionResult } from '../hooks/usePlayInteraction';
import { displayCardName } from '../utils/gameViewHelpers';
import * as styles from './gameViewStyles';

/** 技能选牌放在战场操作区，避开固定高度、裁剪内容的底部手牌栏。 */
export function DistributePromptPanel({ play }: { play: PlayInteractionResult }) {
  const { view, canOperate, perspectiveIdx, send } = useGameView();
  const { activeDistribute, distSelected, distAllocations } = play;
  if (!canOperate || !activeDistribute) return null;
  const { prompt } = activeDistribute;
  const allocating = (prompt.mode ?? 'allocate') === 'allocate';
  const assigned = new Map(distAllocations.flatMap((a) => a.cardIds.map((id) => [id, a.target] as const)));
  const playerLabel = (index: number) => {
    const p = view.players.find((p) => p.index === index);
    const name = p?.username?.trim() ? p.username : p?.name?.trim() ? p.name : `P${index + 1}`;
    return `${name}${index === perspectiveIdx ? '（自己）' : ''}`;
  };

  return (
    <section className={panel} aria-label="技能选牌与分配" data-testid="skill-card-picker">
      <strong className={styles.promptTitle}>{prompt.title}</strong>
      <p className={instructions}>
        {allocating ? activeDistribute.externalTargetSelection
          ? '① 点击牌 → ② 选择接收角色 → ③ 点击确定'
          : `① 点击牌 → ② 点击下方角色分配 → ③ ${(prompt.minTotal ?? 1) === activeDistribute.cardIds.length ? '全部分配后提交' : '提交分配'}`
          : '点击需要的牌，再点击确认'}
        {allocating && !activeDistribute.externalTargetSelection
          ? ` · 已分配 ${assigned.size} 张` : ` · 已选 ${distSelected.size} 张`}
      </p>
      <div className={cardRow}>
        {activeDistribute.cardIds.map((id) => {
          const card = view.cardMap[id];
          if (!card) return null;
          const target = assigned.get(id);
          const selected = distSelected.has(id);
          const name = displayCardName(card.name, card.damageType);
          return (
            <button
              key={id}
              type="button"
              className={cx(cardButton, selected && cardSelected, target !== undefined && cardAssigned)}
              aria-label={`${name} ${card.suit}${card.rank}`}
              aria-pressed={selected}
              disabled={target !== undefined}
              data-card-id={id}
              onClick={() => play.handleDistToggle(id)}
            >
              <span className={face}><CardFace {...card} size="small" /></span>
              <span className={cardCaption}>{name} {card.suit}{card.rank}</span>
              {target !== undefined && <span className={assignment}>→ {playerLabel(target)}</span>}
            </button>
          );
        })}
      </div>
      {allocating && (
        <div className={targetRow}>
          {view.players.filter((p) => play.isTargetable(p.index)).map((p) => {
            const received = distAllocations.filter((a) => a.target === p.index).reduce((n, a) => n + a.cardIds.length, 0);
            const disabled = distSelected.size === 0 || received + distSelected.size > (prompt.maxPerTarget ?? 99);
            return (
              <button
                key={p.index}
                className={styles.promptBtn}
                disabled={disabled}
                onClick={() => activeDistribute.externalTargetSelection
                  ? play.handleTargetClick(p.name) : play.handleDistAllocate(p.index)}
              >
                {activeDistribute.externalTargetSelection ? '选择' : '分给'} {playerLabel(p.index)}
              </button>
            );
          })}
        </div>
      )}
      {prompt.cancelLabel && activeDistribute.actionType === 'respond' && (
        <button
          className={styles.promptBtn}
          onClick={() => {
            send(activeDistribute.skillId, 'respond', { allocation: [] });
            play.handleDistClear();
          }}
        >{prompt.cancelLabel}</button>
      )}
    </section>
  );
}

const panel = css`
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  max-height: 330px;
  overflow-y: auto;
  border: 1px solid #8a7448;
  border-radius: 8px;
  background: #171209;
  color: #eee1c5;
  scrollbar-width: thin;
`;
const instructions = css`
  margin: 4px 0 8px;
  font-size: 14px;
  line-height: 1.5;
`;
const cardRow = css`
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 3px 2px 8px;
`;
const cardButton = css`
  flex: 0 0 92px;
  padding: 0;
  border: 2px solid #9c8454;
  border-radius: 6px;
  overflow: hidden;
  background: #211b11;
  color: #eee1c5;
  cursor: pointer;
  & > * { pointer-events: none; }
`;
const face = css`
  position: relative;
  display: block;
  height: 92px;
`;
const cardCaption = css`
  display: block;
  padding: 3px;
  font-size: 14px;
  font-weight: bold;
`;
const cardSelected = css`
  border-color: #66df92;
  box-shadow: 0 0 0 1px #66df92;
`;
const cardAssigned = css`
  border-color: #d0ab58;
  opacity: 0.7;
  cursor: default;
`;
const assignment = css`
  display: block;
  padding: 3px;
  font-size: 12px;
  overflow-wrap: anywhere;
`;
const targetRow = css`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 4px 0;
`;
