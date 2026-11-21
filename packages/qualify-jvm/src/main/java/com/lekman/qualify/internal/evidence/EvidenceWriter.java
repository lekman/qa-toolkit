package com.lekman.qualify.internal.evidence;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.util.UUID;

/**
 * Writes files atomically: to a temporary file in the same directory, whose name starts with a dot,
 * then flushed to disk and renamed over the target.
 */
public final class EvidenceWriter {

  private EvidenceWriter() {}

  /** Write bytes to a path atomically, creating its directory. */
  public static void write(Path path, byte[] bytes) throws IOException {
    Path dir =
        java.util.Objects.requireNonNull(
            path.toAbsolutePath().getParent(), "a file has a directory");
    Files.createDirectories(dir);
    Path temp = dir.resolve("." + path.getFileName() + "." + UUID.randomUUID() + ".tmp");
    try {
      try (FileChannel channel =
          FileChannel.open(temp, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
        ByteBuffer buffer = ByteBuffer.wrap(bytes);
        while (buffer.hasRemaining()) {
          channel.write(buffer);
        }
        channel.force(true);
      }
      try {
        Files.move(temp, path, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
      } catch (AtomicMoveNotSupportedException e) {
        Files.move(temp, path, StandardCopyOption.REPLACE_EXISTING);
      }
    } finally {
      Files.deleteIfExists(temp);
    }
  }
}
