package com.lekman.qualify.internal.report;

import com.lekman.qualify.internal.theme.TokenValues;
import java.time.Instant;
import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * Everything the renderer needs: the cover, the content, the page texts and the metadata.
 *
 * @param cover what the cover shows
 * @param blocks the content after the cover
 * @param header the header template
 * @param footer the footer template
 * @param classification drawn on the right of every header
 * @param tokens token values for the header and footer
 * @param metadata the PDF document information
 * @param images the image attachments, in the order the image blocks refer to them
 */
public record ReportDocument(
    Cover cover,
    List<Block> blocks,
    String header,
    String footer,
    String classification,
    TokenValues tokens,
    Metadata metadata,
    List<ReportImages.Source> images) {

  /**
   * The cover page, section 9.1.
   *
   * @param brandName the text beside the logo, or {@code null}
   * @param title the title
   * @param subtitle the subtitle
   * @param fields the metadata rows
   */
  public record Cover(
      @Nullable String brandName, String title, String subtitle, List<Block.Field> fields) {}

  /**
   * The PDF's document information.
   *
   * @param title the title
   * @param subject the run ID
   * @param keywords {@code sha256:<digest>}
   * @param producer the package name and version
   * @param creationDate the generation time
   */
  public record Metadata(
      String title, String subject, String keywords, String producer, Instant creationDate) {}
}
