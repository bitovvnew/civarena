#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const entry = join(root, 'dist', 'cli.js');
if (!existsSync(entry)) {
  console.error('CivArena is not built yet. Run: npm install && npm run build');
  process.exit(1);
}
const { main } = await import(new URL('../dist/cli.js', import.meta.url).href);
await main();
