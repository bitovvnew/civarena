// First-run setup wizard: providers -> teams -> world -> start.
// Keys are typed here, sent once to the local server (127.0.0.1), checked with a free model-list call,
// and stored in .env. The server never sends a key back.

import { useEffect, useMemo, useState } from 'react';
import { postJson, type ScenarioMeta } from '../data';
import { fmtCompact, fmtNum, LANGS, type Lang, type T } from '../i18n';

interface Detection { id: string; label: string; envKey: boolean; reachable?: boolean; models?: number }
interface Catalog { id: string; label: string; needsKey: boolean; keyUrl: string | null }
interface ModelInfo { id: string; label: string; usdPerMTokIn?: number; context?: number }
interface Probe { ok: boolean; models: ModelInfo[]; error?: string; ms: number }
interface Config { teams: string[]; agents: number; scenario: string; seed: string; policyEvery: number; budget: { globalTokens: number; teamTokens: number; teamCalls: number }; rateLimit: { rpm: number; concurrency: number } }
interface Status { configured: boolean; providers: Detection[]; catalog: Catalog[]; config: Config; error: string }

const OFFLINE = [
  { id: 'tycoon', label: 'Tycoons' }, { id: 'cooperative', label: 'Co-op' }, { id: 'prudent', label: 'Prudent' },
  { id: 'gambler', label: 'Gamblers' }, { id: 'adaptive', label: 'Adaptive' },
];

export function Setup({ t, lang, setLang, scenarios, onDone, onCancel }: {
  t: T; lang: Lang; setLang: (l: Lang) => void; scenarios: ScenarioMeta[]; onDone: () => void; onCancel?: () => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [step, setStep] = useState(0);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [probes, setProbes] = useState<Record<string, Probe | 'busy'>>({});
  const [teams, setTeams] = useState<string[]>([]);
  const [search, setSearch] = useState<Record<string, string>>({});
  const [cfg, setCfg] = useState<Config | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/setup/status').then((r) => r.json()).then((s: Status) => {
      setStatus(s);
      setCfg(s.config);
      setTeams(s.config.teams);
      // auto-check what is already available: env keys and a running Ollama
      for (const d of s.providers) if (d.envKey || (d.id === 'ollama' && d.reachable) || d.id === 'offline') check(d.id, '');
    }).catch((e) => setError(String(e)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function check(provider: string, key: string) {
    setProbes((p) => ({ ...p, [provider]: 'busy' }));
    try {
      const res = await postJson<Probe>('/api/setup/probe', { provider, key });
      setProbes((p) => ({ ...p, [provider]: res }));
    } catch (e) {
      setProbes((p) => ({ ...p, [provider]: { ok: false, models: [], error: (e as Error).message, ms: 0 } }));
    }
  }

  const ready = useMemo(() => Object.entries(probes).filter(([, p]) => p !== 'busy' && p.ok).map(([k]) => k), [probes]);
  const llmTeams = teams.filter((x) => !x.startsWith('offline:')).length;
  const calls = cfg ? Math.ceil(500 / cfg.policyEvery) * llmTeams : 0;

  async function save() {
    if (!cfg) return;
    setSaving(true);
    setError('');
    try {
      const sendKeys: Record<string, string> = {};
      for (const [k, v] of Object.entries(keys)) if (v.trim() && ready.includes(k)) sendKeys[k] = v.trim();
      await postJson('/api/setup/save', { keys: sendKeys, config: { ...cfg, teams } });
      setKeys({}); // forget keys in the page as soon as the server has them
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!status || !cfg) return <div className="setup"><p className="intro">{error || t('connecting')}</p></div>;
  const steps = ['providers', 'teams', 'world', 'start'];

  return (
    <div className="setup">
      <header className="setup-head">
        <div>
          <span className="small-caps">CivArena · {t('nav.setup')}</span>
          <h1>{t('setup.title')}</h1>
          <p className="intro">{t('setup.intro')}</p>
        </div>
        <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={t('nav.language')}>
          {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </header>
      <ol className="steps">
        {steps.map((s, i) => <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''}><button onClick={() => setStep(i)}>{i + 1}. {t(`setup.step.${s}`)}</button></li>)}
      </ol>

      {step === 0 && (
        <div className="providers">
          {status.catalog.map((p) => {
            const d = status.providers.find((x) => x.id === p.id);
            const pr = probes[p.id];
            return (
              <section key={p.id} className={`provider ${pr && pr !== 'busy' && pr.ok ? 'ok' : ''}`}>
                <div className="provider-head">
                  <h3>{p.id === 'offline' ? t('setup.offline') : p.label}</h3>
                  {p.keyUrl && <a href={p.keyUrl} target="_blank" rel="noreferrer noopener">{t('setup.getKey')} ↗</a>}
                </div>
                {p.id === 'offline' && <p className="note">{t('setup.offlineHint')}</p>}
                {p.id === 'ollama' && <p className="note">{d?.reachable ? t('setup.ollamaUp', { n: d.models ?? 0 }) : t('setup.ollamaDown')}</p>}
                {p.needsKey && (
                  <>
                    {d?.envKey && <p className="note found">{t('setup.envKey')}</p>}
                    <div className="key-row">
                      <label className="sr" htmlFor={`k-${p.id}`}>{t('setup.key')}</label>
                      <input id={`k-${p.id}`} type={reveal[p.id] ? 'text' : 'password'} autoComplete="off" spellCheck={false}
                        placeholder={d?.envKey ? t('setup.useEnv') : t('setup.keyPlaceholder')} value={keys[p.id] ?? ''}
                        onChange={(e) => setKeys({ ...keys, [p.id]: e.target.value })} />
                      <button className="link" onClick={() => setReveal({ ...reveal, [p.id]: !reveal[p.id] })}>{reveal[p.id] ? t('setup.hide') : t('setup.show')}</button>
                      <button className="btn" disabled={pr === 'busy' || (!keys[p.id] && !d?.envKey)} onClick={() => check(p.id, keys[p.id] ?? '')}>{pr === 'busy' ? t('setup.checking') : t('setup.check')}</button>
                    </div>
                  </>
                )}
                {pr && pr !== 'busy' && (pr.ok
                  ? <p className="status ok">✓ {t('setup.ok', { n: pr.models.length, ms: pr.ms })}</p>
                  : <p className="status bad">✕ {t('setup.fail', { error: pr.error ?? '' })}</p>)}
              </section>
            );
          })}
          <p className="privacy">{t('setup.privacy')}</p>
        </div>
      )}

      {step === 1 && (
        <div className="team-pick">
          <h3>{t('setup.teams', { n: teams.length })}</h3>
          <ol className="chosen">
            {teams.map((tm, i) => (
              <li key={tm + i}><code>{tm}</code><button className="link" onClick={() => setTeams(teams.filter((_, j) => j !== i))}>{t('setup.remove')}</button></li>
            ))}
            {teams.length === 0 && <li className="muted">{t('setup.noTeams')}</li>}
          </ol>
          {ready.length === 0 && <p className="note">{t('setup.validFirst')}</p>}
          {ready.map((prov) => {
            const pr = probes[prov] as Probe;
            const q = (search[prov] ?? '').toLowerCase();
            const models = prov === 'offline' ? OFFLINE : pr.models;
            const list = models.filter((m) => !q || m.id.toLowerCase().includes(q) || m.label.toLowerCase().includes(q)).slice(0, 60);
            const label = status.catalog.find((c) => c.id === prov)?.label ?? prov;
            return (
              <section key={prov} className="model-list">
                <div className="provider-head">
                  <h4>{prov === 'offline' ? t('setup.offline') : label}</h4>
                  {models.length > 8 && <input type="search" placeholder={t('setup.search', { n: models.length })} value={search[prov] ?? ''} onChange={(e) => setSearch({ ...search, [prov]: e.target.value })} />}
                </div>
                <ul>
                  {list.map((m) => {
                    const spec = `${prov}:${m.id}`;
                    const on = teams.includes(spec);
                    const price = (m as ModelInfo).usdPerMTokIn;
                    return (
                      <li key={m.id}>
                        <button className={`model ${on ? 'on' : ''}`} disabled={!on && teams.length >= 8} aria-pressed={on}
                          onClick={() => setTeams(on ? teams.filter((x) => x !== spec) : [...teams, spec])}>
                          <span className="mid">{m.id}</span>
                          {m.label !== m.id && <span className="mlabel">{m.label}</span>}
                          {price !== undefined && <span className="price">{t('setup.perM', { p: fmtNum(price, lang, 2) })}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {step === 2 && (
        <div className="world-form form-grid">
          <label>{t('setup.citizens')} <b>{cfg.agents}</b><input type="range" min={60} max={1500} step={20} value={cfg.agents} onChange={(e) => setCfg({ ...cfg, agents: +e.target.value })} /></label>
          <label>{t('setup.scenario')}
            <select value={cfg.scenario} onChange={(e) => setCfg({ ...cfg, scenario: e.target.value })}>
              {scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label>{t('setup.seed')}<input value={cfg.seed} maxLength={64} onChange={(e) => setCfg({ ...cfg, seed: e.target.value })} /></label>
          <label>{t('setup.policyEvery', { n: cfg.policyEvery })}<input type="range" min={5} max={100} step={5} value={cfg.policyEvery} onChange={(e) => setCfg({ ...cfg, policyEvery: +e.target.value })} /></label>
          <h4 className="small-caps wide">{t('setup.limits')}</h4>
          <label>{t('setup.globalTokens')} <b>{fmtCompact(cfg.budget.globalTokens, lang)}</b><input type="range" min={100000} max={10000000} step={100000} value={cfg.budget.globalTokens} onChange={(e) => setCfg({ ...cfg, budget: { ...cfg.budget, globalTokens: +e.target.value } })} /></label>
          <label>{t('setup.teamTokens')} <b>{fmtCompact(cfg.budget.teamTokens, lang)}</b><input type="range" min={50000} max={5000000} step={50000} value={cfg.budget.teamTokens} onChange={(e) => setCfg({ ...cfg, budget: { ...cfg.budget, teamTokens: +e.target.value } })} /></label>
          <label>{t('setup.rpm')} <b>{cfg.rateLimit.rpm}</b><input type="range" min={1} max={300} value={cfg.rateLimit.rpm} onChange={(e) => setCfg({ ...cfg, rateLimit: { ...cfg.rateLimit, rpm: +e.target.value } })} /></label>
          <p className="note wide">{t('setup.estimate', { calls })}</p>
        </div>
      )}

      {step === 3 && (
        <div className="review">
          <ul className="chosen">{teams.map((tm) => <li key={tm}><code>{tm}</code></li>)}</ul>
          <p>{t('setup.citizens')}: <b>{cfg.agents}</b> · {t('setup.scenario')}: <b>{scenarios.find((s) => s.id === cfg.scenario)?.name ?? cfg.scenario}</b> · {t('setup.seed')}: <b>{cfg.seed}</b></p>
          <p className="note">{t('setup.estimate', { calls })}</p>
          <p className="privacy">{t('setup.privacy')}</p>
          {(error || status.error) && <p className="status bad">✕ {error || status.error}</p>}
          <button className="btn big" disabled={saving || teams.length === 0} onClick={save}>{saving ? t('setup.starting') : t('setup.start')}</button>
        </div>
      )}

      <footer className="setup-foot">
        {step > 0 ? <button className="btn ghost" onClick={() => setStep(step - 1)}>{t('setup.back')}</button> : onCancel ? <button className="btn ghost" onClick={onCancel}>{t('setup.cancel')}</button> : <span />}
        {step < 3 && <button className="btn" disabled={step === 1 && teams.length === 0} onClick={() => setStep(step + 1)}>{t('setup.next')}</button>}
      </footer>
    </div>
  );
}
