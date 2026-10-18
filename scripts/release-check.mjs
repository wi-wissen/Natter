// Check before a release: node scripts/release-check.mjs <x.y.z>
// Every package has this version, internal dependencies point to it, LICENSE has no placeholder left.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2] ?? '';
const problems = [];
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) problems.push(`"${version}" is not a version (x.y.z)`);
const pkgs = ['assets', 'core', 'web'].map((p) => JSON.parse(readFileSync(join(root, 'packages', p, 'package.json'), 'utf8')));
const names = new Set(pkgs.map((p) => p.name));
for (const pkg of pkgs) {
  if (pkg.version !== version) problems.push(`${pkg.name} has version ${pkg.version}, expected ${version}`);
  if (pkg.private) problems.push(`${pkg.name} is private`);
  for (const [dep, range] of Object.entries(pkg.dependencies ?? {})) {
    if (names.has(dep) && range !== version) problems.push(`${pkg.name} depends on ${dep}@${range}, expected ${version}`);
  }
}
if (readFileSync(join(root, 'LICENSE'), 'utf8').includes('COPYRIGHT_HOLDER')) problems.push('LICENSE still contains the placeholder COPYRIGHT_HOLDER');
if (problems.length) {
  for (const p of problems) console.error(`::error::${p}`);
  console.error('Fix: node scripts/set-version.mjs <x.y.z>, npm install, commit, then tag v<x.y.z>.');
  process.exit(1);
}
console.log(`Release ${version}: ${pkgs.map((p) => p.name).join(', ')}`);
