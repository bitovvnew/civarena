import { useMemo, useState } from 'react';
import type { Command, Frame, Headline, ShockKind, TeamScore } from '../../../src/engine/types';
import type { Meta, World } from '../data';
import { fmtCompact, fmtNum, type Lang, type T } from '../i18n';
import { Sparkline } from './charts';

// ---------------------------------------------------------------- KPIs ---

export function KpiTiles({ frames, index, t, lang }: { frames: Frame[]; index: number; t: T; lang: Lang }) {
  const f = frames[index];
  const from = Math.max(0, index - 150);
  const slice = frames.slice(from, index + 1);
  const prev = frames[Math.max(0, index - 10)];
  const tiles: { key: string; value: string; spark: number[]; delta?: number; good?: 'up' | 'down' }[] = f
    ? [
        { key: 'kpi.gdp', value: '$' + fmtCompact(f.m.gdp, lang), spark: slice.map((x) => x.m.gdp), delta: pct(f.m.gdp, prev?.m.gdp), good: 'up' },
        { key: 'kpi.inflation', value: `${fmtNum(f.m.inflation, lang, 1)}%`, spark: slice.map((x) => x.m.cpi) },
        { key: 'kpi.unemployment', value: `${fmtNum(f.m.unemployment * 100, lang, 1)}%`, spark: slice.map((x) => x.m.unemployment), good: 'down' },
        { key: 'kpi.gini', value: fmtNum(f.m.gini, lang, 2), spark: slice.map((x) => x.m.gini), good: 'down' },
        { key: 'kpi.money', value: '$' + fmtCompact(f.m.money, lang), spark: slice.map((x) => x.m.money), delta: pct(f.m.money, prev?.m.money) },
        { key: 'kpi.population', value: fmtNum(f.m.population, lang, 0), spark: slice.map((x) => x.m.population), delta: pct(f.m.population, prev?.m.population), good: 'up' },
      ]
    : [];
  return (
    <div className="kpis">
      {tiles.map((k) => (
        <div className="kpi" key={k.key}>
          <div className="kpi-label">{t(k.key)}</div>
          <div className="kpi-row">
            <div className="kpi-value">{k.value}</div>
            {k.delta !== undefined && Number.isFinite(k.delta) && Math.abs(k.delta) >= 0.05 && (
              <div className={`kpi-delta ${k.good === undefined ? '' : (k.delta > 0) === (k.good === 'up') ? 'pos' : 'neg'}`}>
                {k.delta > 0 ? '▲' : '▼'} {fmtNum(Math.abs(k.delta), lang, 1)}%
              </div>
            )}
          </div>
          <Sparkline values={k.spark} color="var(--accent)" />
        </div>
      ))}
    </div>
  );
}

function pct(a: number, b?: number) {
  if (!b) return NaN;
  return ((a - b) / Math.abs(b)) * 100;
}

// --------------------------------------------------------- leaderboard ---

export function Leaderboard({ teams, t, lang }: { teams: TeamScore[]; t: T; lang: Lang }) {
  const rows = [...teams].sort((a, b) => b.score - a.score);
  const max = Math.max(1, ...rows.map((r) => r.score));
  return (
    <div className="leaderboard">
      <table>
        <thead>
          <tr>
            <th>#</th><th></th><th className="num">{t('lb.score')}</th><th className="num">{t('lb.wealth')}</th><th className="num">{t('lb.gdp')}</th>
            <th className="num">{t('lb.alive')}</th><th className="num hide-sm">{t('lb.gini')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id}>
              <td className={`rank r${i + 1}`}>{i + 1}</td>
              <td className="team">
                <div className="team-name"><span className="chip" style={{ background: r.color }} />{r.label}
                  <span className="provider">{r.provider === 'mock' ? t('lb.offline') : r.provider}</span></div>
                <div className="bar"><span style={{ width: `${(r.score / max) * 100}%`, background: r.color }} /></div>
                <div className="rationale" title={r.rationale}>“{r.rationale}”</div>
              </td>
              <td className="num strong">{fmtNum(r.score, lang, 1)}</td>
              <td className="num">{fmtNum(r.wealthShare * 100, lang, 1)}%</td>
              <td className="num">{fmtNum(r.gdpShare * 100, lang, 1)}%</td>
              <td className="num">{r.alive}<span className="muted">/{r.born}</span></td>
              <td className="num hide-sm">{fmtNum(r.gini, lang, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="foot">{t('lb.help')}</div>
    </div>
  );
}

// ---------------------------------------------------------- headlines ---

export function EventFeed({ frames, index, meta, t }: { frames: Frame[]; index: number; meta: Meta; t: T }) {
  const [filter, setFilter] = useState<'all' | 'drama'>('all');
  const items = useMemo(() => {
    const out: (Headline & { uid: string })[] = [];
    for (let i = index; i >= 0 && out.length < 80; i--) {
      const hs = frames[i]?.headlines ?? [];
      for (let k = hs.length - 1; k >= 0; k--) {
        const h = hs[k];
        if (filter === 'drama' && h.level < 2) continue;
        out.push({ ...h, uid: `${frames[i].tick}.${k}` });
      }
    }
    return out;
  }, [frames, index, filter]);
  const colorOf = (team?: string) => meta.teams.find((x) => x.id === team)?.color;
  return (
    <div className="feed">
      <div className="seg" role="tablist">
        {(['all', 'drama'] as const).map((k) => (
          <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{t(`feed.${k}`)}</button>
        ))}
      </div>
      <ol className="feed-list" aria-live="polite">
        {items.length === 0 && <li className="empty">{t('feed.empty')}</li>}
        {items.map((h) => (
          <li key={h.uid} className={`lvl${h.level} k-${h.kind}`}>
            <span className="day">{h.tick}</span>
            {h.team && <span className="chip" style={{ background: colorOf(h.team) }} />}
            <span className="text">{t(h.key, h.params)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ------------------------------------------------------- trade network ---

export function TradeNetwork({ frames, index, meta, t, lang }: { frames: Frame[]; index: number; meta: Meta; t: T; lang: Lang }) {
  const [hover, setHover] = useState<string | null>(null);
  const flows = useMemo(() => {
    const acc: Record<string, number> = {};
    for (let i = Math.max(0, index - 49); i <= index; i++) {
      const f = frames[i];
      if (!f) continue;
      for (const [k, v] of Object.entries(f.flows)) acc[k] = (acc[k] ?? 0) + v;
    }
    return acc;
  }, [frames, index]);
  const f = frames[index];
  const nodes = [...meta.teams.map((tm) => ({ id: tm.id, label: tm.label, color: tm.color })), { id: 'world', label: t('net.world'), color: 'var(--text-muted)' }];
  const W = 360, H = 260, cx = W / 2, cy = H / 2 + 4, R = 92;
  const pos = new Map(nodes.map((n, i) => {
    const a = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
    return [n.id, [cx + Math.cos(a) * R * 1.35, cy + Math.sin(a) * R] as [number, number]];
  }));
  const wealth = new Map((f?.teams ?? []).map((x) => [x.id, x.wealthShare]));
  const edges = Object.entries(flows)
    .map(([k, v]) => { const [from, to] = k.split('>'); return { k, from, to, v }; })
    .filter((e) => pos.has(e.from) && pos.has(e.to) && e.v > 0);
  const maxV = Math.max(1, ...edges.map((e) => e.v));
  const colorOf = (id: string) => nodes.find((n) => n.id === id)?.color ?? '#888';
  return (
    <div className="network">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('panel.network')}>
        <defs>
          {nodes.map((n) => (
            <marker key={n.id} id={`arr-${cssId(n.id)}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0,0L10,5L0,10z" fill={n.color} />
            </marker>
          ))}
        </defs>
        {edges.map((e) => {
          const [x1, y1] = pos.get(e.from)!, [x2, y2] = pos.get(e.to)!;
          const active = hover === null || hover === e.from || hover === e.to;
          const width = 0.8 + (e.v / maxV) * 7;
          if (e.from === e.to) {
            // trade inside a team: a small loop
            const dx = x1 - cx, dy = y1 - cy, len = Math.hypot(dx, dy) || 1;
            const ox = (dx / len) * 22, oy = (dy / len) * 22;
            return <path key={e.k} d={`M${x1},${y1} c${ox - oy * 0.8},${oy + ox * 0.8} ${ox + oy * 0.8},${oy - ox * 0.8} 0,0`} fill="none" stroke={colorOf(e.from)} strokeWidth={width} opacity={active ? 0.55 : 0.08} />;
          }
          const mx = (x1 + x2) / 2 + (y2 - y1) * 0.18, my = (y1 + y2) / 2 - (x2 - x1) * 0.18;
          const shrink = (x: number, y: number, tx: number, ty: number, d: number) => { const l = Math.hypot(tx - x, ty - y) || 1; return [x + ((tx - x) / l) * d, y + ((ty - y) / l) * d]; };
          const [ex, ey] = shrink(x2, y2, mx, my, 20);
          return <path key={e.k} d={`M${x1},${y1} Q${mx},${my} ${ex},${ey}`} fill="none" stroke={colorOf(e.from)} strokeWidth={width} opacity={active ? 0.7 : 0.08} markerEnd={`url(#arr-${cssId(e.from)})`} strokeLinecap="round" />;
        })}
        {nodes.map((n) => {
          const [x, y] = pos.get(n.id)!;
          const r = n.id === 'world' ? 11 : 9 + Math.sqrt(wealth.get(n.id) ?? 0.1) * 22;
          const out = edges.filter((e) => e.from === n.id).reduce((s, e) => s + e.v, 0);
          return (
            <g key={n.id} onPointerEnter={() => setHover(n.id)} onPointerLeave={() => setHover(null)} style={{ cursor: 'default' }}>
              <circle cx={x} cy={y} r={r + 6} fill="transparent" />
              <circle cx={x} cy={y} r={r} fill={n.color} stroke="var(--surface-1)" strokeWidth={2} />
              <text x={x} y={y + r + 13} textAnchor="middle" className="node-label">{n.label}</text>
              {hover === n.id && <text x={x} y={y - r - 6} textAnchor="middle" className="node-value">${fmtCompact(out, lang)}</text>}
            </g>
          );
        })}
      </svg>
      <div className="foot">{t('net.help')}</div>
    </div>
  );
}

function cssId(s: string) {
  return s.replace(/[^a-zA-Z0-9_-]/g, '_');
}

// ------------------------------------------------------------ controls ---

const SHOCKS: ShockKind[] = ['drought', 'mine_collapse', 'tech_boom', 'plague', 'gold_rush', 'trade_embargo'];

export function Controls({ world, frame, command, t }: { world: World; frame: Frame | undefined; command: (c: Command) => void; t: T }) {
  const live = world.status !== 'replay';
  const gov = frame?.gov;
  const [tax, setTax] = useState<number | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [ubi, setUbi] = useState<number | null>(null);
  const taxV = tax ?? Math.round((gov?.taxRate ?? 0.1) * 100);
  const rateV = rate ?? frame?.m.policyRate ?? 4;
  const ubiV = ubi ?? gov?.ubi ?? 0;
  if (!live) return <div className="controls readonly">{t('ctl.readonly')}</div>;
  const money = frame?.m.money ?? 20000;
  return (
    <div className="controls">
      <label className="slider">
        <span>{t('ctl.tax')} <b>{taxV}%</b></span>
        <input type="range" min={0} max={60} step={1} value={taxV} onChange={(e) => setTax(+e.target.value)}
          onPointerUp={() => { command({ type: 'tax', rate: taxV / 100 }); setTax(null); }} onKeyUp={() => { command({ type: 'tax', rate: taxV / 100 }); setTax(null); }} />
      </label>
      <label className="slider">
        <span>{t('ctl.rate')} <b>{rateV}%</b></span>
        <input type="range" min={0} max={25} step={0.5} value={rateV} onChange={(e) => setRate(+e.target.value)}
          onPointerUp={() => { command({ type: 'rate', rate: rateV }); setRate(null); }} onKeyUp={() => { command({ type: 'rate', rate: rateV }); setRate(null); }} />
      </label>
      <label className="slider">
        <span>{t('ctl.ubi')} <b>${ubiV}</b></span>
        <input type="range" min={0} max={5} step={0.25} value={ubiV} onChange={(e) => setUbi(+e.target.value)}
          onPointerUp={() => { command({ type: 'ubi', amount: ubiV }); setUbi(null); }} onKeyUp={() => { command({ type: 'ubi', amount: ubiV }); setUbi(null); }} />
      </label>
      <div className="toggles">
        <button className={`toggle ${gov?.welfare ? 'on' : ''}`} aria-pressed={!!gov?.welfare} onClick={() => command({ type: 'welfare', on: !gov?.welfare })}>{t('ctl.welfare')}</button>
        <button className={`toggle ${gov?.antitrust ? 'on' : ''}`} aria-pressed={!!gov?.antitrust} onClick={() => command({ type: 'antitrust', on: !gov?.antitrust })}>{t('ctl.antitrust')}</button>
        <button className="action money" onClick={() => command({ type: 'print', amount: Math.round(money * 0.25) })}>{t('ctl.print')} +25%</button>
      </div>
      <div className="shock-label">{t('ctl.shocks')}</div>
      <div className="shocks">
        {SHOCKS.map((k) => {
          const active = frame?.shocks.some((s) => s.kind === k);
          return <button key={k} className={`shock ${active ? 'active' : ''}`} onClick={() => command({ type: 'shock', kind: k })}>{t(`shock.${k}`)}</button>;
        })}
      </div>
      <button className="action reset" onClick={() => command({ type: 'reset' })}>{t('ctl.reset')}</button>
    </div>
  );
}

// ------------------------------------------------------------ timeline ---

export function Timeline({ world, index, seek, command, t }: { world: World; index: number; seek: (i: number | null) => void; command: (c: Command) => void; t: T }) {
  const n = world.frames.length;
  const marks = useMemo(() => {
    const out: { i: number; kind: string }[] = [];
    world.frames.forEach((f, i) => {
      const h = f.headlines.find((x) => x.level === 2);
      if (h) out.push({ i, kind: h.kind });
    });
    return out.slice(-200);
  }, [world.frames.length, world.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const following = world.cursor === null && world.status !== 'replay';
  const speeds = [2, 4, 8, 16, 32];
  return (
    <div className="timeline">
      <button className="play" aria-label={world.paused ? t('ctl.play') : t('ctl.pause')} onClick={() => command({ type: world.paused ? 'resume' : 'pause' })}>
        {world.paused ? '▶' : '❚❚'}
      </button>
      <div className="speed" role="group" aria-label={t('ctl.speed')}>
        {speeds.map((s) => (
          <button key={s} className={Math.round(world.tps) === s ? 'on' : ''} onClick={() => command({ type: 'speed', tps: s })}>{s}×</button>
        ))}
      </div>
      <div className="scrub">
        <div className="marks" aria-hidden="true">
          {n > 1 && marks.map((m) => <span key={m.i} className={`mark k-${m.kind}`} style={{ left: `${(m.i / (n - 1)) * 100}%` }} />)}
        </div>
        <input type="range" min={0} max={Math.max(0, n - 1)} value={Math.max(0, index)} onChange={(e) => seek(+e.target.value)} aria-label="timeline" />
      </div>
      {world.status !== 'replay' && (
        <button className={`live-btn ${following ? 'on' : ''}`} onClick={() => seek(null)}>{following ? '● ' + t('mode.live') : t('ctl.live')}</button>
      )}
    </div>
  );
}
