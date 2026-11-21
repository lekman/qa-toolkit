package com.lekman.qualify.cli;

import com.lekman.qualify.internal.envelope.GitFacts;
import com.lekman.qualify.internal.envelope.GitProbe;
import com.lekman.qualify.internal.evidence.EvidenceWriter;
import java.io.IOException;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.jspecify.annotations.Nullable;

/** {@code java -jar qualify-<version>-cli.jar <command> ...}: the CLI on the real process. */
public final class Main {

  private Main() {}

  /** Run a command and exit with its code. */
  public static void main(String[] args) {
    System.exit(Commands.run(List.of(args), new ProcessIO()));
  }

  /** The process's own environment, files and streams. */
  static final class ProcessIO implements CliIO {
    private final PrintStream out = new PrintStream(System.out, true, StandardCharsets.UTF_8);
    private final PrintStream err = new PrintStream(System.err, true, StandardCharsets.UTF_8);

    @Override
    public Path cwd() {
      return Path.of("").toAbsolutePath();
    }

    @Override
    public Map<String, String> env() {
      return System.getenv();
    }

    @Override
    public GitFacts git(Path directory) {
      return GitProbe.read(directory);
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
      return Instant.ofEpochMilli(System.currentTimeMillis());
    }

    @Override
    public byte[] read(Path path) throws IOException {
      return Files.readAllBytes(path);
    }

    @Override
    public void stderr(String text) {
      err.print(text);
    }

    @Override
    public void stdout(String text) {
      out.print(text);
    }

    @Override
    public void write(Path path, byte[] bytes) throws IOException {
      EvidenceWriter.write(path, bytes);
    }
  }
}
