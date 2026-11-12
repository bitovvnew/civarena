// Share & export: animated GIF (rendered in the browser), WebM video of the live atlas,
// share card PNG, a link to this exact day, and the replay file itself.

import { useState } from 'react';
import type { Frame, ReplayFile } from '../../../src/engine/types';
import { replayToGif } from '../../../src/render/raster';
import type { Meta, World } from '../data';
import { frontPage } from '../gazette';
import { downloadBlob } from '../hooks';
import type { Lang, T } from '../i18n';
import { shareCard } from './Gazette';

export function toReplay(meta: Meta, frames: Frame[]): ReplayFile {
  return {
    format: 'civarena-replay', version: 1, createdWith: `civarena ${meta.version}`, scenario: meta.scenario.id, scenarioName: meta.scenario.name, seed: meta.seed,
    config: { agents: meta.agents, ticks: frames[frames.length - 1]?.tick ?? 0, teams: meta.teams },
    map: meta.map, names: meta.names, frames,
  };
}

export function ExportPanel({ world, meta, index, t, lang, canvas }: { world: World; meta: Meta; index: number; t: T; lang: Lang; canvas: HTMLCanvasElement | null }) {
  const frames = world.frames;
  const last = frames[frames.length - 1]?.tick ?? 1;
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(last);
  const [gifPct, setGifPct] = useState<number | null>(null);
  const [rec, setRec] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const day = frames[index]?.tick ?? 1;

  const renderGif = async () => {
    setGifPct(0);
    // yield so the progress label paints, then render in one go (fast: ~0.2s per 100 days)
    await new Promise((r) => setTimeout(r, 30));
    const replay = toReplay(meta, frames);
    const bytes = replayToGif(replay, { from, to: Math.max(from + 5, to), step: 5, scale: 6, title: 'CivArena' });
    setGifPct(100);
    downloadBlob(new Blob([bytes as BlobPart], { type: 'image/gif' }), `civarena-${meta.scenario.id}-day${from}-${to}.gif`);
    setTimeout(() => setGifPct(null), 800);
  };

  const record = () => {
    if (!canvas || !('MediaRecorder' in window)) return;
    const stream = canvas.captureStream(60);
    const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) ?? 'video/webm';
    const mr = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6_000_000 });
    const chunks: Blob[] = [];
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.onstop = () => {
      downloadBlob(new Blob(chunks, { type: 'video/webm' }), `civarena-${meta.scenario.id}-day${day}.webm`);
      setRec(null);
    };
    mr.start();
    let s = 10;
    setRec(s);
    const id = setInterval(() => {
      s--;
      setRec(s);
      if (s <= 0) { clearInterval(id); mr.stop(); }
    }, 1000);
  };

  const link = (() => {
    const u = new URL(location.href);
    u.search = '';
    const remote = new URLSearchParams(location.search).get('replay');
    if (remote) u.searchParams.set('replay', remote);
    u.searchParams.set('at', String(day));
    u.searchParams.set('lang', lang);
    return u.toString();
  })();

  const downloadReplay = async () => {
    if (world.status !== 'replay' && !world.isStatic) {
      location.href = '/api/replay';
      return;
    }
    const json = JSON.stringify(toReplay(meta, frames));
    const gz = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
    downloadBlob(await new Response(gz).blob(), `civarena-${meta.scenario.id}-${meta.seed}.civ.json.gz`);
  };

  return (
    <div className="export">
      <section className="ex-item">
        <h3>{t('export.gif')}</h3>
        <p className="note">{t('export.gifHint', { from, to })}</p>
        <div className="row">
          <label>{t('export.from')} <input type="number" min={1} max={last} value={from} onChange={(e) => setFrom(Math.max(1, Math.min(last, +e.target.value)))} /></label>
          <label>{t('export.to')} <input type="number" min={1} max={last} value={to} onChange={(e) => setTo(Math.max(1, Math.min(last, +e.target.value)))} /></label>
          <button className="btn" disabled={gifPct !== null} onClick={renderGif}>{gifPct !== null ? t('export.rendering', { pct: gifPct }) : t('export.render')}</button>
        </div>
      </section>
      <section className="ex-item">
        <h3>{t('export.video')}</h3>
        <p className="note">{t('export.videoHint')}</p>
        <button className="btn" disabled={rec !== null || !canvas} onClick={record}>{rec !== null ? t('export.recording', { s: rec }) : t('export.record')}</button>
      </section>
      <section className="ex-item">
        <h3>{t('export.card')}</h3>
        <p className="note">{t('export.cardHint')}</p>
        <button className="btn" onClick={() => shareCard(meta, frames, index, frontPage(frames, index), t, lang)}>{t('export.makeCard')}</button>
      </section>
      <section className="ex-item">
        <h3>{t('export.link')}</h3>
        <p className="note">{t('export.linkHint', { day })}</p>
        <div className="row">
          <input className="link-field" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
          <button className="btn" onClick={() => navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>{copied ? t('export.copied') : t('export.copy')}</button>
        </div>
      </section>
      <section className="ex-item">
        <h3>{t('export.replay')}</h3>
        <p className="note">{t('export.replayHint')}</p>
        <button className="btn" onClick={downloadReplay}>{t('export.download')}</button>
      </section>
    </div>
  );
}
