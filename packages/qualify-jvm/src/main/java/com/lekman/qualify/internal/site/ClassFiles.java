package com.lekman.qualify.internal.site;

import java.io.ByteArrayInputStream;
import java.io.DataInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import org.jspecify.annotations.Nullable;

/**
 * Reads a method's first line and a class's source file name from its class file. Java has no
 * reflection API for either, and the declaration site of a test is the first line of its method.
 * Needs the line numbers javac and kotlinc write by default.
 */
public final class ClassFiles {

  private ClassFiles() {}

  /**
   * What a class file says about one method.
   *
   * @param sourceFile the {@code SourceFile} attribute, or {@code null}
   * @param firstLine the lowest line number of the method's code, or 0 when unknown
   */
  public record MethodInfo(@Nullable String sourceFile, int firstLine) {}

  /** Read the source file and the method's first line from the class's own class file. */
  public static MethodInfo describe(Method method) {
    Class<?> type = method.getDeclaringClass();
    String name = type.getName();
    String resource = name.substring(name.lastIndexOf('.') + 1) + ".class";
    try (InputStream in = type.getResourceAsStream(resource)) {
      if (in == null) {
        return new MethodInfo(null, 0);
      }
      return parse(in.readAllBytes(), method.getName(), descriptor(method));
    } catch (IOException | RuntimeException e) {
      return new MethodInfo(null, 0);
    }
  }

  /** The JVM descriptor of a method, such as {@code (Ljava/lang/String;)V}. */
  public static String descriptor(Method method) {
    StringBuilder out = new StringBuilder("(");
    for (Class<?> parameter : method.getParameterTypes()) {
      out.append(descriptor(parameter));
    }
    return out.append(')').append(descriptor(method.getReturnType())).toString();
  }

  /** Parse a class file and find a method by name and descriptor. */
  public static MethodInfo parse(byte[] classFile, String methodName, String methodDescriptor)
      throws IOException {
    DataInputStream in = new DataInputStream(new ByteArrayInputStream(classFile));
    if (in.readInt() != 0xCAFEBABE) {
      throw new IOException("not a class file");
    }
    in.readUnsignedShort();
    in.readUnsignedShort();
    int count = in.readUnsignedShort();
    String[] utf8 = new String[count];
    for (int i = 1; i < count; i++) {
      int tag = in.readUnsignedByte();
      switch (tag) {
        case 1 -> {
          byte[] bytes = new byte[in.readUnsignedShort()];
          in.readFully(bytes);
          utf8[i] = new String(bytes, StandardCharsets.UTF_8);
        }
        case 3, 4, 9, 10, 11, 12, 17, 18 -> in.skipNBytes(4);
        case 5, 6 -> {
          in.skipNBytes(8);
          i++;
        }
        case 7, 8, 16, 19, 20 -> in.skipNBytes(2);
        case 15 -> in.skipNBytes(3);
        default -> throw new IOException("unknown constant pool tag " + tag);
      }
    }
    in.skipNBytes(6);
    in.skipNBytes(2L * in.readUnsignedShort());
    int fields = in.readUnsignedShort();
    for (int i = 0; i < fields; i++) {
      in.skipNBytes(6);
      skipAttributes(in);
    }
    int line = 0;
    int methods = in.readUnsignedShort();
    for (int i = 0; i < methods; i++) {
      in.skipNBytes(2);
      String name = utf8[in.readUnsignedShort()];
      String descriptor = utf8[in.readUnsignedShort()];
      boolean wanted = methodName.equals(name) && methodDescriptor.equals(descriptor);
      int attributes = in.readUnsignedShort();
      for (int a = 0; a < attributes; a++) {
        String attribute = utf8[in.readUnsignedShort()];
        int length = in.readInt();
        if (wanted && "Code".equals(attribute)) {
          line = firstLine(in, utf8);
        } else {
          in.skipNBytes(length);
        }
      }
    }
    @Nullable String sourceFile = null;
    int attributes = in.readUnsignedShort();
    for (int a = 0; a < attributes; a++) {
      String attribute = utf8[in.readUnsignedShort()];
      int length = in.readInt();
      if ("SourceFile".equals(attribute)) {
        sourceFile = utf8[in.readUnsignedShort()];
      } else {
        in.skipNBytes(length);
      }
    }
    return new MethodInfo(sourceFile, line);
  }

  private static String descriptor(Class<?> type) {
    if (type.isArray()) {
      return type.getName().replace('.', '/');
    }
    if (type.isPrimitive()) {
      return switch (type.getName()) {
        case "void" -> "V";
        case "boolean" -> "Z";
        case "byte" -> "B";
        case "char" -> "C";
        case "short" -> "S";
        case "int" -> "I";
        case "long" -> "J";
        case "float" -> "F";
        default -> "D";
      };
    }
    return "L" + type.getName().replace('.', '/') + ";";
  }

  private static int firstLine(DataInputStream in, String[] utf8) throws IOException {
    in.skipNBytes(4);
    in.skipNBytes(in.readInt());
    in.skipNBytes(8L * in.readUnsignedShort());
    int line = 0;
    int attributes = in.readUnsignedShort();
    for (int a = 0; a < attributes; a++) {
      String attribute = utf8[in.readUnsignedShort()];
      int length = in.readInt();
      if ("LineNumberTable".equals(attribute)) {
        int entries = in.readUnsignedShort();
        for (int e = 0; e < entries; e++) {
          in.skipNBytes(2);
          int number = in.readUnsignedShort();
          line = line == 0 ? number : Math.min(line, number);
        }
      } else {
        in.skipNBytes(length);
      }
    }
    return line;
  }

  private static void skipAttributes(DataInputStream in) throws IOException {
    int attributes = in.readUnsignedShort();
    for (int a = 0; a < attributes; a++) {
      in.skipNBytes(2);
      in.skipNBytes(in.readInt() & 0xFFFFFFFFL);
    }
  }
}
