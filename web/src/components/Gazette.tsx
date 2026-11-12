// The CivArena Daily: a printable front page for any day, and the 1200x630 share card drawn from it.

import { useEffect, useMemo } from 'react';
import { GOODS, type Frame } from '../../../src/engine/types';
import type { Meta } from '../data';
import { frontPage, type FrontPage } from '../gazette';
import { downloadBlob } from '../hooks';
import { fmtCompact, fmtNum, fmtPct, type Lang, type T } from '../i18n';
import { teamColor } from '../theme';

export function GazetteModal({ meta, frames, index, t, lang, dark, onClose }: { meta: Meta; frames: Frame[]; index: number; t: T; lang: Lang; dark: boolean; onClose: () => void }) {
  const page = useMemo(() => frontPage(frames, index), [frames, index]);
  const f = frames[index];
  const prev = frames[Math.max(0, index - 7)] ?? f;
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  if (!f) return null;
  const standings = [...f.teams].sort((a, b) => b.score - a.score);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <article className="paper" onClick={(e) => e.stopPropagation()} aria-label={t('app.daily')}>
        <header className="paper-mast">
          <div className="paper-rule" />
          <h1>{t('app.daily')}</h1>
          <div className="paper-line"><span>{meta.scenario.name}</span><span>{t('day')} {f.tick} · {t('year')} {Math.floor(f.tick / 100) + 1}</span><span>{t('seed')} {meta.seed}</span></div>
        </header>
        <section className="paper-lead">
          <h2>{page.lead ? t(page.lead.key, page.lead.params) : t('lead.quiet')}</h2>
          <p className="dek">{t('lead.dek', { gdp: '$' + fmtCompact(f.m.gdp, lang), gdpChange: fmtPct(page.change.gdp, lang), cpiChange: fmtPct(page.change.cpi, lang), pop: f.m.population })}</p>
        </section>
        <div className="paper-cols">
          <section>
            <h3 className="small-caps">{t('gazette.briefs')}</h3>
            <ul className="briefs">{[...page.secondary, ...page.briefs].map((s, i) => <li key={i}><b>{s.tick}.</b> {t(s.key, s.params)}</li>)}</ul>
          </section>
          <section>
            <h3 className="small-caps">{t('gazette.markets')}</h3>
            <table className="mini">
              <thead><tr><th></th><th className="num">{t('gazette.price')}</th><th className="num">{t('gazette.change')}</th></tr></thead>
              <tbody>{GOODS.map((g) => {
                const ch = ((f.prices[g] - prev.prices[g]) / (prev.prices[g] || 1)) * 100;
                return <tr key={g}><td>{t(`good.${g}`)}</td><td className="num">${fmtNum(f.prices[g], lang)}</td><td className={`num ${ch > 0.05 ? 'up' : ch < -0.05 ? 'down' : ''}`}>{fmtPct(ch, lang)}</td></tr>;
              })}</tbody>
            </table>
            <h3 className="small-caps">{t('gazette.conditions')}</h3>
            <p>{f.shocks.length ? f.shocks.map((s) => t(`shock.${s.kind}`)).join(', ') : t('none')} · {t('cartels')}: {f.cartels.length ? f.cartels.map((c) => t(`good.${c.good}`)).join(', ') : t('none')}</p>
          </section>
          <section>
            <h3 className="small-caps">{t('gazette.standings')}</h3>
            <ol className="paper-standings">{standings.map((s) => (
              <li key={s.id}><i style={{ background: teamColor(s.color, dark) }} /><span>{s.label}</span><b className="num">{fmtNum(s.score, lang, 1)}</b></li>
            ))}</ol>
            {page.oped && (<><h3 className="small-caps">{t('lead.oped', { team: page.oped.team })}</h3><blockquote>“{page.oped.text}”</blockquote></>)}
          </section>
        </div>
        <footer className="paper-foot">
          <button className="btn" onClick={() => shareCard(meta, frames, index, page, t, lang)}>{t('gazette.download')}</button>
          <button className="btn ghost" onClick={onClose}>{t('gazette.close')}</button>
        </footer>
      </article>
    </div>
  );
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  // CJK text has no spaces: fall back to character wrapping
  if (lines.length === 1 && ctx.measureText(lines[0]).width > maxW) {
    const out: string[] = [];
    let cur = '';
    for (const ch of text) {
      if (ctx.measureText(cur + ch).width > maxW) { out.push(cur); cur = ch; } else cur += ch;
    }
    if (cur) out.push(cur);
    return out;
  }
  return lines;
}

const SERIF = "'Iowan Old Style', 'Charter', 'Source Serif Pro', Georgia, 'Noto Serif', 'Songti SC', 'Noto Serif CJK SC', serif";
const SANS = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', sans-serif";

/** Draw a 1200x630 share card (paper edition) and download it. */
export function renderShareCard(meta: Meta, frames: Frame[], index: number, page: FrontPage, t: T, lang: Lang): HTMLCanvasElement {
  const W = 1200, H = 630;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const f = frames[index];
  const ink = '#1b1a17', paper = '#f2ede3', muted = '#6f685c', rule = '#1b1a17', red = '#b8321f';
  g.fillStyle = paper;
  g.fillRect(0, 0, W, H);
  // masthead
  g.fillStyle = ink;
  g.font = `700 64px ${SERIF}`;
  g.textBaseline = 'alphabetic';
  g.fillText(t('app.daily'), 56, 98);
  g.font = `500 20px ${SANS}`;
  g.fillStyle = muted;
  const line = `${meta.scenario.name}  ·  ${t('day')} ${f.tick}  ·  ${t('year')} ${Math.floor(f.tick / 100) + 1}`;
  g.fillText(line, 58, 132);
  g.fillStyle = rule;
  g.fillRect(56, 148, W - 112, 3);
  g.fillRect(56, 155, W - 112, 1);
  if (page.lead && page.lead.level === 2) {
    g.fillStyle = red;
    g.font = `700 18px ${SANS}`;
    g.fillText(t('toast.breaking').toUpperCase(), 56, 190);
  }
  // lead
  g.fillStyle = ink;
  g.font = `700 46px ${SERIF}`;
  const headline = page.lead ? t(page.lead.key, page.lead.params) : t('lead.quiet');
  const lines = wrap(g, headline, 700).slice(0, 4);
  lines.forEach((l, i) => g.fillText(l, 56, 240 + i * 54));
  g.font = `400 20px ${SANS}`;
  g.fillStyle = muted;
  const dek = t('lead.dek', { gdp: '$' + fmtCompact(f.m.gdp, lang), gdpChange: fmtPct(page.change.gdp, lang), cpiChange: fmtPct(page.change.cpi, lang), pop: f.m.population });
  wrap(g, dek, 700).slice(0, 2).forEach((l, i) => g.fillText(l, 56, 240 + lines.length * 54 + 16 + i * 26));
  // standings column
  const x0 = 820;
  g.fillStyle = rule;
  g.fillRect(x0 - 28, 176, 1, 380);
  g.fillStyle = ink;
  g.font = `700 16px ${SANS}`;
  g.fillText(t('gazette.standings').toUpperCase(), x0, 196);
  const st = [...f.teams].sort((a, b) => b.score - a.score).slice(0, 6);
  const maxS = Math.max(1, ...st.map((s) => s.score));
  st.forEach((s, i) => {
    const y = 236 + i * 52;
    g.fillStyle = ink;
    g.font = `600 22px ${SERIF}`;
    g.fillText(`${i + 1}. ${s.label}`.slice(0, 22), x0, y);
    g.font = `500 18px ui-monospace, Menlo, Consolas, monospace`;
    g.textAlign = 'right';
    g.fillText(fmtNum(s.score, lang, 1), W - 56, y);
    g.textAlign = 'left';
    g.fillStyle = teamColor(s.color, false);
    g.fillRect(x0, y + 10, ((W - 56 - x0) * s.score) / maxS, 6);
  });
  // GDP sparkline along the bottom
  const xs = frames.slice(0, index + 1);
  const vals = xs.map((x) => x.m.gdp);
  const max = Math.max(1, ...vals), n = vals.length;
  g.strokeStyle = ink;
  g.lineWidth = 2;
  g.beginPath();
  vals.forEach((v, i) => {
    const px = 56 + (i / Math.max(1, n - 1)) * 700, py = 590 - (v / max) * 60;
    if (i) g.lineTo(px, py); else g.moveTo(px, py);
  });
  g.stroke();
  g.fillStyle = muted;
  g.font = `500 16px ${SANS}`;
  g.fillText(t('chart.gdp'), 56, 520);
  g.textAlign = 'right';
  g.fillText('github.com/bitovvnew/civarena', W - 56, 600);
  g.textAlign = 'left';
  return c;
}

export function shareCard(meta: Meta, frames: Frame[], index: number, page: FrontPage, t: T, lang: Lang) {
  const c = renderShareCard(meta, frames, index, page, t, lang);
  c.toBlob((b) => b && downloadBlob(b, `civarena-day${frames[index].tick}.png`), 'image/png');
}
