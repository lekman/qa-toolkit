const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** ULIDs: 48 bits of milliseconds and 80 random bits, in Crockford base32. */
export class Ulid {
  /**
   * Create a ULID from a time and 10 random bytes. Pass the bytes in so the
   * result is reproducible in tests.
   */
  static create(time: number, random: Uint8Array): string {
    if (!Number.isSafeInteger(time) || time < 0 || time >= 2 ** 48) {
      throw new RangeError("ULID time must be a 48-bit count of milliseconds");
    }
    if (random.length !== 10) {
      throw new RangeError("ULID randomness must be 10 bytes");
    }
    let timePart = "";
    let rest = time;
    for (let i = 0; i < 10; i++) {
      timePart = ALPHABET[rest % 32] + timePart;
      rest = Math.floor(rest / 32);
    }
    let bits = 0n;
    for (const byte of random) bits = (bits << 8n) | BigInt(byte);
    let randomPart = "";
    for (let i = 0; i < 16; i++) {
      randomPart = ALPHABET[Number(bits & 31n)] + randomPart;
      bits >>= 5n;
    }
    return timePart + randomPart;
  }

  /** Whether a string is a ULID. */
  static isValid(value: unknown): value is string {
    return typeof value === "string" && PATTERN.test(value);
  }
}
