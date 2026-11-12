// Builds a static, serverless demo (dist/demo) that plays a pre-recorded offline world.
// This is what GitHub Pages hosts: no backend, no API keys.
//   npm run build && npm run demo:build
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist', 'demo');
const BIN = path.join(ROOT, 'bin', 'civarena.js');
const vite = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');

execFileSync(process.execPath, [vite, 'build', '--outDir', OUT], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, VITE_STATIC: './demo.civ.json.gz' },
});
execFileSync(process.execPath, [BIN, 'run', '--offline', '--scenario', 'classic', '--agents', '500', '--seed', '42', '--policy-every', '25', '--ticks', '800', '--out', path.join(OUT, 'demo.civ.json.gz')], { stdio: 'inherit', cwd: OUT });
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
console.log(`\n  static demo ready in ${path.relative(ROOT, OUT)}/`);
