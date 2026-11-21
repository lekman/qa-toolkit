package com.lekman.qualify.internal.settings;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.lekman.qualify.ConfigurationError;
import com.lekman.qualify.Level;
import com.lekman.qualify.NotApplicableRule;
import com.lekman.qualify.QualifyConfiguration;
import com.lekman.qualify.internal.declaration.Declaration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class SettingsTest {

  private static Optional<String> none(String name) {
    return Optional.empty();
  }

  private static Declaration declaration(String scope, List<String> tags) {
    return new Declaration(
        "OQ-SET-001",
        Level.OQ,
        "t",
        "g",
        "w",
        "t",
        null,
        scope,
        List.of(),
        null,
        tags,
        null,
        "a:1");
  }

  @Test
  void defaultsApplyWithNothingSet() {
    Settings settings = SettingsResolver.resolve(Map.of(), SettingsTest::none, null);
    assertEquals("local", settings.environment());
    assertEquals(1024L * 1024L, settings.attachmentLimit());
    assertEquals("qualification/evidence", settings.evidenceDir());
    assertFalse(settings.productionWriteBlocked());
    assertEquals(Optional.empty(), settings.secretSource().apply("X"));
  }

  @Test
  void variablesWinOverConfiguration() {
    Map<String, String> env =
        Map.of(
            "QUALIFY_ENVIRONMENT", " live ",
            "QUALIFY_PRODUCTION", "live, prod",
            "QUALIFY_ATTACHMENT_LIMIT", "10",
            "QUALIFY_SECRET_TOKEN", "value");
    Settings settings =
        SettingsResolver.resolve(
            env, name -> Optional.of(name.equals("qualify.environment") ? "other" : " "), null);
    assertEquals("live", settings.environment());
    assertTrue(settings.productionWriteBlocked());
    assertEquals(10L, settings.attachmentLimit());
    assertEquals(Optional.of("value"), settings.secretSource().apply("TOKEN"));
  }

  @Test
  void overridesAreParsedAndChecked() {
    assertEquals(
        List.of(new PolicyOverride("OQ-SET-001", "why"), new PolicyOverride("OQ-SET-002", "a=b")),
        SettingsResolver.overrides(" OQ-SET-001 = why ;; OQ-SET-002=a=b"));
    assertThrows(ConfigurationError.class, () -> SettingsResolver.overrides("nope=x"));
    assertThrows(ConfigurationError.class, () -> SettingsResolver.overrides("OQ-SET-001"));
    assertThrows(
        ConfigurationError.class, () -> SettingsResolver.overrides("OQ-SET-001=a;OQ-SET-001=b"));
    assertThrows(
        ConfigurationError.class,
        () ->
            SettingsResolver.resolve(
                Map.of("QUALIFY_ATTACHMENT_LIMIT", "-1"), SettingsTest::none, null));
    assertThrows(
        ConfigurationError.class,
        () ->
            SettingsResolver.resolve(
                Map.of("QUALIFY_ATTACHMENT_LIMIT", "ten"), SettingsTest::none, null));
  }

  @Test
  void policySkipsWritesInProductionAndNotApplicableTests() {
    QualifyConfiguration project =
        new QualifyConfiguration() {
          @Override
          public List<NotApplicableRule> notApplicable() {
            return List.of(
                new NotApplicableRule("only on staging", List.of(), List.of("staging")),
                new NotApplicableRule("slow", List.of("slow"), List.of()));
          }
        };
    Settings production =
        SettingsResolver.resolve(
            Map.of("QUALIFY_ENVIRONMENT", "prod"), SettingsTest::none, project);
    assertEquals(
        Optional.of("read-write test blocked in production environment prod"),
        Policy.skipReason(declaration("read-write", List.of()), production));
    assertEquals(
        Optional.of("slow"), Policy.skipReason(declaration("read", List.of("slow")), production));
    assertEquals(Optional.empty(), Policy.skipReason(declaration("read", List.of()), production));
    Settings staging =
        SettingsResolver.resolve(
            Map.of("QUALIFY_ENVIRONMENT", "staging"), SettingsTest::none, project);
    assertEquals(
        Optional.of("only on staging"), Policy.skipReason(declaration("read", List.of()), staging));
    assertEquals(
        Map.of("productionWriteBlocked", true, "overrides", List.of()), Policy.info(production));
    assertThrows(
        IllegalArgumentException.class, () -> new NotApplicableRule(" ", List.of(), List.of()));
  }

  @Test
  void aBrokenOrBlankResolverMeansProduction() {
    QualifyConfiguration blank =
        new QualifyConfiguration() {
          @Override
          public Optional<String> environment() {
            return Optional.of(" ");
          }
        };
    assertEquals("production", SettingsResolver.environment(Map.of(), SettingsTest::none, blank));
    assertEquals(
        "local",
        SettingsResolver.environment(Map.of(), SettingsTest::none, new QualifyConfiguration() {}));
  }
}
