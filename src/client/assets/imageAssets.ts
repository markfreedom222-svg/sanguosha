// src/client/assets/imageAssets.ts
// 武将/卡牌图片资源映射。薄委托 ResourceManager。
//
// 全局 ID 约定（见 docs/superpowers/specs/2026-07-26-resource-pack-system-design.md §3.1）：
//   character/{名}              武将立绘
//   card/{名}-{点}-{花色}       手牌大图
//   card/equipment/{名}         装备区缩略图
//
// 缺失资源（无文件或未注册）ResourceManager.get 返回 null，调用方 fallback：
//   - 卡牌：<object> fallback 到 HTML 牌面
//   - 武将：<img onError> fallback 到势力色背景

import { resourceManager } from '../resources';
import { 基本牌列表, 锦囊牌列表, 装备牌列表 } from '../../engine/data/card-defs';
import type { CardType } from '../../engine/types';

const NAME_TO_SUB: ReadonlyMap<string, 'basic' | 'equipment' | 'trick'> = (() => {
  const m = new Map<string, 'basic' | 'equipment' | 'trick'>();
  const subOf = (t: CardType): 'basic' | 'equipment' | 'trick' =>
    t === '基本牌' ? 'basic' : t === '装备牌' ? 'equipment' : 'trick';
  for (const def of 基本牌列表) m.set(def.name, subOf(def.type));
  for (const def of 锦囊牌列表) m.set(def.name, subOf(def.type));
  for (const def of 装备牌列表) m.set(def.name, subOf(def.type));
  return m;
})();

/** 武将立绘 URL。name 为空返回 null。 */
export function getCharacterImage(name: string): string | null {
  if (!name) return null;
  return resourceManager.get(`character/${name}`);
}

/** 卡牌图 URL。需同时具备 name + suit + rank。扩展名由 manifest 的 file 字段决定。 */
export function getCardImage(card: { name: string; suit?: string; rank?: string; damageType?: string }): string | null {
  // 出牌历史使用展示名「火杀/雷杀」，手牌使用内部名「杀」和伤害属性。
  // 两种输入都归到基本牌「杀」，避免展示名被当作未知牌而退回深色占位。
  const variant = card.name === '火杀' || card.name === '雷杀' ? card.name
    : card.name === '杀' && card.damageType === '火焰' ? '火杀'
    : card.name === '杀' && card.damageType === '雷电' ? '雷杀' : null;
  const name = variant ? '杀' : card.name;
  const sub = NAME_TO_SUB.get(name);
  if (!sub || !card.suit || !card.rank) return null;
  if (variant) {
    const art = resourceManager.get(`card/art/${variant}`);
    if (art) return art;
  }
  return resourceManager.get(`card/${name}-${card.rank}-${card.suit}`)
    ?? resourceManager.get(`card/art/${name}`);
}

/** 装备区缩略图 URL。 */
export function getEquipCardImage(name: string): string | null {
  if (NAME_TO_SUB.get(name) !== 'equipment') return null;
  return resourceManager.get(`card/equipment/${name}`);
}

/** 牌背图 URL。优先 pack 系统注册的牌背(card/back);否则回退到 gen-card.ts 生成的
 *  牌背(cards-ai/back.png,本地开发默认存在)。文件缺失时调用方应回退到内联 SVG 牌背。 */
export function getCardBackImage(): string | null {
  return resourceManager.get('card/back') ?? '/cards-ai/back.png';
}
