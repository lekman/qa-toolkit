import { en, Faker } from "@faker-js/faker";

/** Seeded Faker instances. */
export class Fakers {
  /** A new English-locale Faker seeded with `seed`. */
  static seeded(seed: number): Faker {
    const faker = new Faker({ locale: [en] });
    faker.seed(seed);
    return faker;
  }
}
