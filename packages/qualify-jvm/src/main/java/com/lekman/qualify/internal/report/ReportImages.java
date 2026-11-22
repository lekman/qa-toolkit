package com.lekman.qualify.internal.report;

import java.util.Map;
import org.jspecify.annotations.Nullable;

/**
 * Image attachments in the report, section 9.2 of the specification: which attachments are drawn,
 * how large, and the lines that go with them. Pure: the PDF library decodes the bytes later.
 */
public final class ReportImages {

  private static final byte[] PNG = {
    (byte) 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  };
  private static final byte[] JPEG = {(byte) 0xff, (byte) 0xd8, (byte) 0xff};

  private ReportImages() {}

  /** An image format the report draws. */
  public enum Format {
    /** {@code image/png} */
    PNG,
    /** {@code image/jpeg} */
    JPEG
  }

  /**
   * A width and a height: pixels for an image file, points on a page.
   *
   * @param width the width
   * @param height the height
   */
  public record Size(double width, double height) {}

  /** The bytes of an image attachment, as the evidence holds them, and their format. */
  public static final class Source {
    private final byte[] bytes;
    private final Format format;

    /**
     * An image attachment.
     *
     * @param bytes the bytes
     * @param format the format its content type names
     */
    public Source(byte[] bytes, Format format) {
      this.bytes = bytes.clone();
      this.format = format;
    }

    /** A copy of the bytes. */
    public byte[] bytes() {
      return bytes.clone();
    }

    /** The format its content type names. */
    public Format format() {
      return format;
    }
  }

  /**
   * {@code <file name>, <size> bytes, SHA-256 <first 12 characters of sha256>}
   *
   * @param attachment an attachment of a test record
   */
  public static String caption(Map<String, Object> attachment) {
    String sha256 = String.valueOf(attachment.get("sha256"));
    return attachment.get("filename")
        + ", "
        + attachment.get("sizeBytes")
        + " bytes, SHA-256 "
        + sha256.substring(0, Math.min(12, sha256.length()));
  }

  /**
   * The size to draw an image at: one pixel is one point, scaled down to fit the box with its
   * aspect ratio kept, and never scaled up.
   */
  public static Size fit(Size pixels, Size box) {
    double scale =
        Math.min(1, Math.min(box.width() / pixels.width(), box.height() / pixels.height()));
    return new Size(pixels.width() * scale, pixels.height() * scale);
  }

  /** The image format of a content type, or {@code null} for one the report does not draw. */
  public static @Nullable Format format(String contentType) {
    if ("image/png".equals(contentType)) {
      return Format.PNG;
    }
    if ("image/jpeg".equals(contentType)) {
      return Format.JPEG;
    }
    return null;
  }

  /** Whether the bytes start with the signature of their format. */
  public static boolean signed(byte[] bytes, Format format) {
    byte[] signature = format == Format.PNG ? PNG : JPEG;
    if (bytes.length < signature.length) {
      return false;
    }
    for (int i = 0; i < signature.length; i++) {
      if (bytes[i] != signature[i]) {
        return false;
      }
    }
    return true;
  }

  /**
   * The line drawn in place of an image that cannot be read.
   *
   * @param attachment an attachment of a test record
   */
  public static String unreadable(Map<String, Object> attachment) {
    return attachment.get("filename")
        + " could not be read as "
        + attachment.get("contentType")
        + ", so it is not drawn.";
  }
}
