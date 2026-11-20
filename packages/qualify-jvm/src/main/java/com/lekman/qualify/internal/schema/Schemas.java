package com.lekman.qualify.internal.schema;

import com.lekman.qualify.internal.json.Json;
import com.lekman.qualify.internal.json.JsonFormatException;
import com.networknt.schema.Error;
import com.networknt.schema.Schema;
import com.networknt.schema.SchemaRegistry;
import com.networknt.schema.SpecificationVersion;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import tools.jackson.databind.JsonNode;

/**
 * Validation against the specification's JSON Schemas, which the build copies from {@code
 * spec/qualify} into the jar.
 */
public final class Schemas {

  private static final Schema EVIDENCE = load("evidence.schema.json");
  private static final Schema TRACE = load("trace.schema.json");

  private Schemas() {}

  /** Problems with an evidence file (marker, record or run file); empty when valid. */
  public static List<String> evidence(JsonNode file) {
    return problems(EVIDENCE, file);
  }

  /** Problems with a value of the JSON model as an evidence file. */
  public static List<String> evidence(Object file) {
    return evidence(Json.toNode(file));
  }

  /** Problems with a trace file; empty when valid. */
  public static List<String> trace(JsonNode file) {
    return problems(TRACE, file);
  }

  private static Schema load(String name) {
    try (InputStream in = Schemas.class.getResourceAsStream("/com/lekman/qualify/schema/" + name)) {
      if (in == null) {
        throw new IllegalStateException("the jar does not hold " + name);
      }
      String text = new String(in.readAllBytes(), StandardCharsets.UTF_8);
      return SchemaRegistry.withDefaultDialect(SpecificationVersion.DRAFT_2020_12)
          .getSchema(Json.parseNode(text));
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    } catch (JsonFormatException e) {
      throw new IllegalStateException(name + " is not valid JSON", e);
    }
  }

  private static List<String> problems(Schema schema, JsonNode file) {
    List<String> problems = new ArrayList<>();
    for (Error error : schema.validate(file)) {
      problems.add(error.toString());
    }
    return problems;
  }
}
