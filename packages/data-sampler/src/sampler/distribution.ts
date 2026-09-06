import type { IRandom } from "./interfaces";

/** Numeric draws built on a uniform source, for field generators. */
export class Distribution {
  /** Uniform in [min, max). Returns `min` when `min` equals `max`. */
  static band(random: IRandom, min: number, max: number): number {
    return min + random.next() * (max - min);
  }

  /** Clamp helper for the tails of a normal draw. */
  static clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  /** Integer in [min, max], both ends inclusive. */
  static integer(random: IRandom, min: number, max: number): number {
    return Math.floor(random.next() * (max - min + 1)) + min;
  }

  /** Normal draw by Box-Muller over two uniform draws. */
  static normal(random: IRandom, mean: number, sd: number): number {
    // 1 - u is in (0, 1], so the logarithm is finite.
    const u1 = 1 - random.next();
    const u2 = random.next();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + sd * z;
  }

  /**
   * Uniform in [limits.min, min) or (max, limits.max]. The side is chosen by
   * one draw, weighted by the width of each side. Throws when neither side
   * has width.
   */
  static outside(
    random: IRandom,
    min: number,
    max: number,
    limits: { min: number; max: number },
  ): number {
    const lowWidth = Math.max(0, min - limits.min);
    const highWidth = Math.max(0, limits.max - max);
    if (lowWidth === 0 && highWidth === 0) {
      throw new RangeError(
        `no room outside [${min}, ${max}] within [${limits.min}, ${limits.max}]`,
      );
    }
    const takeLow = random.next() * (lowWidth + highWidth) < lowWidth;
    if (takeLow) return Distribution.band(random, limits.min, min);
    // Mirror the band so the result never equals `max` and can reach limits.max.
    return limits.max - random.next() * highWidth;
  }
}
