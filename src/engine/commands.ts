// Strict validation for commands coming from the dashboard, scenario files and share links.

import type { Command, ShockKind } from './types.js';

export const SHOCK_KINDS: ShockKind[] = ['drought', 'mine_collapse', 'tech_boom', 'plague', 'gold_rush', 'trade_embargo'];

const num = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);

/** Returns a clean Command or null. Never trusts extra fields. */
export function validateCommand(raw: unknown): Command | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  switch (c.type) {
    case 'pause':
    case 'resume':
      return { type: c.type };
    case 'speed': {
      const tps = num(c.tps, 0.2, 60);
      return tps === null ? null : { type: 'speed', tps };
    }
    case 'tax': {
      const rate = num(c.rate, 0, 0.9);
      return rate === null ? null : { type: 'tax', rate };
    }
    case 'rate': {
      const rate = num(c.rate, 0, 50);
      return rate === null ? null : { type: 'rate', rate };
    }
    case 'ubi': {
      const amount = num(c.amount, 0, 50);
      return amount === null ? null : { type: 'ubi', amount };
    }
    case 'welfare':
    case 'antitrust':
      return typeof c.on === 'boolean' ? { type: c.type, on: c.on } : null;
    case 'print': {
      const amount = num(c.amount, 0, 1e9);
      return amount === null ? null : { type: 'print', amount };
    }
    case 'shock':
      return SHOCK_KINDS.includes(c.kind as ShockKind) ? { type: 'shock', kind: c.kind as ShockKind } : null;
    case 'reset': {
      if (c.seed === undefined) return { type: 'reset' };
      const seed = num(c.seed, 0, 2 ** 32 - 1);
      return seed === null ? null : { type: 'reset', seed: Math.floor(seed) };
    }
    default:
      return null;
  }
}
