package com.lekman.qualify.internal.ulid;

import java.security.SecureRandom;
import java.util.regex.Pattern;

/** ULIDs: 48 bits of milliseconds and 80 random bits, in Crockford base32. */
public final class Ulid {

  private static final String ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  private static final Pattern PATTERN = Pattern.compile("^[0-9A-HJKMNP-TV-Z]{26}$");
  private static final SecureRandom RANDOM = new SecureRandom();

  private Ulid() {}

  /** A ULID from a time and 10 random bytes; pass the bytes in for a reproducible result. */
  public static String create(long time, byte[] random) {
    if (time < 0 || time >= (1L << 48)) {
      throw new IllegalArgumentException("ULID time must be a 48-bit count of milliseconds");
    }
    if (random.length != 10) {
      throw new IllegalArgumentException("ULID randomness must be 10 bytes");
    }
    char[] out = new char[26];
    long rest = time;
    for (int i = 9; i >= 0; i--) {
      out[i] = ALPHABET.charAt((int) (rest & 31));
      rest >>>= 5;
    }
    java.math.BigInteger bits = new java.math.BigInteger(1, random);
    for (int i = 25; i >= 10; i--) {
      out[i] = ALPHABET.charAt(bits.intValue() & 31);
      bits = bits.shiftRight(5);
    }
    return new String(out);
  }

  /** A new ULID for the current time. */
  public static String next(long time) {
    byte[] random = new byte[10];
    RANDOM.nextBytes(random);
    return create(time, random);
  }

  /** Whether a string is a ULID. */
  public static boolean isValid(String value) {
    return value != null && PATTERN.matcher(value).matches();
  }
}
