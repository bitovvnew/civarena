// Front-page sections: masthead + ticker, the numbers, today's lead, standings, the wire, trade network.

import { useMemo, useState } from 'react';
import { GOODS, type Frame, type Headline, type TeamScore } from '../../../src/engine/types';
import type { Meta, World } from '../data';
import { frontPage } from '../gazette';
import { useCountUp } from '../hooks';
import { fmtCompact, fmtNum, fmtPct, LANGS, type Lang, type T } from '../i18n';
import { teamColor } from '../theme';
import { Sparkline } from './charts';

// ------------------------------------------------------------- masthead ---

export type View = 'front' | 'scenarios' | 'tournament' | 'export';

export function Masthead({ meta, world, frame, t, lang, setLang, dark, toggleTheme, view, setView, onOpen, onPaper }: {
  meta: Meta; world: World; frame: Frame | undefined; t: T; lang: Lang; setLang: (l: Lang) => void; dark: boolean; toggleTheme: () => void;
  view: View; setView: (v: View) => void; onOpen: () => void; onPaper: () => void;
}) {
  const day = frame?.tick ?? 0;
  const mode = world.status === 'replay' ? t('mode.replay') : world.paused ? t('mode.paused') : t('mode.live');
  return (
    <header className="masthead">
      <div className="mast-top">
        <span className={`edition-mark ${world.status === 'replay' ? 'replay' : world.paused ? 'paused' : 'live'}`}>{mode}</span>
        <span className="mast-meta">{meta.scenario.name} · {t('seed')} {meta.seed}</span>
        <div className="mast-tools">
          <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={t('nav.language')}>
            {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="link" onClick={toggleTheme}>{dark ? t('nav.daylight') : t('nav.night')}</button>
          <button className="link" onClick={onOpen}>{t('nav.open')}</button>
          {world.status !== 'replay' && !world.isStatic && <a className="link" href="/?setup=1">{t('nav.setup')}</a>}
        </div>
      </div>
      <div className="mast-title">
        <h1>
          <svg className="mast-emblem" viewBox="0 0 40 40" aria-hidden="true"><use href="#civ-mark" /></svg>
          CivArena
        </h1>
        <div className="mast-date">
          <span className="big">{t('day')} {fmtNum(day, lang, 0)}</span>
          <span>{t('year')} {Math.floor(day / 100) + 1}</span>
        </div>
      </div>
      <nav className="mast-nav" aria-label="Sections">
        {(['front', 'scenarios', 'tournament', 'export'] as View[]).map((v) => (
          <button key={v} className={view === v ? 'on' : ''} aria-current={view === v ? 'page' : undefined} onClick={() => setView(v)}>{t(`nav.${v}`)}</button>
        ))}
        <button className="paper-btn" onClick={onPaper}>{t('gazette.open')}</button>
      </nav>
      {frame && <Ticker frame={frame} frames={world.frames} t={t} lang={lang} />}
    </header>
  );
}

function Ticker({ frame, frames, t, lang }: { frame: Frame; frames: Frame[]; t: T; lang: Lang }) {
  const idx = frames.indexOf(frame);
  const prev = frames[Math.max(0, idx - 7)] ?? frame;
  const items = [
    ...GOODS.map((g) => ({ k: t(`good.${g}`), v: `$${fmtNum(frame.prices[g], lang)}`, ch: ((frame.prices[g] - prev.prices[g]) / (prev.prices[g] || 1)) * 100 })),
    { k: 'CPI', v: fmtNum(frame.m.cpi, lang, 0), ch: ((frame.m.cpi - prev.m.cpi) / (prev.m.cpi || 1)) * 100 },
    ...frame.teams.map((tm) => ({ k: tm.label, v: fmtNum(tm.score, lang, 1), ch: 0, team: true })),
  ];
  const row = items.map((it, i) => (
    <span key={i} className="tick-item">
      <b>{it.k}</b> {it.v}
      {!('team' in it) && Math.abs(it.ch) >= 0.05 && <span className={it.ch > 0 ? 'up' : 'down'}>{it.ch > 0 ? '▲' : '▼'}{fmtNum(Math.abs(it.ch), lang, 1)}%</span>}
    </span>
  ));
  return (
    <div className="ticker" aria-hidden="true">
      <div className="ticker-track">{row}{row}</div>
    </div>
  );
}

// --------------------------------------------------------------- numbers ---

function Counter({ value, format }: { value: number; format: (v: number) => string }) {
  const v = useCountUp(value);
  return <>{format(v)}</>;
}

export function Numbers({ frames, index, t, lang }: { frames: Frame[]; index: number; t: T; lang: Lang }) {
  const f = frames[index];
  if (!f) return null;
  const from = Math.max(0, index - 150);
  const slice = frames.slice(from, index + 1);
  const prev = frames[Math.max(0, index - 7)];
  const pct = (a: number, b?: number) => (b ? ((a - b) / Math.abs(b)) * 100 : NaN);
  const tiles: { key: string; value: number; fmt: (v: number) => string; spark: number[]; delta?: number; good?: 'up' | 'down' }[] = [
    { key: 'kpi.gdp', value: f.m.gdp, fmt: (v) => '$' + fmtCompact(v, lang), spark: slice.map((x) => x.m.gdp), delta: pct(f.m.gdp, prev?.m.gdp), good: 'up' },
    { key: 'kpi.inflation', value: f.m.inflation, fmt: (v) => `${fmtNum(v, lang, 1)}%`, spark: slice.map((x) => x.m.cpi) },
    { key: 'kpi.unemployment', value: f.m.unemployment * 100, fmt: (v) => `${fmtNum(v, lang, 1)}%`, spark: slice.map((x) => x.m.unemployment), good: 'down' },
    { key: 'kpi.gini', value: f.m.gini, fmt: (v) => fmtNum(v, lang, 2), spark: slice.map((x) => x.m.gini), good: 'down' },
    { key: 'kpi.money', value: f.m.money, fmt: (v) => '$' + fmtCompact(v, lang), spark: slice.map((x) => x.m.money), delta: pct(f.m.money, prev?.m.money) },
    { key: 'kpi.population', value: f.m.population, fmt: (v) => fmtNum(Math.round(v), lang, 0), spark: slice.map((x) => x.m.population), delta: pct(f.m.population, prev?.m.population), good: 'up' },
  ];
  return (
    <section className="numbers" aria-label="Key numbers">
      {tiles.map((k) => (
        <div className="number" key={k.key}>
          <div className="label">{t(k.key)}</div>
          <div className="figure"><Counter value={k.value} format={k.fmt} /></div>
          <div className="foot-row">
            <Sparkline values={k.spark} color="var(--ink-2)" />
            {k.delta !== undefined && Number.isFinite(k.delta) && Math.abs(k.delta) >= 0.05 && (
              <span className={`delta ${k.good === undefined ? '' : (k.delta > 0) === (k.good === 'up') ? 'pos' : 'neg'}`} title={t('kpi.week')}>{fmtPct(k.delta, lang)}</span>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}

// ------------------------------------------------------------ lead story ---

export function Lead({ frames, index, t, lang }: { frames: Frame[]; index: number; t: T; lang: Lang }) {
  const page = useMemo(() => frontPage(frames, index), [frames, index]);
  const f = frames[index];
  if (!f) return null;
  const lead = page.lead;
  return (
    <section className="lead" aria-live="polite">
      <div className="kicker">{t('sec.lead')} · {t('day')} {lead?.tick ?? f.tick}</div>
      <h2 key={lead ? `${lead.tick}${lead.key}` : 'quiet'} className="headline">{lead ? t(lead.key, lead.params) : t('lead.quiet')}</h2>
      <p className="dek">{t('lead.dek', { gdp: '$' + fmtCompact(f.m.gdp, lang), gdpChange: fmtPct(page.change.gdp, lang), cpiChange: fmtPct(page.change.cpi, lang), pop: f.m.population })}</p>
      {page.secondary.length > 0 && (
        <ul className="secondary">
          {page.secondary.map((s, i) => <li key={i}><span className="day">{s.tick}</span>{t(s.key, s.params)}</li>)}
        </ul>
      )}
    </section>
  );
}

// ------------------------------------------------------------ standings ---

export interface UsageRow { team: string; calls: number; tokens: number; limit: number; exhausted: string | null; provider: string }

export function Standings({ teams, t, lang, dark, usage }: { teams: TeamScore[]; t: T; lang: Lang; dark: boolean; usage: UsageRow[] }) {
  const rows = [...teams].sort((a, b) => b.score - a.score);
  const max = Math.max(1, ...rows.map((r) => r.score));
  return (
    <div className="standings">
      <table>
        <thead>
          <tr>
            <th scope="col">#</th><th scope="col"></th><th className="num" scope="col">{t('lb.score')}</th><th className="num" scope="col">{t('lb.wealth')}</th>
            <th className="num" scope="col">{t('lb.gdp')}</th><th className="num" scope="col">{t('lb.alive')}</th><th className="num hide-sm" scope="col">{t('lb.gini')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const u = usage.find((x) => x.team === r.id);
            return (
              <tr key={r.id} style={{ ['--row' as string]: i }}>
                <td className={`rank r${i + 1}`}>{i + 1}</td>
                <td className="team">
                  <div className="team-name"><i style={{ background: teamColor(r.color, dark) }} />{r.label}
                    <span className="provider">{r.provider === 'offline' || r.provider === 'mock' ? t('lb.offline') : r.provider}</span>
                    {u && u.tokens > 0 && <span className={`spend ${u.exhausted ? 'out' : ''}`}>{u.exhausted ? t('spend.out') : `${fmtCompact(u.tokens, lang)} tok`}</span>}
                  </div>
                  <div className="bar"><span style={{ width: `${(r.score / max) * 100}%`, background: teamColor(r.color, dark) }} /></div>
                  <blockquote className="rationale" title={r.rationale}>“{r.rationale}”</blockquote>
                </td>
                <td className="num strong">{fmtNum(r.score, lang, 1)}</td>
                <td className="num">{fmtNum(r.wealthShare * 100, lang, 1)}%</td>
                <td className="num">{fmtNum(r.gdpShare * 100, lang, 1)}%</td>
                <td className="num">{r.alive}<span className="muted">/{r.born}</span></td>
                <td className="num hide-sm">{fmtNum(r.gini, lang, 2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="note">{t('lb.help')}</p>
    </div>
  );
}

// -------------------------------------------------------------- the wire ---

export function Wire({ frames, index, meta, t, dark, onName }: { frames: Frame[]; index: number; meta: Meta; t: T; dark: boolean; onName: (name: string) => void }) {
  const [filter, setFilter] = useState<'all' | 'drama'>('all');
  const items = useMemo(() => {
    const out: (Headline & { uid: string })[] = [];
    for (let i = index; i >= 0 && out.length < 90; i--) {
      const hs = frames[i]?.headlines ?? [];
      for (let k = hs.length - 1; k >= 0; k--) {
        const h = hs[k];
        if (filter === 'drama' && h.level < 2) continue;
        out.push({ ...h, uid: `${frames[i].tick}.${k}` });
      }
    }
    return out;
  }, [frames, index, filter]);
  const colorOf = (team?: string) => {
    const c = meta.teams.find((x) => x.id === team)?.color;
    return c ? teamColor(c, dark) : undefined;
  };
  return (
    <div className="wire">
      <div className="seg" role="tablist">
        {(['all', 'drama'] as const).map((k) => (
          <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{t(`feed.${k}`)}</button>
        ))}
      </div>
      <ol className="wire-list">
        {items.length === 0 && <li className="empty">{t('feed.empty')}</li>}
        {items.map((h) => (
          <li key={h.uid} className={`lvl${h.level} k-${h.kind}`}>
            <span className="day">{h.tick}</span>
            {h.team && <i className="dot" style={{ background: colorOf(h.team) }} />}
            <span className="text">
              {t(h.key, h.params)}
              {typeof h.params.name === 'string' && <button className="who" onClick={() => onName(h.params.name as string)} aria-label={`${h.params.name}`}>→</button>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// --------------------------------------------------------- trade network ---

export function TradeNetwork({ frames, index, meta, t, lang, dark }: { frames: Frame[]; index: number; meta: Meta; t: T; lang: Lang; dark: boolean }) {
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
  const nodes = [...meta.teams.map((tm) => ({ id: tm.id, label: tm.label, color: teamColor(tm.color, dark) })), { id: 'world', label: t('net.world'), color: 'var(--ink-3)' }];
  const W = 380, H = 270, cx = W / 2, cy = H / 2, R = 96;
  const pos = new Map(nodes.map((n, i) => {
    const a = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
    return [n.id, [cx + Math.cos(a) * R * 1.4, cy + Math.sin(a) * R] as [number, number]];
  }));
  const wealth = new Map((f?.teams ?? []).map((x) => [x.id, x.wealthShare]));
  const edges = Object.entries(flows).map(([k, v]) => { const [from, to] = k.split('>'); return { k, from, to, v }; }).filter((e) => pos.has(e.from) && pos.has(e.to) && e.v > 0 && e.from !== e.to);
  const maxV = Math.max(1, ...edges.map((e) => e.v));
  const colorOf = (id: string) => nodes.find((n) => n.id === id)?.color ?? '#888';
  return (
    <div className="network">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('sec.trade')}>
        <defs>
          <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="context-stroke" /></marker>
        </defs>
        {edges.map((e) => {
          const [x1, y1] = pos.get(e.from)!, [x2, y2] = pos.get(e.to)!;
          const active = hover === null || hover === e.from || hover === e.to;
          const mx = (x1 + x2) / 2 + (y2 - y1) * 0.2, my = (y1 + y2) / 2 - (x2 - x1) * 0.2;
          const l = Math.hypot(mx - x2, my - y2) || 1;
          const ex = x2 + ((mx - x2) / l) * 18, ey = y2 + ((my - y2) / l) * 18;
          return <path key={e.k} className="flow" d={`M${x1},${y1} Q${mx},${my} ${ex},${ey}`} fill="none" stroke={colorOf(e.from)} strokeWidth={0.8 + (e.v / maxV) * 6} opacity={active ? 0.75 : 0.07} markerEnd="url(#arr)" strokeLinecap="round" />;
        })}
        {nodes.map((n) => {
          const [x, y] = pos.get(n.id)!;
          const r = n.id === 'world' ? 9 : 8 + Math.sqrt(wealth.get(n.id) ?? 0.1) * 20;
          const out = edges.filter((e) => e.from === n.id).reduce((s, e) => s + e.v, 0);
          return (
            <g key={n.id} onPointerEnter={() => setHover(n.id)} onPointerLeave={() => setHover(null)}>
              <circle cx={x} cy={y} r={r + 8} fill="transparent" />
              <circle cx={x} cy={y} r={r} fill={n.color} stroke="var(--paper)" strokeWidth={2} />
              <text x={x} y={y + r + 13} textAnchor="middle" className="node-label">{n.label}</text>
              {hover === n.id && <text x={x} y={y - r - 6} textAnchor="middle" className="node-value">${fmtCompact(out, lang)}</text>}
            </g>
          );
        })}
      </svg>
      <p className="note">{t('net.help')}</p>
    </div>
  );
}
