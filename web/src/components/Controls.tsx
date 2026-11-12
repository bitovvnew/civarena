import { useMemo, useState } from 'react';
import type { Command, Frame, ShockKind } from '../../../src/engine/types';
import type { World } from '../data';
import type { T } from '../i18n';

const SHOCKS: ShockKind[] = ['drought', 'mine_collapse', 'tech_boom', 'plague', 'gold_rush', 'trade_embargo'];

export function PolicyDesk({ world, frame, command, t }: { world: World; frame: Frame | undefined; command: (c: Command) => void; t: T }) {
  const gov = frame?.gov;
  const [tax, setTax] = useState<number | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [ubi, setUbi] = useState<number | null>(null);
  if (world.status === 'replay') return <p className="readonly">{t('ctl.readonly')}</p>;
  const taxV = tax ?? Math.round((gov?.taxRate ?? 0.1) * 100);
  const rateV = rate ?? frame?.m.policyRate ?? 4;
  const ubiV = ubi ?? gov?.ubi ?? 0;
  const money = frame?.m.money ?? 20000;
  const commit = (fn: () => void) => ({ onPointerUp: fn, onKeyUp: fn });
  return (
    <div className="desk">
      <label className="slider">
        <span>{t('ctl.tax')} <b>{taxV}%</b></span>
        <input type="range" min={0} max={60} step={1} value={taxV} onChange={(e) => setTax(+e.target.value)} {...commit(() => { command({ type: 'tax', rate: taxV / 100 }); setTax(null); })} />
      </label>
      <label className="slider">
        <span>{t('ctl.rate')} <b>{rateV}%</b></span>
        <input type="range" min={0} max={25} step={0.5} value={rateV} onChange={(e) => setRate(+e.target.value)} {...commit(() => { command({ type: 'rate', rate: rateV }); setRate(null); })} />
      </label>
      <label className="slider">
        <span>{t('ctl.ubi')} <b>${ubiV}</b></span>
        <input type="range" min={0} max={5} step={0.25} value={ubiV} onChange={(e) => setUbi(+e.target.value)} {...commit(() => { command({ type: 'ubi', amount: ubiV }); setUbi(null); })} />
      </label>
      <div className="switches">
        <button className={`switch ${gov?.welfare ? 'on' : ''}`} role="switch" aria-checked={!!gov?.welfare} onClick={() => command({ type: 'welfare', on: !gov?.welfare })}>
          {t('ctl.welfare')} <span className="state">{gov?.welfare ? t('ctl.on') : t('ctl.off')}</span>
        </button>
        <button className={`switch ${gov?.antitrust ? 'on' : ''}`} role="switch" aria-checked={!!gov?.antitrust} onClick={() => command({ type: 'antitrust', on: !gov?.antitrust })}>
          {t('ctl.antitrust')} <span className="state">{gov?.antitrust ? t('ctl.on') : t('ctl.off')}</span>
        </button>
        <button className="stamp" onClick={() => command({ type: 'print', amount: Math.round(money * 0.25) })}>{t('ctl.print')} +25%</button>
      </div>
      <div className="shocks-row">
        <span className="small-caps">{t('ctl.shocks')}</span>
        {SHOCKS.map((k) => {
          const active = frame?.shocks.some((s) => s.kind === k);
          return <button key={k} className={`shock ${active ? 'active' : ''}`} aria-pressed={!!active} onClick={() => command({ type: 'shock', kind: k })}>{t(`shock.${k}`)}</button>;
        })}
        <button className="shock reset" onClick={() => command({ type: 'reset' })}>{t('ctl.reset')}</button>
      </div>
    </div>
  );
}

export function Timeline({ world, index, seek, command, t }: { world: World; index: number; seek: (i: number | null) => void; command: (c: Command) => void; t: T }) {
  const n = world.frames.length;
  const marks = useMemo(() => {
    const out: { i: number; kind: string }[] = [];
    world.frames.forEach((f, i) => {
      const h = f.headlines.find((x) => x.level === 2);
      if (h) out.push({ i, kind: h.kind });
    });
    return out.slice(-240);
  }, [world.frames.length, world.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const following = world.cursor === null && world.status !== 'replay';
  const speeds = [2, 4, 8, 16, 32];
  const progress = n > 1 ? (Math.max(0, index) / (n - 1)) * 100 : 0;
  return (
    <div className="timeline">
      <button className="play" aria-label={world.paused ? t('ctl.play') : t('ctl.pause')} onClick={() => command({ type: world.paused ? 'resume' : 'pause' })}>
        {world.paused
          ? <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor" /></svg>
          : <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 3h3v10H4zM9 3h3v10H9z" fill="currentColor" /></svg>}
      </button>
      <div className="speed" role="group" aria-label={t('ctl.speed')}>
        {speeds.map((s) => <button key={s} className={Math.round(world.tps) === s ? 'on' : ''} onClick={() => command({ type: 'speed', tps: s })}>{s}×</button>)}
      </div>
      <div className="scrub" style={{ ['--p' as string]: `${progress}%` }}>
        <div className="marks" aria-hidden="true">
          {n > 1 && marks.map((m) => <span key={m.i} className={`mark k-${m.kind}`} style={{ left: `${(m.i / (n - 1)) * 100}%` }} />)}
        </div>
        <input type="range" min={0} max={Math.max(0, n - 1)} value={Math.max(0, index)} onChange={(e) => seek(+e.target.value)} aria-label="Timeline" />
      </div>
      <span className="day-read">{world.frames[index]?.tick ?? 0}</span>
      {world.status !== 'replay' && (
        <button className={`live-btn ${following ? 'on' : ''}`} onClick={() => seek(null)}>{following ? t('mode.live') : t('ctl.live')}</button>
      )}
    </div>
  );
}
