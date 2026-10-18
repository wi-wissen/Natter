// Bundle the web host (with the core) into packages/web/dist/natter-web.js and report its size.
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outdir = join(here, 'dist');
rmSync(outdir, { recursive: true, force: true });
// the core comes as its browser build: a small start, one chunk per module pack, loaded when a program imports from it
await build({
  entryPoints: { 'natter-web': join(here, 'src/index.js') }, bundle: true, minify: true, format: 'esm', target: 'es2022', splitting: true,
  alias: { '@natterjs/core': join(here, '../core/src/browser.js') },
  loader: { '.svg': 'text' }, sourcemap: true, outdir, legalComments: 'none',
});
const kb = (n) => (n / 1024).toFixed(1) + ' KB';
const gz = (f) => gzipSync(readFileSync(join(outdir, f)), { level: 9 }).length;
const files = readdirSync(outdir).filter((f) => f.endsWith('.js'));
for (const f of files) console.log(`${f.padEnd(28)} ${kb(readFileSync(join(outdir, f)).length).padStart(10)} minified ${kb(gz(f)).padStart(9)} gzip${f === 'natter-web.js' ? '  (start)' : ''}`);
