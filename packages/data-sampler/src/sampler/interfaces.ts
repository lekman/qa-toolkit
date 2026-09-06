/** Source of uniform random numbers in [0, 1). Everything else derives from it. */
export interface IRandom {
  next(): number;
}
