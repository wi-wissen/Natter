// Reads and checks the asset packs (used by the tests and by the manifest script).
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = dirname(fileURLToPath(import.meta.url));
export const NAME_RE = /^[a-z][a-z0-9_]*$/;
export const MAX_FILE = 20 * 1024;
export const MAX_PACK = 200 * 1024;

/** All pack folders (those with a pack.json). */
export const packDirs = () => readdirSync(ROOT).filter((d) => existsSync(join(ROOT, d, 'pack.json'))).sort();

export const readPack = (dir) => JSON.parse(readFileSync(join(ROOT, dir, 'pack.json'), 'utf8'));

/** Minimal well-formedness check of an SVG text: balanced tags, one root. Returns a list of problems. */
export function svgProblems(text, { animated = false } = {}) {
  const problems = [];
  const clean = text.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?xml[\s\S]*?\?>/g, '');
  const tagRe = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  const stack = [];
  let m, roots = 0, last = 0;
  while ((m = tagRe.exec(clean))) {
    const [, close, name, attrs, self] = m;
    if (stack.length === 0 && !close) roots++;
    if (close) {
      if (stack.pop() !== name) { problems.push(`unbalanced </${name}>`); break; }
    } else if (!self) stack.push(name);
    last = tagRe.lastIndex;
    if (/\b(href|src)\s*=\s*["'](?!#)/.test(attrs) && name !== 'a') problems.push(`external reference in <${name}>`);
    if (/^(script|image|foreignObject|iframe|use)$/.test(name) && name !== 'use') problems.push(`forbidden element <${name}>`);
  }
  if (stack.length) problems.push(`unclosed <${stack.pop()}>`);
  if (roots !== 1) problems.push(`expected 1 root element, found ${roots}`);
  if (clean.slice(last).trim()) problems.push('text after the root element');
  if (/@import|url\(\s*["']?https?:/i.test(clean)) problems.push('external url');
  if (/<text[\s>]/.test(clean)) problems.push('<text> must be converted to paths');
  if (!animated && /<animate|<set\b|animation\s*:|@keyframes/.test(clean)) problems.push('animation is not allowed');
  const root = /<svg\b([^>]*)>/.exec(clean);
  if (!root) problems.push('no <svg> root');
  else {
    const a = root[1];
    if (!/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(a)) problems.push('missing xmlns');
    const w = /\bwidth="(\d+)"/.exec(a), h = /\bheight="(\d+)"/.exec(a), vb = /viewBox="0 0 (\d+) (\d+)"/.exec(a);
    if (!w || !h) problems.push('width and height must be integers');
    if (!vb) problems.push('viewBox must be "0 0 W H"');
    if (w && h && vb && (w[1] !== vb[1] || h[1] !== vb[2])) problems.push('viewBox does not match width/height');
  }
  return problems;
}

/** Size of the SVG as [w, h]. */
export function svgSize(text) {
  const w = /<svg\b[^>]*\bwidth="(\d+)"/.exec(text), h = /<svg\b[^>]*\bheight="(\d+)"/.exec(text);
  return [Number(w?.[1]), Number(h?.[1])];
}

export const fileSize = (p) => statSync(p).size;
export { join, readdirSync, readFileSync, existsSync };
