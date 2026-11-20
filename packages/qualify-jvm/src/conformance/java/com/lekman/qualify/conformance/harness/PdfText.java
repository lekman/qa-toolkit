package com.lekman.qualify.conformance.harness;

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.text.PDFTextStripper;

/**
 * Text extraction from a PDF with PDFBox's {@link PDFTextStripper}, for the report scenarios. Text
 * on one baseline of a page becomes one line, left to right; runs of whitespace collapse to one
 * space and empty lines are dropped, as scenario 21 describes.
 *
 * @param pages every page's lines, in page order
 * @param info the document information, raw: Title, Subject, Keywords, CreationDate
 */
record PdfText(List<List<String>> pages, Map<String, String> info) {

  /** Extract the text and the document information of a PDF file. */
  static PdfText extract(Path file) throws IOException {
    try (PDDocument document = Loader.loadPDF(file.toFile())) {
      List<List<String>> pages = new ArrayList<>();
      PDFTextStripper stripper = new PDFTextStripper();
      stripper.setSortByPosition(true);
      for (int n = 1; n <= document.getNumberOfPages(); n++) {
        stripper.setStartPage(n);
        stripper.setEndPage(n);
        List<String> lines = new ArrayList<>();
        for (String line : stripper.getText(document).split("\\R", -1)) {
          String collapsed = line.replaceAll("\\s+", " ").trim();
          if (!collapsed.isEmpty()) {
            lines.add(collapsed);
          }
        }
        pages.add(lines);
      }
      PDDocumentInformation information = document.getDocumentInformation();
      Map<String, String> info = new TreeMap<>();
      info.put("Title", String.valueOf(information.getTitle()));
      info.put("Subject", String.valueOf(information.getSubject()));
      info.put("Keywords", String.valueOf(information.getKeywords()));
      info.put(
          "CreationDate",
          String.valueOf(information.getCOSObject().getString(COSName.CREATION_DATE)));
      return new PdfText(pages, info);
    }
  }

  /** Every page's lines, in order. */
  List<String> lines() {
    List<String> all = new ArrayList<>();
    pages.forEach(all::addAll);
    return all;
  }

  /**
   * The first outline line not found in order: each is found inside a line at or after the end of
   * the previous match. {@code null} when every line is found.
   */
  static String missingFromOutline(List<String> lines, List<String> outline) {
    int at = 0;
    int offset = 0;
    for (String wanted : outline) {
      boolean found = false;
      for (; at < lines.size(); at++, offset = 0) {
        int index = lines.get(at).indexOf(wanted, offset);
        if (index >= 0) {
          offset = index + wanted.length();
          found = true;
          break;
        }
      }
      if (!found) {
        return wanted;
      }
    }
    return null;
  }
}
