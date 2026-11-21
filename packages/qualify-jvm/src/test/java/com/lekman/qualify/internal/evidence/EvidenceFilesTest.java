package com.lekman.qualify.internal.evidence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class EvidenceFilesTest {

  @TempDir Path temp;

  @Test
  void namesParseBack() {
    String key = EvidenceFiles.key("a.java:1");
    assertEquals(8, key.length());
    String name = EvidenceFiles.record("01HQA1ZQJ0C0NF0RMANCE00000", "OQ-A1-001", key);
    EvidenceFiles.Name parsed = EvidenceFiles.parse(name).orElseThrow();
    assertEquals("OQ-A1-001", parsed.testId());
    assertTrue(
        EvidenceFiles.parse(EvidenceFiles.marker("01HQA1ZQJ0C0NF0RMANCE00000", "OQ-A1-001", key))
            .orElseThrow()
            .started());
    assertEquals(Optional.empty(), EvidenceFiles.parse("x.json"));
    assertEquals(
        "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824  f.json\n",
        EvidenceFiles.sidecar("hello".getBytes(StandardCharsets.UTF_8), "f.json"));
  }

  @Test
  void writesAreAtomicAndReplace() throws IOException {
    Path file = temp.resolve("a/b/file.json");
    EvidenceWriter.write(file, "one".getBytes(StandardCharsets.UTF_8));
    EvidenceWriter.write(file, "two".getBytes(StandardCharsets.UTF_8));
    assertEquals("two", Files.readString(file));
    try (var files = Files.list(file.getParent())) {
      assertEquals(1, files.count());
    }
  }
}
