package com.lekman.qualify;

/** An attachment over the size limit. The outcome is {@code error}. */
public class AttachmentTooLarge extends RuntimeException {

  private static final long serialVersionUID = 1L;

  /** An attachment over the limit, with the message the specification gives. */
  public AttachmentTooLarge(String message) {
    super(message);
  }
}
