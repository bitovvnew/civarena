// Breaking-news slips: dramatic headlines slide in at the corner, then file themselves away.

import { useEffect, useRef, useState } from 'react';
import type { Frame, Headline } from '../../../src/engine/types';
import type { T } from '../i18n';

interface Slip extends Headline { id: number }

export function Toasts({ frame, live, t }: { frame: Frame | undefined; live: boolean; t: T }) {
  const [slips, setSlips] = useState<Slip[]>([]);
  const lastTick = useRef(-1);
  const seq = useRef(0);
  useEffect(() => {
    if (!frame || frame.tick === lastTick.current) return;
    const jumped = Math.abs(frame.tick - lastTick.current) > 3;
    lastTick.current = frame.tick;
    if (!live || jumped) return;
    const fresh = frame.headlines.filter((h) => h.level === 2).slice(0, 2).map((h) => ({ ...h, id: ++seq.current }));
    if (!fresh.length) return;
    setSlips((s) => [...fresh, ...s].slice(0, 3));
    for (const f of fresh) setTimeout(() => setSlips((s) => s.filter((x) => x.id !== f.id)), 6000);
  }, [frame, live]);
  return (
    <div className="slips" aria-live="assertive">
      {slips.map((s) => (
        <div key={s.id} className="slip" role="status">
          <span className="slip-kicker">{t('toast.breaking')} · {t('day')} {s.tick}</span>
          <span className="slip-text">{t(s.key, s.params)}</span>
        </div>
      ))}
    </div>
  );
}
