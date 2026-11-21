package com.lekman.qualify.internal.site;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class SitesTest {

  private static final Path CWD = Path.of("").toAbsolutePath();
  private static final Path REPO =
      Path.of(System.getProperty("qualify.repoRoot")).toAbsolutePath().normalize();

  int sample(String text) {
    return text.length();
  }

  @Test
  void aMethodsSiteIsItsFileAndFirstLine() throws NoSuchMethodException {
    Sites sites = new Sites(CWD, REPO, List.of());
    String site = sites.declaration(SitesTest.class.getDeclaredMethod("sample", String.class));
    assertTrue(
        site.matches(
            "packages/qualify-jvm/src/test/java/com/lekman/qualify/internal/site/SitesTest\\.java:2\\d"),
        site);
    assertEquals(
        "(Ljava/lang/String;)I",
        ClassFiles.descriptor(SitesTest.class.getDeclaredMethod("sample", String.class)));
  }

  @Test
  void theCallerIsTheFirstFrameOutsideQualify() {
    Sites sites = new Sites(CWD, null, List.of("extra"));
    Optional<String> caller = sites.caller();
    assertTrue(
        caller
            .orElseThrow()
            .startsWith("src/test/java/com/lekman/qualify/internal/site/SitesTest.java:"),
        caller.get());
  }

  @Test
  void aFailureIsPlacedInTheTestClass() {
    Sites sites = new Sites(CWD, REPO, List.of());
    Throwable error = new IllegalStateException();
    assertTrue(sites.inClass(error, SitesTest.class).orElseThrow().contains("SitesTest.java:"));
    assertEquals(Optional.empty(), sites.inClass(error, String.class));
  }

  @Test
  void anUnknownFileKeepsItsPackagePath() {
    Sites sites = new Sites(Path.of("/nowhere"), null, List.of());
    assertEquals("com/acme/Thing.kt:7", sites.format("com.acme.Thing", "Thing.kt", 7));
    assertEquals("Odd_Name.java:0", sites.format("Odd", "Odd:Name.java", -1));
  }

  @Test
  void classFilesAreParsed() throws IOException {
    assertThrows(IOException.class, () -> ClassFiles.parse(new byte[] {0, 1, 2, 3}, "m", "()V"));
    ClassFiles.MethodInfo info = ClassFiles.describe(lengthOf());
    assertEquals("String.java", info.sourceFile());
    assertTrue(info.firstLine() > 0);
  }

  private static java.lang.reflect.Method lengthOf() {
    try {
      return String.class.getMethod("length");
    } catch (NoSuchMethodException e) {
      throw new AssertionError(e);
    }
  }
}
