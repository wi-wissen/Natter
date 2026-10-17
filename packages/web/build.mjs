// Bundle the web host (with the core) into packages/web/dist/natter-web.js and report its size.
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outfile = join(here, 'dist/natter-web.js');
await build({
  entryPoints: [join(here, 'src/index.js')], bundle: true, minify: true, format: 'esm', target: 'es2020',
  loader: { '.svg': 'text' }, sourcemap: true, outfile, legalComments: 'none',
});
const code = readFileSync(outfile);
const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log(`natter-web.js: ${kb(code.length)} minified, ${kb(gzipSync(code, { level: 9 }).length)} gzip`);
