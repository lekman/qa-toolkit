package com.lekman.qualify.internal.envelope;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.lekman.qualify.internal.ulid.Ulid;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;

class EnvelopeTest {

  @Test
  void githubActionsNamesTheActorAndTheRun() {
    Map<String, String> env =
        Map.of(
            "GITHUB_ACTIONS", "true",
            "GITHUB_ACTOR", "octo",
            "GITHUB_SERVER_URL", "https://github.com",
            "GITHUB_REPOSITORY", "acme/app",
            "GITHUB_RUN_ID", "7",
            "GITHUB_HEAD_REF", "feat/x");
    Map<String, Object> actor = Envelope.actor(env);
    assertEquals("octo", actor.get("name"));
    assertEquals("github-actions", actor.get("ci"));
    assertEquals("https://github.com/acme/app/actions/runs/7", actor.get("ciRunUrl"));
    GitFacts detached = new GitFacts("/r", "0123456789abcdef0123456789abcdef01234567", null, false);
    assertEquals("feat/x", Envelope.source(detached, env).get("branch"));
    Map<String, String> partial = new HashMap<>(env);
    partial.remove("GITHUB_RUN_ID");
    partial.remove("GITHUB_HEAD_REF");
    partial.put("GITHUB_REF_NAME", "main");
    assertNull(Envelope.actor(partial).get("ciRunUrl"));
    assertEquals("main", Envelope.source(detached, partial).get("branch"));
  }

  @Test
  void outsideCiTheUserNamesTheActor() {
    assertEquals("dev", Envelope.actor(Map.of("USERNAME", "dev")).get("name"));
    assertEquals("me", Envelope.actor(Map.of("USER", "me", "USERNAME", "dev")).get("name"));
    assertNull(Envelope.source(new GitFacts(null, "not-a-sha", "", null), Map.of()).get("commit"));
  }

  @Test
  void targetsComeFromQualifyTargetVariables() {
    Map<String, Object> target =
        Envelope.target(
            Map.of(
                "QUALIFY_TARGET_DIGEST",
                "sha256:1",
                "QUALIFY_TARGET_IMAGE_TAG",
                "",
                "QUALIFY_TARGET_",
                "x"));
    assertEquals("sha256:1", target.get("digest"));
    assertTrue(target.containsKey("image_tag"));
    assertNull(target.get("image_tag"));
    assertEquals(2, target.size());
  }

  @Test
  void gitIsReadWhereThereIsARepository() {
    GitFacts facts = GitProbe.read(Path.of("").toAbsolutePath());
    assertNotNull(facts.root());
    assertNotNull(facts.commit());
    assertEquals(GitFacts.NONE, GitProbe.read(Path.of(System.getProperty("java.io.tmpdir"))));
  }

  @Test
  void ulidsAreCrockfordBase32() {
    assertEquals("0000000000" + "0000000000000000", Ulid.create(0, new byte[10]));
    assertEquals(
        "7ZZZZZZZZZ" + "ZZZZZZZZZZZZZZZZ", Ulid.create((1L << 48) - 1, filled((byte) 0xFF)));
    assertTrue(Ulid.isValid(Ulid.next(System.currentTimeMillis())));
    assertThrows(IllegalArgumentException.class, () -> Ulid.create(-1, new byte[10]));
    assertThrows(IllegalArgumentException.class, () -> Ulid.create(0, new byte[9]));
  }

  private static byte[] filled(byte value) {
    byte[] bytes = new byte[10];
    java.util.Arrays.fill(bytes, value);
    return bytes;
  }
}
