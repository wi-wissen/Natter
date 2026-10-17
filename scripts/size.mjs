// Bundle the core with esbuild and report minified and gzipped size.
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';

const r = await build({ entryPoints: ['packages/core/src/index.js'], bundle: true, minify: true, format: 'esm', write: false, target: 'es2020' });
const code = r.outputFiles[0].contents;
const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log(`core: ${kb(code.length)} minified, ${kb(gzipSync(code, { level: 9 }).length)} gzip`);
