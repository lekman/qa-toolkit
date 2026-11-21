package com.lekman.qualify.cli;

import com.lekman.qualify.internal.envelope.GitFacts;
import java.io.IOException;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;

/** Everything the CLI reads from and writes to, so the commands can be tested without a process. */
public interface CliIO {

  /** The environment variables. */
  Map<String, String> env();

  /** The working directory. */
  Path cwd();

  /** The current time. */
  Instant now();

  /** What git says about a directory. */
  GitFacts git(Path directory);

  /** The names in a directory, or {@code null} when it does not exist. */
  @Nullable List<String> list(Path directory) throws IOException;

  /** A file's bytes. */
  byte[] read(Path path) throws IOException;

  /** Write a file atomically. */
  void write(Path path, byte[] bytes) throws IOException;

  /** Write to standard output. */
  void stdout(String text);

  /** Write to standard error. */
  void stderr(String text);
}
