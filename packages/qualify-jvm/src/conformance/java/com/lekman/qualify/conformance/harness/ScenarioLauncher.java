package com.lekman.qualify.conformance.harness;

import static org.junit.platform.engine.discovery.DiscoverySelectors.selectClass;
import static org.junit.platform.engine.discovery.DiscoverySelectors.selectMethod;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.junit.platform.engine.DiscoverySelector;
import org.junit.platform.engine.TestExecutionResult;
import org.junit.platform.launcher.Launcher;
import org.junit.platform.launcher.LauncherDiscoveryRequest;
import org.junit.platform.launcher.TestExecutionListener;
import org.junit.platform.launcher.TestIdentifier;
import org.junit.platform.launcher.core.LauncherDiscoveryRequestBuilder;
import org.junit.platform.launcher.core.LauncherFactory;
import org.junit.platform.launcher.listeners.SummaryGeneratingListener;
import org.junit.platform.launcher.listeners.TestExecutionSummary;

/**
 * Runs scenario test classes through the JUnit Platform launcher, in a JVM the harness starts with
 * the scenario's environment. Arguments: {@code Class} or {@code Class#method} selectors, and
 * {@code --parallel} to run them concurrently on two threads.
 *
 * <p>Prints each failure, a summary line and the threads that ran tests, then exits 0 when no test
 * failed and 1 otherwise, as a test runner does.
 */
public final class ScenarioLauncher {

  private ScenarioLauncher() {}

  /** Run the selected tests. */
  public static void main(String[] args) {
    List<DiscoverySelector> selectors = new ArrayList<>();
    boolean parallel = false;
    for (String arg : args) {
      if (arg.equals("--parallel")) {
        parallel = true;
      } else if (arg.contains("#")) {
        selectors.add(selectMethod(arg));
      } else {
        selectors.add(selectClass(arg));
      }
    }
    Map<String, String> config = new HashMap<>();
    if (parallel) {
      config.put("junit.jupiter.execution.parallel.enabled", "true");
      config.put("junit.jupiter.execution.parallel.mode.default", "concurrent");
      config.put("junit.jupiter.execution.parallel.mode.classes.default", "concurrent");
      config.put("junit.jupiter.execution.parallel.config.strategy", "fixed");
      config.put("junit.jupiter.execution.parallel.config.fixed.parallelism", "2");
    }
    LauncherDiscoveryRequest request =
        LauncherDiscoveryRequestBuilder.request()
            .selectors(selectors)
            .configurationParameters(config)
            .build();
    SummaryGeneratingListener summary = new SummaryGeneratingListener();
    Set<String> threads = ConcurrentHashMap.newKeySet();
    TestExecutionListener threadLog =
        new TestExecutionListener() {
          @Override
          public void executionStarted(TestIdentifier identifier) {
            if (identifier.isTest()) {
              threads.add(Thread.currentThread().getName());
            }
          }

          @Override
          public void executionFinished(TestIdentifier identifier, TestExecutionResult result) {
            if (identifier.isTest()) {
              threads.add(Thread.currentThread().getName());
            }
          }
        };
    Launcher launcher = LauncherFactory.create();
    launcher.execute(request, summary, threadLog);
    TestExecutionSummary result = summary.getSummary();
    for (TestExecutionSummary.Failure failure : result.getFailures()) {
      StringBuilder text = new StringBuilder(failure.getTestIdentifier().getDisplayName());
      Throwable t = failure.getException();
      for (int depth = 0; t != null && depth < 8; depth++, t = t.getCause()) {
        text.append(" | ").append(t.getClass().getSimpleName()).append(": ").append(t.getMessage());
      }
      System.out.println("FAILED " + text);
    }
    System.out.printf(
        "tests: found %d, succeeded %d, failed %d, aborted %d, skipped %d%n",
        result.getTestsFoundCount(),
        result.getTestsSucceededCount(),
        result.getTestsFailedCount(),
        result.getTestsAbortedCount(),
        result.getTestsSkippedCount());
    System.out.println("threads: " + threads.size());
    System.exit(result.getTotalFailureCount() == 0 ? 0 : 1);
  }
}
