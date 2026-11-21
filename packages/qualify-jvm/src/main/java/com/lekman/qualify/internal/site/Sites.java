package com.lekman.qualify.internal.site;

import java.io.IOException;
import java.lang.reflect.Method;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.CodeSource;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Stream;
import org.jspecify.annotations.Nullable;

/**
 * Sites: the repository-relative {@code path:line} of a declaration, a check or a failure.
 *
 * <p>A stack frame names a class and a file name, not a path. The path is found by looking for
 * {@code <package path>/<file name>} under the source roots: every {@code src/<set>/java} and
 * {@code src/<set>/kotlin} of the working directory, plus any given in {@code qualify.sourceRoots}.
 * A file that is not found keeps its package path, such as {@code com/acme/ExportTest.java}.
 */
public final class Sites {

  private static final List<String> RUNTIME_PREFIXES =
      List.of("java.", "javax.", "jdk.", "sun.", "com.sun.", "org.junit.", "kotlin.");

  private final Path root;
  private final List<Path> sourceRoots;
  private final @Nullable URL own;
  private final Map<String, String> paths = new ConcurrentHashMap<>();

  /**
   * Sites for one working directory.
   *
   * @param workingDirectory where the tests run
   * @param repositoryRoot the git root that paths are relative to, or {@code null} to use the
   *     working directory
   * @param extraSourceRoots further source roots, relative to the working directory
   */
  public Sites(
      Path workingDirectory, @Nullable Path repositoryRoot, List<String> extraSourceRoots) {
    Path cwd = workingDirectory.toAbsolutePath().normalize();
    this.root = repositoryRoot == null ? cwd : repositoryRoot.toAbsolutePath().normalize();
    List<Path> roots = new ArrayList<>();
    for (String extra : extraSourceRoots) {
      roots.add(cwd.resolve(extra).normalize());
    }
    Path src = cwd.resolve("src");
    if (Files.isDirectory(src)) {
      try (Stream<Path> sets = Files.list(src)) {
        sets.sorted()
            .forEach(
                set -> {
                  roots.add(set.resolve("java"));
                  roots.add(set.resolve("kotlin"));
                });
      } catch (IOException e) {
        // No readable source sets: paths keep their package form.
      }
    }
    this.sourceRoots = List.copyOf(roots);
    CodeSource source = Sites.class.getProtectionDomain().getCodeSource();
    this.own = source == null ? null : source.getLocation();
  }

  /**
   * The first frame outside qualify's own classes and the runtime: the line that called into
   * qualify.
   */
  public Optional<String> caller() {
    return StackWalker.getInstance(StackWalker.Option.RETAIN_CLASS_REFERENCE)
        .walk(
            frames ->
                frames
                    .filter(f -> !isOwn(f.getDeclaringClass()) && !isRuntime(f.getClassName()))
                    .filter(f -> f.getFileName() != null && f.getLineNumber() > 0)
                    .findFirst()
                    .map(f -> format(f.getClassName(), f.getFileName(), f.getLineNumber())));
  }

  /** The site of a test method: its file and the first line of its body. */
  public String declaration(Method method) {
    ClassFiles.MethodInfo info = ClassFiles.describe(method);
    Class<?> type = method.getDeclaringClass();
    String file = info.sourceFile() != null ? info.sourceFile() : outer(type.getName()) + ".java";
    return format(type.getName(), file, info.firstLine());
  }

  /** Format a class's source file and line as {@code path:line}. */
  public String format(String className, String fileName, int line) {
    String path =
        paths.computeIfAbsent(className + "\u0000" + fileName, k -> resolve(className, fileName));
    return path.replace(':', '_').replace('\n', '_') + ":" + Math.max(0, line);
  }

  /**
   * The innermost frame of a failure in the test class or a class nested in it, or empty when none
   * is.
   */
  public Optional<String> inClass(Throwable error, Class<?> testClass) {
    String name = testClass.getName();
    for (StackTraceElement element : error.getStackTrace()) {
      String cls = element.getClassName();
      if ((cls.equals(name) || cls.startsWith(name + "$"))
          && element.getFileName() != null
          && element.getLineNumber() > 0) {
        return Optional.of(format(cls, element.getFileName(), element.getLineNumber()));
      }
    }
    return Optional.empty();
  }

  private boolean isOwn(Class<?> type) {
    if (own == null || !type.getName().startsWith("com.lekman.qualify.")) {
      return false;
    }
    CodeSource source = type.getProtectionDomain().getCodeSource();
    return source != null && own.equals(source.getLocation());
  }

  private static boolean isRuntime(String className) {
    return RUNTIME_PREFIXES.stream().anyMatch(className::startsWith);
  }

  private static String outer(String className) {
    String simple = className.substring(className.lastIndexOf('.') + 1);
    int dollar = simple.indexOf('$');
    return dollar < 0 ? simple : simple.substring(0, dollar);
  }

  private String resolve(String className, String fileName) {
    int dot = className.lastIndexOf('.');
    String packagePath = dot < 0 ? "" : className.substring(0, dot).replace('.', '/') + "/";
    String relative = packagePath + fileName;
    for (Path sourceRoot : sourceRoots) {
      Path candidate = sourceRoot.resolve(relative);
      if (Files.isRegularFile(candidate)) {
        Path absolute = candidate.toAbsolutePath().normalize();
        if (absolute.startsWith(root)) {
          return root.relativize(absolute).toString().replace('\\', '/');
        }
        return absolute.getFileName().toString();
      }
    }
    return relative;
  }
}
