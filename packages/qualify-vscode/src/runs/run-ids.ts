const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Run IDs in the ULID form the evidence schema requires. */
export class RunIds {
  /**
   * A ULID from a time in milliseconds and 16 random bytes: 10 characters
   * of time, then 16 of randomness, in Crockford's base 32.
   */
  static create(timeMs: number, random: Uint8Array): string {
    let time = "";
    let t = Math.max(0, Math.floor(timeMs));
    for (let i = 0; i < 10; i++) {
      time = ALPHABET[t % 32] + time;
      t = Math.floor(t / 32);
    }
    let rest = "";
    for (let i = 0; i < 16; i++) rest += ALPHABET[(random[i] ?? 0) % 32];
    return time + rest;
  }
}
