// "Headline of the day": picks the lead story for any day and writes the front page around it.
// Pure functions over frames, so the same day always prints the same paper.

import type { Frame, Headline, HeadlineKind } from '../../src/engine/types';

const WEIGHT: Partial<Record<HeadlineKind, number>> = {
  starvation: 9, bank_crisis: 9, cartel_break: 8, cartel_form: 7, shock: 8, monopoly: 6, bankrupt: 4,
  price_spike: 5, price_crash: 5, richest: 4, baby_boom: 4, policy: 5, strategy: 3, milestone: 2,
};

export interface Story extends Headline {
  score: number;
}

/** Collect the stories of the last `window` days, newest first, scored for newsworthiness. */
export function storiesAround(frames: Frame[], index: number, window = 12): Story[] {
  const out: Story[] = [];
  for (let i = index; i >= 0 && i > index - window; i--) {
    const f = frames[i];
    if (!f) continue;
    for (const h of f.headlines) {
      const recency = 1 - (index - i) / (window * 1.6);
      const magnitude = typeof h.params.count === 'number' ? Math.min(3, h.params.count / 5) : typeof h.params.pct === 'number' ? Math.min(3, h.params.pct / 40) : 0;
      out.push({ ...h, score: ((WEIGHT[h.kind] ?? 2) + h.level * 3 + magnitude) * recency });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

export interface FrontPage {
  day: number;
  lead: Story | null;
  secondary: Story[];
  briefs: Story[];
  oped: { team: string; text: string } | null;
  change: { gdp: number; cpi: number; population: number };
}

export function frontPage(frames: Frame[], index: number): FrontPage {
  const f = frames[index];
  const stories = storiesAround(frames, index).filter((s) => s.kind !== 'strategy');
  const seen = new Set<string>();
  const unique = stories.filter((s) => {
    const k = s.key + (s.params.good ?? '') + (s.params.name ?? '');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const week = frames[Math.max(0, index - 7)] ?? f;
  const pct = (a: number, b: number) => (b ? ((a - b) / Math.abs(b)) * 100 : 0);
  const leader = f ? [...f.teams].sort((a, b) => b.score - a.score)[0] : undefined;
  return {
    day: f?.tick ?? 0,
    lead: unique[0] ?? null,
    secondary: unique.slice(1, 4),
    briefs: unique.slice(4, 10),
    oped: leader ? { team: leader.label, text: leader.rationale } : null,
    change: f && week ? { gdp: pct(f.m.gdp, week.m.gdp), cpi: pct(f.m.cpi, week.m.cpi), population: f.m.population - week.m.population } : { gdp: 0, cpi: 0, population: 0 },
  };
}
