// Scenario gallery + builder. Builder output is a declarative JSON file: safe to share, no code inside.

import { useState } from 'react';
import type { ShockKind } from '../../../src/engine/types';
import type { ScenarioMeta, World } from '../data';
import { postJson } from '../data';
import { downloadBlob } from '../hooks';
import type { T } from '../i18n';

type EventType = 'tax' | 'rate' | 'ubi' | 'welfare' | 'antitrust' | 'print' | 'shock' | 'headline';
interface Row { day: number; type: EventType; value: string; headline: string }

const SHOCKS: ShockKind[] = ['drought', 'mine_collapse', 'tech_boom', 'plague', 'gold_rush', 'trade_embargo'];

function rowToEvent(r: Row) {
  const v = Number(r.value);
  let command: Record<string, unknown> | undefined;
  switch (r.type) {
    case 'tax': command = { type: 'tax', rate: Math.min(0.9, Math.max(0, v / 100)) }; break;
    case 'rate': command = { type: 'rate', rate: Math.min(50, Math.max(0, v)) }; break;
    case 'ubi': command = { type: 'ubi', amount: Math.min(50, Math.max(0, v)) }; break;
    case 'welfare': command = { type: 'welfare', on: r.value !== 'off' }; break;
    case 'antitrust': command = { type: 'antitrust', on: r.value !== 'off' }; break;
    case 'print': command = { type: 'print', amount: Math.max(0, v) }; break;
    case 'shock': command = { type: 'shock', kind: SHOCKS.includes(r.value as ShockKind) ? r.value : 'drought' }; break;
    default: command = undefined;
  }
  return { day: Math.max(1, Math.round(r.day)), ...(command ? { command } : {}), ...(r.headline.trim() ? { headline: r.headline.trim() } : {}) };
}

export function Scenarios({ world, scenarios, current, t, canRun, onRun }: {
  world: World; scenarios: ScenarioMeta[]; current?: string; t: T; canRun: boolean; onRun: (id: string) => void;
}) {
  const [building, setBuilding] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [tax, setTax] = useState(10);
  const [rate, setRate] = useState(4);
  const [welfare, setWelfare] = useState(true);
  const [antitrust, setAntitrust] = useState(false);
  const [rows, setRows] = useState<Row[]>([{ day: 100, type: 'shock', value: 'drought', headline: '' }]);
  const [status, setStatus] = useState('');

  const spec = () => ({
    format: 'civarena-scenario', version: 1,
    id: (name || 'my-scenario').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my-scenario',
    name: name || 'My scenario', description: desc,
    setup: { gov: { taxRate: tax / 100, welfare, antitrust }, policyRate: rate },
    timeline: rows.map(rowToEvent).filter((e) => 'command' in e || 'headline' in e),
  });

  const save = async () => {
    try {
      await postJson('/api/scenarios', spec());
      setStatus(t('scen.saved'));
    } catch (e) {
      setStatus(`${t('misc.error')}: ${(e as Error).message}`);
    }
  };

  const download = (s: unknown, id: string) => downloadBlob(new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' }), `${id}.json`);
  const groups: [string, ScenarioMeta[]][] = [
    [t('scen.builtin'), scenarios.filter((s) => s.source === 'builtin')],
    [t('scen.json'), scenarios.filter((s) => s.source === 'json')],
    [t('scen.code'), scenarios.filter((s) => s.source === 'code')],
  ];

  return (
    <div className="scenarios">
      <p className="intro">{t('scen.intro')}</p>
      {groups.map(([label, list]) => list.length > 0 && (
        <section key={label}>
          <h3 className="small-caps">{label}</h3>
          <ul className="scen-list">
            {list.map((s) => (
              <li key={s.id} className={s.id === current ? 'current' : ''}>
                <div className="scen-head">
                  <h4>{s.name}</h4>
                  {s.tags.length > 0 && <span className="tags">{s.tags.join(' · ')}</span>}
                </div>
                <p>{s.description}</p>
                <div className="scen-actions">
                  {s.id === current ? <span className="small-caps">{t('scen.running')}</span> : canRun && <button className="btn" onClick={() => onRun(s.id)}>{t('scen.run')}</button>}
                  {s.spec != null && <button className="btn ghost" onClick={() => download(s.spec, s.id)}>{t('scen.download')}</button>}
                  {s.author && <span className="muted">{t('scen.by', { author: s.author })}</span>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section className="builder">
        {!building ? (
          <button className="btn" onClick={() => setBuilding(true)}>{t('scen.new')}</button>
        ) : (
          <>
            <h3>{t('scen.builder')}</h3>
            <div className="form-grid">
              <label>{t('scen.name')}<input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></label>
              <label className="wide">{t('scen.description')}<input value={desc} maxLength={400} onChange={(e) => setDesc(e.target.value)} /></label>
            </div>
            <h4 className="small-caps">{t('scen.start')}</h4>
            <div className="form-grid">
              <label>{t('ctl.tax')} <b>{tax}%</b><input type="range" min={0} max={60} value={tax} onChange={(e) => setTax(+e.target.value)} /></label>
              <label>{t('scen.startRate')} <b>{rate}%</b><input type="range" min={0} max={25} step={0.5} value={rate} onChange={(e) => setRate(+e.target.value)} /></label>
              <label className="check"><input type="checkbox" checked={welfare} onChange={(e) => setWelfare(e.target.checked)} /> {t('ctl.welfare')}</label>
              <label className="check"><input type="checkbox" checked={antitrust} onChange={(e) => setAntitrust(e.target.checked)} /> {t('ctl.antitrust')}</label>
            </div>
            <h4 className="small-caps">{t('scen.timeline')}</h4>
            <table className="timeline-table">
              <thead><tr><th>{t('scen.day')}</th><th>{t('scen.event')}</th><th>{t('scen.value')}</th><th>{t('scen.headline')}</th><th></th></tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  const set = (patch: Partial<Row>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                  return (
                    <tr key={i}>
                      <td><input type="number" min={1} value={r.day} onChange={(e) => set({ day: +e.target.value })} /></td>
                      <td>
                        <select value={r.type} onChange={(e) => set({ type: e.target.value as EventType, value: e.target.value === 'shock' ? 'drought' : e.target.value === 'welfare' || e.target.value === 'antitrust' ? 'on' : '' })}>
                          {(['tax', 'rate', 'ubi', 'welfare', 'antitrust', 'print', 'shock', 'headline'] as EventType[]).map((k) => <option key={k} value={k}>{t(`cmd.${k}`)}</option>)}
                        </select>
                      </td>
                      <td>
                        {r.type === 'shock' ? (
                          <select value={r.value} onChange={(e) => set({ value: e.target.value })}>{SHOCKS.map((k) => <option key={k} value={k}>{t(`shock.${k}`)}</option>)}</select>
                        ) : r.type === 'welfare' || r.type === 'antitrust' ? (
                          <select value={r.value} onChange={(e) => set({ value: e.target.value })}><option value="on">{t('ctl.on')}</option><option value="off">{t('ctl.off')}</option></select>
                        ) : r.type === 'headline' ? <span className="muted">—</span> : (
                          <input type="number" value={r.value} onChange={(e) => set({ value: e.target.value })} />
                        )}
                      </td>
                      <td><input value={r.headline} maxLength={200} onChange={(e) => set({ headline: e.target.value })} /></td>
                      <td><button className="link" onClick={() => setRows(rows.filter((_, j) => j !== i))}>{t('scen.remove')}</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="row">
              <button className="btn ghost" onClick={() => setRows([...rows, { day: (rows[rows.length - 1]?.day ?? 0) + 50, type: 'tax', value: '20', headline: '' }])}>{t('scen.addEvent')}</button>
              {world.status !== 'replay' && !world.isStatic && <button className="btn" onClick={save}>{t('scen.save')}</button>}
              <button className="btn ghost" onClick={() => download(spec(), spec().id)}>{t('scen.download')}</button>
              {status && <span className="muted">{status}</span>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
