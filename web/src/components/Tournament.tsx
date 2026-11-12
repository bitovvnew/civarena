// Tournament results: mean score with a 95% interval per team (dot + whisker), wins and per-scenario table.

import type { TournamentReport } from '../../../src/tournament-types';
import { fmtNum, type Lang, type T } from '../i18n';
import { teamColor } from '../theme';

export function Tournament({ report, t, lang, dark }: { report: TournamentReport | null; t: T; lang: Lang; dark: boolean }) {
  if (!report) return <p className="intro">{t('tour.empty')}</p>;
  const lo = Math.min(...report.standings.map((s) => s.mean - s.ci95));
  const hi = Math.max(...report.standings.map((s) => s.mean + s.ci95));
  const pad = (hi - lo) * 0.1 || 5;
  const x0 = lo - pad, x1 = hi + pad;
  const X = (v: number) => ((v - x0) / (x1 - x0)) * 100;
  return (
    <div className="tournament">
      <p className="intro">{t('tour.worlds', { n: report.runs.length, seeds: report.seeds.length, days: report.ticks })} · {report.scenarios.map((s) => s.name).join(', ')}</p>
      <table className="tour-table">
        <thead>
          <tr><th>#</th><th></th><th className="num">{t('tour.mean')}</th><th className="ci-col">{t('tour.ci')}</th><th className="num">{t('tour.wins')}</th><th className="num">{t('tour.survival')}</th></tr>
        </thead>
        <tbody>
          {report.standings.map((s, i) => (
            <tr key={s.spec}>
              <td className={`rank r${i + 1}`}>{i + 1}</td>
              <td><div className="team-name"><i style={{ background: teamColor(s.color, dark) }} />{s.label}</div><code>{s.spec}</code></td>
              <td className="num strong">{fmtNum(s.mean, lang, 1)}</td>
              <td className="ci-col">
                <svg viewBox="0 0 100 12" preserveAspectRatio="none" role="img" aria-label={`${fmtNum(s.mean - s.ci95, lang, 1)} – ${fmtNum(s.mean + s.ci95, lang, 1)}`}>
                  <line x1={X(s.mean - s.ci95)} x2={X(s.mean + s.ci95)} y1="6" y2="6" stroke="var(--ink-2)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                  <line x1={X(s.mean - s.ci95)} x2={X(s.mean - s.ci95)} y1="2" y2="10" stroke="var(--ink-2)" vectorEffect="non-scaling-stroke" />
                  <line x1={X(s.mean + s.ci95)} x2={X(s.mean + s.ci95)} y1="2" y2="10" stroke="var(--ink-2)" vectorEffect="non-scaling-stroke" />
                </svg>
                <span className="dotmark" style={{ left: `${X(s.mean)}%`, background: teamColor(s.color, dark) }} />
              </td>
              <td className="num">{s.wins}/{s.runs}</td>
              <td className="num">{fmtNum(s.meanSurvival * 100, lang, 0)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      {report.scenarios.length > 1 && (
        <>
          <h3 className="small-caps">{t('tour.byScenario')}</h3>
          <table className="mini">
            <thead><tr><th></th>{report.scenarios.map((s) => <th key={s.id} className="num">{s.name}</th>)}</tr></thead>
            <tbody>{report.standings.map((s) => <tr key={s.spec}><td>{s.label}</td>{report.scenarios.map((sc) => <td key={sc.id} className="num">{fmtNum(s.byScenario[sc.id], lang, 1)}</td>)}</tr>)}</tbody>
          </table>
        </>
      )}
    </div>
  );
}
