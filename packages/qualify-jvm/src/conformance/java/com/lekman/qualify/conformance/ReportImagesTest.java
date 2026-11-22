package com.lekman.qualify.conformance;

import static com.lekman.qualify.conformance.Fixture.GIVEN;
import static com.lekman.qualify.conformance.Fixture.THEN;
import static com.lekman.qualify.conformance.Fixture.WHEN;

import com.lekman.qualify.OQ;
import com.lekman.qualify.QualifyContext;
import com.lekman.qualify.Scope;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Scenario 23, {@code report-images}: PNG and JPEG attachments, bytes that are not an image, and a
 * text file. The image files come from the specification's fixtures.
 */
class ReportImagesTest {

  /** The fixture folder, found by walking up from the working directory. */
  private static Path images() {
    for (Path dir = Path.of("").toAbsolutePath(); dir != null; dir = dir.getParent()) {
      Path candidate = dir.resolve("spec/qualify/conformance/fixtures/images");
      if (Files.isDirectory(candidate)) {
        return candidate;
      }
    }
    throw new IllegalStateException("spec/qualify/conformance/fixtures/images not found");
  }

  @OQ(
      id = "OQ-CONF-024",
      title = "report-images test",
      given = GIVEN,
      when = WHEN,
      then = THEN,
      scope = Scope.READ)
  void attachesImages(QualifyContext ctx) throws IOException {
    Path images = images();
    ctx.attach("screen.png", Files.readAllBytes(images.resolve("screen.png")), "image/png");
    ctx.attach("tall.jpg", Files.readAllBytes(images.resolve("tall.jpg")), "image/jpeg");
    ctx.attach("broken.png", "not an image".getBytes(StandardCharsets.UTF_8), "image/png");
    ctx.attach("icon.png", Files.readAllBytes(images.resolve("icon.png")), "image/png");
    ctx.attach("note.txt", "hello\n", "text/plain");
    ctx.check("fixture", "one equals one").that(1).isEqualTo(1);
  }
}
