import { describe, expect, it } from 'vitest';
import { OFFLINE_TEAMS, brainFromSpec } from '../src/brains/index.js';
import { Simulation } from '../src/engine/engine.js';
import { GifEncoder } from '../src/render/gif.js';
import { createRaster, replayToGif } from '../src/render/raster.js';
import { classic, parseScenarioSpec, scenarioFromSpec } from '../src/scenarios/index.js';
import { meanSd, runTournament, tCritical, tournamentMarkdown } from '../src/tournament.js';

/** Tiny GIF decoder for tests: returns the indexed pixels of every frame. */
function decodeGif(buf: Uint8Array): { w: number; h: number; frames: Uint8Array[] } {
  let p = 6;
  const u16 = () => buf[p++] | (buf[p++] << 8);
  const w = u16(), h = u16();
  const flags = buf[p++];
  p += 2;
  if (flags & 0x80) p += 3 * (1 << ((flags & 7) + 1));
  const frames: Uint8Array[] = [];
  while (p < buf.length) {
    const b = buf[p++];
    if (b === 0x3b) break;
    if (b === 0x21) {
      p++;
      while (buf[p]) p += buf[p] + 1;
      p++;
      continue;
    }
    if (b !== 0x2c) throw new Error('bad block ' + b);
    p += 9;
    const min = buf[p++];
    const data: number[] = [];
    while (buf[p]) { const n = buf[p++]; for (let i = 0; i < n; i++) data.push(buf[p++]); }
    p++;
    // LZW decode
    const clear = 1 << min, eoi = clear + 1;
    let size = min + 1, dict: number[][] = [], prev: number[] | null = null;
    const reset = () => { dict = []; for (let i = 0; i < clear; i++) dict[i] = [i]; dict[clear] = []; dict[eoi] = []; size = min + 1; prev = null; };
    reset();
    const out: number[] = [];
    let bitPos = 0;
    const read = () => { let v = 0; for (let i = 0; i < size; i++) { const bit = (data[(bitPos + i) >> 3] >> ((bitPos + i) & 7)) & 1; v |= bit << i; } bitPos += size; return v; };
    for (;;) {
      const code = read();
      if (code === clear) { reset(); continue; }
      if (code === eoi) break;
      let entry: number[];
      if (code < dict.length) entry = dict[code];
      else entry = [...prev!, prev![0]];
      out.push(...entry);
      if (prev) dict.push([...prev, entry[0]]);
      prev = entry;
      if (dict.length === 1 << size && size < 12) size++;
    }
    frames.push(Uint8Array.from(out));
  }
  return { w, h, frames };
}

describe('gif', () => {
  it('encodes frames that decode back to the same pixels', () => {
    const w = 37, h = 23;
    const pal: [number, number, number][] = Array.from({ length: 19 }, (_, i) => [i * 10, 255 - i * 10, i * 3]);
    const enc = new GifEncoder(w, h, pal);
    const frames = [0, 1, 2].map((k) => Uint8Array.from({ length: w * h }, (_, i) => ((i * 7 + k * 13) ^ (i >> 3)) % pal.length));
    for (const f of frames) enc.addFrame(f, 50);
    const gif = enc.finish();
    expect(String.fromCharCode(...gif.slice(0, 6))).toBe('GIF89a');
    const dec = decodeGif(gif);
    expect([dec.w, dec.h]).toEqual([w, h]);
    expect(dec.frames.map((f) => Array.from(f))).toEqual(frames.map((f) => Array.from(f)));
  });

  it('renders a replay into a valid animated GIF', async () => {
    const sim = new Simulation({ seed: 4, agents: 80, scenario: classic, teams: OFFLINE_TEAMS.map((s) => ({ brain: brainFromSpec(s) })) });
    await sim.run(30);
    const replay = sim.toReplay();
    const raster = createRaster(replay, { scale: 3 });
    expect(raster.palette.length).toBeLessThanOrEqual(256);
    const gif = replayToGif(replay, { scale: 3, step: 5 });
    const dec = decodeGif(gif);
    expect(dec.w).toBe(raster.width);
    expect(dec.frames.length).toBeGreaterThan(5);
    for (const f of dec.frames) expect(f.length).toBe(raster.width * raster.height);
  });
});

describe('declarative scenarios', () => {
  const spec = {
    format: 'civarena-scenario', id: 'Test Crash!', name: 'Crash', description: 'd',
    setup: { gov: { taxRate: 0.3, ubi: 999 }, policyRate: 9 },
    timeline: [{ day: 5, command: { type: 'shock', kind: 'drought' }, headline: 'Rain stops' }, { day: 8, command: { type: 'rate', rate: 15 } }],
    repeat: [{ from: 10, every: 5, command: { type: 'print', amount: 100 } }],
  };

  it('validates and normalises untrusted JSON', () => {
    const s = parseScenarioSpec(spec);
    expect(s.id).toBe('test-crash');
    expect(s.setup?.gov?.ubi).toBe(50); // clamped
    expect(() => parseScenarioSpec({ ...spec, timeline: [{ day: 3, command: { type: 'eval', code: 'x' } }] })).toThrow();
    expect(() => parseScenarioSpec({ ...spec, format: 'nope' })).toThrow();
    expect(() => parseScenarioSpec({ ...spec, timeline: [{ day: 3, command: { type: 'reset' } }] })).toThrow();
  });

  it('runs its timeline', async () => {
    const sc = scenarioFromSpec(parseScenarioSpec(spec));
    const sim = new Simulation({ seed: 5, agents: 60, scenario: sc, teams: OFFLINE_TEAMS.map((s) => ({ brain: brainFromSpec(s) })) });
    const frames = await sim.run(20);
    expect(sim.state.gov.taxRate).toBe(0.3);
    expect(sim.state.cb.policyRate).toBe(15);
    expect(frames[4].shocks.map((s) => s.kind)).toContain('drought');
    expect(frames[4].headlines.some((h) => h.params.text === 'Rain stops')).toBe(true);
    expect(sim.state.cb.printed).toBeCloseTo(300, 5); // days 10, 15, 20
  });
});

describe('tournament', () => {
  it('computes stats', () => {
    expect(meanSd([1, 2, 3])).toEqual({ mean: 2, sd: 1 });
    expect(tCritical(1)).toBeCloseTo(12.71);
    expect(tCritical(500)).toBe(1.96);
  });

  it('runs every seed x scenario, rotates seats and ranks teams', async () => {
    const teams = ['offline:cooperative', 'offline:tycoon', 'offline:prudent'];
    const report = await runTournament({ teams, scenarios: [classic], seeds: [1, 2, 3], ticks: 60, agents: 60 });
    expect(report.runs).toHaveLength(3);
    expect(report.runs[1].order[0]).toBe('offline:tycoon');
    expect(report.standings).toHaveLength(3);
    expect(report.standings[0].mean).toBeGreaterThanOrEqual(report.standings[2].mean);
    expect(report.standings.reduce((s, x) => s + x.wins, 0)).toBe(3);
    expect(tournamentMarkdown(report)).toContain('| 1 |');
    await expect(runTournament({ teams: ['offline:tycoon', 'offline:tycoon'], scenarios: [classic], seeds: [1], ticks: 5, agents: 20 })).rejects.toThrow();
  });
});
