package com.lekman.qualify.internal.execution;

import org.jspecify.annotations.Nullable;

/** An attachment held until the test ends, not yet redacted: a JSON value or bytes. */
public final class PendingAttachment {

  private final String filename;
  private final String contentType;
  private final @Nullable Object json;
  private final byte @Nullable [] bytes;

  private PendingAttachment(
      String filename, String contentType, @Nullable Object json, byte @Nullable [] bytes) {
    this.filename = filename;
    this.contentType = contentType;
    this.json = json;
    this.bytes = bytes;
  }

  /** A JSON attachment holding a normalised value. */
  public static PendingAttachment ofJson(
      String filename, String contentType, @Nullable Object json) {
    return new PendingAttachment(filename, contentType, json, null);
  }

  /** An attachment holding bytes. */
  public static PendingAttachment ofBytes(String filename, String contentType, byte[] bytes) {
    return new PendingAttachment(filename, contentType, null, bytes.clone());
  }

  /** The bytes of a byte attachment; a copy. */
  public byte[] bytes() {
    if (bytes == null) {
      throw new IllegalStateException(filename + " is a JSON attachment");
    }
    return bytes.clone();
  }

  /** The content type. */
  public String contentType() {
    return contentType;
  }

  /** The file name. */
  public String filename() {
    return filename;
  }

  /** Whether it is held as a JSON value. */
  public boolean isJson() {
    return bytes == null;
  }

  /** The normalised value of a JSON attachment. */
  public @Nullable Object json() {
    return json;
  }
}
