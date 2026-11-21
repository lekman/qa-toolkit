package com.lekman.qualify.cli;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.jspecify.annotations.Nullable;

/**
 * Command-line arguments: {@code --name value}, {@code --name=value}, boolean {@code --flag}, and
 * positionals. An unknown option is a usage error, as in the TypeScript CLI.
 */
final class Args {

  private final Map<String, String> values = new HashMap<>();
  private final List<String> positionals = new ArrayList<>();

  private Args() {}

  /** Parse arguments for options that take a value and flags that take none. */
  static Args parse(List<String> args, Set<String> valued, Set<String> flags) {
    Args parsed = new Args();
    boolean optionsEnded = false;
    for (int i = 0; i < args.size(); i++) {
      String arg = args.get(i);
      if (optionsEnded || !arg.startsWith("--") || arg.equals("-")) {
        parsed.positionals.add(arg);
        continue;
      }
      if (arg.equals("--")) {
        optionsEnded = true;
        continue;
      }
      int equals = arg.indexOf('=');
      String name = equals < 0 ? arg.substring(2) : arg.substring(2, equals);
      if (flags.contains(name)) {
        if (equals >= 0) {
          throw new UsageError("option --" + name + " does not take a value");
        }
        parsed.values.put(name, "true");
      } else if (valued.contains(name)) {
        String value;
        if (equals >= 0) {
          value = arg.substring(equals + 1);
        } else if (i + 1 < args.size()) {
          value = args.get(++i);
        } else {
          throw new UsageError("option --" + name + " needs a value");
        }
        parsed.values.put(name, value);
      } else {
        throw new UsageError("unknown option --" + name);
      }
    }
    return parsed;
  }

  /** Whether a flag was given. */
  boolean flag(String name) {
    return values.containsKey(name);
  }

  /** The positionals. */
  List<String> positionals() {
    return List.copyOf(positionals);
  }

  /** An option's value, or {@code null}. */
  @Nullable String value(String name) {
    return values.get(name);
  }
}
