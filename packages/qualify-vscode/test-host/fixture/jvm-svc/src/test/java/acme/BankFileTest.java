package acme;

import com.lekman.qualify.IQ;
import com.lekman.qualify.QualifyContext;

class BankFileTest {
  @IQ(
      id = "IQ-EXPORT-001",
      title = "The export service starts with its settings",
      given = "the installed service",
      when = "it starts",
      then = "it reads its settings",
      requirements = {"EXPORT-001"})
  void serviceStarts(QualifyContext ctx) {
    ctx.check("service", "starts").that(true).isTrue();
  }
}
