import type { Faker } from "@faker-js/faker";

import type { Allocation, Grade, GradeScale, Weights } from "../grade/types";
import type { IRandom } from "./interfaces";

/** What a field generator sees when it produces one value for one record. */
export interface GenerateContext<T> {
  faker: Faker;
  grade: Grade;
  index: number;
  random: IRandom;
  /** Fields generated so far for this record, in declaration order. */
  record: Readonly<Partial<T>>;
  scale: GradeScale;
}

/** Produces one field value for one record, given the record's grade. */
export type FieldGenerator<T, V> = (ctx: GenerateContext<T>) => V;

/** One generator per grade, or a `default` used for every grade not listed. */
export type FieldSpec<T, V> = {
  readonly default?: FieldGenerator<T, V>;
} & {
  readonly [grade: Grade]: FieldGenerator<T, V> | undefined;
};

/** A named scale, a default spread, and one field specification per output property. */
export interface DatasetDefinition<T> {
  name: string;
  grades: GradeScale;
  spread: Weights;
  fields: { readonly [K in keyof T]-?: FieldSpec<T, T[K]> };
}

/** How many records to produce, from which seed, with which spread. */
export interface SampleOptions {
  count: number;
  seed?: number;
  spread?: Weights;
}

/** One generated record with the grade that produced it. */
export interface SampledRecord<T> {
  data: T;
  grade: Grade;
  index: number;
}

/** A collected run: every record, the allocation it satisfied, and the seed. */
export interface SampleRun<T> {
  allocation: Allocation;
  records: SampledRecord<T>[];
  seed: number;
}
