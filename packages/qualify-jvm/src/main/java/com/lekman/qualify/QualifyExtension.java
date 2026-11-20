package com.lekman.qualify;

import com.lekman.qualify.internal.declaration.Declaration;
import com.lekman.qualify.internal.declaration.Declarations;
import com.lekman.qualify.internal.declaration.DeclaredFields;
import com.lekman.qualify.internal.envelope.GitProbe;
import com.lekman.qualify.internal.execution.Execution;
import com.lekman.qualify.internal.execution.Outcomes;
import com.lekman.qualify.internal.execution.RedactedFailure;
import com.lekman.qualify.internal.execution.Session;
import com.lekman.qualify.internal.execution.Tool;
import com.lekman.qualify.internal.settings.Policy;
import java.lang.annotation.Annotation;
import java.lang.reflect.Method;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.TestFactory;
import org.junit.jupiter.api.TestTemplate;
import org.junit.jupiter.api.extension.AfterTestExecutionCallback;
import org.junit.jupiter.api.extension.BeforeTestExecutionCallback;
import org.junit.jupiter.api.extension.ConditionEvaluationResult;
import org.junit.jupiter.api.extension.ExecutionCondition;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.junit.jupiter.api.extension.InvocationInterceptor;
import org.junit.jupiter.api.extension.ParameterContext;
import org.junit.jupiter.api.extension.ParameterResolver;
import org.junit.jupiter.api.extension.ReflectiveInvocationContext;
import org.junit.jupiter.api.extension.TestWatcher;
import org.junit.platform.commons.support.AnnotationSupport;
import org.opentest4j.TestAbortedException;

/**
 * The JUnit 5 extension behind {@link IQ}, {@link OQ}, {@link PQ} and {@link IU}. The annotations
 * register it; a test never names it.
 *
 * <ul>
 *   <li>The {@link ExecutionCondition} validates the declaration and applies the policy. A denied
 *       test is recorded as {@code skip} and JUnit shows it as disabled with the reason.
 *   <li>{@link BeforeTestExecutionCallback} writes the started marker.
 *   <li>{@link ParameterResolver} supplies the {@link QualifyContext}.
 *   <li>{@link AfterTestExecutionCallback} reads the execution exception and writes the redacted
 *       record. A test whose soft checks failed fails here with {@link CheckFailed}.
 *   <li>{@link InvocationInterceptor} replaces a failure whose message holds a registered secret
 *       with one whose message is redacted, so the runner's own report does not show the value.
 *   <li>{@link TestWatcher} writes the record of a started test whose after-execution callback
 *       never ran.
 * </ul>
 *
 * <p>The run ID is shared by the launcher session: {@code QUALIFY_RUN_ID} or the configuration
 * parameter {@code qualify.runId} when set, otherwise one ULID per launcher session.
 */
public final class QualifyExtension
    implements ExecutionCondition,
        BeforeTestExecutionCallback,
        AfterTestExecutionCallback,
        ParameterResolver,
        InvocationInterceptor,
        TestWatcher {

  private static final ExtensionContext.Namespace NAMESPACE =
      ExtensionContext.Namespace.create(QualifyExtension.class);
  private static final String EXECUTION = "execution";
  private static final String SESSION = "session";
  private static final String THROWN = "thrown";

  /** Created by JUnit through {@code @ExtendWith} on the level annotations. */
  public QualifyExtension() {
    // JUnit creates one instance per registration; all state lives in stores.
  }

  @Override
  public void afterTestExecution(ExtensionContext context) {
    Execution execution = stored(context);
    if (execution == null) {
      return;
    }
    Throwable thrown = context.getStore(NAMESPACE).get(THROWN, Throwable.class);
    if (thrown == null) {
      thrown = context.getExecutionException().orElse(null);
    }
    Execution.Ending ending = execution.finish(thrown);
    if (ending != null && thrown == null && ending.classification().errorType() != null) {
      String message = String.valueOf(ending.classification().errorMessage());
      String site = ending.site() == null ? "" : ending.site();
      throw new CheckFailed(execution.redact(message), site);
    }
  }

  @Override
  public void beforeTestExecution(ExtensionContext context) {
    if (context.getTestMethod().isEmpty()) {
      return;
    }
    Execution existing = stored(context);
    Execution execution = existing != null ? existing : prepare(context);
    if (existing == null) {
      // Conditions were switched off (junit.jupiter.conditions.deactivate), so
      // the policy is applied here instead.
      Optional<String> reason = policy(context, execution);
      if (reason.isPresent()) {
        throw new TestAbortedException(reason.get());
      }
    }
    execution.start();
  }

  @Override
  public ConditionEvaluationResult evaluateExecutionCondition(ExtensionContext context) {
    if (context.getTestMethod().isEmpty()) {
      return ConditionEvaluationResult.enabled("qualify applies to test methods");
    }
    Execution execution = prepare(context);
    Optional<String> reason = policy(context, execution);
    return reason.isPresent()
        ? ConditionEvaluationResult.disabled(reason.get())
        : ConditionEvaluationResult.enabled("qualify: the policy allows this test");
  }

  @Override
  public void interceptTestMethod(
      Invocation<@Nullable Void> invocation,
      ReflectiveInvocationContext<Method> invocationContext,
      ExtensionContext context)
      throws Throwable {
    try {
      invocation.proceed();
    } catch (Throwable thrown) {
      Execution execution = stored(context);
      if (execution == null) {
        throw thrown;
      }
      context.getStore(NAMESPACE).put(THROWN, thrown);
      throw scrubbed(thrown, execution);
    }
  }

  @Override
  public Object resolveParameter(ParameterContext parameter, ExtensionContext context) {
    Execution execution = stored(context);
    return (execution != null ? execution : prepare(context)).context();
  }

  @Override
  public boolean supportsParameter(ParameterContext parameter, ExtensionContext context) {
    return parameter.getParameter().getType() == QualifyContext.class;
  }

  @Override
  public void testAborted(ExtensionContext context, @Nullable Throwable cause) {
    finishLate(context, cause);
  }

  @Override
  public void testFailed(ExtensionContext context, @Nullable Throwable cause) {
    finishLate(context, cause);
  }

  @Override
  public void testSuccessful(ExtensionContext context) {
    finishLate(context, null);
  }

  private static DeclaredFields fields(Method method, List<String> tags) {
    List<Annotation> found = new ArrayList<>();
    for (Class<? extends Annotation> type : List.of(IQ.class, OQ.class, PQ.class, IU.class)) {
      AnnotationSupport.findAnnotation(method, type).ifPresent(found::add);
    }
    String name = method.getDeclaringClass().getSimpleName() + "." + method.getName();
    if (found.size() != 1) {
      throw new DeclarationError(
          name, List.of("a test takes exactly one of @IQ, @OQ, @PQ and @IU"));
    }
    if (AnnotationSupport.isAnnotated(method, TestTemplate.class)
        || AnnotationSupport.isAnnotated(method, TestFactory.class)) {
      throw new DeclarationError(
          name,
          List.of(
              "parametrised qualification tests are refused in v1, because one ID would map to several records"));
    }
    Annotation annotation = found.get(0);
    if (annotation instanceof IQ a) {
      return new DeclaredFields(
          Level.IQ,
          a.id(),
          a.title(),
          a.given(),
          a.when(),
          a.then(),
          List.of(a.and()),
          null,
          List.of(a.requirements()),
          a.risk(),
          merge(a.tags(), tags, Level.IQ),
          a.controls());
    }
    if (annotation instanceof OQ a) {
      return new DeclaredFields(
          Level.OQ,
          a.id(),
          a.title(),
          a.given(),
          a.when(),
          a.then(),
          List.of(a.and()),
          a.scope(),
          List.of(a.requirements()),
          a.risk(),
          merge(a.tags(), tags, Level.OQ),
          a.controls());
    }
    if (annotation instanceof PQ a) {
      return new DeclaredFields(
          Level.PQ,
          a.id(),
          a.title(),
          a.given(),
          a.when(),
          a.then(),
          List.of(a.and()),
          a.scope(),
          List.of(a.requirements()),
          a.risk(),
          merge(a.tags(), tags, Level.PQ),
          a.controls());
    }
    IU a = (IU) annotation;
    return new DeclaredFields(
        Level.IU,
        a.id(),
        a.title(),
        a.given(),
        a.when(),
        a.then(),
        List.of(a.and()),
        null,
        List.of(a.requirements()),
        a.risk(),
        merge(a.tags(), tags, Level.IU),
        a.controls());
  }

  private static void finishLate(ExtensionContext context, @Nullable Throwable cause) {
    Execution execution = stored(context);
    if (execution != null && execution.isStarted() && !execution.isRecorded()) {
      execution.finish(cause);
    }
  }

  /** Declared tags plus every JUnit tag of the test except its level's own. */
  private static List<String> merge(String[] declared, List<String> junitTags, Level level) {
    List<String> tags = new ArrayList<>(Arrays.asList(declared));
    for (String tag : junitTags) {
      if (!tag.equals(level.name())) {
        tags.add(tag);
      }
    }
    return tags;
  }

  private static Optional<String> policy(ExtensionContext context, Execution execution) {
    Session session = session(context);
    Optional<String> reason = Policy.skipReason(execution.declaration(), session.settings());
    reason.ifPresent(execution::skipBeforeStart);
    return reason;
  }

  private static Execution prepare(ExtensionContext context) {
    Session session = session(context);
    Method method = context.getRequiredTestMethod();
    List<String> tags = new ArrayList<>(context.getTags());
    Declaration declaration =
        Declarations.validate(fields(method, tags), session.sites().declaration(method));
    Execution execution = new Execution(session, declaration, context.getRequiredTestClass());
    context.getStore(NAMESPACE).put(EXECUTION, execution);
    return execution;
  }

  private static Throwable scrubbed(Throwable thrown, Execution execution) {
    boolean holdsSecret = false;
    Throwable t = thrown;
    for (int depth = 0; t != null && depth < 32; depth++, t = t.getCause()) {
      String message = t.getMessage();
      if (message != null && !execution.redact(message).equals(message)) {
        holdsSecret = true;
      }
    }
    if (!holdsSecret) {
      return thrown;
    }
    String message = execution.redact(Outcomes.messageOf(thrown));
    Throwable replacement;
    if (thrown instanceof SkipSignal) {
      replacement = new SkipSignal(message);
    } else if (thrown instanceof TestAbortedException) {
      replacement = new TestAbortedException(message);
    } else if (thrown instanceof CheckFailed failed) {
      replacement = new CheckFailed(message, failed.getSite());
    } else if (thrown instanceof AssertionError) {
      replacement = new AssertionError(message);
    } else {
      replacement = new RedactedFailure(thrown.getClass().getName() + ": " + message);
    }
    replacement.setStackTrace(thrown.getStackTrace());
    return replacement;
  }

  private static Session session(ExtensionContext context) {
    ExtensionContext.Store store =
        context.getStore(ExtensionContext.StoreScope.LAUNCHER_SESSION, NAMESPACE);
    return store.getOrComputeIfAbsent(
        SESSION,
        key -> {
          Path cwd = Path.of("").toAbsolutePath();
          return Session.create(
              new Session.Inputs(
                  System.getenv(),
                  context::getConfigurationParameter,
                  cwd,
                  GitProbe.read(cwd),
                  Tool.describe(),
                  () -> Instant.ofEpochMilli(System.currentTimeMillis()),
                  System.err::println));
        },
        Session.class);
  }

  private static @Nullable Execution stored(ExtensionContext context) {
    try {
      return context.getStore(NAMESPACE).get(EXECUTION, Execution.class);
    } catch (RuntimeException e) {
      // The store of a finished test may already be closed.
      return null;
    }
  }
}
