/** Small, fast, seedable PRNG (sfc32). Same seed -> same world, on every platform. */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number) {
    // splitmix32 to spread the seed over four words
    let s = seed >>> 0;
    const next = () => {
      s = (s + 0x9e3779b9) >>> 0;
      let z = s;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
      return (z ^ (z >>> 16)) >>> 0;
    };
    this.a = next();
    this.b = next();
    this.c = next();
    this.d = next();
    for (let i = 0; i < 12; i++) this.float();
  }

  /** Uniform float in [0, 1). */
  float(): number {
    const t = (((this.a + this.b) >>> 0) + this.d) >>> 0;
    this.d = (this.d + 1) >>> 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) >>> 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) >>> 0;
    return t / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.float();
  }

  int(min: number, maxExclusive: number): number {
    return min + Math.floor(this.float() * (maxExclusive - min));
  }

  chance(p: number): boolean {
    return this.float() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.float() * arr.length)];
  }

  /** Approximately normal (Irwin-Hall, n=4), mean 0, sd ~1. */
  normal(): number {
    return (this.float() + this.float() + this.float() + this.float() - 2) * 1.732;
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.float() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

/** Stable 32-bit hash for seeds typed by humans ("hello" -> number). */
export function hashSeed(input: string | number): number {
  if (typeof input === 'number' && Number.isFinite(input)) return input >>> 0;
  const s = String(input);
  if (/^\d+$/.test(s)) return Number(s) >>> 0;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
