import { build } from 'vite';
import fs from 'node:fs/promises';
await build({ mode: 'demo', build: { outDir: 'docs/demo' } });
await fs.copyFile('node_modules/@fontsource/manrope/LICENSE', 'docs/demo/FONT-LICENSE.txt');
