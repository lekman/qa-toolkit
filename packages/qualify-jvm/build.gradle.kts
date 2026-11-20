// com.lekman:qualify, the JUnit 5 implementation of spec/qualify.
//
//   ./gradlew build          format and lint checks, Error Prone with NullAway,
//                            unit and Kotlin tests, coverage gate, CLI jar
//   ./gradlew conformance    every scenario in spec/qualify/conformance/README.md
//   ./gradlew spotlessApply  format the Java and Kotlin sources

import io.gitlab.arturbosch.detekt.Detekt
import net.ltgt.gradle.errorprone.CheckSeverity
import net.ltgt.gradle.errorprone.errorprone
import org.gradle.api.tasks.testing.logging.TestExceptionFormat

plugins {
    `java-library`
    jacoco
    kotlin("jvm") version "2.4.21"
    id("com.gradleup.shadow") version "9.6.1"
    id("com.diffplug.spotless") version "8.11.0"
    id("net.ltgt.errorprone") version "5.2.0"
    id("io.gitlab.arturbosch.detekt") version "1.23.8"
}

group = "com.lekman"
version = "0.1.0"

val repoRoot = layout.projectDirectory.dir("../..")
val specDir = repoRoot.dir("spec/qualify")

// The library targets Java 17. Error Prone runs only on JDK 21 or later, so
// javac comes from JDK 21 with --release 17; the tests and the CLI run on
// Java 17.
java {
    toolchain { languageVersion = JavaLanguageVersion.of(21) }
}
val java17 = javaToolchains.launcherFor { languageVersion = JavaLanguageVersion.of(17) }

// Kotlin compiles the Kotlin tests with the same JDK, for Java 17.
kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
        freeCompilerArgs.add("-Xjdk-release=17")
    }
}

repositories {
    mavenCentral()
}

val conformance by sourceSets.creating {
    compileClasspath += sourceSets.main.get().output
    runtimeClasspath += sourceSets.main.get().output
}

configurations[conformance.implementationConfigurationName].extendsFrom(
    configurations.implementation.get(),
    configurations.api.get(),
)
configurations[conformance.runtimeOnlyConfigurationName].extendsFrom(configurations.runtimeOnly.get())

// Silences SLF4J's "no provider" notice in the CLI only; library users keep
// their own logging.
val cliLogging by configurations.creating {
    isCanBeConsumed = false
}

dependencies {
    // The JUnit 5 API users already have. 5.13 is the oldest with the
    // launcher-session store the run ID lives in; JUnit 6 works too.
    api("org.junit.jupiter:junit-jupiter-api:5.14.4")
    // Nullness annotations on the public API, which Kotlin reads.
    api("org.jspecify:jspecify:1.0.0")
    implementation("tools.jackson.core:jackson-databind:3.2.4")
    implementation("tools.jackson.dataformat:jackson-dataformat-yaml:3.2.4")
    implementation("com.networknt:json-schema-validator:3.0.9")

    errorprone("com.google.errorprone:error_prone_core:2.52.0")
    errorprone("com.uber.nullaway:nullaway:0.14.3")

    testImplementation(platform("org.junit:junit-bom:5.14.4"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testImplementation("org.junit.platform:junit-platform-testkit")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
    testImplementation(kotlin("stdlib"))
    testRuntimeOnly("org.slf4j:slf4j-nop:2.0.17")

    "conformanceImplementation"(platform("org.junit:junit-bom:5.14.4"))
    "conformanceImplementation"("org.junit.jupiter:junit-jupiter")
    "conformanceImplementation"("org.junit.platform:junit-platform-launcher")
    "conformanceRuntimeOnly"("org.slf4j:slf4j-nop:2.0.17")

    cliLogging("org.slf4j:slf4j-nop:2.0.17")
}

tasks.processResources {
    // The schemas are read from spec/qualify, their one hand-written source.
    from(specDir) {
        include("evidence.schema.json", "trace.schema.json")
        into("com/lekman/qualify/schema")
    }
    val props = mapOf("version" to project.version.toString())
    inputs.properties(props)
    filesMatching("com/lekman/qualify/qualify.properties") { expand(props) }
}

tasks.withType<JavaCompile>().configureEach {
    options.encoding = "UTF-8"
    options.release = 17
    options.compilerArgs.addAll(listOf("-Xlint:all,-serial,-processing", "-Werror"))
    options.errorprone {
        disableWarningsInGeneratedCode = true
        // NullAway checks the library; tests pass nulls on purpose.
        check("NullAway", if (name == "compileJava") CheckSeverity.ERROR else CheckSeverity.OFF)
        option("NullAway:AnnotatedPackages", "com.lekman.qualify")
    }
}

tasks.jar {
    manifest {
        attributes(
            "Automatic-Module-Name" to "com.lekman.qualify",
            "Implementation-Title" to "com.lekman:qualify",
            "Implementation-Version" to project.version,
        )
    }
}

tasks.named<com.github.jengelman.gradle.plugins.shadow.tasks.ShadowJar>("shadowJar") { enabled = false }

// The CLI as one runnable jar: java -jar qualify-<version>-cli.jar merge ...
val cliJar by tasks.registering(com.github.jengelman.gradle.plugins.shadow.tasks.ShadowJar::class) {
    group = "build"
    description = "Builds the runnable CLI jar with its dependencies."
    archiveClassifier = "cli"
    from(sourceSets.main.get().output)
    configurations = listOf(project.configurations.runtimeClasspath.get(), cliLogging)
    manifest { attributes("Main-Class" to "com.lekman.qualify.cli.Main") }
    mergeServiceFiles()
    exclude(
        "META-INF/*.SF",
        "META-INF/*.DSA",
        "META-INF/*.RSA",
        "META-INF/versions/*/module-info.class",
        "module-info.class",
    )
}
tasks.assemble { dependsOn(cliJar) }

tasks.test {
    useJUnitPlatform()
    javaLauncher = java17
    // Fixture classes run through the JUnit testkit inside the tests, never
    // on their own.
    exclude("**/fixtures/**")
    systemProperty(
        "qualify.evidenceDir",
        layout.buildDirectory
            .dir("qualify-test-evidence")
            .get()
            .asFile.path,
    )
    testLogging {
        events("failed")
        exceptionFormat = TestExceptionFormat.FULL
    }
    finalizedBy(tasks.jacocoTestReport)
}

jacoco {
    toolVersion = "0.8.14"
}

// The process entry point only hands System.in/out and the file system to
// Commands, which the tests cover.
val coverageExcludes = listOf("com/lekman/qualify/cli/Main.class", "com/lekman/qualify/cli/Main\$ProcessIO.class")

tasks.jacocoTestReport {
    dependsOn(tasks.test)
    reports {
        xml.required = true
        html.required = true
    }
    classDirectories.setFrom(
        sourceSets.main
            .get()
            .output.asFileTree
            .matching { exclude(coverageExcludes) },
    )
}

tasks.jacocoTestCoverageVerification {
    dependsOn(tasks.test)
    classDirectories.setFrom(
        sourceSets.main
            .get()
            .output.asFileTree
            .matching { exclude(coverageExcludes) },
    )
    violationRules {
        rule {
            limit {
                counter = "LINE"
                minimum = "0.80".toBigDecimal()
            }
            limit {
                counter = "INSTRUCTION"
                minimum = "0.80".toBigDecimal()
            }
            limit {
                counter = "METHOD"
                minimum = "0.60".toBigDecimal()
            }
        }
    }
}
tasks.check { dependsOn(tasks.jacocoTestCoverageVerification) }

// Versions match the repository's Trunk configuration, so the build and
// Trunk never format or flag a file differently.
spotless {
    java {
        target("src/*/java/**/*.java")
        googleJavaFormat("1.32.0")
    }
    kotlin {
        target("src/*/kotlin/**/*.kt")
        ktlint("1.7.1").editorConfigOverride(mapOf("ktlint_code_style" to "ktlint_official"))
    }
    kotlinGradle {
        target("*.gradle.kts")
        ktlint("1.7.1").editorConfigOverride(mapOf("ktlint_code_style" to "ktlint_official"))
    }
}

detekt {
    toolVersion = "1.23.8"
    buildUponDefaultConfig = true
    config.setFrom("config/detekt/detekt.yml")
    source.setFrom("src/test/kotlin")
}
// detekt 1.23.8 embeds the Kotlin 2.0.21 compiler and refuses a newer one on
// its own classpath, which the Kotlin plugin of this build would bring in.
configurations.matching { it.name == "detekt" }.configureEach {
    resolutionStrategy.eachDependency {
        if (requested.group == "org.jetbrains.kotlin") useVersion("2.0.21")
    }
}
tasks.withType<Detekt>().configureEach { jvmTarget = "17" }
tasks.check { dependsOn(tasks.named("detekt")) }

tasks.register<JavaExec>("conformance") {
    group = "verification"
    description =
        "Runs every conformance scenario through the JUnit Platform launcher and diffs it with " +
        "spec/qualify/conformance/expected."
    dependsOn(cliJar, tasks.named(conformance.classesTaskName))
    classpath = conformance.runtimeClasspath
    mainClass = "com.lekman.qualify.conformance.harness.Harness"
    workingDir = layout.projectDirectory.asFile
    javaLauncher = java17
    systemProperty(
        "qualify.conformance.cliJar",
        cliJar
            .get()
            .archiveFile
            .get()
            .asFile.path,
    )
    systemProperty("qualify.conformance.classpath", conformance.runtimeClasspath.asPath)
    systemProperty("qualify.conformance.repoRoot", repoRoot.asFile.path)
    systemProperty(
        "qualify.conformance.java",
        java17
            .get()
            .executablePath.asFile.path,
    )
    args(providers.gradleProperty("only").map { listOf("--only", it) }.getOrElse(emptyList()))
}
