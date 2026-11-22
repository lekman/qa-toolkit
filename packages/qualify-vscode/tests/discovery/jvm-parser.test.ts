import { describe, expect, test } from "bun:test";

import { Discovery } from "../../src/discovery";

describe("Java and Kotlin discovery", () => {
  test("reads a Kotlin annotation, its class and its method", () => {
    const [d] = Discovery.parse(
      "/repo/svc/src/test/kotlin/BankFileTest.kt",
      `import com.lekman.qualify.OQ
import com.lekman.qualify.Risk
import com.lekman.qualify.Scope

class BankFileTest {
    @OQ(
        id = "OQ-EXPORT-003",
        title = "The bank file never changes an amount",
        given = "a day of payments",
        \`when\` = "the export runs",
        then = "every amount matches",
        requirements = ["EXPORT-003"],
        risk = Risk.HIGH,
        scope = Scope.READ_WRITE,
        tags = ["export"],
    )
    @Tag("slow")
    fun bankFileKeepsAmounts(ctx: QualifyContext) {
    }
}
`,
    );
    expect(d).toMatchObject({
      className: "BankFileTest",
      framework: "junit",
      id: "OQ-EXPORT-003",
      language: "jvm",
      line: 6,
      method: "bankFileKeepsAmounts",
      problems: [],
      requirements: ["EXPORT-003"],
      risk: "high",
      scope: "read-write",
      tags: ["export"],
    });
  });

  test("reads a Java annotation with array braces and a method after other annotations", () => {
    const [d] = Discovery.parse(
      "/repo/svc/src/test/java/BankFileTest.java",
      `import com.lekman.qualify.IU;

class BankFileTest {
  @IU(id = "IU-EXPORT-001", title = "A clerk sends the file",
      given = "g", when = "w", then = "t",
      requirements = {"EXPORT-001", "EXPORT-002"}, risk = Risk.LOW)
  @DisplayName("ignored")
  @Timeout(5)
  public void clerkSendsTheFile(QualifyContext ctx) {
    if (x(1)) {}
  }
}
`,
    );
    expect(d).toMatchObject({
      className: "BankFileTest",
      id: "IU-EXPORT-001",
      method: "clerkSendsTheFile",
      problems: [],
      requirements: ["EXPORT-001", "EXPORT-002"],
      risk: "low",
    });
  });

  test("reads a Kotlin method name in backticks", () => {
    const [d] = Discovery.parse(
      "/repo/svc/src/test/kotlin/A.kt",
      `import com.lekman.qualify.IQ
object Checks {
  @IQ(id = "IQ-SETUP-001", title = "t", given = "g", \`when\` = "w", then = "t")
  fun \`the service starts\`(ctx: QualifyContext) {}
}
`,
    );
    expect(d).toMatchObject({
      className: "Checks",
      method: "the service starts",
      problems: [],
    });
  });

  test("reads nothing from a file that does not use qualify", () => {
    expect(
      Discovery.parse("/repo/A.java", `@OQ(id = "OQ-AB-001") void a() {}`),
    ).toEqual([]);
  });
});
