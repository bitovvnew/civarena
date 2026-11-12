// The atlas: an engraved map printed on newsprint. Every citizen is an ink dot; traders walk to the
// market square and leave a short trade stroke behind; bankrupts flash a red ring. 60fps canvas.

import { useEffect, useMemo, useRef, useState } from 'react';
import { workTile } from '../../../src/engine/map';
import { JOBS, TILE, type Frame } from '../../../src/engine/types';
import type { Meta } from '../data';
import { useReducedMotion } from '../hooks';
import { fmtNum, type Lang, type T } from '../i18n';
import { INK_NIGHT, INK_PAPER, TERRAIN_NIGHT, TERRAIN_PAPER, teamColor } from '../theme';

interface Dot { id: number; x: number; y: number; tx: number; ty: number; r: number; tr: number; color: string; flags: number; row: number[]; born: number }
interface Spark { x0: number; y0: number; x1: number; y1: number; t0: number; color: string }

function hash(n: number) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

export interface WorldMapHandle {
  canvas: HTMLCanvasElement | null;
}

export function WorldMap({ meta, frame, t, lang, dark, selected, onSelect, canvasRef }: {
  meta: Meta; frame: Frame | undefined; t: T; lang: Lang; dark: boolean;
  selected: number | null; onSelect: (id: number | null) => void; canvasRef?: React.MutableRefObject<HTMLCanvasElement | null>;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const dots = useRef(new Map<number, Dot>());
  const sparks = useRef<Spark[]>([]);
  const homeCache = useRef(new Map<string, [number, number]>());
  const lastTick = useRef(-1);
  const [size, setSize] = useState({ w: 720, h: 440 });
  const [hover, setHover] = useState<{ dot: Dot; px: number; py: number } | null>(null);
  const reduced = useReducedMotion();
  const { width: MW, height: MH, tiles } = meta.map;
  const market = useMemo(() => [MW / 2, MH / 2] as const, [MW, MH]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.floor(e.contentRect.width);
      setSize({ w, h: Math.round((w * MH) / MW) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [MW, MH]);

  // terrain plate: tints plus engraving marks, rendered once per size/theme at device resolution
  const plate = useMemo(() => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(size.w * dpr));
    c.height = Math.max(1, Math.round(size.h * dpr));
    const g = c.getContext('2d')!;
    const s = (size.w / MW) * dpr;
    const pal = dark ? TERRAIN_NIGHT : TERRAIN_PAPER;
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      g.fillStyle = pal[tiles[y * MW + x]] ?? pal[1];
      g.fillRect(Math.floor(x * s), Math.floor(y * s), Math.ceil(s) + 1, Math.ceil(s) + 1);
    }
    g.strokeStyle = dark ? INK_NIGHT : INK_PAPER;
    g.fillStyle = dark ? INK_NIGHT : INK_PAPER;
    g.lineWidth = Math.max(0.6, s * 0.08);
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const k = tiles[y * MW + x];
      const cx = (x + 0.5) * s, cy = (y + 0.5) * s, h = hash(y * MW + x);
      if (k === TILE.forest && h < 0.7) {
        g.beginPath();
        g.arc(cx + (h - 0.5) * s * 0.5, cy, s * 0.09, 0, Math.PI * 2);
        g.fill();
      } else if (k === TILE.mountain && h < 0.55) {
        g.beginPath();
        g.moveTo(cx - s * 0.28, cy + s * 0.18);
        g.lineTo(cx, cy - s * 0.2);
        g.lineTo(cx + s * 0.28, cy + s * 0.18);
        g.stroke();
      } else if (k === TILE.water && h < 0.18) {
        g.beginPath();
        g.moveTo(cx - s * 0.3, cy);
        g.quadraticCurveTo(cx - s * 0.15, cy - s * 0.12, cx, cy);
        g.quadraticCurveTo(cx + s * 0.15, cy + s * 0.12, cx + s * 0.3, cy);
        g.stroke();
      } else if (k === TILE.farm && h < 0.35) {
        g.beginPath();
        g.moveTo(cx - s * 0.3, cy + s * 0.1);
        g.lineTo(cx + s * 0.3, cy + s * 0.1);
        g.stroke();
      }
    }
    // the market square: a double-ruled circle like a city on an old map
    g.lineWidth = Math.max(1, s * 0.12);
    g.strokeStyle = dark ? 'rgba(235,229,216,0.55)' : 'rgba(27,26,23,0.6)';
    for (const r of [2.2, 2.6]) {
      g.beginPath();
      g.arc(market[0] * s, market[1] * s, r * s, 0, Math.PI * 2);
      g.stroke();
    }
    return c;
  }, [tiles, MW, MH, dark, size, market]);

  // new targets from the latest snapshot
  useEffect(() => {
    if (!frame?.agents) return;
    const seen = new Set<number>();
    const maxW = Math.max(1, ...frame.agents.map((r) => r[3]));
    const now = performance.now();
    const newTick = frame.tick !== lastTick.current;
    const jumped = Math.abs(frame.tick - lastTick.current) > 12;
    lastTick.current = frame.tick;
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
      let tx = home[0] + 0.5 + (hash(id * 3 + 1) - 0.5) * 0.9, ty = home[1] + 0.5 + (hash(id * 7 + 2) - 0.5) * 0.9;
      const color = teamColor(meta.teams[teamIdx]?.color ?? '#888888', dark);
      if (flags & 4) {
        const k = 0.55 + hash(id + frame.tick) * 0.35;
        const mx = market[0] + (hash(id) - 0.5) * 3, my = market[1] + (hash(id * 5) - 0.5) * 2;
        if (newTick && !reduced && sparks.current.length < 260 && hash(id * 13 + frame.tick) < 0.35) sparks.current.push({ x0: tx, y0: ty, x1: mx, y1: my, t0: now, color });
        tx += (mx - tx) * k;
        ty += (my - ty) * k;
      }
      const r = 1.6 + Math.sqrt(Math.max(0, wealth) / maxW) * 4.2;
      const d = dots.current.get(id);
      if (d) {
        Object.assign(d, { tx, ty, tr: r, color, flags, row });
        if (jumped || reduced) { d.x = tx; d.y = ty; d.r = r; }
      } else dots.current.set(id, { id, x: tx, y: ty, tx, ty, r: reduced ? r : 0, tr: r, color, flags, row, born: now });
    }
    for (const id of [...dots.current.keys()]) if (!seen.has(id)) dots.current.delete(id);
  }, [frame, tiles, MW, MH, meta, market, dark, reduced]);

  // 60fps render loop
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const draw = (now: number) => {
      const c = canvas.current;
      if (!c) return;
      const dt = Math.min(64, now - last);
      last = now;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const { w, h } = size;
      if (c.width !== Math.round(w * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      const g = c.getContext('2d')!;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(plate, 0, 0);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const s = w / MW;
      const ease = reduced ? 1 : 1 - Math.pow(0.86, dt / 16.7);
      const unit = Math.min(1.3, Math.max(0.6, w / 900));
      // trade strokes fade over 700ms
      if (sparks.current.length) {
        g.lineWidth = 1;
        sparks.current = sparks.current.filter((sp) => {
          const k = (now - sp.t0) / 700;
          if (k >= 1) return false;
          const head = Math.min(1, k * 1.6);
          g.globalAlpha = 0.55 * (1 - k);
          g.strokeStyle = sp.color;
          g.beginPath();
          g.moveTo(sp.x0 * s, sp.y0 * s);
          g.lineTo((sp.x0 + (sp.x1 - sp.x0) * head) * s, (sp.y0 + (sp.y1 - sp.y0) * head) * s);
          g.stroke();
          return true;
        });
        g.globalAlpha = 1;
      }
      const ring = dark ? '#ebe5d8' : '#1b1a17';
      for (const d of dots.current.values()) {
        d.x += (d.tx - d.x) * ease;
        d.y += (d.ty - d.y) * ease;
        d.r += (d.tr - d.r) * ease;
        const px = d.x * s, py = d.y * s;
        const rr = Math.max(1, d.r * unit);
        g.beginPath();
        g.arc(px, py, rr, 0, Math.PI * 2);
        g.fillStyle = d.color;
        g.globalAlpha = d.flags & 2 ? 0.4 : 1;
        g.fill();
        g.globalAlpha = 1;
        if (d.flags & 1) {
          g.lineWidth = 1;
          g.strokeStyle = ring;
          g.beginPath();
          g.arc(px, py, rr + 1.6, 0, Math.PI * 2);
          g.stroke();
        }
        if (d.flags & 16) {
          const pulse = reduced ? 0 : (Math.sin(now / 90) + 1) * 1.2;
          g.lineWidth = 1.5;
          g.strokeStyle = '#c4321f';
          g.beginPath();
          g.arc(px, py, rr + 3 + pulse, 0, Math.PI * 2);
          g.stroke();
        }
      }
      const sel = selected !== null ? dots.current.get(selected) : hover?.dot;
      if (sel) {
        const px = sel.x * s, py = sel.y * s, rr = Math.max(1, sel.r * unit) + 4;
        g.lineWidth = 1.5;
        g.strokeStyle = ring;
        g.beginPath();
        g.arc(px, py, rr, 0, Math.PI * 2);
        g.stroke();
        if (selected !== null) {
          g.beginPath();
          g.moveTo(px + rr, py);
          g.lineTo(px + rr + 14, py - 14);
          g.lineTo(px + rr + 40, py - 14);
          g.stroke();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size, plate, MW, dark, hover, selected, reduced]);

  const nearest = (e: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const s = size.w / MW;
    let best: Dot | null = null;
    let bd = 12 * 12;
    for (const d of dots.current.values()) {
      const dx = d.x * s - mx, dy = d.y * s - my;
      const dist = dx * dx + dy * dy;
      if (dist < bd) { bd = dist; best = d; }
    }
    return { best, mx, my };
  };

  const hd = hover?.dot;
  return (
    <div className="atlas" ref={wrap}>
      <canvas
        ref={(el) => { canvas.current = el; if (canvasRef) canvasRef.current = el; }}
        style={{ width: size.w, height: size.h }}
        onPointerMove={(e) => { const { best, mx, my } = nearest(e); setHover(best ? { dot: best, px: mx, py: my } : null); }}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => onSelect(nearest(e).best?.id ?? null)}
        role="img"
        aria-label={t('sec.map')}
      />
      {hd && hover && (
        <div className="tip" style={{ left: hover.px > size.w * 0.6 ? undefined : hover.px + 14, right: hover.px > size.w * 0.6 ? size.w - hover.px + 14 : undefined, top: Math.max(4, hover.py - 24) }}>
          <div className="tip-title">{meta.names[hd.id] ?? `#${hd.id}`}</div>
          <div className="tip-row"><i style={{ background: hd.color }} />{meta.teams[hd.row[1]]?.label} · {t(`job.${JOBS[hd.row[2]]}`)}</div>
          <div className="tip-row num">${fmtNum(hd.row[3], lang)} · {t('map.health')} {hd.row[4]}%</div>
          {(hd.flags & 2) > 0 && <div className="tip-note">{t('map.hungry')}</div>}
          {(hd.flags & 1) > 0 && <div className="tip-note">{t('map.cartel')}</div>}
          {(hd.flags & 8) > 0 && <div className="tip-note">{t('map.loan')}</div>}
        </div>
      )}
    </div>
  );
}
