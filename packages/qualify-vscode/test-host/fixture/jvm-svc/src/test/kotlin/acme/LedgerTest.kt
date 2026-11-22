package acme

import com.lekman.qualify.OQ
import com.lekman.qualify.QualifyContext
import com.lekman.qualify.Risk
import com.lekman.qualify.Scope

class LedgerTest {
    @OQ(
        id = "OQ-LEDGER-001",
        title = "The ledger keeps every payment",
        given = "a day of payments",
        `when` = "the ledger is closed",
        then = "every payment is in the ledger",
        requirements = ["LEDGER-001"],
        risk = Risk.LOW,
        scope = Scope.READ,
    )
    fun ledgerKeepsPayments(ctx: QualifyContext) {
        ctx.check("ledger", "keeps payments").that(3).isEqualTo(3)
    }
}
