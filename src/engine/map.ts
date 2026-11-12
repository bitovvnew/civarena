import { Rng } from './rng.js';
import { TILE, type Job } from './types.js';

/** Generate a small continent: river farmland, forests, mountains, and a central city with a market. */
export function generateMap(seed: number, width = 72, height = 44): number[] {
  const rng = new Rng(seed ^ 0x51ed);
  // value noise on a coarse grid, smoothstep-interpolated
  const noise = (scale: number, salt: number) => {
    const gw = Math.ceil(width / scale) + 2;
    const gh = Math.ceil(height / scale) + 2;
    const r = new Rng((seed ^ salt) >>> 0);
    const g: number[] = Array.from({ length: gw * gh }, () => r.float());
    return (x: number, y: number) => {
      const fx = x / scale, fy = y / scale;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const v = (i: number, j: number) => g[j * gw + i];
      const a = v(x0, y0) * (1 - sx) + v(x0 + 1, y0) * sx;
      const b = v(x0, y0 + 1) * (1 - sx) + v(x0 + 1, y0 + 1) * sx;
      return a * (1 - sy) + b * sy;
    };
  };
  const elev = noise(9, 0x1001);
  const detail = noise(4, 0x2002);
  const wet = noise(11, 0x3003);
  const cx = width / 2, cy = height / 2;
  const tiles = new Array<number>(width * height);
  const riverPhase = rng.range(0, Math.PI * 2);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x - cx) / (width / 2), dy = (y - cy) / (height / 2);
      const dist = Math.sqrt(dx * dx + dy * dy);
      const e = elev(x, y) * 0.75 + detail(x, y) * 0.25 - dist * 0.55;
      const riverY = cy + Math.sin(x / 7 + riverPhase) * 4 + Math.sin(x / 3.1) * 1.2;
      const nearRiver = Math.abs(y - riverY);
      let t: number = TILE.plains;
      if (e < -0.12) t = TILE.water;
      else if (nearRiver < 0.8 && x > 3 && x < width - 4) t = TILE.water;
      else if (e > 0.42) t = TILE.mountain;
      else if (nearRiver < 5 && wet(x, y) > 0.35) t = TILE.farm;
      else if (wet(x, y) > 0.55) t = TILE.forest;
      const cd = Math.hypot(x - cx, (y - cy) * 1.3);
      if (cd < 5.5 && t !== TILE.water) t = TILE.city;
      if (cd < 1.8) t = TILE.market;
      tiles[y * width + x] = t;
    }
  }
  // a bridge so the city stays connected across the river
  for (let x = Math.floor(cx) - 1; x <= Math.floor(cx) + 1; x++) {
    for (let y = 0; y < height; y++) {
      const cd = Math.hypot(x - cx, (y - cy) * 1.3);
      if (cd < 5.5) tiles[y * width + x] = cd < 1.8 ? TILE.market : TILE.city;
    }
  }
  ensureTerrain(tiles, width, height, rng);
  return tiles;
}

/** Make sure every resource type exists, so every job is possible on every seed. */
function ensureTerrain(tiles: number[], width: number, height: number, rng: Rng) {
  const need = [TILE.farm, TILE.forest, TILE.mountain];
  for (const kind of need) {
    let count = 0;
    for (const t of tiles) if (t === kind) count++;
    let guard = 0;
    while (count < 30 && guard++ < 2000) {
      const x = rng.int(2, width - 2), y = rng.int(2, height - 2);
      const i = y * width + x;
      if (tiles[i] === TILE.plains) {
        tiles[i] = kind;
        count++;
      }
    }
  }
}

const WORK_TILE: Record<Job, number> = {
  farmer: TILE.farm,
  lumberjack: TILE.forest,
  miner: TILE.mountain,
  smith: TILE.city,
  artisan: TILE.city,
};

/** Pick a work tile for a job, deterministic per agent id. */
export function workTile(tiles: number[], width: number, height: number, job: Job, id: number, seed: number): [number, number] {
  const want = WORK_TILE[job];
  const rng = new Rng((seed ^ Math.imul(id + 1, 2654435761)) >>> 0);
  for (let attempt = 0; attempt < 600; attempt++) {
    const x = rng.int(0, width), y = rng.int(0, height);
    if (tiles[y * width + x] === want) return [x, y];
  }
  for (let attempt = 0; attempt < 600; attempt++) {
    const x = rng.int(0, width), y = rng.int(0, height);
    if (tiles[y * width + x] !== TILE.water) return [x, y];
  }
  return [Math.floor(width / 2), Math.floor(height / 2)];
}
