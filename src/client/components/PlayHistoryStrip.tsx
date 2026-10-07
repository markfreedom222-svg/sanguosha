// src/client/components/PlayHistoryStrip.tsx
// 对战区中央出牌历史条:FIFO 小牌 + 下方短标注(谁对谁 / 谁弃)。

import { memo, useEffect, useRef } from 'react';
import { css } from '@linaria/core';
import { SUIT_COLOR } from './gameViewConstants';
import { CardFace } from './CardFace';
import type { PlayHistoryItem } from '../utils/playHistoryQueue';

export type PlayHistoryStripProps = {
  items: PlayHistoryItem[];
};

function PlayHistoryStripImpl({ items }: PlayHistoryStripProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stripRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [items]);
  if (items.length === 0) return null;
  return (
    <div ref={stripRef} className={strip} aria-label="出牌展示" data-play-history-count={items.length}>
      {items.map((it) => {
        return (
          <div key={it.id} className={slot}>
            <div className={cardFace} style={{ borderColor: SUIT_COLOR[it.card.suit ?? ''] ?? '#ccc' }}>
              <CardFace name={it.card.name} suit={it.card.suit} rank={it.card.rank} size="normal" />
            </div>
            <div className={caption} title={it.caption}>
              {it.caption}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function propsEqual(a: PlayHistoryStripProps, b: PlayHistoryStripProps): boolean {
  if (a.items.length !== b.items.length) return false;
  for (let i = 0; i < a.items.length; i++) {
    const x = a.items[i];
    const y = b.items[i];
    if (x.id !== y.id || x.caption !== y.caption) return false;
  }
  return true;
}

export const PlayHistoryStrip = memo(PlayHistoryStripImpl, propsEqual);

const strip = css`
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: flex-end;
  justify-content: flex-start;
  gap: 8px;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  flex: 0 1 auto;
  overflow-x: auto;
  padding: 4px 8px;
  border-radius: 8px;
  scrollbar-width: thin;
  pointer-events: auto;
`;

const slot = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  flex: 0 0 auto;
  animation: playHistoryIn 0.25s ease-out both;
`;

const cardFace = css`
  position: relative;
  box-sizing: border-box;
  width: 72px;
  height: 96px;
  padding: 0;
  border-radius: 6px;
  background: linear-gradient(135deg, #3a3048 0%, #1e1a28 100%);
  border: 2px solid #c9a227;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.55);
  text-align: center;
  overflow: hidden;
`;

const caption = css`
  font-size: 16px;
  font-weight: 700;
  color: #e8d5a3;
  width: 100px;
  text-align: center;
  white-space: normal;
  overflow-wrap: anywhere;
  line-height: 1.2;
  min-height: 2.4em;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
`;
