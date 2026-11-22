import type { AttachmentRecord } from "../evidence";
import type { ImageFormat, ImageSize } from "./types";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const JPEG = [0xff, 0xd8, 0xff] as const;

/**
 * Image attachments in the report, section 9.2: which attachments are drawn,
 * how large, and the lines that go with them. Pure: the PDF library decodes
 * the bytes later.
 */
export class ReportImages {
  /** `<file name>, <size> bytes, SHA-256 <first 12 characters of sha256>` */
  static caption(attachment: AttachmentRecord): string {
    return `${attachment.filename}, ${attachment.sizeBytes} bytes, SHA-256 ${attachment.sha256.slice(0, 12)}`;
  }

  /**
   * The size to draw an image at: one pixel is one point, scaled down to fit
   * the box with its aspect ratio kept, and never scaled up.
   */
  static fit(pixels: ImageSize, box: ImageSize): ImageSize {
    const scale = Math.min(
      1,
      box.width / pixels.width,
      box.height / pixels.height,
    );
    return { width: pixels.width * scale, height: pixels.height * scale };
  }

  /** The image format of a content type, or `null` for one the report does not draw. */
  static format(contentType: string): ImageFormat | null {
    if (contentType === "image/png") return "png";
    if (contentType === "image/jpeg") return "jpeg";
    return null;
  }

  /** Whether the bytes start with the signature of their format. */
  static signed(bytes: Uint8Array, format: ImageFormat): boolean {
    const signature = format === "png" ? PNG : JPEG;
    return (
      bytes.length >= signature.length &&
      signature.every((byte, i) => bytes[i] === byte)
    );
  }

  /** The line drawn in place of an image that cannot be read. */
  static unreadable(attachment: AttachmentRecord): string {
    return `${attachment.filename} could not be read as ${attachment.contentType}, so it is not drawn.`;
  }
}
