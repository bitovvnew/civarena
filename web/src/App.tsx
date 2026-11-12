import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GOODS, type Frame, type ReplayFile } from '../../src/engine/types';
import type { TournamentReport } from '../../src/tournament-types';
import { LineChart, StackedShare } from './components/charts';
import { PolicyDesk, Timeline } from './components/Controls';
import { ExportPanel } from './components/Export';
import { Lead, Masthead, Numbers, Standings, TradeNetwork, Wire, type UsageRow, type View } from './components/Front';
import { GazetteModal } from './components/Gazette';
import { Inspector } from './components/Inspector';
import { Scenarios } from './components/Scenarios';
import { Setup } from './components/Setup';
import { Toasts } from './components/Toasts';
import { Tournament } from './components/Tournament';
import { WorldMap } from './components/WorldMap';
import { currentFrames, postJson, readJsonBlob, useWorld } from './data';
import { useInterval } from './hooks';
import { detectLang, fmtCompact, fmtNum, makeT, type Lang } from './i18n';
import { teamColor } from './theme';

function useTheme(): [boolean, () => void] {
  const [dark, setDark] = useState(() => {
    const q = new URLSearchParams(location.search).get('theme');
    if (q) return q === 'dark';
    try {
      const s = localStorage.getItem('civarena.theme');
      if (s) return s === 'dark';
    } catch { /* ignore */ }
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
  });
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try { localStorage.setItem('civarena.theme', dark ? 'dark' : 'light'); } catch { /* ignore */ }
  }, [dark]);
  return [dark, () => setDark((d) => !d)];
}

/** Downsample frames for charts (always keeps the frame on screen). */
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
  const { world, command, seek, loadReplay, reconnect } = useWorld();
  const [lang, setLang] = useState<Lang>(detectLang);
  const [dark, toggleTheme] = useTheme();
  const [view, setView] = useState<View>('front');
  const [paper, setPaper] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [tournament, setTournament] = useState<TournamentReport | null>(null);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [forceSetup, setForceSetup] = useState(() => new URLSearchParams(location.search).has('setup'));
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const t = useMemo(() => makeT(lang), [lang]);

  useEffect(() => {
    try { localStorage.setItem('civarena.lang', lang); } catch { /* ignore */ }
    document.documentElement.lang = lang;
  }, [lang]);

  const { frame, agentsFrame, index } = currentFrames(world);
  const meta = world.meta;
  const win = useMemo(() => windowFrames(world.frames, index), [world.frames, index, world.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const xs = win.map((f) => f.tick);

  useInterval(() => {
    fetch('/api/usage').then((r) => r.json()).then((u) => setUsage(u.teams ?? [])).catch(() => {});
  }, world.status === 'live' ? 5000 : null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key !== 'Escape' && e.target instanceof Element && e.target.closest('input, select, textarea, button, a, [contenteditable]')) return;
      if (e.code === 'Space') { e.preventDefault(); command({ type: world.paused ? 'resume' : 'pause' }); }
      if (e.key === 'Escape') { setSelected(null); setPaper(false); }
      if (e.key === 'ArrowLeft') seek(Math.max(0, index - (e.shiftKey ? 25 : 1)));
      if (e.key === 'ArrowRight') seek(index + (e.shiftKey ? 25 : 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [command, world.paused, seek, index]);

  const openFile = useCallback(async (file: Blob) => {
    try {
      const data = await readJsonBlob<{ format?: string }>(file);
      if (data.format === 'civarena-replay') { loadReplay(data as ReplayFile); setView('front'); return; }
      if (data.format === 'civarena-tournament') { setTournament(data as TournamentReport); setView('tournament'); return; }
      if (data.format === 'civarena-scenario') {
        if (world.status === 'live') { await postJson('/api/scenarios', data); setNotice(t('scen.saved')); }
        setView('scenarios');
        return;
      }
      throw new Error('Unknown file');
    } catch (err) {
      setNotice(`${t('misc.error')}: ${(err as Error).message}`);
    }
  }, [loadReplay, world.status, t]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) openFile(f);
  };

  const onName = (name: string) => {
    const id = meta?.names.indexOf(name) ?? -1;
    if (id >= 0) setSelected(id);
  };

  // ---------- setup (first run, or ?setup=1)
  if (world.status === 'setup' || (forceSetup && world.status !== 'replay' && !world.isStatic && world.status !== 'connecting' && world.status !== 'offline')) {
    return (
      <Setup t={t} lang={lang} setLang={setLang} scenarios={meta?.scenarios ?? []}
        onDone={() => { setForceSetup(false); history.replaceState(null, '', location.pathname); reconnect(); }}
        onCancel={world.status === 'live' ? () => { setForceSetup(false); history.replaceState(null, '', location.pathname); } : undefined} />
    );
  }

  if (!meta || !frame) {
    return (
      <div className="boot">
        <div className="boot-mark" />
        <p>{world.status === 'offline' ? t('disconnected') : t('connecting')}</p>
      </div>
    );
  }

  const teamSeries = meta.teams.map((tm) => ({ id: tm.id, label: tm.label, color: teamColor(tm.color, dark), values: win.map((f) => f.teams.find((x) => x.id === tm.id)?.wealth ?? 0) }));
  const ink = 'var(--ink)';

  return (
    <div className={`app ${dragging ? 'dragging' : ''}`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }} onDrop={onDrop}>
      <a className="skip" href="#main">Skip to content</a>
      <Masthead meta={meta} world={world} frame={frame} t={t} lang={lang} setLang={setLang} dark={dark} toggleTheme={toggleTheme}
        view={view} setView={setView} onOpen={() => fileInput.current?.click()} onPaper={() => setPaper(true)} />
      <input ref={fileInput} type="file" accept=".json,.gz" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) openFile(f); e.target.value = ''; }} />
      {world.status === 'offline' && <div className="banner">{t('disconnected')}</div>}
      {notice && <div className="banner" role="status" onClick={() => setNotice('')}>{notice}</div>}

      <main id="main">
        {view === 'front' && (
          <>
            <Numbers frames={world.frames} index={index} t={t} lang={lang} />
            <div className="front">
              <div className="col-main">
                <Lead frames={world.frames} index={index} t={t} lang={lang} />
                <section className="block atlas-block">
                  <div className="block-head">
                    <h2>{t('sec.map')}</h2>
                    <div className="chips">
                      {frame.shocks.map((s) => <span key={s.kind} className="chip shock">{t(`shock.${s.kind}`)}</span>)}
                      {frame.cartels.map((c) => <span key={c.id} className="chip cartel" title={`${t('floor')} $${c.floor}`}>{t('cartels')}: {t(`good.${c.good}`)} · {c.members}</span>)}
                    </div>
                  </div>
                  <WorldMap meta={meta} frame={agentsFrame} t={t} lang={lang} dark={dark} selected={selected} onSelect={setSelected} canvasRef={canvasRef} />
                  <p className="note">{t('map.legend')}</p>
                </section>
                <section className="block">
                  <div className="block-head"><h2>{t('sec.economy')}</h2></div>
                  <div className="multiples four">
                    <figure><figcaption>{t('chart.gdp')}</figcaption><LineChart x={xs} series={[{ id: 'gdp', label: t('chart.gdp'), color: ink, values: win.map((f) => f.m.gdp) }]} format={(v) => '$' + fmtCompact(v, lang)} area /></figure>
                    <figure><figcaption>{t('chart.cpi')}</figcaption><LineChart x={xs} series={[{ id: 'cpi', label: t('chart.cpi'), color: ink, values: win.map((f) => f.m.cpi) }]} format={(v) => fmtCompact(v, lang)} refLine={100} /></figure>
                    <figure><figcaption>{t('chart.money')}</figcaption><LineChart x={xs} series={[{ id: 'money', label: t('chart.money'), color: ink, values: win.map((f) => f.m.money) }]} format={(v) => '$' + fmtCompact(v, lang)} area /></figure>
                    <figure><figcaption>{t('chart.unemployment')}</figcaption><LineChart x={xs} series={[{ id: 'u', label: t('chart.unemployment'), color: ink, values: win.map((f) => f.m.unemployment * 100) }]} format={(v) => `${fmtNum(v, lang, 0)}%`} /></figure>
                  </div>
                </section>
                <section className="block">
                  <div className="block-head"><h2>{t('sec.prices')}</h2></div>
                  <div className="multiples five">
                    {GOODS.map((g) => (
                      <figure key={g}>
                        <figcaption><span className="cap">{t(`good.${g}`)}</span> <span className="now">${fmtNum(frame.prices[g], lang)}</span></figcaption>
                        <LineChart x={xs} height={104} series={[{ id: g, label: t(`good.${g}`), color: ink, values: win.map((f) => f.prices[g]) }]} format={(v) => '$' + fmtNum(v, lang)} />
                      </figure>
                    ))}
                  </div>
                </section>
              </div>
              <aside className="col-side">
                <section className="block">
                  <div className="block-head"><h2>{t('sec.standings')}</h2></div>
                  <Standings teams={frame.teams} t={t} lang={lang} dark={dark} usage={usage} />
                </section>
                <section className="block wire-block">
                  <div className="block-head"><h2>{t('sec.wire')}</h2></div>
                  <Wire frames={world.frames} index={index} meta={meta} t={t} dark={dark} onName={onName} />
                </section>
                <section className="block">
                  <div className="block-head"><h2>{t('sec.share')}</h2></div>
                  <div className="legend">{teamSeries.map((s) => <span key={s.id}><i style={{ background: s.color }} />{s.label}</span>)}</div>
                  <StackedShare x={xs} series={teamSeries} format={(v) => `${Math.round(v * 100)}%`} />
                </section>
                <section className="block">
                  <div className="block-head"><h2>{t('sec.trade')}</h2></div>
                  <TradeNetwork frames={world.frames} index={index} meta={meta} t={t} lang={lang} dark={dark} />
                </section>
              </aside>
            </div>
            <section className="block desk-block">
              <div className="block-head"><h2>{t('sec.policy')}</h2></div>
              <PolicyDesk world={world} frame={frame} command={command} t={t} />
            </section>
          </>
        )}
        {view === 'scenarios' && (
          <section className="page">
            <h2 className="page-title">{t('scen.title')}</h2>
            <Scenarios world={world} scenarios={meta.scenarios} current={meta.scenario.id} t={t} canRun={world.status === 'live'}
              onRun={(id) => postJson('/api/world', { scenario: id }).then(() => setView('front')).catch((e) => setNotice((e as Error).message))} />
          </section>
        )}
        {view === 'tournament' && (
          <section className="page">
            <h2 className="page-title">{t('tour.title')}</h2>
            <Tournament report={tournament} t={t} lang={lang} dark={dark} />
          </section>
        )}
        {view === 'export' && (
          <section className="page">
            <h2 className="page-title">{t('export.title')}</h2>
            <ExportPanel world={world} meta={meta} index={index} t={t} lang={lang} canvas={canvasRef.current} />
          </section>
        )}
      </main>

      {selected !== null && view === 'front' && (
        <Inspector id={selected} meta={meta} frames={world.frames} index={index} t={t} lang={lang} dark={dark} onClose={() => setSelected(null)} />
      )}
      <Toasts frame={frame} live={world.cursor === null && world.status === 'live'} t={t} />
      {paper && <GazetteModal meta={meta} frames={world.frames} index={index} t={t} lang={lang} dark={dark} onClose={() => setPaper(false)} />}
      <footer className="dock"><Timeline world={world} index={index} seek={seek} command={command} t={t} /></footer>
      {dragging && <div className="dropzone">{t('misc.drop')}</div>}

      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <symbol id="civ-mark" viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" strokeWidth="2.2" />
          <circle cx="20" cy="20" r="12.5" fill="none" stroke="currentColor" strokeWidth="1" />
          <path d="M20 7.5v25M7.5 20h25" stroke="currentColor" strokeWidth="1" />
          <circle cx="20" cy="20" r="3.2" fill="var(--red)" />
        </symbol>
      </svg>
    </div>
  );
}
