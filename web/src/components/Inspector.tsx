// Citizen file: follow one life through the whole world, reconstructed from the frames.

import { useMemo } from 'react';
import { JOBS, type Frame } from '../../../src/engine/types';
import type { Meta } from '../data';
import { fmtNum, type Lang, type T } from '../i18n';
import { teamColor } from '../theme';
import { LineChart } from './charts';

interface LifeEvent { day: number; text: string }

export function Inspector({ id, meta, frames, index, t, lang, dark, onClose }: {
  id: number; meta: Meta; frames: Frame[]; index: number; t: T; lang: Lang; dark: boolean; onClose: () => void;
}) {
  const name = meta.names[id] ?? `#${id}`;
  const life = useMemo(() => {
    const xs: number[] = [], wealth: number[] = [], health: number[] = [];
    const events: LifeEvent[] = [];
    let prev: number[] | undefined;
    let born: number | undefined, died: number | undefined, peak = { w: -Infinity, day: 0 };
    let last: number[] | undefined;
    for (let i = 0; i <= index; i++) {
      const f = frames[i];
      if (!f.agents) continue;
      const row = f.agents.find((r) => r[0] === id);
      if (!row) {
        if (prev && died === undefined) died = f.tick;
        continue;
      }
      if (born === undefined) born = f.tick;
      xs.push(f.tick);
      wealth.push(row[3]);
      health.push(row[4]);
      if (row[3] > peak.w) peak = { w: row[3], day: f.tick };
      if (prev) {
        if (prev[2] !== row[2]) events.push({ day: f.tick, text: t('inspect.became', { job: JOBS[row[2]] }) });
        if (!(prev[5] & 1) && row[5] & 1) events.push({ day: f.tick, text: t('inspect.joined') });
        if (prev[5] & 1 && !(row[5] & 1)) events.push({ day: f.tick, text: t('inspect.left') });
        if (!(prev[5] & 8) && row[5] & 8) events.push({ day: f.tick, text: t('inspect.loan') });
        if (!(prev[5] & 2) && row[5] & 2) events.push({ day: f.tick, text: t('inspect.hungry') });
      }
      if (row[5] & 16) events.push({ day: f.tick, text: t('inspect.bankrupt') });
      prev = row;
      last = row;
    }
    // headlines that name this citizen
    for (let i = 0; i <= index; i++) for (const h of frames[i].headlines) if (h.params.name === name) events.push({ day: h.tick, text: t(h.key, h.params) });
    const dedup = new Map(events.map((e) => [`${e.day}${e.text}`, e]));
    return { xs, wealth, health, events: [...dedup.values()].sort((a, b) => b.day - a.day).slice(0, 40), born, died, peak, last };
  }, [id, frames, index, t, name]);
  const row = life.last;
  const team = row ? meta.teams[row[1]] : undefined;
  const color = team ? teamColor(team.color, dark) : 'var(--ink)';
  return (
    <aside className="dossier" aria-label={t('inspect.title')}>
      <div className="dossier-head">
        <span className="small-caps">{t('inspect.title')} · #{id}</span>
        <button className="close" onClick={onClose} aria-label={t('inspect.close')}>×</button>
      </div>
      <h3 className="dossier-name">{name}</h3>
      {row ? (
        <>
          <dl className="facts">
            <div><dt>{t('inspect.team')}</dt><dd><i style={{ background: color }} />{team?.label}</dd></div>
            <div><dt>{t('inspect.job')}</dt><dd>{t(`job.${JOBS[row[2]]}`)}</dd></div>
            <div><dt>{t('inspect.wealth')}</dt><dd className="num">${fmtNum(row[3], lang)}</dd></div>
            <div><dt>{t('inspect.health')}</dt><dd className="num">{row[4]}%</dd></div>
          </dl>
          <p className="life-line">
            {life.born !== undefined && life.born > 1 ? t('inspect.born', { day: life.born }) : ''}
            {life.died !== undefined ? ` ${t('inspect.died', { day: life.died })}` : ''}
            {life.peak.w > -Infinity ? ` ${t('inspect.peak', { wealth: Math.round(life.peak.w), day: life.peak.day })}` : ''}
          </p>
          {life.xs.length > 2 && <LineChart x={life.xs} height={110} series={[{ id: 'w', label: t('inspect.wealth'), color, values: life.wealth }]} format={(v) => '$' + fmtNum(v, lang, 0)} />}
          <h4 className="small-caps">{t('inspect.story')}</h4>
          <ol className="story">
            {life.events.map((e, i) => <li key={i}><span className="day">{e.day}</span>{e.text}</li>)}
          </ol>
        </>
      ) : <p className="note">{t('inspect.none')}</p>}
    </aside>
  );
}
