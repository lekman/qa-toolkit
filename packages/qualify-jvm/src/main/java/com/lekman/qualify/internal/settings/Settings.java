package com.lekman.qualify.internal.settings;

import com.lekman.qualify.NotApplicableRule;
import java.util.List;
import java.util.Optional;
import java.util.function.Function;

/**
 * Settings after resolving environment variables, JUnit configuration parameters and the project's
 * {@link com.lekman.qualify.QualifyConfiguration}.
 *
 * @param attachmentLimit the attachment size limit in bytes
 * @param environment the environment name
 * @param evidenceDir the evidence directory, as given
 * @param notApplicable rules that skip tests as not applicable
 * @param overrides tests allowed to write in production
 * @param production environment names treated as production
 * @param productionWriteBlocked whether the environment is a production one
 * @param secretSource reads a secret by name
 */
public record Settings(
    long attachmentLimit,
    String environment,
    String evidenceDir,
    List<NotApplicableRule> notApplicable,
    List<PolicyOverride> overrides,
    List<String> production,
    boolean productionWriteBlocked,
    Function<String, Optional<String>> secretSource) {}
