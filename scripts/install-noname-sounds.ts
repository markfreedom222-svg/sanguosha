import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { createStandardDeck } from '../src/engine/core/deck';
import type { Manifest } from '../src/client/resources/types';

const commit = 'f9e2ca727159855677f44ac2230491e83c2508c6';
const source = 'https://github.com/RainEggplant/noname';
export async function installNonameSounds(root: string, manifest: Manifest): Promise<void> {
  const response = await fetch(`https://api.github.com/repos/RainEggplant/noname/git/trees/${commit}?recursive=1`);
  if (!response.ok) throw new Error(`noname tree: HTTP ${response.status}`);
  const tree = await response.json() as { truncated: boolean; tree: Array<{ path: string; sha: string }> };
  if (tree.truncated) throw new Error('Incomplete noname resource tree');
  const hashes = new Map(tree.tree.map((e) => [e.path, e.sha]));
  const sounds: Record<string, string> = {
    flip: 'draw', draw: 'draw', discard: 'discard', judge: 'judge', shuffle: 'drawx', card_place: 'discard',
    heal: 'recover', lose_health: 'loseHp', chain: 'link', equip: 'equip1', unequip: 'discard',
    injure_1: 'damage', injure_2: 'damage2', injure_3: 'damage2', death: 'die_male', win: 'win', lose: 'lose',
  };
  for (const card of createStandardDeck()) if (card.type === '装备牌') {
    const slot: Record<string, string> = { 武器: 'equip1', 防具: 'equip2', 防御马: 'equip3', 进攻马: 'equip4', 宝物: 'equip5' };
    sounds[`equip/${card.name}`] = slot[card.subtype ?? ''] ?? 'equip1';
  }
  const paths = [...new Set(Object.values(sounds).map((name) => `audio/effect/${name}.mp3`)), 'audio/background/music_default.mp3', 'LICENSE', 'README.md'];
  for (const path of paths) {
    const target = join(root, 'upstream/noname', path);
    const hash = (b: Buffer) => createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');
    let buffer: Buffer | undefined;
    try { buffer = await readFile(target); } catch { /* first install */ }
    if (!buffer || hash(buffer) !== hashes.get(path)) {
      const res = await fetch(`https://raw.githubusercontent.com/RainEggplant/noname/${commit}/${path}`, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`noname ${path}: HTTP ${res.status}`);
      buffer = Buffer.from(await res.arrayBuffer());
      if (hash(buffer) !== hashes.get(path)) throw new Error(`noname integrity mismatch: ${path}`);
      await mkdir(join(target, '..'), { recursive: true });
      await writeFile(target + '.tmp', buffer);
      await rename(target + '.tmp', target);
    }
  }
  const replace = new Set([...Object.keys(sounds), 'turn_start', 'turn_end', 'phase_start', 'phase_end'].map((s) => `sound/${s}`));
  manifest.resources = manifest.resources.filter((r) => !replace.has(r.id));
  for (const [id, name] of Object.entries(sounds)) manifest.resources.push({ id: `sound/${id}`, type: 'audio', file: `upstream/noname/audio/effect/${name}.mp3` });
  manifest.resources = manifest.resources.filter((r) => r.id !== 'sound/bgm');
  manifest.resources.push({ id: 'sound/bgm', type: 'audio', file: 'upstream/noname/audio/background/music_default.mp3' });
  manifest.description = 'QSanguosha 原图与语音，noname 卡牌动作音效；回合和阶段切换静音。部分界武将共用标准立绘。授权及来源见资源包说明。';
  await writeFile(join(root, 'NONAME-ATTRIBUTION.md'), `# noname action audio\nSource: ${source}\nCommit: ${commit}\nOriginal MP3 files, unchanged. Repository license: GPLv3; retained at upstream/noname/LICENSE. README is retained. Original material rights remain with their owners; no claim of MIT/CC0 licensing. No upstream source code copied.\nPlayback design independently implemented: silent phase transitions, action-specific sounds, repeat suppression.\n`);
  console.log(`Installed noname action audio (${paths.length - 2} original clips).`);
}
