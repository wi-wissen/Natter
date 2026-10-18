// Copy the root LICENSE into the current package before `npm pack`/`npm publish` (run from a package's prepack).
import { copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
copyFileSync(join(root, 'LICENSE'), join(process.cwd(), 'LICENSE'));
