// Hand-rolled SVG charts: thin 2px lines, one axis, recessive grid, crosshair + tooltip on hover.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export function useSize<T extends HTMLElement>(): [React.RefObject<T | null>, { w: number; h: number }] {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      setSize((s) => (Math.abs(s.w - r.width) > 0.5 || Math.abs(s.h - r.height) > 0.5 ? { w: r.width, h: r.height } : s));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

/** "Nice" axis ticks. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (max - min < 1e-9) {
    max = min + 1;
  }
  const span = max - min;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

export interface Series {
  id: string;
  label: string;
  color: string;
  values: number[];
}

interface LineChartProps {
  x: number[]; // ticks
  series: Series[];
  height?: number;
  format: (v: number) => string;
  zeroBased?: boolean;
  cursorX?: number | null; // tick shown by the replay scrubber
  onHoverX?: (tick: number | null) => void;
  area?: boolean;
  label?: string;
  refLine?: number;
}

export function LineChart({ x, series, height = 150, format, zeroBased = true, cursorX, area, label, refLine }: LineChartProps) {
  const [ref, { w }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 44, r: 10, t: 8, b: 20 };
  const iw = Math.max(10, w - pad.l - pad.r);
  const ih = Math.max(10, height - pad.t - pad.b);
  const { y0, y1, ticks } = useMemo(() => {
    let lo = Infinity, hi = -Infinity;
    for (const s of series) for (const v of s.values) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (refLine !== undefined) { lo = Math.min(lo, refLine); hi = Math.max(hi, refLine); }
    if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
    if (zeroBased) lo = Math.min(0, lo);
    const t = niceTicks(lo, hi, 4);
    return { y0: Math.min(lo, t[0]), y1: Math.max(hi, t[t.length - 1]), ticks: t };
  }, [series, zeroBased, refLine]);
  const xMin = x[0] ?? 0, xMax = x[x.length - 1] ?? 1;
  const sx = (v: number) => pad.l + ((v - xMin) / Math.max(1, xMax - xMin)) * iw;
  const sy = (v: number) => pad.t + ih - ((v - y0) / Math.max(1e-9, y1 - y0)) * ih;
  const paths = series.map((s) => {
    let d = '';
    s.values.forEach((v, i) => {
      if (!Number.isFinite(v)) return;
      d += `${d ? 'L' : 'M'}${sx(x[i]).toFixed(1)},${sy(v).toFixed(1)}`;
    });
    return d;
  });
  const xTicks = niceTicks(xMin, xMax, Math.max(2, Math.floor(iw / 90))).filter((t) => t >= xMin && t <= xMax);
  const hi = hover ?? null;
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const tick = xMin + (px / iw) * (xMax - xMin);
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < x.length; i++) {
      const d = Math.abs(x[i] - tick);
      if (d < bd) { bd = d; best = i; }
    }
    setHover(best);
  };
  return (
    <div className="chart" ref={ref} style={{ height }}>
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label={label}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={pad.l + iw} y1={sy(t)} y2={sy(t)} className={t === 0 ? 'axis' : 'grid'} />
              <text x={pad.l - 6} y={sy(t)} className="tick" textAnchor="end" dominantBaseline="middle">{format(t)}</text>
            </g>
          ))}
          {refLine !== undefined && <line x1={pad.l} x2={pad.l + iw} y1={sy(refLine)} y2={sy(refLine)} className="ref" />}
          {xTicks.map((t) => (
            <text key={t} x={sx(t)} y={height - 5} className="tick" textAnchor="middle">{Math.round(t)}</text>
          ))}
          {area && series.length === 1 && paths[0] && (
            <path className="fade-in" d={`${paths[0]}L${sx(xMax)},${sy(Math.max(0, y0))}L${sx(xMin)},${sy(Math.max(0, y0))}Z`} fill={series[0].color} opacity={0.1} />
          )}
          {paths.map((d, i) => <path className="draw" pathLength={1} key={series[i].id} d={d} fill="none" stroke={series[i].color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
          {cursorX != null && cursorX >= xMin && cursorX <= xMax && <line x1={sx(cursorX)} x2={sx(cursorX)} y1={pad.t} y2={pad.t + ih} className="cursor" />}
          {hi !== null && x[hi] !== undefined && (
            <g>
              <line x1={sx(x[hi])} x2={sx(x[hi])} y1={pad.t} y2={pad.t + ih} className="crosshair" />
              {series.map((s) => Number.isFinite(s.values[hi]) && (
                <circle key={s.id} cx={sx(x[hi])} cy={sy(s.values[hi])} r={4} fill={s.color} stroke="var(--surface-1)" strokeWidth={2} />
              ))}
            </g>
          )}
          <rect x={pad.l} y={pad.t} width={iw} height={ih} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
      )}
      {hi !== null && x[hi] !== undefined && (
        <Tooltip x={sx(x[hi])} w={w} title={`#${x[hi]}`}>
          {series.map((s) => (
            <div key={s.id} className="tt-row">
              {series.length > 1 && <span className="swatch" style={{ background: s.color }} />}
              <span className="tt-label">{s.label}</span>
              <span className="tt-val">{Number.isFinite(s.values[hi]) ? format(s.values[hi]) : '–'}</span>
            </div>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

export function Tooltip({ x, w, title, children }: { x: number; w: number; title: string; children: ReactNode }) {
  const left = x > w * 0.6 ? undefined : x + 12;
  const right = x > w * 0.6 ? w - x + 12 : undefined;
  return (
    <div className="tooltip" style={{ left, right, top: 6 }}>
      <div className="tt-title">{title}</div>
      {children}
    </div>
  );
}

/** 100%-stacked area of team wealth share with direct end labels. */
export function StackedShare({ x, series, height = 180, format }: { x: number[]; series: Series[]; height?: number; format: (v: number) => string }) {
  const [ref, { w }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 36, r: 92, t: 6, b: 20 };
  const iw = Math.max(10, w - pad.l - pad.r);
  const ih = Math.max(10, height - pad.t - pad.b);
  const xMin = x[0] ?? 0, xMax = x[x.length - 1] ?? 1;
  const sx = (v: number) => pad.l + ((v - xMin) / Math.max(1, xMax - xMin)) * iw;
  const sy = (v: number) => pad.t + ih - v * ih;
  const n = x.length;
  const cum: number[][] = [];
  const base = new Array(n).fill(0);
  for (const s of series) {
    const top = base.map((b, i) => b + Math.max(0, s.values[i] ?? 0));
    cum.push(top);
    for (let i = 0; i < n; i++) base[i] = top[i];
  }
  const totals = base;
  const norm = (v: number, i: number) => (totals[i] > 0 ? v / totals[i] : 0);
  const shapes = series.map((s, k) => {
    const lower = k === 0 ? new Array(n).fill(0) : cum[k - 1];
    const upper = cum[k];
    let d = '';
    for (let i = 0; i < n; i++) d += `${i ? 'L' : 'M'}${sx(x[i]).toFixed(1)},${(sy(norm(upper[i], i)) + (k < series.length - 1 ? 1 : 0)).toFixed(1)}`;
    for (let i = n - 1; i >= 0; i--) d += `L${sx(x[i]).toFixed(1)},${(sy(norm(lower[i], i)) - (k > 0 ? 1 : 0)).toFixed(1)}`;
    return d + 'Z';
  });
  const last = n - 1;
  const labels = series.map((s, k) => {
    const lo = k === 0 ? 0 : norm(cum[k - 1][last], last);
    const hi = norm(cum[k][last], last);
    return { s, mid: (lo + hi) / 2, share: hi - lo };
  });
  // nudge labels apart
  const ys = labels.map((l) => sy(l.mid));
  const order = ys.map((y, i) => i).sort((a, b) => ys[a] - ys[b]);
  for (let k = 1; k < order.length; k++) if (ys[order[k]] - ys[order[k - 1]] < 13) ys[order[k]] = ys[order[k - 1]] + 13;
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const tick = xMin + ((e.clientX - rect.left) / iw) * (xMax - xMin);
    let best = 0, bd = Infinity;
    for (let i = 0; i < n; i++) { const d = Math.abs(x[i] - tick); if (d < bd) { bd = d; best = i; } }
    setHover(best);
  };
  return (
    <div className="chart" ref={ref} style={{ height }}>
      {w > 0 && n > 1 && (
        <svg width={w} height={height} role="img">
          <g className="wipe">{shapes.map((d, k) => <path key={series[k].id} d={d} fill={series[k].color} opacity={hover === null ? 0.92 : 0.78} />)}</g>
          {[0, 0.5, 1].map((t) => (
            <text key={t} x={pad.l - 6} y={sy(t)} className="tick" textAnchor="end" dominantBaseline="middle">{Math.round(t * 100)}%</text>
          ))}
          {niceTicks(xMin, xMax, Math.max(2, Math.floor(iw / 90))).filter((t) => t >= xMin && t <= xMax).map((t) => (
            <text key={t} x={sx(t)} y={height - 5} className="tick" textAnchor="middle">{Math.round(t)}</text>
          ))}
          {labels.map((l, k) => (
            <text key={l.s.id} x={pad.l + iw + 8} y={ys[k]} className="end-label" dominantBaseline="middle">
              <tspan fill="var(--text-primary)">{format(l.share)}</tspan>
              <tspan fill="var(--text-secondary)"> {l.s.label.length > 9 ? l.s.label.slice(0, 9) + '…' : l.s.label}</tspan>
            </text>
          ))}
          {hover !== null && <line x1={sx(x[hover])} x2={sx(x[hover])} y1={pad.t} y2={pad.t + ih} className="crosshair" />}
          <rect x={pad.l} y={pad.t} width={iw} height={ih} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
      )}
      {hover !== null && (
        <Tooltip x={sx(x[hover])} w={w} title={`#${x[hover]}`}>
          {series.map((s, k) => {
            const lo = k === 0 ? 0 : cum[k - 1][hover];
            return (
              <div key={s.id} className="tt-row">
                <span className="swatch" style={{ background: s.color }} />
                <span className="tt-label">{s.label}</span>
                <span className="tt-val">{format(norm(cum[k][hover] - lo, hover))}</span>
              </div>
            );
          })}
        </Tooltip>
      )}
    </div>
  );
}

export function Sparkline({ values, color, height = 28 }: { values: number[]; color: string; height?: number }) {
  const [ref, { w }] = useSize<HTMLDivElement>();
  let lo = Infinity, hi = -Infinity;
  for (const v of values) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
  if (hi - lo < 1e-9) hi = lo + 1;
  const n = values.length;
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / Math.max(1, n - 1)) * (w - 4) + 2).toFixed(1)},${(height - 3 - ((v - lo) / (hi - lo)) * (height - 6)).toFixed(1)}`).join('');
  return (
    <div ref={ref} className="spark" style={{ height }}>
      {w > 0 && n > 1 && (
        <svg width={w} height={height} aria-hidden="true">
          <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
          <circle cx={w - 2} cy={height - 3 - ((values[n - 1] - lo) / (hi - lo)) * (height - 6)} r={2.5} fill={color} />
        </svg>
      )}
    </div>
  );
}
