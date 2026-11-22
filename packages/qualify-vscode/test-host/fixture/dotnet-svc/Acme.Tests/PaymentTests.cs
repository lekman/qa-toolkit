using Lekman.Qualify;

namespace Acme.Tests;

public class PaymentTests
{
    [OQ("OQ-PAYMENT-001", "A payment is refused without a signature",
        Given = "an unsigned payment",
        When = "it is sent",
        Then = "it is refused",
        Requirements = ["PAYMENT-001"], Risk = Risk.High, Scope = Scope.Read)]
    public void UnsignedPaymentIsRefused()
    {
        QualifyContext.Current.Check("payment", "is refused").That(true).IsTrue();
    }
}
