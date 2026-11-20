package com.lekman.qualify.internal.evidence;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** File names inside an evidence directory, section 6 of the specification. */
public final class EvidenceFiles {

  /** The run file name. */
  public static final String RUN_FILE = "test-evidence.json";

  private static final Pattern NAME =
      Pattern.compile(
          "^([0-9A-HJKMNP-TV-Z]{26})__((?:IQ|OQ|PQ|IU)-[A-Z][A-Z0-9]{1,15}-[0-9]{3,})__([0-9a-f]{8})\\.(started|json)$");

  private EvidenceFiles() {}

  /**
   * A record or marker file name, split into its parts.
   *
   * @param runId the run ID
   * @param testId the test ID
   * @param key the instance key
   * @param started whether it is a started marker
   * @param stem the name without its extension
   */
  public record Name(String runId, String testId, String key, boolean started, String stem) {}

  /** The instance key: the first 8 hex digits of the SHA-256 of the declaration's site. */
  public static String key(String site) {
    return sha256(site.getBytes(StandardCharsets.UTF_8)).substring(0, 8);
  }

  /** {@code <runId>__<testId>__<key>.started} */
  public static String marker(String runId, String testId, String key) {
    return runId + "__" + testId + "__" + key + ".started";
  }

  /** Split a record or marker file name; empty for any other name. */
  public static Optional<Name> parse(String name) {
    Matcher m = NAME.matcher(name);
    if (!m.matches()) {
      return Optional.empty();
    }
    return Optional.of(
        new Name(
            m.group(1),
            m.group(2),
            m.group(3),
            m.group(4).equals("started"),
            m.group(1) + "__" + m.group(2) + "__" + m.group(3)));
  }

  /** {@code <runId>__<testId>__<key>.json} */
  public static String record(String runId, String testId, String key) {
    return runId + "__" + testId + "__" + key + ".json";
  }

  /** The lowercase hex SHA-256 of some bytes. */
  public static String sha256(byte[] bytes) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("every Java runtime has SHA-256", e);
    }
  }

  /** The {@code .sha256} sidecar text: digest, two spaces, file name, newline. */
  public static String sidecar(byte[] content, String fileName) {
    return sha256(content) + "  " + fileName + "\n";
  }
}
