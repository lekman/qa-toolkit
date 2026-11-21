package com.lekman.qualify.cli;

import com.lekman.qualify.ConfigurationError;
import com.lekman.qualify.internal.envelope.Envelope;
import com.lekman.qualify.internal.evidence.EvidenceFiles;
import com.lekman.qualify.internal.evidence.EvidenceShape;
import com.lekman.qualify.internal.execution.Tool;
import com.lekman.qualify.internal.json.Json;
import com.lekman.qualify.internal.json.JsonFormatException;
import com.lekman.qualify.internal.merge.Merge;
import com.lekman.qualify.internal.report.PdfRenderer;
import com.lekman.qualify.internal.report.ReportContent;
import com.lekman.qualify.internal.report.ReportDocument;
import com.lekman.qualify.internal.schema.Schemas;
import com.lekman.qualify.internal.settings.Policy;
import com.lekman.qualify.internal.settings.Settings;
import com.lekman.qualify.internal.settings.SettingsResolver;
import com.lekman.qualify.internal.theme.Theme;
import com.lekman.qualify.internal.theme.ThemeError;
import com.lekman.qualify.internal.theme.ThemeLoader;
import com.lekman.qualify.internal.trace.ProtocolEntry;
import com.lekman.qualify.internal.trace.Trace;
import com.lekman.qualify.internal.trace.TraceInputError;
import com.lekman.qualify.internal.trace.TraceInputs;
import com.lekman.qualify.internal.ulid.Ulid;
import com.lekman.qualify.internal.values.Values;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import tools.jackson.databind.JsonNode;

/** The {@code qualify} commands of the Java package, with all I/O through {@link CliIO}. */
public final class Commands {

  /** Every test passed. */
  public static final int OK = 0;

  /** At least one fail or error. */
  public static final int FAILED = 1;

  /** Invalid input. */
  public static final int INVALID = 2;

  /** Incomplete: no records. */
  public static final int INCOMPLETE = 3;

  /** A usage error. */
  public static final int USAGE = 64;

  private static final Pattern REPORT_TIME =
      Pattern.compile("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?Z$");

  /** The usage text. */
  public static final String USAGE_TEXT =
      """
      Usage:
        qualify merge    [--evidence-dir DIR] [--allow-runs ID,ID] [--out FILE]
        qualify validate FILE...
        qualify report   RUNFILE --pdf FILE [--theme NAME|PATH] [--protocol protocol.yaml]
                         [--map trace.yaml] [--title TEXT] [--subtitle TEXT]
                         [--document-id TEXT] [--classification TEXT]
                         [--signatures ROLE;ROLE;...] [--no-signatures]
        qualify --help | --version

      qualify trace is in the TypeScript package: npx @lekman/qualify trace ...

      Exit codes: 0 pass, 1 fail or error, 2 invalid input, 3 incomplete, 64 usage.
      """;

  private Commands() {}

  /** Run the CLI with arguments, without the program name. Returns the exit code. */
  public static int run(List<String> argv, CliIO io) {
    String command = argv.isEmpty() ? null : argv.get(0);
    List<String> rest = argv.isEmpty() ? List.of() : argv.subList(1, argv.size());
    try {
      if (command == null) {
        throw new UsageError("no command given");
      }
      return switch (command) {
        case "--help", "-h" -> {
          io.stdout(USAGE_TEXT);
          yield OK;
        }
        case "--version", "-v" -> {
          io.stdout(Tool.version() + "\n");
          yield OK;
        }
        case "merge" -> merge(rest, io);
        case "validate" -> validate(rest, io);
        case "report" -> report(rest, io);
        case "trace" -> {
          io.stderr(
              "qualify: trace is part of the TypeScript package; run npx @lekman/qualify trace "
                  + String.join(" ", rest)
                  + "\n");
          yield USAGE;
        }
        default -> throw new UsageError("unknown command " + command);
      };
    } catch (UsageError e) {
      io.stderr("qualify: " + e.getMessage() + "\n\n" + USAGE_TEXT);
      return USAGE;
    } catch (InputError | ConfigurationError | ThemeError | TraceInputError e) {
      io.stderr("qualify: " + e.getMessage() + "\n");
      return INVALID;
    }
  }

  private static Map<String, Object> emptyEnvelope(CliIO io) {
    Settings settings = SettingsResolver.resolve(io.env(), name -> Optional.empty(), null);
    String given = io.env().get("QUALIFY_RUN_ID");
    String runId =
        given != null && Ulid.isValid(given) ? given : Ulid.next(io.now().toEpochMilli());
    return Envelope.build(
        runId,
        settings.environment(),
        Tool.describe("java " + Runtime.version() + "; qualify merge"),
        io.git(io.cwd()),
        io.env(),
        Policy.info(settings));
  }

  private static int merge(List<String> argv, CliIO io) {
    Args args = Args.parse(argv, Set.of("allow-runs", "evidence-dir", "out"), Set.of());
    if (!args.positionals().isEmpty()) {
      throw new UsageError(
          "merge takes no file arguments, got " + String.join(" ", args.positionals()));
    }
    String allowValue = args.value("allow-runs");
    List<String> allowRuns =
        allowValue == null
            ? List.of()
            : Arrays.stream(allowValue.split(",", -1))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
    for (String id : allowRuns) {
      if (!Ulid.isValid(id)) {
        throw new UsageError("--allow-runs: " + id + " is not a run ID");
      }
    }
    String dirValue = args.value("evidence-dir");
    if (dirValue == null) {
      String fromEnv = io.env().get("QUALIFY_EVIDENCE_DIR");
      dirValue =
          fromEnv == null || fromEnv.isEmpty() ? SettingsResolver.DEFAULT_EVIDENCE_DIR : fromEnv;
    }
    Path dir = io.cwd().resolve(dirValue);
    String outValue = args.value("out");
    Path out = outValue == null ? dir.resolve(EvidenceFiles.RUN_FILE) : io.cwd().resolve(outValue);
    Path records = dir.resolve("records");
    List<String> names;
    try {
      List<String> listed = io.list(records);
      names = listed == null ? List.of() : listed;
    } catch (IOException e) {
      throw new InputError("cannot read " + records + ": " + e.getMessage());
    }
    List<Merge.Input> inputs = new ArrayList<>();
    for (String name : names) {
      if (name.startsWith(".")) {
        continue;
      }
      try {
        inputs.add(
            new Merge.Input(
                name, new String(io.read(records.resolve(name)), StandardCharsets.UTF_8)));
      } catch (IOException e) {
        throw new InputError("cannot read " + name + ": " + e.getMessage());
      }
    }
    Merge.Result result =
        Merge.build(inputs, allowRuns, () -> emptyEnvelope(io), () -> Values.timestamp(io.now()));
    Map<String, Object> file = result.file();
    if (file == null) {
      StringBuilder text = new StringBuilder();
      result.errors().forEach(e -> text.append("qualify merge: ").append(e).append('\n'));
      text.append("qualify merge: no run file written\n");
      io.stderr(text.toString());
      return INVALID;
    }
    List<String> problems = Schemas.evidence(file);
    if (!problems.isEmpty()) {
      throw new InputError("the merged run file is not valid: " + String.join("; ", problems));
    }
    byte[] document = Json.document(file, EvidenceShape.FILE).getBytes(StandardCharsets.UTF_8);
    try {
      io.write(out, document);
      io.write(
          out.resolveSibling(out.getFileName() + ".sha256"),
          EvidenceFiles.sidecar(document, out.getFileName().toString())
              .getBytes(StandardCharsets.UTF_8));
    } catch (IOException e) {
      throw new InputError("cannot write " + out + ": " + e.getMessage());
    }
    @SuppressWarnings("unchecked")
    Map<String, Object> s =
        (Map<String, Object>) java.util.Objects.requireNonNull(file.get("summary"));
    io.stdout(
        "qualify merge: "
            + s.get("total")
            + " tests, "
            + s.get("pass")
            + " pass, "
            + s.get("fail")
            + " fail, "
            + s.get("error")
            + " error, "
            + s.get("skip")
            + " skip; verdict "
            + s.get("verdict")
            + "; wrote "
            + out
            + "\n");
    return result.exitCode();
  }

  private static int report(List<String> argv, CliIO io) {
    Args args =
        Args.parse(
            argv,
            Set.of(
                "classification",
                "document-id",
                "map",
                "pdf",
                "protocol",
                "signatures",
                "subtitle",
                "theme",
                "title"),
            Set.of("no-signatures"));
    if (args.positionals().size() != 1) {
      throw new UsageError("report takes exactly one run file");
    }
    String pdf = args.value("pdf");
    if (pdf == null) {
      throw new UsageError("report needs --pdf FILE");
    }
    if (args.flag("no-signatures") && args.value("signatures") != null) {
      throw new UsageError("--signatures and --no-signatures exclude each other");
    }
    List<String> signatures = null;
    if (args.flag("no-signatures")) {
      signatures = List.of();
    } else if (args.value("signatures") != null) {
      signatures =
          Arrays.stream(String.valueOf(args.value("signatures")).split(";", -1))
              .map(String::trim)
              .filter(r -> !r.isEmpty())
              .toList();
      if (signatures.isEmpty()) {
        throw new UsageError("--signatures names no role");
      }
    }
    for (String flag : List.of("title", "document-id", "theme")) {
      String value = args.value(flag);
      if (value != null && value.isBlank()) {
        throw new UsageError("--" + flag + " must not be empty");
      }
    }
    Instant generatedAt = reportTime(io);
    String reference = args.value("theme");
    if (reference == null) {
      String fromEnv = io.env().get("QUALIFY_REPORT_THEME");
      reference = fromEnv == null || fromEnv.isEmpty() ? ThemeLoader.DEFAULT : fromEnv;
    }
    Theme theme = ThemeLoader.load(reference, io.cwd());

    String runPath = args.positionals().get(0);
    byte[] runBytes = read(io, runPath);
    sidecar(io, runPath, runBytes);
    JsonNode node;
    try {
      node = Json.parseNode(new String(runBytes, StandardCharsets.UTF_8));
    } catch (JsonFormatException e) {
      throw new InputError(runPath + ": not valid JSON (" + e.getMessage() + ")");
    }
    List<String> problems = Schemas.evidence(node);
    if (!problems.isEmpty()) {
      throw new InputError(runPath + ": " + String.join("; ", problems));
    }
    if (!"run".equals(node.path("kind").stringValue(""))) {
      throw new InputError(runPath + ": expected a run file; run qualify merge first");
    }
    @SuppressWarnings("unchecked")
    Map<String, Object> runFile = (Map<String, Object>) Objects.requireNonNull(Json.fromNode(node));
    String protocolPath = args.value("protocol");
    List<ProtocolEntry> protocol =
        protocolPath == null
            ? List.of()
            : TraceInputs.protocol(
                new String(read(io, protocolPath), StandardCharsets.UTF_8), protocolPath);
    String mapPath = args.value("map");
    Map<String, List<String>> map =
        mapPath == null
            ? Map.of()
            : TraceInputs.map(new String(read(io, mapPath), StandardCharsets.UTF_8), mapPath);
    ReportDocument document =
        ReportContent.build(
            runFile,
            EvidenceFiles.sha256(runBytes),
            Trace.build(runFile, protocol, map),
            theme,
            Tool.NAME + " " + Tool.version(),
            new ReportContent.Options(
                generatedAt,
                args.value("title"),
                args.value("subtitle"),
                args.value("document-id"),
                args.value("classification"),
                signatures));
    byte[] bytes = PdfRenderer.render(document, theme);
    Path out = io.cwd().resolve(pdf);
    try {
      io.write(out, bytes);
    } catch (IOException e) {
      throw new InputError("cannot write " + out + ": " + e.getMessage());
    }
    @SuppressWarnings("unchecked")
    Map<String, Object> summary =
        (Map<String, Object>) Objects.requireNonNull(runFile.get("summary"));
    io.stdout("qualify report: wrote " + out + "; run verdict " + summary.get("verdict") + "\n");
    return OK;
  }

  /** The generation time: {@code QUALIFY_REPORT_TIME} when set, else now. */
  private static Instant reportTime(CliIO io) {
    String value = io.env().get("QUALIFY_REPORT_TIME");
    if (value == null || value.isEmpty()) {
      return io.now();
    }
    if (!REPORT_TIME.matcher(value).matches()) {
      throw new InputError(
          "QUALIFY_REPORT_TIME must be a UTC instant such as 2026-01-02T03:04:05.006Z, got "
              + value);
    }
    try {
      return Instant.parse(value);
    } catch (DateTimeParseException e) {
      throw new InputError(
          "QUALIFY_REPORT_TIME must be a UTC instant such as 2026-01-02T03:04:05.006Z, got "
              + value);
    }
  }

  private static byte[] read(CliIO io, String path) {
    try {
      return io.read(io.cwd().resolve(path));
    } catch (IOException e) {
      throw new InputError("cannot read " + path + ": " + e.getMessage());
    }
  }

  /** Check a {@code .sha256} sidecar next to a file, when there is one. */
  private static void sidecar(CliIO io, String path, byte[] bytes) {
    byte[] sidecar;
    try {
      sidecar = io.read(io.cwd().resolve(path + ".sha256"));
    } catch (IOException e) {
      return;
    }
    String recorded = new String(sidecar, StandardCharsets.UTF_8).trim().split("\\s+", -1)[0];
    if (!recorded.equals(EvidenceFiles.sha256(bytes))) {
      throw new InputError(path + ": the SHA-256 does not match " + path + ".sha256");
    }
  }

  private static int validate(List<String> argv, CliIO io) {
    Args args = Args.parse(argv, Set.of(), Set.of());
    if (args.positionals().isEmpty()) {
      throw new UsageError("validate needs at least one file");
    }
    int invalid = 0;
    for (String path : args.positionals()) {
      try {
        byte[] bytes = read(io, path);
        sidecar(io, path, bytes);
        JsonNode node;
        try {
          node = Json.parseNode(new String(bytes, StandardCharsets.UTF_8));
        } catch (JsonFormatException e) {
          throw new InputError(path + ": not valid JSON (" + e.getMessage() + ")");
        }
        JsonNode kind = node.get("kind");
        boolean trace = kind != null && kind.isString() && "trace".equals(kind.stringValue());
        List<String> problems =
            new ArrayList<>(trace ? Schemas.trace(node) : Schemas.evidence(node));
        if (problems.isEmpty() && !trace) {
          problems.addAll(levels(node));
        }
        if (!problems.isEmpty()) {
          throw new InputError(path + ": " + String.join("; ", problems));
        }
        io.stdout("valid: " + path + "\n");
      } catch (InputError e) {
        invalid++;
        io.stderr("qualify validate: " + e.getMessage() + "\n");
      }
    }
    return invalid == 0 ? OK : INVALID;
  }

  /** The rule the schema cannot express: an ID's prefix equals its level. */
  private static List<String> levels(JsonNode file) {
    List<JsonNode> tests = new ArrayList<>();
    JsonNode many = file.get("tests");
    if (many != null) {
      many.forEach(tests::add);
    }
    JsonNode one = file.get("test");
    if (one != null) {
      tests.add(one);
    }
    List<String> problems = new ArrayList<>();
    for (JsonNode test : tests) {
      String id = test.get("id").stringValue();
      String level = test.get("level").stringValue();
      if (!id.startsWith(level + "-")) {
        problems.add("test " + id + " does not match its level " + level);
      }
    }
    return problems;
  }
}
