// Download original, pinned upstream assets; no image/audio transformation.
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { createStandardDeck } from '../src/engine/core/deck';
import { allCharacters } from '../src/engine/data/characters';
import type { Manifest } from '../src/client/resources/types';
import { installNonameSounds } from './install-noname-sounds';

const commit = '85baa7489157c023bb2528a40ce4ef4e12863387';
const source = 'https://github.com/Mogara/QSanguosha';
const raw = `https://raw.githubusercontent.com/Mogara/QSanguosha/${commit}/`;
const v2Commit = 'e8768851bd8054db9fd1b63cd6f1feca813590d7';
const v2Raw = `https://raw.githubusercontent.com/Mogara/QSanguosha-v2/${v2Commit}/`;
const root = join(process.cwd(), 'public/packs/base');
await mkdir(root, { recursive: true });
async function request(url: string): Promise<Buffer> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (error) { if (attempt === 2) throw error; }
  }
  throw new Error('Download failed');
}
const tree = JSON.parse((await request(`https://api.github.com/repos/Mogara/QSanguosha/git/trees/${commit}?recursive=1`)).toString());
if (tree.truncated) throw new Error('Incomplete upstream tree');
const blobs = new Map<string, { sha: string }>(tree.tree.filter((e: { type: string }) => e.type === 'blob').map((e: { path: string; sha: string }) => [e.path, e]));
const v2Tree = JSON.parse((await request(`https://api.github.com/repos/Mogara/QSanguosha-v2/git/trees/${v2Commit}?recursive=1`)).toString());
if (v2Tree.truncated) throw new Error('Incomplete secondary tree');
for (const entry of v2Tree.tree) if (entry.type === 'blob') blobs.set(`v2/${entry.path}`, entry);
function sourceUrl(path: string): string {
  const secondary = path.startsWith('v2/');
  return (secondary ? v2Raw : raw) + (secondary ? path.slice(3) : path).split('/').map(encodeURIComponent).join('/');
}
function gitHash(buffer: Buffer): string {
  return createHash('sha1').update(`blob ${buffer.length}\0`).update(buffer).digest('hex');
}
async function download(path: string): Promise<string> {
  const file = `upstream/${path}`;
  const target = join(root, file);
  let buffer: Buffer | undefined;
  try { buffer = await readFile(target); } catch { /* first install */ }
  if (!buffer || gitHash(buffer) !== blobs.get(path)?.sha) {
    buffer = await request(sourceUrl(path));
    if (gitHash(buffer) !== blobs.get(path)?.sha) throw new Error(`Integrity mismatch: ${path}`);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target + '.tmp', buffer);
    await rename(target + '.tmp', target);
  }
  return file;
}
const translations = new Map<string, string[]>();
for (const path of blobs.keys()) {
  if (!/^(v2\/)?lang\/zh_CN\/Package\//.test(path) || !path.endsWith('.lua')) continue;
  const text = (await request(sourceUrl(path))).toString('utf8');
  for (const match of text.matchAll(/\["([a-z][a-z0-9_]*)"\]\s*=\s*"([^"\n]+)"/g)) {
    const ids = translations.get(match[2]) ?? [];
    ids.push(match[1]); translations.set(match[2], ids);
  }
}
translations.set('卧龙诸葛', ['wolong']);
translations.set('张昭张纮', ['erzhang']);
translations.set('颜良文丑', ['yanliangwenchou']);
translations.set('关兴张苞', ['guanxingzhangbao']);
const cards: Record<string, string> = {
  杀: 'slash', 火杀: 'fire_slash', 雷杀: 'thunder_slash', 闪: 'jink', 桃: 'peach', 酒: 'analeptic',
  决斗: 'duel', 无中生有: 'ex_nihilo', 借刀杀人: 'collateral', 顺手牵羊: 'snatch', 过河拆桥: 'dismantlement',
  无懈可击: 'nullification', 铁索连环: 'iron_chain', 火攻: 'fire_attack', 桃园结义: 'god_salvation',
  南蛮入侵: 'savage_assault', 万箭齐发: 'archery_attack', 闪电: 'lightning', 五谷丰登: 'amazing_grace',
  乐不思蜀: 'indulgence', 兵粮寸断: 'supply_shortage', 知己知彼: 'known_both',
  诸葛连弩: 'Crossbow', 青釭剑: 'QinggangSword', 寒冰剑: 'IceSword', 雌雄双股剑: 'DoubleSword',
  贯石斧: 'axe', 丈八蛇矛: 'spear', 麒麟弓: 'KylinBow', 八卦阵: 'EightDiagram', 仁王盾: 'RenwangShield',
  白银狮子: 'SilverLion', 朱雀羽扇: 'fan', 三尖两刃刀: 'Triblade', 吴六剑: 'SixSwords', 藤甲: 'vine',
  青龙偃月刀: 'Blade', 方天画戟: 'Halberd', 赤兔: 'chitu', 大宛: 'dayuan', 紫骍: 'zixing',
  的卢: 'dilu', 绝影: 'jueying', 爪黄飞电: 'zhuahuangfeidian', 骅骝: 'hualiu', 古锭刀: 'guding_blade',
};
const manifest: Manifest = {
  manifestVersion: 1, id: 'base', name: '三国杀视听资源', version: '1.0.0', author: 'Mogara Team / QSanguosha',
  homepage: source, priority: 0,
  description: 'QSanguosha 原图及 OGG 音效，V2 补充立绘。仅非商业使用；授权与来源见资源包说明。部分界武将共用标准立绘。', resources: [],
};
const jobs = new Map<string, string>();
const missing: string[] = [];
const aliases: string[] = [];
function add(id: string, type: 'image' | 'audio', candidates: string[]) {
  const path = candidates.find((p) => blobs.has(p));
  if (!path) { missing.push(id); return; }
  jobs.set(path, `upstream/${path}`);
  manifest.resources.push({ id, type, file: `upstream/${path}` });
}
for (const character of allCharacters) {
  const name = character.name;
  const baseName = name.startsWith('界') ? name.slice(1) : name;
  const lookupName = baseName === '张昭张弘' ? '张昭张纮' : baseName;
  const ids = [...new Set(translations.get(lookupName) ?? [])].sort((a, b) => Number(a.includes('_')) - Number(b.includes('_')));
  if (name !== lookupName && ids.length) aliases.push(name);
  add(`character/${name}`, 'image', [
    ...ids.flatMap((id) => [`image/fullskin/generals/full/${id}.png`, `image/generals/card/${id}.jpg`]),
    ...ids.flatMap((id) => [`v2/image/fullskin/generals/full/${id}.png`, `v2/image/generals/card/${id}.jpg`]),
  ]);
  add(`sound/death/${name}`, 'audio', [...ids.map((id) => `audio/death/${id}.ogg`), ...ids.map((id) => `v2/audio/death/${id}.ogg`)]);
}
for (const [name, id] of Object.entries(cards)) {
  const candidates = [`image/big-card/${id}.png`, `image/card/${id}.png`, `image/card/${id[0].toUpperCase() + id.slice(1)}.png`, `v2/image/big-card/${id}.png`, `v2/image/card/${id}.png`];
  add(`card/art/${name}`, 'image', candidates);
  if (createStandardDeck().some((card) => card.name === name && card.type === '装备牌')) add(`card/equipment/${name}`, 'image', candidates);
  const voice = id.toLowerCase();
  if (blobs.has(`audio/card/male/${voice}.ogg`)) add(`sound/card/${name}`, 'audio', [`audio/card/male/${voice}.ogg`]);
}
// Keep exact physical-card IDs for compatibility, using original shared artwork.
for (const card of createStandardDeck()) {
  const name = card.name === '杀' && card.damageType === '火焰' ? '火杀' : card.name === '杀' && card.damageType === '雷电' ? '雷杀' : card.name;
  const art = manifest.resources.find((r) => r.id === `card/art/${name}`);
  const id = `card/${card.name}-${card.rank}-${card.suit}`;
  if (art && !manifest.resources.some((r) => r.id === id)) manifest.resources.push({ ...art, id });
}
const sounds: Record<string, string[]> = {
  flip: ['audio/system/choose-item.ogg'], shuffle: ['audio/system/choose-item.ogg'], card_place: ['audio/system/choose-item.ogg'],
  heal: ['audio/card/male/peach.ogg'], lose_health: ['audio/system/hplost.ogg'], death: ['audio/system/lose.ogg'],
  equip: ['audio/card/common/weapon.ogg'], unequip: ['audio/system/choose-item.ogg'], chain: ['audio/system/chained.ogg'],
  turn_start: ['audio/system/pop-up.ogg'], turn_end: ['audio/system/choose-item.ogg'],
  phase_start: ['audio/system/choose-item.ogg'], phase_end: ['audio/system/choose-item.ogg'],
  injure_1: ['audio/system/injure1.ogg'], injure_2: ['audio/system/injure2.ogg'], injure_3: ['audio/system/injure3.ogg'],
};
add('card/back', 'image', ['image/system/card-back.png']);
for (const [id, candidates] of Object.entries(sounds)) add(`sound/${id}`, 'audio', candidates);
for (const path of ['README.md', 'CC BY-NC-ND 4.0', 'v2/LICENSE', 'v2/GPLv3', 'v2/MCFR', 'v2/README.markdown']) jobs.set(path, `upstream/${path}`);
const queue = [...jobs.keys()];
let done = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (queue.length) {
    const path = queue.shift()!;
    await download(path);
    done++; if (done % 25 === 0) console.log(`Downloaded/verified ${done}/${jobs.size}`);
  }
}));
await writeFile(join(root, 'ATTRIBUTION.md'), `# QSanguosha resources\n\nSource: ${source}\nCommit: ${commit}\nAuthor: Mogara Team and original contributors.\nLicense: CC BY-NC-ND 4.0 https://creativecommons.org/licenses/by-nc-nd/4.0/\nOriginal files are unchanged. No commercial use. Upstream license and README are retained.\nManifest aliases are project-specific; some 界 characters share standard portraits; UI clips are reused for related events.\n`);
await writeFile(join(root, 'ATTRIBUTION.md'), `\nAdditional portraits/death voices: https://github.com/Mogara/QSanguosha-v2\nCommit: ${v2Commit}\nUpstream LICENSE states GPLv3 with MCFR (commercial use forbidden). See upstream/v2/LICENSE, GPLv3 and MCFR; these supplementary files are also unchanged. No source code from upstream is incorporated.\n`, { flag: 'a' });
await installNonameSounds(root, manifest);
await writeFile(join(root, 'coverage.json'), JSON.stringify({ source, commit, resources: manifest.resources.length, sharedPortraits: aliases, missing: missing.filter((id) => id.startsWith('character/')), missingAudio: missing.filter((id) => id.startsWith('sound/')) }, null, 2));
await writeFile(join(root, 'manifest.json.tmp'), JSON.stringify(manifest, null, 2));
await rename(join(root, 'manifest.json.tmp'), join(root, 'manifest.json'));
console.log(`Installed ${manifest.resources.length} resource IDs from ${jobs.size} original files.`);
console.log(`Missing portraits: ${missing.filter((id) => id.startsWith('character/')).join(', ')}`);
