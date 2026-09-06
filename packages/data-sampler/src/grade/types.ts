/** A named classification of a record, chosen by the dataset author. */
export type Grade = string;

/** The ordered list of grades a dataset knows, ascending severity. */
export type GradeScale = readonly Grade[];

/** Weight per grade. Sums to 1, or to 100 when written as percentages. */
export type Weights = Readonly<Record<Grade, number>>;

/** Exact integer count per grade for one run. */
export type Allocation = Readonly<Record<Grade, number>>;
