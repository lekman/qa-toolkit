import type { IRandom } from "../../src/sampler/interfaces";

/** Replays a fixed sequence of values in [0, 1), cycling when it runs out. */
export class ScriptedRandom implements IRandom {
  private position = 0;

  constructor(private readonly values: readonly number[]) {
    if (values.length === 0)
      throw new Error("ScriptedRandom needs at least one value");
  }

  /** The next scripted value; wraps around at the end of the list. */
  next(): number {
    const value = this.values[this.position % this.values.length] as number;
    this.position += 1;
    return value;
  }
}
