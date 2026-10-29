/**
 * Deterministic XorShift32 RNG for simulation reproducibility.
 */
export class Rng {
  private state: number;

  constructor(seed: number = 123456789) {
    this.state = seed >>> 0 || 123456789;
  }

  public nextUint32(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state;
  }

  /** Returns float in [0, 1) */
  public next(): number {
    return (this.nextUint32() >>> 0) / 4294967296;
  }

  /** Returns 0 or 1 */
  public bit(): number {
    return this.nextUint32() & 1;
  }

  /** Range [min, max) */
  public range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Integer range [min, max] inclusive */
  public rangeInt(min: number, max: number): number {
    return Math.floor(min + this.next() * (max - min + 1));
  }

  public reset(seed: number): void {
    this.state = seed >>> 0 || 123456789;
  }
}
