package com.lekman.qualify

import com.lekman.qualify.fixtures.KotlinFixture
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Runs the Kotlin fixture through the JUnit testkit and reads its evidence. */
class KotlinCallShapeTest {
    @Test
    fun `the Kotlin call shape writes the evidence the specification describes`() {
        val run = Testkit.run(KotlinFixture::class.java)
        run.results().testEvents().assertStatistics { it.succeeded(2).failed(0) }

        val record = run.record("OQ-EXPORT-003")
        assertEquals("pass", record["outcome"])
        assertEquals("the export writes the bank file", record["when"])
        assertEquals(listOf("EXPORT-003"), record["requirements"])
        assertEquals("high", record["risk"])
        assertEquals(listOf("export"), record["tags"])
        val site = record["site"] as String
        val file = "packages/qualify-jvm/src/test/kotlin/com/lekman/qualify/fixtures/KotlinFixture.kt"
        assertTrue(site.startsWith("$file:"), site)

        @Suppress("UNCHECKED_CAST")
        val checks = record["checks"] as List<Map<String, Any?>>
        assertEquals(6, checks.size)
        assertEquals(mapOf("amount" to "100.50", "currency" to "EUR"), checks[2]["actual"])
        assertEquals("delegate", checks[3]["matcher"])
        assertEquals("completed", checks[3]["actual"])
        assertEquals("read", run.record("IQ-EXPORT-001")["scope"])
    }
}
