package com.lekman.qualify.conformance.harness;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import javax.imageio.ImageIO;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;

/**
 * Renders the first pages of a PDF to PNG with PDFBox's {@link PDFRenderer}, to look at the glyphs
 * as drawn. Arguments: the PDF, the output folder, the file name prefix, and the page count.
 */
public final class RenderPages {

  private RenderPages() {}

  /** Render pages 1 to n as {@code <prefix>-page-<n>.png}. */
  public static void main(String[] args) throws IOException {
    Path pdf = Path.of(args[0]);
    Path out = Path.of(args[1]);
    int count = Integer.parseInt(args[3]);
    Files.createDirectories(out);
    try (PDDocument document = Loader.loadPDF(pdf.toFile())) {
      PDFRenderer renderer = new PDFRenderer(document);
      for (int page = 0; page < Math.min(count, document.getNumberOfPages()); page++) {
        BufferedImage image = renderer.renderImageWithDPI(page, 110, ImageType.RGB);
        Path file = out.resolve(args[2] + "-page-" + (page + 1) + ".png");
        ImageIO.write(image, "png", file.toFile());
        System.out.println("wrote " + file);
      }
    }
  }
}
