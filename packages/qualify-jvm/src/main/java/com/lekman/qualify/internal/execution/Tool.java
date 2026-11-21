package com.lekman.qualify.internal.execution;

import java.io.IOException;
import java.io.InputStream;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Properties;
import org.junit.jupiter.api.Test;

/** The {@code tool} object of the run envelope: this package, Java and the JUnit version. */
public final class Tool {

  /** The package name recorded as {@code tool.name}. */
  public static final String NAME = "com.lekman:qualify";

  private Tool() {}

  /** The tool object for a test run. */
  public static Map<String, Object> describe() {
    Package junit = Test.class.getPackage();
    String junitVersion = junit == null ? null : junit.getImplementationVersion();
    return describe(
        "java "
            + Runtime.version()
            + "; junit-jupiter "
            + (junitVersion == null ? "unknown" : junitVersion));
  }

  /** The tool object with a given runtime description. */
  public static Map<String, Object> describe(String runtime) {
    Map<String, Object> tool = new LinkedHashMap<>();
    tool.put("name", NAME);
    tool.put("version", version());
    tool.put("language", "java");
    tool.put("runtime", runtime);
    return tool;
  }

  /** This package's version, from the properties file the build writes. */
  public static String version() {
    try (InputStream in =
        Tool.class.getResourceAsStream("/com/lekman/qualify/qualify.properties")) {
      if (in == null) {
        return "unknown";
      }
      Properties properties = new Properties();
      properties.load(in);
      return properties.getProperty("version", "unknown");
    } catch (IOException e) {
      return "unknown";
    }
  }
}
