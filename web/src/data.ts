// Client-side world store: live (SSE from the CLI server) or replay (a .civ.json file).

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Command, Frame, ReplayFile } from '../../src/engine/types';

export interface TeamMeta { id: string; label: string; provider: string; model: string; color: string }
export interface Meta {
  mode: 'live' | 'replay';
  version: string;
  seed: number;
  scenario: { id: string; name: string; description: string };
  scenarios: { id: string; name: string; description: string }[];
  teams: TeamMeta[];
  map: { width: number; height: number; tiles: number[] };
  names: string[];
  agents: number;
  paused: boolean;
  tps: number;
}

export interface World {
  meta: Meta | null;
  frames: Frame[];
  /** Index into frames that is on screen; null = follow the newest frame. */
  cursor: number | null;
  status: 'connecting' | 'live' | 'replay' | 'offline';
  paused: boolean;
  tps: number;
  version: number; // bumps on every new frame, cheap change detector
}

const STATIC = (import.meta as unknown as { env?: { VITE_STATIC?: string } }).env?.VITE_STATIC;

async function readReplayBlob(blob: Blob): Promise<ReplayFile> {
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  let text: string;
  if (head[0] === 0x1f && head[1] === 0x8b) {
    const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
    text = await new Response(stream).text();
  } else text = await blob.text();
  const r = JSON.parse(text) as ReplayFile;
  if (r.format !== 'civarena-replay') throw new Error('Not a CivArena replay');
  return r;
}

function replayMeta(r: ReplayFile): Meta {
  return {
    mode: 'replay', version: r.createdWith, seed: r.seed,
    scenario: { id: r.scenario, name: r.scenario, description: '' }, scenarios: [],
    teams: r.config.teams, map: r.map, names: r.names, agents: r.config.agents, paused: true, tps: 8,
  };
}

/** `?at=end` or `?at=<day>` opens a replay paused at that point (used for screenshots and share links). */
function startCursor(n: number): { cursor: number; paused: boolean } {
  const at = new URLSearchParams(location.search).get('at');
  if (!at) return { cursor: 0, paused: false };
  if (at === 'end') return { cursor: Math.max(0, n - 1), paused: true };
  const v = Number(at);
  return { cursor: Number.isFinite(v) ? Math.max(0, Math.min(n - 1, v - 1)) : 0, paused: true };
}

/** Keep full agent snapshots only on recent frames and every 5th older one (memory). */
function trim(frames: Frame[]) {
  const n = frames.length;
  const old = n - 60;
  if (old > 0 && frames[old - 1]?.agents && frames[old - 1].tick % 5 !== 0) frames[old - 1] = { ...frames[old - 1], agents: undefined };
}

export function useWorld() {
  const [world, setWorld] = useState<World>({ meta: null, frames: [], cursor: null, status: 'connecting', paused: false, tps: 8, version: 0 });
  const framesRef = useRef<Frame[]>([]);
  const metaRef = useRef<Meta | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const playRef = useRef<number | null>(null);

  const loadReplay = useCallback((r: ReplayFile) => {
    esRef.current?.close();
    esRef.current = null;
    framesRef.current = r.frames;
    metaRef.current = replayMeta(r);
    const start = startCursor(r.frames.length);
    setWorld({ meta: metaRef.current, frames: r.frames, cursor: start.cursor, status: 'replay', paused: start.paused, tps: 12, version: Date.now() });
  }, []);

  const openFile = useCallback(async (file: Blob) => {
    loadReplay(await readReplayBlob(file));
  }, [loadReplay]);

  // initial connection
  useEffect(() => {
    let cancelled = false;
    const connectLive = async () => {
      try {
        if (STATIC) {
          const res = await fetch(STATIC);
          if (!cancelled) loadReplay(await readReplayBlob(await res.blob()));
          return;
        }
        const meta = (await (await fetch('/api/meta')).json()) as Meta;
        const history = (await (await fetch('/api/history')).json()) as Frame[];
        if (cancelled) return;
        metaRef.current = meta;
        framesRef.current = history;
        if (meta.mode === 'replay') {
          const start = startCursor(history.length);
          setWorld({ meta, frames: history, cursor: start.cursor, status: 'replay', paused: start.paused, tps: 12, version: Date.now() });
          return;
        }
        setWorld({ meta, frames: history, cursor: null, status: 'live', paused: meta.paused, tps: meta.tps, version: Date.now() });
        const es = new EventSource('/api/stream');
        esRef.current = es;
        es.addEventListener('frame', (ev) => {
          const f = JSON.parse((ev as MessageEvent).data) as Frame;
          const m = metaRef.current;
          if (m && f.births) for (const [id, name] of f.births) m.names[id] = name;
          framesRef.current.push(f);
          trim(framesRef.current);
          setWorld((w) => ({ ...w, frames: framesRef.current, status: 'live', version: w.version + 1 }));
        });
        es.addEventListener('reset', (ev) => {
          const m = JSON.parse((ev as MessageEvent).data) as Meta;
          metaRef.current = m;
          framesRef.current = [];
          setWorld((w) => ({ ...w, meta: m, frames: [], cursor: null, version: w.version + 1 }));
        });
        es.addEventListener('control', (ev) => {
          const c = JSON.parse((ev as MessageEvent).data) as { paused: boolean; tps: number };
          setWorld((w) => ({ ...w, paused: c.paused, tps: c.tps }));
        });
        es.onerror = () => setWorld((w) => (w.status === 'live' ? { ...w, status: 'offline' } : w));
        es.onopen = () => setWorld((w) => (w.status === 'offline' ? { ...w, status: 'live' } : w));
      } catch {
        if (!cancelled) setWorld((w) => ({ ...w, status: 'offline' }));
      }
    };
    connectLive();
    return () => {
      cancelled = true;
      esRef.current?.close();
    };
  }, [loadReplay]);

  // replay autoplay
  useEffect(() => {
    if (world.status !== 'replay' || world.paused) return;
    const id = window.setInterval(() => {
      setWorld((w) => {
        const c = w.cursor ?? 0;
        if (c >= w.frames.length - 1) return { ...w, paused: true };
        return { ...w, cursor: c + 1 };
      });
    }, 1000 / Math.max(1, world.tps));
    playRef.current = id;
    return () => window.clearInterval(id);
  }, [world.status, world.paused, world.tps]);

  const command = useCallback(async (cmd: Command) => {
    if (world.status === 'replay') {
      if (cmd.type === 'pause') setWorld((w) => ({ ...w, paused: true }));
      if (cmd.type === 'resume') setWorld((w) => ({ ...w, paused: false, cursor: (w.cursor ?? 0) >= w.frames.length - 1 ? 0 : w.cursor }));
      if (cmd.type === 'speed') setWorld((w) => ({ ...w, tps: cmd.tps }));
      return;
    }
    try {
      await fetch('/api/command', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cmd) });
    } catch { /* offline */ }
  }, [world.status]);

  const seek = useCallback((index: number | null) => {
    setWorld((w) => ({ ...w, cursor: index === null ? null : Math.max(0, Math.min(w.frames.length - 1, index)) }));
  }, []);

  return { world, command, seek, openFile };
}

/** The frame on screen, plus the closest frame at or before it that carries agent positions. */
export function currentFrames(world: World): { frame: Frame | undefined; agentsFrame: Frame | undefined; index: number } {
  const { frames } = world;
  if (frames.length === 0) return { frame: undefined, agentsFrame: undefined, index: -1 };
  const index = world.cursor === null ? frames.length - 1 : Math.min(world.cursor, frames.length - 1);
  let j = index;
  while (j >= 0 && !frames[j].agents) j--;
  return { frame: frames[index], agentsFrame: j >= 0 ? frames[j] : undefined, index };
}
