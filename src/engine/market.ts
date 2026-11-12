// Uniform-price call auction, one per good per tick.
// Bids sorted high -> low, asks low -> high; we match while the best bid >= best ask,
// then everyone trades at one clearing price between the marginal bid and the marginal ask.

export type Party = number | 'foreign';

export interface Order {
  party: Party;
  qty: number;
  limit: number;
  /** Tie-breaker for equal limits; lower goes first. Deterministic. */
  seq: number;
}

export interface Fill {
  buyer: Party;
  seller: Party;
  qty: number;
}

export interface Clearing {
  price: number;
  volume: number;
  fills: Fill[];
  /** Total quantity demanded/offered (for price discovery when nothing clears). */
  demand: number;
  supply: number;
}

const EPS = 1e-9;

export function clear(bids: Order[], asks: Order[], clamp?: { min: number; max: number }): Clearing {
  const b = bids.filter((o) => o.qty > EPS && o.limit > 0).sort((x, y) => y.limit - x.limit || x.seq - y.seq);
  const a = asks.filter((o) => o.qty > EPS).sort((x, y) => x.limit - y.limit || x.seq - y.seq);
  const demand = b.reduce((s, o) => s + (Number.isFinite(o.qty) ? o.qty : 0), 0);
  const supply = a.reduce((s, o) => s + (Number.isFinite(o.qty) ? o.qty : 0), 0);
  const fills: Fill[] = [];
  let i = 0;
  let j = 0;
  let bq = b[0]?.qty ?? 0;
  let aq = a[0]?.qty ?? 0;
  let lastBid = 0;
  let lastAsk = 0;
  let volume = 0;
  while (i < b.length && j < a.length && b[i].limit + EPS >= a[j].limit) {
    if (b[i].party === a[j].party) {
      // never trade with yourself: skip the smaller side
      if (bq <= aq) { i++; bq = b[i]?.qty ?? 0; } else { j++; aq = a[j]?.qty ?? 0; }
      continue;
    }
    if (b[i].party === 'foreign' && a[j].party === 'foreign') break;
    const q = Math.min(bq, aq);
    if (!Number.isFinite(q)) break;
    fills.push({ buyer: b[i].party, seller: a[j].party, qty: q });
    volume += q;
    lastBid = b[i].limit;
    lastAsk = a[j].limit;
    bq -= q;
    aq -= q;
    if (bq <= EPS) { i++; bq = b[i]?.qty ?? 0; }
    if (aq <= EPS) { j++; aq = a[j]?.qty ?? 0; }
  }
  let price = volume > 0 ? (lastBid + lastAsk) / 2 : 0;
  if (clamp && volume > 0) price = Math.min(clamp.max, Math.max(clamp.min, price));
  return { price, volume, fills, demand, supply };
}
