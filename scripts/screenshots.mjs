// Regenerates every image in docs/img from a synthetic offline world (seed 42, no real data).
//   npm run build && npm run screenshots
// Needs Chrome or Edge (set CHROME_PATH to override).
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'img');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'civarena-shots-'));
const BIN = path.join(ROOT, 'bin', 'civarena.js');
const PORT = 4412;
fs.mkdirSync(OUT, { recursive: true });

const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);
const BROWSER = BROWSERS.find((p) => fs.existsSync(p));
if (!BROWSER) throw new Error('No Chrome/Edge found. Set CHROME_PATH.');

const replay = path.join(TMP, 'demo.civ.json.gz');
console.log('simulating demo world...');
execFileSync(process.execPath, [BIN, 'run', '--seed', '42', '--ticks', '600', '--out', replay], { stdio: 'inherit', cwd: TMP });

const server = spawn(process.execPath, [BIN, 'replay', replay, '--no-open', '--port', String(PORT)], { stdio: 'ignore', cwd: TMP });
await new Promise((r) => setTimeout(r, 1500));

function shot(query, file, w, h) {
  const url = `http://localhost:${PORT}/?${query}`;
  execFileSync(BROWSER, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${w},${h}`,
    '--virtual-time-budget=6000', `--user-data-dir=${path.join(TMP, 'profile')}`, `--screenshot=${path.join(OUT, file)}`, url,
  ], { stdio: 'ignore' });
  console.log('  ✓', file);
}

try {
  shot('at=end&lang=en&theme=dark', 'hero.png', 1600, 1000);
  shot('at=end&lang=en&theme=dark', 'dashboard-full.png', 1600, 2050);
  shot('at=320&lang=en&theme=light', 'light.png', 1600, 1000);
  shot('at=end&lang=ru&theme=dark', 'russian.png', 1280, 900);
  shot('at=end&lang=en&theme=dark', 'mobile.png', 420, 900);
} finally {
  server.kill();
}
