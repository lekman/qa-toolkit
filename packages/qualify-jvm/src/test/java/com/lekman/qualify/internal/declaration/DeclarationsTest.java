package com.lekman.qualify.internal.declaration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.lekman.qualify.DeclarationError;
import com.lekman.qualify.Level;
import com.lekman.qualify.Risk;
import com.lekman.qualify.Scope;
import java.util.List;
import org.junit.jupiter.api.Test;

class DeclarationsTest {

  private static DeclaredFields fields(Level level, String id, Scope scope) {
    return new DeclaredFields(
        level,
        id,
        "title",
        "g",
        "w",
        "t",
        List.of(),
        scope,
        List.of("R-1"),
        Risk.LOW,
        List.of("b", "a"),
        "");
  }

  @Test
  void aValidDeclarationKeepsItsFields() {
    Declaration d =
        Declarations.validate(fields(Level.OQ, "OQ-AREA-001", Scope.READ_WRITE), "x.java:3");
    assertEquals("read-write", d.scope());
    assertEquals("low", d.risk());
    assertEquals(List.of("a", "b"), d.tags());
    assertFalse(d.toJson().containsKey("and"));
    assertFalse(d.toJson().containsKey("controls"));
    assertEquals("x.java:3", d.toJson().get("site"));
  }

  @Test
  void idsAndScopesAreChecked() {
    assertTrue(Declarations.isTestId("IU-A1-123"));
    assertFalse(Declarations.isTestId("OQ-EXPORT-API-001"));
    assertFalse(Declarations.isTestId(null));
    DeclarationError pattern =
        assertThrows(
            DeclarationError.class,
            () -> Declarations.validate(fields(Level.OQ, "oq-x-1", Scope.READ), "s:1"));
    assertTrue(pattern.getMessage().contains("pattern"));
    DeclarationError prefix =
        assertThrows(
            DeclarationError.class,
            () -> Declarations.validate(fields(Level.PQ, "OQ-AB-001", Scope.READ), "s:1"));
    assertTrue(prefix.getProblems().get(0).contains("does not match the declared level PQ"));
    DeclarationError iqScope =
        assertThrows(
            DeclarationError.class,
            () -> Declarations.validate(fields(Level.IQ, "IQ-AB-001", Scope.READ), "s:1"));
    assertTrue(iqScope.getMessage().contains("always read"));
    DeclarationError iuScope =
        assertThrows(
            DeclarationError.class,
            () -> Declarations.validate(fields(Level.IU, "IU-AB-001", Scope.READ), "s:1"));
    assertTrue(iuScope.getMessage().contains("always read-write"));
    DeclarationError missing =
        assertThrows(
            DeclarationError.class,
            () -> Declarations.validate(fields(Level.PQ, "PQ-AB-001", Scope.UNDECLARED), "s:1"));
    assertTrue(missing.getMessage().contains("scope is required for PQ"));
  }
}
