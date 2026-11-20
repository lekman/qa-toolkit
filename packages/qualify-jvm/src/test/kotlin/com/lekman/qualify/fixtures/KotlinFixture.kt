package com.lekman.qualify.fixtures

import com.lekman.qualify.IQ
import com.lekman.qualify.OQ
import com.lekman.qualify.QualifyContext
import com.lekman.qualify.Risk
import com.lekman.qualify.Scope

/** A bank file line, as a Kotlin data class. */
data class Payment(
    val currency: String,
    val amount: String,
)

/** The call shape of section 2.4 of the specification, from Kotlin. */
class KotlinFixture {
    private val ledger = listOf(Payment("EUR", "100.50"), Payment("SEK", "1200.00"))

    @OQ(
        id = "OQ-EXPORT-003",
        title = "The bank file never changes an amount",
        given = "a day of payments in three currencies",
        `when` = "the export writes the bank file",
        then = "every amount in the file equals the amount in the ledger",
        requirements = ["EXPORT-003"],
        risk = Risk.HIGH,
        scope = Scope.READ,
        tags = ["export"],
    )
    fun bankFileKeepsAmounts(ctx: QualifyContext) {
        val file = ledger.associate { it.currency to it.amount }
        ctx.check("bank file", "EUR keeps two decimals").that(file["EUR"]).isEqualTo("100.50")
        ctx.check("bank file", "holds every payment").that(ledger).hasLength(ledger.size)
        ctx.check("bank file", "first line").that(ledger.first()).isEqualTo(Payment("EUR", "100.50"))
        ctx.delegate("ledger", "helper checks the totals") { checkTotals() }
        val count = ctx.delegateValue("ledger", "counts lines") { ledger.size }
        ctx.check("ledger", "two lines").that(count).isEqualTo(2)
    }

    @IQ(
        id = "IQ-EXPORT-001",
        title = "The export service is installed",
        given = "a fresh installation",
        `when` = "the service starts",
        then = "it reports its version",
    )
    fun serviceIsInstalled(ctx: QualifyContext) {
        ctx.check("service", "reports a version").that("1.2.3").matches("^\\d+\\.\\d+\\.\\d+$")
    }

    private fun checkTotals() {
        check(ledger.isNotEmpty()) { "the ledger is empty" }
    }
}
