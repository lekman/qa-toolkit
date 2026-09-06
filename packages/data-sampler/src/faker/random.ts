import type { Faker } from "@faker-js/faker";

import type { IRandom } from "../sampler/interfaces";

const RANGE = 2 ** 32;

/** Uniform numbers in [0, 1) drawn from a Faker instance's seeded stream. */
export class FakerRandom implements IRandom {
  constructor(private readonly faker: Faker) {}

  /** `faker.number.int` over 32 bits divided by 2^32, so the result is never 1. */
  next(): number {
    return this.faker.number.int({ max: RANGE - 1, min: 0 }) / RANGE;
  }
}
