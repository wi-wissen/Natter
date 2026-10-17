// Bundle the core with esbuild and report minified and gzip size: the browser entry (small start, one chunk per pack)
// and the full entry (everything in one file).
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
const gz = (c) => gzipSync(c, { level: 9 }).length;
const base = { bundle: true, minify: true, format: 'esm', write: false, target: 'es2022' };

const full = await build({ ...base, entryPoints: ['packages/core/src/index.js'] });
console.log(`full (index.js):    ${kb(full.outputFiles[0].contents.length)} minified, ${kb(gz(full.outputFiles[0].contents))} gzip`);

const split = await build({ ...base, entryPoints: ['packages/core/src/browser.js'], splitting: true, outdir: 'out' });
const main = split.outputFiles.find((f) => /browser\.js$/.test(f.path));
console.log(`browser start:      ${kb(main.contents.length)} minified, ${kb(gz(main.contents))} gzip`);
for (const f of split.outputFiles) if (f !== main) console.log(`  chunk ${f.path.split('/').pop().padEnd(22)} ${kb(f.contents.length).padStart(9)} minified, ${kb(gz(f.contents)).padStart(8)} gzip`);
