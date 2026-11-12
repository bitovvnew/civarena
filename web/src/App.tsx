import { useEffect, useMemo, useRef, useState } from 'react';
import { GOODS, type Frame } from '../../src/engine/types';
import { LineChart, StackedShare } from './components/charts';
import { Controls, EventFeed, KpiTiles, Leaderboard, Timeline, TradeNetwork } from './components/panels';
import { WorldMap } from './components/WorldMap';
import { currentFrames, useWorld } from './data';
import { detectLang, fmtCompact, fmtNum, LANGS, makeT, type Lang } from './i18n';

function useTheme(): [boolean, () => void] {
  const [dark, setDark] = useState(() => {
    const q = new URLSearchParams(location.search).get('theme');
    if (q) return q !== 'light';
    try {
      const s = localStorage.getItem('civarena.theme');
      if (s) return s === 'dark';
    } catch { /* ignore */ }
    return true; // the arena is a night-time control room by default
  });
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try { localStorage.setItem('civarena.theme', dark ? 'dark' : 'light'); } catch { /* ignore */ }
  }, [dark]);
  return [dark, () => setDark((d) => !d)];
}

/** Downsample a window of frames for charts (keeps the last frame). */
function windowFrames(frames: Frame[], index: number, max = 360): Frame[] {
  const slice = frames.slice(0, index + 1);
  if (slice.length <= max) return slice;
  const step = slice.length / max;
  const out: Frame[] = [];
  for (let i = 0; i < max - 1; i++) out.push(slice[Math.floor(i * step)]);
  out.push(slice[slice.length - 1]);
  return out;
}

export function App() {
  const { world, command, seek, openFile } = useWorld();
  const [lang, setLang] = useState<Lang>(detectLang);
  const [dark, toggleTheme] = useTheme();
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const t = useMemo(() => makeT(lang), [lang]);
  useEffect(() => {
    try { localStorage.setItem('civarena.lang', lang); } catch { /* ignore */ }
    document.documentElement.lang = lang;
  }, [lang]);

  const { frame, agentsFrame, index } = currentFrames(world);
  const meta = world.meta;
  const win = useMemo(() => windowFrames(world.frames, index), [world.frames, index, world.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const xs = win.map((f) => f.tick);
  const accent = 'var(--accent)';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.code === 'Space') { e.preventDefault(); command({ type: world.paused ? 'resume' : 'pause' }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [command, world.paused]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) openFile(file).catch((err) => alert((err as Error).message));
  };

  if (!meta) {
    return <div className="boot"><div className="logo-mark" /><p>{world.status === 'offline' ? t('disconnected') : t('connecting')}</p></div>;
  }

  const mode = world.status === 'replay' ? t('mode.replay') : world.paused ? t('mode.paused') : t('mode.live');
  const tick = frame?.tick ?? 0;
  const teamSeries = meta.teams.map((tm) => ({ id: tm.id, label: tm.label, color: tm.color, values: win.map((f) => f.teams.find((x) => x.id === tm.id)?.wealth ?? 0) }));

  return (
    <div className={`app ${dragging ? 'dragging' : ''}`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
      <header className="top">
        <div className="brand">
          <svg className="logo" viewBox="0 0 32 32" aria-hidden="true"><use href="#civ-logo" /></svg>
          <div>
            <div className="name">CivArena</div>
            <div className="sub">{t('app.tagline')}</div>
          </div>
        </div>
        <div className="world-id">
          <span className={`mode-badge ${world.status === 'replay' ? 'replay' : world.paused ? 'paused' : 'live'}`}>{mode}</span>
          <span className="scenario" title={meta.scenario.description}>{meta.scenario.name}</span>
          <span className="tickno">{t('tick')} <b>{fmtNum(tick, lang, 0)}</b> · {t('year')} <b>{Math.floor(tick / 100) + 1}</b></span>
          <span className="seed">seed {meta.seed}</span>
        </div>
        <div className="top-actions">
          {world.status !== 'replay' && <a className="btn ghost" href="/api/replay" download>{t('ctl.download')}</a>}
          <button className="btn ghost" onClick={() => fileInput.current?.click()}>{t('ctl.open')}</button>
          <input ref={fileInput} type="file" accept=".json,.gz" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) openFile(f).catch((err) => alert((err as Error).message)); }} />
          <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label="Language">
            {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="btn ghost icon" onClick={toggleTheme} aria-label="Toggle theme">{dark ? '☀' : '☾'}</button>
        </div>
      </header>

      {world.status === 'offline' && <div className="banner">{t('disconnected')}</div>}

      <KpiTiles frames={world.frames} index={index} t={t} lang={lang} />

      <main className="grid">
        <section className="panel map-panel">
          <div className="panel-head">
            <h2>{t('panel.map')}</h2>
            <div className="status-chips">
              {frame?.shocks.map((s) => <span key={s.kind} className="chip-tag shock">{t(`shock.${s.kind}`)}</span>)}
              {frame?.cartels.map((c) => <span key={c.id} className="chip-tag cartel" title={`${t('floor')} $${c.floor}`}>{t(`good.${c.good}`)} · {c.members} {t('members')}</span>)}
            </div>
          </div>
          <WorldMap meta={meta} frame={agentsFrame} t={t} lang={lang} dark={dark} />
          <div className="foot">{t('map.legend')}</div>
        </section>

        <section className="panel lb-panel">
          <div className="panel-head"><h2>{t('panel.leaderboard')}</h2></div>
          {frame && <Leaderboard teams={frame.teams} t={t} lang={lang} />}
        </section>

        <section className="panel feed-panel">
          <div className="panel-head"><h2>{t('panel.feed')}</h2></div>
          <EventFeed frames={world.frames} index={index} meta={meta} t={t} />
        </section>

        <section className="panel econ-panel">
          <div className="panel-head"><h2>{t('panel.economy')}</h2></div>
          <div className="multiples four">
            <div><h3>{t('chart.gdp')}</h3><LineChart x={xs} series={[{ id: 'gdp', label: t('chart.gdp'), color: accent, values: win.map((f) => f.m.gdp) }]} format={(v) => '$' + fmtCompact(v, lang)} area label={t('chart.gdp')} /></div>
            <div><h3>{t('chart.cpi')}</h3><LineChart x={xs} series={[{ id: 'cpi', label: t('chart.cpi'), color: accent, values: win.map((f) => f.m.cpi) }]} format={(v) => fmtCompact(v, lang)} refLine={100} label={t('chart.cpi')} /></div>
            <div><h3>{t('chart.money')}</h3><LineChart x={xs} series={[{ id: 'money', label: t('chart.money'), color: accent, values: win.map((f) => f.m.money) }]} format={(v) => '$' + fmtCompact(v, lang)} area label={t('chart.money')} /></div>
            <div><h3>{t('chart.unemployment')}</h3><LineChart x={xs} series={[{ id: 'u', label: t('chart.unemployment'), color: accent, values: win.map((f) => f.m.unemployment * 100) }]} format={(v) => `${fmtNum(v, lang, 0)}%`} label={t('chart.unemployment')} /></div>
          </div>
        </section>

        <section className="panel share-panel">
          <div className="panel-head"><h2>{t('panel.share')}</h2></div>
          <div className="legend">
            {meta.teams.map((tm) => <span key={tm.id}><i style={{ background: tm.color }} />{tm.label}</span>)}
          </div>
          <StackedShare x={xs} series={teamSeries} format={(v) => `${Math.round(v * 100)}%`} />
        </section>

        <section className="panel net-panel">
          <div className="panel-head"><h2>{t('panel.network')}</h2></div>
          <TradeNetwork frames={world.frames} index={index} meta={meta} t={t} lang={lang} />
        </section>

        <section className="panel price-panel">
          <div className="panel-head"><h2>{t('panel.prices')}</h2></div>
          <div className="multiples five">
            {GOODS.map((g) => (
              <div key={g}>
                <h3><span className="good-name">{t(`good.${g}`)}</span> <span className="now">${fmtNum(frame?.prices[g] ?? 0, lang)}</span></h3>
                <LineChart x={xs} height={110} zeroBased series={[{ id: g, label: t(`good.${g}`), color: accent, values: win.map((f) => f.prices[g]) }]} format={(v) => '$' + fmtNum(v, lang)} label={t(`good.${g}`)} />
              </div>
            ))}
          </div>
        </section>

        <section className="panel ctl-panel">
          <div className="panel-head"><h2>{t('panel.controls')}</h2></div>
          <Controls world={world} frame={frame} command={command} t={t} />
        </section>
      </main>

      <footer className="dock">
        <Timeline world={world} index={index} seek={seek} command={command} t={t} />
      </footer>
      {dragging && <div className="dropzone">{t('ctl.drop')}</div>}

      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <symbol id="civ-logo" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="16" cy="9" r="3.2" fill="#3987e5" />
          <circle cx="9.5" cy="20" r="3.2" fill="#d95926" />
          <circle cx="22.5" cy="20" r="3.2" fill="#199e70" />
          <path d="M16 12.5 L11.2 17.6 M16 12.5 L20.8 17.6 M12.8 20 H19.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </symbol>
      </svg>
    </div>
  );
}
