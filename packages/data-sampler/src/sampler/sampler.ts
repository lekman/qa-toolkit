import { randomInt } from "node:crypto";

import type { Allocation, Grade } from "../grade/types";
import type {
  DatasetDefinition,
  FieldGenerator,
  FieldSpec,
  GenerateContext,
  SampledRecord,
  SampleOptions,
  SampleRun,
} from "./types";

import { Fakers } from "../faker/faker";
import { FakerRandom } from "../faker/random";
import { Spread } from "../grade/spread";

/** Largest seed drawn when none is given. Fits a 32-bit signed integer. */
const MAX_DRAWN_SEED = 2 ** 31 - 1;

/** Generates records that satisfy a dataset's grades and spread. */
export class Sampler {
  /**
   * The allocation and the seed for a run, without generating anything. A
   * missing seed is drawn from crypto so the run can still be reproduced.
   */
  static plan<T>(
    dataset: DatasetDefinition<T>,
    options: SampleOptions,
  ): { allocation: Allocation; seed: number } {
    const weights = options.spread
      ? Spread.validate(options.spread, dataset.grades)
      : dataset.spread;
    const allocation = Spread.allocate(weights, options.count, dataset.grades);
    const seed = options.seed ?? randomInt(0, MAX_DRAWN_SEED + 1);
    return { allocation, seed };
  }

  /**
   * Lazily yields records. One Faker instance is seeded from the resolved
   * seed and one random stream drives both the grade shuffle and every field
   * value, so the same inputs produce the same output. Call `plan` first when
   * the seed must be reported before the first record.
   */
  static *records<T>(
    dataset: DatasetDefinition<T>,
    options: SampleOptions,
  ): Generator<SampledRecord<T>, void> {
    const { allocation, seed } = Sampler.plan(dataset, options);
    const faker = Fakers.seeded(seed);
    const random = new FakerRandom(faker);
    const grades = Spread.sequence(allocation, dataset.grades, random);
    const specs = Object.entries(dataset.fields) as [keyof T & string, FieldSpec<T, unknown>][];
    for (let index = 0; index < grades.length; index += 1) {
      const grade = grades[index] as Grade;
      const record: Partial<T> = {};
      for (const [key, spec] of specs) {
        const generate = (spec[grade] ?? spec.default) as FieldGenerator<T, T[typeof key]>;
        const ctx: GenerateContext<T> = { faker, grade, index, random, record, scale: dataset.grades };
        record[key] = generate(ctx);
      }
      yield { data: record as T, grade, index };
    }
  }

  /** Collects `records` into a SampleRun. Convenience for tests and small fixtures. */
  static run<T>(dataset: DatasetDefinition<T>, options: SampleOptions): SampleRun<T> {
    const { allocation, seed } = Sampler.plan(dataset, options);
    const records = [...Sampler.records(dataset, { ...options, seed })];
    return { allocation, records, seed };
  }
}
