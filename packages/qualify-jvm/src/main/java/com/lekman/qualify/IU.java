package com.lekman.qualify;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;

/**
 * An intended use (IU) test. A JUnit test tagged {@code IU} that receives a {@link QualifyContext}
 * and writes redacted evidence when it runs.
 *
 * <p>The scope of every IU test is {@code read-write}, so the annotation has no {@code scope}
 * attribute. Every {@code @Tag} on the method or its class is recorded with {@code tags}; JUnit
 * selects by {@code @Tag} only.
 */
@Target({ElementType.METHOD, ElementType.ANNOTATION_TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Test
@Tag("IU")
@ExtendWith(QualifyExtension.class)
public @interface IU {
  /** The test ID, for example {@code IU-EXPORT-003}. */
  String id();

  /** One line saying what the test proves. */
  String title();

  /** The state before the test. */
  String given();

  /** The action under test. In Kotlin, write {@code `when`}. */
  String when();

  /** The expected result. */
  String then();

  /** Further clauses, each not empty. */
  String[] and() default {};

  /** Requirement IDs, 1 to 64 characters each, without duplicates. */
  String[] requirements() default {};

  /** The risk the test covers. */
  Risk risk() default Risk.UNDECLARED;

  /** Free strings, recorded sorted and without duplicates. */
  String[] tags() default {};

  /** The ID of the negative test this test is the control for. */
  String controls() default "";
}
