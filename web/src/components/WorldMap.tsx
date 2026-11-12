// Canvas world map: terrain, every citizen as a dot, traders walking to the market.

import { useEffect, useMemo, useRef, useState } from 'react';
import { workTile } from '../../../src/engine/map';
import { JOBS, TILE, type Frame } from '../../../src/engine/types';
import type { Meta } from '../data';
import type { T } from '../i18n';
import { fmtNum, type Lang } from '../i18n';

const TERRAIN: Record<number, [string, string]> = {
  // [dark, light]
  [TILE.water]: ['#0e1d28', '#d4e2ec'],
  [TILE.plains]: ['#1e221d', '#ece9df'],
  [TILE.farm]: ['#30361f', '#e2e2bf'],
  [TILE.forest]: ['#152a1e', '#cadecb'],
  [TILE.mountain]: ['#35332f', '#d3d0c8'],
  [TILE.city]: ['#2d2b31', '#e0dce3'],
  [TILE.market]: ['#4a3f2a', '#eedcb2'],
};

interface Dot { id: number; x: number; y: number; tx: number; ty: number; r: number; color: string; flags: number; row: number[] }

function hash(n: number) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

export function WorldMap({ meta, frame, t, lang, dark }: { meta: Meta; frame: Frame | undefined; t: T; lang: Lang; dark: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const dots = useRef(new Map<number, Dot>());
  const homeCache = useRef(new Map<string, [number, number]>());
  const [size, setSize] = useState({ w: 600, h: 360 });
  const [hover, setHover] = useState<{ dot: Dot; px: number; py: number } | null>(null);
  const { width: MW, height: MH, tiles } = meta.map;

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const w = e.contentRect.width;
      setSize({ w, h: Math.round((w * MH) / MW) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [MW, MH]);

  // terrain layer, pre-rendered
  const terrain = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = MW;
    c.height = MH;
    const g = c.getContext('2d')!;
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const k = tiles[y * MW + x];
      g.fillStyle = TERRAIN[k]?.[dark ? 0 : 1] ?? '#222';
      g.fillRect(x, y, 1, 1);
    }
    return c;
  }, [tiles, MW, MH, dark]);

  const market = useMemo(() => [MW / 2, MH / 2] as const, [MW, MH]);

  // targets from the latest frame
  useEffect(() => {
    if (!frame?.agents) return;
    const seen = new Set<number>();
    const maxW = Math.max(1, ...frame.agents.map((r) => r[3]));
    for (const row of frame.agents) {
      const [id, teamIdx, jobIdx, wealth, , flags] = row;
      seen.add(id);
      const job = JOBS[jobIdx] ?? 'farmer';
      const key = `${id}:${job}`;
      let home = homeCache.current.get(key);
      if (!home) {
        home = workTile(tiles, MW, MH, job, id, meta.seed);
        homeCache.current.set(key, home);
      }
      const jx = (hash(id * 3 + 1) - 0.5) * 0.9, jy = (hash(id * 7 + 2) - 0.5) * 0.9;
      let tx = home[0] + 0.5 + jx, ty = home[1] + 0.5 + jy;
      if (flags & 4) {
        // trading today: walk most of the way to the market square
        const k = 0.55 + hash(id + frame.tick) * 0.35;
        tx = tx + (market[0] + (hash(id) - 0.5) * 3 - tx) * k;
        ty = ty + (market[1] + (hash(id * 5) - 0.5) * 2 - ty) * k;
      }
      const r = 1.4 + Math.sqrt(Math.max(0, wealth) / maxW) * 3.6; // pixels at 1000px map width
      const color = meta.teams[teamIdx]?.color ?? '#888';
      const d = dots.current.get(id);
      if (d) Object.assign(d, { tx, ty, r, color, flags, row });
      else dots.current.set(id, { id, x: tx, y: ty, tx, ty, r, color, flags, row });
    }
    for (const id of [...dots.current.keys()]) if (!seen.has(id)) dots.current.delete(id);
  }, [frame, tiles, MW, MH, meta, market]);

  // animation loop
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const c = canvas.current;
      if (!c) return;
      const dpr = window.devicePixelRatio || 1;
      const { w, h } = size;
      if (c.width !== Math.round(w * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      const g = c.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.imageSmoothingEnabled = false;
      g.drawImage(terrain, 0, 0, w, h);
      const s = w / MW;
      const now = performance.now() / 1000;
      // market square glow
      g.beginPath();
      g.arc(market[0] * s, market[1] * s, 2.4 * s, 0, Math.PI * 2);
      g.strokeStyle = dark ? 'rgba(240,239,236,0.18)' : 'rgba(11,11,11,0.15)';
      g.lineWidth = 1;
      g.stroke();
      for (const d of dots.current.values()) {
        d.x += (d.tx - d.x) * 0.12;
        d.y += (d.ty - d.y) * 0.12;
        const wob = (d.flags & 4) ? 0 : Math.sin(now * 1.3 + d.id) * 0.12;
        const px = (d.x + wob) * s, py = (d.y + Math.cos(now * 1.1 + d.id * 1.7) * 0.1) * s;
        const rr = Math.max(1.2, d.r * Math.min(1.25, Math.max(0.55, w / 1000)));
        g.beginPath();
        g.arc(px, py, rr, 0, Math.PI * 2);
        g.fillStyle = d.color;
        g.globalAlpha = d.flags & 2 ? 0.45 : 0.95;
        g.fill();
        g.globalAlpha = 1;
        if (d.flags & 1) {
          g.lineWidth = 1.2;
          g.strokeStyle = dark ? '#f0efec' : '#0b0b0b';
          g.beginPath();
          g.arc(px, py, rr + 1.8, 0, Math.PI * 2);
          g.stroke();
        }
        if (d.flags & 16) {
          g.lineWidth = 1.5;
          g.strokeStyle = '#d03b3b';
          g.beginPath();
          g.arc(px, py, rr + 3 + Math.sin(now * 6) * 1, 0, Math.PI * 2);
          g.stroke();
        }
      }
      if (hover) {
        const d = hover.dot;
        g.lineWidth = 2;
        g.strokeStyle = dark ? '#f0efec' : '#0b0b0b';
        g.beginPath();
        g.arc(d.x * s, d.y * s, d.r * Math.min(1.25, Math.max(0.55, w / 1000)) + 3, 0, Math.PI * 2);
        g.stroke();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size, terrain, MW, market, dark, hover]);

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const s = size.w / MW;
    let best: Dot | null = null;
    let bd = 10 * 10;
    for (const d of dots.current.values()) {
      const dx = d.x * s - mx, dy = d.y * s - my;
      const dist = dx * dx + dy * dy;
      if (dist < bd) { bd = dist; best = d; }
    }
    setHover(best ? { dot: best, px: mx, py: my } : null);
  };

  const hd = hover?.dot;
  return (
    <div className="map" ref={wrap}>
      <canvas ref={canvas} style={{ width: size.w, height: size.h }} onPointerMove={onMove} onPointerLeave={() => setHover(null)}
        role="img" aria-label={t('panel.map')} />
      {hd && hover && (
        <div className="tooltip" style={{ left: hover.px > size.w * 0.6 ? undefined : hover.px + 14, right: hover.px > size.w * 0.6 ? size.w - hover.px + 14 : undefined, top: Math.max(4, hover.py - 20) }}>
          <div className="tt-title">{meta.names[hd.id] ?? `#${hd.id}`}</div>
          <div className="tt-row"><span className="swatch" style={{ background: hd.color }} /><span className="tt-label">{meta.teams[hd.row[1]]?.label}</span></div>
          <div className="tt-row"><span className="tt-label">{t(`job.${JOBS[hd.row[2]]}`)}</span><span className="tt-val">${fmtNum(hd.row[3], lang)}</span></div>
          <div className="tt-row"><span className="tt-label">{t('map.health')}</span><span className="tt-val">{hd.row[4]}%</span></div>
          {(hd.flags & 2) > 0 && <div className="tt-note">{t('map.hungry')}</div>}
          {(hd.flags & 1) > 0 && <div className="tt-note">{t('map.cartel')}</div>}
          {(hd.flags & 8) > 0 && <div className="tt-note">{t('map.loan')}</div>}
        </div>
      )}
    </div>
  );
}
