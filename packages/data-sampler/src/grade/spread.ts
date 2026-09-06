import type { IRandom } from "../sampler/interfaces";
import type { Allocation, Grade, GradeScale, Weights } from "./types";

// Imported from the file rather than the sampler barrel: the barrel loads
// sampler.ts, which imports this module, and a runtime cycle through two
// barrels is a bug waiting for an evaluation-order change.
import { SpreadError } from "../sampler/errors";

const SUM_TOLERANCE = 1e-9;
const PERCENT_TOLERANCE = 1e-6;

/** Parse, validate and allocate grade weights. */
export class Spread {
  /**
   * Exact integer counts for `count` records. Floors each grade's share, then
   * hands out the remainder by largest fractional part, ties to the earlier
   * grade in the scale. The counts sum to `count`. Grades in the scale but
   * absent from `weights` get 0.
   */
  static allocate(
    weights: Weights,
    count: number,
    scale: GradeScale,
  ): Allocation {
    if (!Number.isInteger(count) || count < 0) {
      throw new SpreadError(
        `count must be a non-negative integer, got ${count}`,
      );
    }
    const shares = scale.map((grade, position) => {
      const raw = (weights[grade] ?? 0) * count;
      const whole = Math.floor(raw);
      return { fraction: raw - whole, grade, position, whole };
    });
    let remainder = count - shares.reduce((sum, share) => sum + share.whole, 0);
    const byFraction = [...shares].sort(
      (a, b) => b.fraction - a.fraction || a.position - b.position,
    );
    for (const share of byFraction) {
      if (remainder <= 0) break;
      share.whole += 1;
      remainder -= 1;
    }
    const allocation: Record<Grade, number> = {};
    for (const share of shares) allocation[share.grade] = share.whole;
    return Object.freeze(allocation);
  }

  /** Parse `"normal:0.9,ill:0.1"` or `"normal:90,ill:10"`. Throws SpreadError. */
  static parse(text: string): Weights {
    if (text.trim() === "") throw new SpreadError("spread is empty");
    const weights: Record<Grade, number> = {};
    for (const part of text.split(",")) {
      const [grade, value, ...rest] = part.split(":").map((s) => s.trim());
      if (!grade || value === undefined || rest.length > 0) {
        throw new SpreadError(`expected grade:weight, got "${part.trim()}"`);
      }
      const weight = Number(value);
      if (value === "" || Number.isNaN(weight)) {
        throw new SpreadError(
          `weight for "${grade}" is not a number: "${value}"`,
        );
      }
      if (grade in weights)
        throw new SpreadError(`grade "${grade}" is listed twice`);
      weights[grade] = weight;
    }
    return Object.freeze(weights);
  }

  /**
   * Expand the allocation to one grade per index, in scale order, then
   * Fisher-Yates shuffle it with `random`.
   */
  static sequence(
    allocation: Allocation,
    scale: GradeScale,
    random: IRandom,
  ): Grade[] {
    const grades: Grade[] = [];
    for (const grade of scale) {
      for (let i = 0; i < (allocation[grade] ?? 0); i += 1) grades.push(grade);
    }
    for (let i = grades.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random.next() * (i + 1));
      const a = grades[i] as Grade;
      grades[i] = grades[j] as Grade;
      grades[j] = a;
    }
    return grades;
  }

  /**
   * Weights are non-negative, every key is in the scale, and the sum is 1
   * within 1e-9. A sum near 100 is read as percentages and scaled. Returns
   * the validated, possibly scaled, weights.
   */
  static validate(weights: Weights, scale: GradeScale): Weights {
    const keys = Object.keys(weights);
    if (keys.length === 0) throw new SpreadError("spread has no grades");
    for (const grade of keys) {
      if (grade === "default")
        throw new SpreadError('a grade may not be named "default"');
      if (!scale.includes(grade)) {
        throw new SpreadError(
          `grade "${grade}" is not in the scale [${scale.join(", ")}]`,
        );
      }
      const weight = weights[grade] as number;
      if (!Number.isFinite(weight) || weight < 0) {
        throw new SpreadError(
          `weight for "${grade}" must be a non-negative number, got ${weight}`,
        );
      }
    }
    const sum = keys.reduce(
      (total, grade) => total + (weights[grade] as number),
      0,
    );
    if (Math.abs(sum - 1) <= SUM_TOLERANCE)
      return Object.freeze({ ...weights });
    if (Math.abs(sum - 100) <= PERCENT_TOLERANCE) {
      const scaled: Record<Grade, number> = {};
      for (const grade of keys)
        scaled[grade] = (weights[grade] as number) / 100;
      return Object.freeze(scaled);
    }
    throw new SpreadError(
      `weights must sum to 1 (or 100 as percentages), got ${sum}`,
    );
  }
}
