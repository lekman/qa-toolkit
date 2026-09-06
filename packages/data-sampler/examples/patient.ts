/**
 * Reference dataset: a patient record with four grades.
 *
 * The bands below are illustrative test data, chosen so that a validator can
 * tell the grades apart. They are not clinical guidance and must not be read
 * as reference ranges.
 */

// The package's own name, not a relative path: this is the import a consumer
// writes, and Node's ESM loader rejects the directory import "../src" anyway.
// Bun resolves it to src/ through the "bun" export condition; Node resolves
// it to dist/, so run `bun run build` first under Node.
import type { FieldGenerator, IRandom } from "@lekman/data-sampler";

import { Dataset, Distribution } from "@lekman/data-sampler";

/** One generated patient. Dates are ISO 8601 strings. */
export interface Patient {
  id: string;
  givenName: string;
  familyName: string;
  age: number;
  heartRate: number;
  systolicBp: number;
  temperatureC: number;
  spo2: number;
  admittedAt: string;
  dischargedAt: string;
}

/** Physical limits: a value outside these is impossible, not merely ill. */
const LIMITS = {
  age: { max: 130, min: 0 },
  heartRate: { max: 250, min: 20 },
  spo2: { max: 100, min: 0 },
  systolicBp: { max: 300, min: 40 },
  temperatureC: { max: 45, min: 25 },
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Admissions are drawn relative to this date, not to "now". Faker's date
 * helpers default to the current time, which would make the same seed give
 * different dates on different days and break the determinism guard.
 */
const REF_DATE = "2026-09-01T00:00:00.000Z";

/** A clamped, rounded normal draw. */
const roundedNormal = (random: IRandom, mean: number, sd: number, min: number, max: number): number =>
  Math.round(Distribution.clamp(Distribution.normal(random, mean, sd), min, max));

/** Integer in one of two bands, chosen by a coin flip. */
const eitherInt = (random: IRandom, low: [number, number], high: [number, number]): number =>
  random.next() < 0.5
    ? Distribution.integer(random, high[0], high[1])
    : Distribution.integer(random, low[0], low[1]);

/** One-decimal number in one of two bands, chosen by a coin flip. */
const eitherTenth = (random: IRandom, low: [number, number], high: [number, number]): number => {
  const [min, max] = random.next() < 0.5 ? high : low;
  return Math.round(Distribution.band(random, min, max) * 10) / 10;
};

/** One of two fixed values, chosen by a coin flip. */
const pick = (random: IRandom, a: number, b: number): number => (random.next() < 0.5 ? a : b);

const isoDaysFrom = (iso: string, days: number): string =>
  new Date(new Date(iso).getTime() + days * DAY_MS).toISOString();

const dischargedAfter: FieldGenerator<Patient, string> = (ctx) =>
  isoDaysFrom(ctx.record.admittedAt as string, Distribution.band(ctx.random, 0, 14));

const dischargedBefore: FieldGenerator<Patient, string> = (ctx) =>
  isoDaysFrom(ctx.record.admittedAt as string, -Distribution.band(ctx.random, 1, 30));

const patient = Dataset.define<Patient>({
  fields: {
    id: { default: (ctx) => ctx.faker.string.uuid() },
    givenName: { default: (ctx) => ctx.faker.person.firstName() },
    familyName: { default: (ctx) => ctx.faker.person.lastName() },
    age: {
      default: (ctx) => Distribution.integer(ctx.random, 18, 90),
      impossible: (ctx) => pick(ctx.random, -3, 190),
    },
    heartRate: {
      normal: (ctx) => roundedNormal(ctx.random, 72, 8, 55, 95),
      warning: (ctx) => eitherInt(ctx.random, [45, 54], [96, 120]),
      ill: (ctx) => eitherInt(ctx.random, [30, 44], [121, 180]),
      impossible: (ctx) => pick(ctx.random, -20, 999),
    },
    systolicBp: {
      normal: (ctx) => roundedNormal(ctx.random, 118, 10, 95, 135),
      warning: (ctx) => eitherInt(ctx.random, [85, 94], [136, 159]),
      ill: (ctx) => eitherInt(ctx.random, [60, 84], [160, 220]),
      impossible: (ctx) => pick(ctx.random, 0, 500),
    },
    temperatureC: {
      normal: (ctx) =>
        Math.round(Distribution.clamp(Distribution.normal(ctx.random, 36.7, 0.3), 36.1, 37.2) * 10) / 10,
      warning: (ctx) => eitherTenth(ctx.random, [35.0, 36.0], [37.3, 38.4]),
      ill: (ctx) => eitherTenth(ctx.random, [32.0, 34.9], [38.5, 41.0]),
      impossible: (ctx) => pick(ctx.random, 15.0, 60.0),
    },
    spo2: {
      normal: (ctx) => Distribution.integer(ctx.random, 95, 100),
      warning: (ctx) => Distribution.integer(ctx.random, 90, 94),
      ill: (ctx) => Distribution.integer(ctx.random, 70, 89),
      impossible: (ctx) => pick(ctx.random, 120, -5),
    },
    admittedAt: { default: (ctx) => ctx.faker.date.recent({ days: 30, refDate: REF_DATE }).toISOString() },
    dischargedAt: { default: dischargedAfter, impossible: dischargedBefore },
  },
  grades: ["normal", "warning", "ill", "impossible"],
  name: "patient",
  spread: { ill: 0.1, impossible: 0.05, normal: 0.7, warning: 0.15 },
});

export default patient;

/**
 * False when any vital is outside the physical limits the `impossible` grade
 * uses, or when discharge precedes admission. True for every other grade.
 */
export function isPlausible(record: Patient): boolean {
  const within = (value: number, limit: { max: number; min: number }): boolean =>
    value >= limit.min && value <= limit.max;
  return (
    within(record.age, LIMITS.age) &&
    within(record.heartRate, LIMITS.heartRate) &&
    within(record.systolicBp, LIMITS.systolicBp) &&
    within(record.temperatureC, LIMITS.temperatureC) &&
    within(record.spo2, LIMITS.spo2) &&
    record.dischargedAt >= record.admittedAt
  );
}
