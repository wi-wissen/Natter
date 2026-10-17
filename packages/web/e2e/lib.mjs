// Small harness for the browser tests: a static server for packages/web, Chromium via Playwright, a test list.
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = join(ROOT, 'e2e/out');

/** Playwright from the project, or from the tools folder of the machine (PLAYWRIGHT_DIR, default /opt/node-tools). */
export async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* not installed in the project */ }
  const dir = process.env.PLAYWRIGHT_DIR ?? '/opt/node-tools/node_modules/';
  return createRequire(dir.endsWith('/') ? dir : dir + '/')('playwright');
}

/** Chromium binary: PW_CHROMIUM, else the preinstalled one if present, else Playwright's own. */
export async function chromiumPath() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  const p = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  try { await readFile(p); return p; } catch { return undefined; }
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.map': 'application/json', '.json': 'application/json', '.png': 'image/png', '.wav': 'audio/wav' };

/** Static server for packages/web plus /api/* answers for the requests tests. */
export function serve(port = 0, { cors = true } = {}) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/api/hello') {
      const h = { 'content-type': 'application/json' };
      if (cors) h['access-control-allow-origin'] = '*';
      res.writeHead(200, h);
      res.end(JSON.stringify({ greeting: 'hallo', method: req.method }));
      return;
    }
    const path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    try {
      // /assets/… is packages/assets (the demo finds it at ../../assets/ when the repository root is served)
      const file = /^[/\\]assets[/\\]/.test(path) ? join(ROOT, '..', path) : join(ROOT, path.endsWith('/') ? path + 'index.html' : path);
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

/** Run the tests one after the other; prints a line per test, exits with 1 when one fails. */
export async function runTests(tests, setup) {
  await mkdir(OUT, { recursive: true });
  const only = process.argv.slice(2);
  let failed = 0;
  const ctx = await setup();
  for (const [name, fn] of tests) {
    if (only.length && !only.some((o) => name.includes(o))) continue;
    const t0 = Date.now();
    try {
      await fn(ctx);
      console.log(`ok   ${name} (${Date.now() - t0} ms)`);
    } catch (e) {
      failed++;
      console.log(`FAIL ${name}\n     ${String(e?.stack ?? e).split('\n').slice(0, 6).join('\n     ')}`);
    }
  }
  await ctx.close();
  console.log(failed ? `${failed} failed` : 'all passed');
  process.exit(failed ? 1 : 0);
}

export function assert(cond, msg) { if (!cond) throw new Error(msg); }
export function assertEq(a, b, msg) { if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
