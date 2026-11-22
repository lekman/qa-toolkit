package com.lekman.qualify.conformance.harness;

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.graphics.PDXObject;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;

/**
 * The images each page places, for scenario 23: the image XObjects in the page's resources, with
 * their pixel sizes. A transparency mask hangs off its image, not off the page, so it is not
 * listed.
 */
final class PdfImages {

  private PdfImages() {}

  /** Every page's images as {@code <width>x<height>}, in page order. */
  static List<List<String>> extract(Path file) throws IOException {
    try (PDDocument document = Loader.loadPDF(file.toFile())) {
      List<List<String>> pages = new ArrayList<>();
      for (int n = 0; n < document.getNumberOfPages(); n++) {
        List<String> images = new ArrayList<>();
        PDResources resources = document.getPage(n).getResources();
        if (resources != null) {
          for (COSName name : resources.getXObjectNames()) {
            PDXObject xobject = resources.getXObject(name);
            if (xobject instanceof PDImageXObject image) {
              images.add(image.getWidth() + "x" + image.getHeight());
            }
          }
        }
        pages.add(images);
      }
      return pages;
    }
  }
}
