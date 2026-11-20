package com.lekman.qualify.cli;

import com.lekman.qualify.internal.envelope.GitFacts;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.jspecify.annotations.Nullable;

/**
 * The CLI's I/O over a real folder, with captured output, a fixed time and a chosen environment.
 */
final class TestIO implements CliIO {
  final Path cwd;
  final Map<String, String> env = new HashMap<>();
  final StringBuilder out = new StringBuilder();
  final StringBuilder err = new StringBuilder();

  TestIO(Path cwd) {
    this.cwd = cwd;
  }

  @Override
  public Path cwd() {
    return cwd;
  }

  @Override
  public Map<String, String> env() {
    return env;
  }

  @Override
  public GitFacts git(Path directory) {
    return GitFacts.NONE;
  }

  @Override
  public @Nullable List<String> list(Path directory) throws IOException {
    if (!Files.isDirectory(directory)) {
      return null;
    }
    try (Stream<Path> files = Files.list(directory)) {
      return files.map(p -> p.getFileName().toString()).sorted().toList();
    }
  }

  @Override
  public Instant now() {
    return Instant.parse("2026-03-04T05:06:07.008Z");
  }

  @Override
  public byte[] read(Path path) throws IOException {
    return Files.readAllBytes(path);
  }

  @Override
  public void stderr(String text) {
    err.append(text);
  }

  @Override
  public void stdout(String text) {
    out.append(text);
  }

  @Override
  public void write(Path path, byte[] bytes) throws IOException {
    Files.createDirectories(path.toAbsolutePath().getParent());
    Files.write(path, bytes);
  }
}
