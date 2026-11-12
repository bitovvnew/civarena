// Rasterizes replay frames into palette-indexed images for GIF export (CLI and browser share this code).
// Art direction: an engraved atlas printed on newsprint, with team ink dots and a broadsheet caption bar.

import { workTile } from '../engine/map.js';
import { JOBS, TILE, type Frame, type ReplayFile } from '../engine/types.js';
import { GifEncoder } from './gif.js';

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Dark-surface team steps (what the engine stores) -> light-surface steps of the same hue. */
export const LIGHT_STEP: Record<string, string> = {
  '#3987e5': '#2a78d6', '#d95926': '#eb6834', '#199e70': '#1baf7a', '#c98500': '#eda100',
  '#d55181': '#e87ba4', '#008300': '#008300', '#9085e9': '#6250d6', '#e66767': '#e34948',
};

export const PAPER = {
  paper: '#f2ede3', ink: '#1b1a17', rule: '#cbc2b0', muted: '#6f685c', red: '#b8321f',
  terrain: { [TILE.water]: '#c9d6d8', [TILE.plains]: '#ebe4d3', [TILE.farm]: '#e2d9b0', [TILE.forest]: '#c6d1b8', [TILE.mountain]: '#d2c9b9', [TILE.city]: '#dcd2c4', [TILE.market]: '#c7b693' } as Record<number, string>,
};

// 5x7 bitmap font: uppercase, digits and a little punctuation. Each glyph is 7 rows of 5 bits.
const FONT: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14], D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  '0': [14, 17, 19, 21, 25, 17, 14], '1': [4, 12, 4, 4, 4, 4, 14], '2': [14, 17, 1, 2, 4, 8, 31], '3': [31, 2, 4, 2, 1, 17, 14],
  '4': [2, 6, 10, 18, 31, 2, 2], '5': [31, 16, 30, 1, 1, 17, 14], '6': [6, 8, 16, 30, 17, 17, 14], '7': [31, 1, 2, 4, 8, 8, 8],
  '8': [14, 17, 17, 14, 17, 17, 14], '9': [14, 17, 17, 15, 1, 2, 12],
  ' ': [0, 0, 0, 0, 0, 0, 0], '.': [0, 0, 0, 0, 0, 12, 12], ':': [0, 12, 12, 0, 12, 12, 0], '-': [0, 0, 0, 31, 0, 0, 0],
  '%': [24, 25, 2, 4, 8, 19, 3], '$': [4, 15, 20, 14, 5, 30, 4], '/': [1, 1, 2, 4, 8, 16, 16], '+': [0, 4, 4, 31, 4, 4, 0],
  '·': [0, 0, 0, 12, 12, 0, 0], "'": [4, 4, 8, 0, 0, 0, 0], '(': [2, 4, 8, 8, 8, 4, 2], ')': [8, 4, 2, 2, 2, 4, 8],
};

export interface RasterOptions {
  scale?: number; // pixels per map tile
  title?: string;
}

export interface Raster {
  width: number;
  height: number;
  palette: RGB[];
  render(frame: Frame, agentsFrame: Frame | undefined, nextAgents?: Frame, t?: number): Uint8Array;
}

function hash(n: number) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

export function createRaster(replay: Pick<ReplayFile, 'map' | 'config' | 'seed' | 'scenario'>, opts: RasterOptions = {}): Raster {
  const s = opts.scale ?? 6;
  const { width: MW, height: MH, tiles } = replay.map;
  const header = 26, footer = 30;
  const W = MW * s, H = MH * s + header + footer;
  // palette
  const colors: string[] = [PAPER.paper, PAPER.ink, PAPER.rule, PAPER.muted, PAPER.red];
  const terrainIdx: Record<number, number> = {};
  for (const [k, c] of Object.entries(PAPER.terrain)) {
    terrainIdx[Number(k)] = colors.length;
    colors.push(c);
  }
  const teamIdx = replay.config.teams.map((t) => {
    colors.push(LIGHT_STEP[t.color.toLowerCase()] ?? t.color);
    return colors.length - 1;
  });
  const palette = colors.map(hex);
  const [P_PAPER, P_INK, P_RULE, P_MUTED, P_RED] = [0, 1, 2, 3, 4];
  const homeCache = new Map<string, [number, number]>();
  const base = new Uint8Array(W * H);
  base.fill(P_PAPER);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const c = terrainIdx[tiles[y * MW + x]] ?? P_PAPER;
    for (let dy = 0; dy < s; dy++) base.fill(c, (header + y * s + dy) * W + x * s, (header + y * s + dy) * W + x * s + s);
  }
  // hairline rules framing the map like a printed plate
  for (let x = 0; x < W; x++) {
    base[(header - 1) * W + x] = P_INK;
    base[(header + MH * s) * W + x] = P_INK;
  }

  const text = (buf: Uint8Array, str: string, x0: number, y0: number, color: number, px = 1) => {
    let x = x0;
    for (const ch of str.toUpperCase()) {
      const g = FONT[ch] ?? FONT[' '];
      for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
        if (!(g[row] & (1 << (4 - col)))) continue;
        for (let a = 0; a < px; a++) for (let b = 0; b < px; b++) {
          const xx = x + col * px + a, yy = y0 + row * px + b;
          if (xx >= 0 && xx < W && yy >= 0 && yy < H) buf[yy * W + xx] = color;
        }
      }
      x += 6 * px;
    }
    return x;
  };
  const disc = (buf: Uint8Array, cx: number, cy: number, r: number, color: number) => {
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r2) continue;
      if (x >= 0 && x < W && y >= header && y < header + MH * s) buf[y * W + x] = color;
    }
  };
  const pos = (row: number[], tick: number): [number, number] => {
    const [id, , jobIdx, , , flags] = row;
    const job = JOBS[jobIdx] ?? 'farmer';
    const key = `${id}:${job}`;
    let home = homeCache.get(key);
    if (!home) {
      home = workTile(tiles, MW, MH, job, id, replay.seed);
      homeCache.set(key, home);
    }
    let x = home[0] + 0.5 + (hash(id * 3 + 1) - 0.5) * 0.9, y = home[1] + 0.5 + (hash(id * 7 + 2) - 0.5) * 0.9;
    if (flags & 4) {
      const k = 0.55 + hash(id + tick) * 0.35;
      x += (MW / 2 + (hash(id) - 0.5) * 3 - x) * k;
      y += (MH / 2 + (hash(id * 5) - 0.5) * 2 - y) * k;
    }
    return [x, y];
  };

  return {
    width: W,
    height: H,
    palette,
    render(frame, agentsFrame, nextAgents, t = 0) {
      const buf = base.slice();
      const rows = agentsFrame?.agents ?? [];
      const next = new Map((nextAgents?.agents ?? []).map((r) => [r[0], r]));
      const maxW = Math.max(1, ...rows.map((r) => r[3]));
      for (const row of rows) {
        let [x, y] = pos(row, agentsFrame!.tick);
        const n = next.get(row[0]);
        if (n && t > 0) {
          const [nx, ny] = pos(n, nextAgents!.tick);
          x += (nx - x) * t;
          y += (ny - y) * t;
        }
        const r = Math.max(1, (0.18 + Math.sqrt(Math.max(0, row[3]) / maxW) * 0.42) * s);
        const cx = x * s, cy = header + y * s;
        if (row[5] & 1) disc(buf, cx, cy, r + 1.2, P_INK); // cartel ring
        disc(buf, cx, cy, r, teamIdx[row[1]] ?? P_INK);
      }
      // masthead
      const title = (opts.title ?? 'CIVARENA').toUpperCase();
      let x = text(buf, title, 8, 6, P_INK, 2);
      x = text(buf, `  DAY ${frame.tick}`, x, 9, P_MUTED, 1);
      text(buf, `· ${replay.scenario.replace(/-/g, ' ')}`, x + 4, 9, P_MUTED, 1);
      const pop = `POP ${frame.m.population}  GDP $${Math.round(frame.m.gdp)}`;
      text(buf, pop, W - pop.length * 6 - 8, 9, P_INK, 1);
      // footer: stacked share of wealth, broadsheet style
      const fy = header + MH * s + 6;
      const barW = W - 16;
      let bx = 8;
      const total = frame.teams.reduce((a, tm) => a + Math.max(0, tm.wealth), 0) || 1;
      frame.teams.forEach((tm, i) => {
        const w = Math.round((Math.max(0, tm.wealth) / total) * barW);
        const c = teamIdx[replay.config.teams.findIndex((x) => x.id === tm.id)] ?? teamIdx[i];
        for (let yy = fy; yy < fy + 6; yy++) buf.fill(c, yy * W + bx, yy * W + Math.min(W - 8, bx + w));
        bx += w;
      });
      let lx = 8;
      const sorted = [...frame.teams].sort((a, b) => b.score - a.score);
      sorted.slice(0, 4).forEach((tm, i) => {
        const label = `${i + 1}.${tm.label.replace(/[^A-Za-z0-9 .-]/g, '')} ${Math.round(tm.wealthShare * 100)}%`;
        lx = text(buf, label, lx, fy + 11, i === 0 ? P_INK : P_MUTED, 1) + 10;
      });
      if (frame.headlines.some((h) => h.level === 2)) for (let yy = 0; yy < 3; yy++) buf.fill(P_RED, yy * W, (yy + 1) * W);
      for (let xx = 0; xx < W; xx++) buf[(H - 1) * W + xx] = P_RULE;
      return buf;
    },
  };
}

/** Render a replay (or part of it) to an animated GIF. */
export function replayToGif(replay: ReplayFile, opts: RasterOptions & { from?: number; to?: number; step?: number; delayMs?: number; tween?: number } = {}): Uint8Array {
  const raster = createRaster(replay, opts);
  const frames = replay.frames;
  const from = Math.max(1, opts.from ?? 1), to = Math.min(frames.length, opts.to ?? frames.length);
  const step = Math.max(1, opts.step ?? 5);
  const tween = Math.max(1, opts.tween ?? 2);
  const gif = new GifEncoder(raster.width, raster.height, raster.palette);
  const snaps = frames.filter((f) => f.agents && f.tick >= from && f.tick <= to);
  const picked = snaps.filter((_, i) => i % Math.max(1, Math.round(step / 5)) === 0);
  for (let i = 0; i < picked.length; i++) {
    const a = picked[i], b = picked[i + 1];
    for (let k = 0; k < (b ? tween : 1); k++) {
      const t = k / tween;
      const tick = Math.round(a.tick + (b ? (b.tick - a.tick) * t : 0));
      const f = frames[Math.min(frames.length - 1, tick - 1)] ?? a;
      gif.addFrame(raster.render(f, a, b, t), opts.delayMs ?? 70);
    }
  }
  if (picked.length) gif.addFrame(raster.render(picked[picked.length - 1], picked[picked.length - 1]), 2500);
  return gif.finish();
}
