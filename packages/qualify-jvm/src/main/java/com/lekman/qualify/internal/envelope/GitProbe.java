package com.lekman.qualify.internal.envelope;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.jspecify.annotations.Nullable;

/** Runs {@code git} to read the commit, branch and state of the working tree. */
public final class GitProbe {

  private GitProbe() {}

  /** Read the facts for a directory. Every value is {@code null} when git is unavailable. */
  public static GitFacts read(Path directory) {
    String root = git(directory, "rev-parse", "--show-toplevel");
    if (root == null) {
      return GitFacts.NONE;
    }
    String status = git(directory, "status", "--porcelain", "--untracked-files=no");
    return new GitFacts(
        root,
        git(directory, "rev-parse", "HEAD"),
        git(directory, "symbolic-ref", "--quiet", "--short", "HEAD"),
        status == null ? null : !status.isEmpty());
  }

  private static @Nullable String git(Path directory, String... args) {
    List<String> command = new ArrayList<>();
    command.add("git");
    command.addAll(List.of(args));
    try {
      Process process =
          new ProcessBuilder(command)
              .directory(directory.toFile())
              .redirectError(ProcessBuilder.Redirect.DISCARD)
              .redirectInput(ProcessBuilder.Redirect.PIPE)
              .start();
      process.getOutputStream().close();
      String output;
      try (InputStream in = process.getInputStream()) {
        output = new String(in.readAllBytes(), StandardCharsets.UTF_8);
      }
      if (!process.waitFor(30, TimeUnit.SECONDS)) {
        process.destroyForcibly();
        return null;
      }
      return process.exitValue() == 0 ? output.strip() : null;
    } catch (IOException e) {
      return null;
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      return null;
    }
  }
}
