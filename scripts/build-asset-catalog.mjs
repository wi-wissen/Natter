#!/usr/bin/env node
// Write packages/assets/catalog.json: every image of every pack (name, pack, file, size, tags, de/en), the sounds,
// and the animation groups. The Pygame Zero host reads it with one request instead of one per pack; the sprite
// gallery (scripts/build-sprites.mjs) and CodeNatter build on it. Usage: npm run assets:catalog [-- --check]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, buildCatalog, catalogText } from '../packages/assets/assets.js';

const file = join(ROOT, 'catalog.json');
const text = catalogText(buildCatalog());
if (process.argv.includes('--check')) {
  const ok = existsSync(file) && readFileSync(file, 'utf8') === text;
  console.log(ok ? 'catalog.json is current' : 'catalog.json is outdated: run npm run assets:catalog');
  process.exit(ok ? 0 : 1);
}
writeFileSync(file, text);
const c = JSON.parse(text);
console.log(`catalog.json: ${c.images.length} images, ${c.sounds.length} sounds, ${c.groups.length} groups in ${c.packs.length} packs (${(text.length / 1024).toFixed(0)} KB)`);
