// Set one version for all packages and the internal dependency ranges: node scripts/set-version.mjs 0.2.0
// Afterwards run `npm install` to update package-lock.json, commit, and tag `v<version>`.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACKAGES = ['assets', 'core', 'web'];
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version ?? '')) {
  console.error('Usage: node scripts/set-version.mjs <x.y.z>');
  process.exit(1);
}
const files = PACKAGES.map((p) => join(root, 'packages', p, 'package.json'));
const names = new Set(files.map((f) => JSON.parse(readFileSync(f, 'utf8')).name));
for (const file of files) {
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  pkg.version = version;
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies']) {
    for (const dep of Object.keys(pkg[field] ?? {})) if (names.has(dep)) pkg[field][dep] = version;
  }
  writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`${pkg.name} → ${version}`);
}
