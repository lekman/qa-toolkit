package com.lekman.qualify.internal.execution;

import com.lekman.qualify.internal.evidence.EvidenceFiles;
import com.lekman.qualify.internal.json.Json;
import com.lekman.qualify.internal.json.JsonFormatException;
import com.lekman.qualify.internal.redaction.Redaction;
import com.lekman.qualify.internal.values.Values;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/** Attachments, section 7.3 of the specification. */
public final class Attachments {

  private static final Pattern JSON_TYPE =
      Pattern.compile("^application/json\\s*(;.*)?$", Pattern.CASE_INSENSITIVE);

  private Attachments() {}

  /**
   * Redact and encode one attachment. A JSON attachment is redacted as JSON, then written like an
   * evidence file; any other is redacted as bytes.
   */
  public static Map<String, Object> finalise(PendingAttachment pending, List<String> registered) {
    byte[] bytes =
        pending.isJson()
            ? Json.document(Redaction.json(pending.json(), registered))
                .getBytes(StandardCharsets.UTF_8)
            : Redaction.bytes(pending.bytes(), registered);
    Map<String, Object> json = new LinkedHashMap<>();
    json.put("filename", Redaction.text(pending.filename(), registered));
    json.put("contentType", pending.contentType());
    json.put("encoding", "base64");
    json.put("content", Base64.getEncoder().encodeToString(bytes));
    json.put("sizeBytes", (long) bytes.length);
    json.put("sha256", EvidenceFiles.sha256(bytes));
    return json;
  }

  /** Whether a content type is {@code application/json}, with or without parameters. */
  public static boolean isJsonType(String contentType) {
    return JSON_TYPE.matcher(contentType.trim()).matches();
  }

  /**
   * Hold an attachment: JSON text or a JSON value is parsed and normalised, JSON text that does not
   * parse is kept as bytes, and anything else keeps its bytes.
   */
  public static PendingAttachment pending(String filename, Object body, String contentType) {
    boolean json = isJsonType(contentType);
    if (body instanceof String || body instanceof byte[]) {
      byte[] bytes =
          body instanceof String text
              ? text.getBytes(StandardCharsets.UTF_8)
              : ((byte[]) body).clone();
      if (json) {
        try {
          return PendingAttachment.ofJson(
              filename,
              contentType,
              Values.normalise(Json.parse(new String(bytes, StandardCharsets.UTF_8))));
        } catch (JsonFormatException e) {
          // Not valid JSON: keep the bytes as given.
        }
      }
      return PendingAttachment.ofBytes(filename, contentType, bytes);
    }
    if (!json) {
      throw new IllegalArgumentException(
          "attachment "
              + filename
              + ": only application/json takes an object body; pass a String or byte[]");
    }
    return PendingAttachment.ofJson(filename, contentType, Values.normalise(body));
  }

  /** The size of a held attachment, before redaction. */
  public static long size(PendingAttachment pending) {
    return pending.isJson()
        ? Json.document(pending.json()).getBytes(StandardCharsets.UTF_8).length
        : pending.bytes().length;
  }
}
