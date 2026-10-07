import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { createStandardDeck } from '../src/engine/core/deck';
import { allCharacters } from '../src/engine/data/characters';
import type { Manifest } from '../src/client/resources/types';

const root = join(process.cwd(), 'public/packs/base');
const manifest: Manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
const resources = new Map(manifest.resources.map((r) => [r.id, r]));
const files = new Map(manifest.resources.map((r) => [r.file!, r.type]));
const errors: string[] = [];
for (const [file, type] of files) {
  try {
    const buffer = await readFile(join(root, file));
    if (type === 'image') {
      const metadata = await sharp(buffer).metadata();
      if (!metadata.width || !metadata.height) throw new Error('Empty image');
    } else if (type === 'audio') {
      // Three upstream .ogg files contain MPEG audio; preserve bytes and accept
      // their actual format. Browser decoding is checked on resource-check.html.
      const ogg = buffer.subarray(0, 4).toString() === 'OggS';
      const mpeg = buffer.length > 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
      if (!ogg && !mpeg && buffer.subarray(0, 3).toString() !== 'ID3') throw new Error('Invalid audio header');
    }
    const response = await fetch(`http://127.0.0.1:3930/packs/base/${file.split('/').map(encodeURIComponent).join('/')}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!(response.headers.get('content-type') ?? '').startsWith(type === 'image' ? 'image/' : 'audio/')) throw new Error('Unexpected MIME');
  } catch (error) { errors.push(`${file}: ${String(error)}`); }
}
const deck = createStandardDeck();
for (const card of deck) {
  if (!resources.has(`card/${card.name}-${card.rank}-${card.suit}`)) errors.push(`Missing deck image: ${card.name} ${card.suit}${card.rank}`);
}
const missing = allCharacters.filter((c) => !resources.has(`character/${c.name}`)).map((c) => c.name);
const summary = { resourceIds: resources.size, verifiedFiles: files.size, deckCards: deck.length, characterImages: allCharacters.length - missing.length, totalCharacters: allCharacters.length, missingCharacters: missing, errors };
console.log(JSON.stringify(summary, null, 2));
if (errors.length) process.exitCode = 1;
