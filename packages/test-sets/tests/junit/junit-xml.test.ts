import { describe, expect, test } from "bun:test";

import { JunitXml } from "../../src";

const VITEST = `<?xml version="1.0" encoding="UTF-8" ?>
<testsuites name="vitest tests" tests="4" failures="1" errors="0" time="0.5">
  <testsuite name="src/a.test.ts" timestamp="x" hostname="h" tests="4" failures="1" errors="0" skipped="1" time="0.5">
    <testcase classname="src/a.test.ts" name="adds &amp; keeps" time="0.1" file="src/a.test.ts" line="3">
    </testcase>
    <testcase classname="src/a.test.ts" name="fails" time="0.2">
      <failure message="expected 1 to be 2" type="AssertionError"><![CDATA[AssertionError: expected 1 to be 2
    at src/a.test.ts:9]]></failure>
    </testcase>
    <testcase classname="src/a.test.ts" name="skips" time="0">
      <skipped/>
    </testcase>
    <testcase classname="src/a.test.ts" name="throws" time="1,000.5"><error>TypeError: &lt;boom&gt; &#65;&#x42;</error></testcase>
  </testsuite>
</testsuites>
`;

const PYTEST = `<?xml version="1.0" encoding="utf-8"?><testsuites><testsuite name="pytest" errors="0" failures="0" skipped="0" tests="1"><testcase classname="tests.test_a" name="test_a" time="0.01" /></testsuite></testsuites>`;

describe("JunitXml", () => {
  test("reads every case with its outcome, message, suite, file and line", () => {
    const cases = JunitXml.cases(VITEST);
    expect(cases).toEqual([
      {
        classname: "src/a.test.ts",
        file: "src/a.test.ts",
        line: 3,
        name: "adds & keeps",
        outcome: "pass",
        suite: "src/a.test.ts",
        time: 0.1,
      },
      {
        classname: "src/a.test.ts",
        message: "expected 1 to be 2",
        name: "fails",
        outcome: "fail",
        suite: "src/a.test.ts",
        time: 0.2,
      },
      {
        classname: "src/a.test.ts",
        name: "skips",
        outcome: "skip",
        suite: "src/a.test.ts",
        time: 0,
      },
      {
        classname: "src/a.test.ts",
        message: "TypeError: <boom> AB",
        name: "throws",
        outcome: "error",
        suite: "src/a.test.ts",
        time: 1000.5,
      },
    ]);
    expect(JunitXml.cases(PYTEST)).toEqual([
      {
        classname: "tests.test_a",
        name: "test_a",
        outcome: "pass",
        suite: "pytest",
        time: 0.01,
      },
    ]);
  });

  test("reads nothing from text that is not JUnit XML, and stops at a broken tag", () => {
    expect(JunitXml.cases("not xml")).toEqual([]);
    expect(JunitXml.cases("<testcase name='a'")).toEqual([]);
    expect(JunitXml.cases("<testcases/><testcase name='a'/>")).toEqual([
      { name: "a", outcome: "pass", suite: "" },
    ]);
  });

  test("summarises", () => {
    expect(JunitXml.summary(JunitXml.cases(VITEST))).toEqual({
      errors: 1,
      failures: 1,
      skipped: 1,
      tests: 4,
      time: 1000.8,
    });
  });

  test("merges reports under one testsuites element with the totals", () => {
    const merged = JunitXml.merge([
      VITEST,
      PYTEST,
      JunitXml.missing("e2e <web>", 'exited "1"'),
    ]);
    expect(merged).toStartWith(
      '<?xml version="1.0" encoding="UTF-8"?>\n<testsuites tests="6" failures="1" errors="2" skipped="1"',
    );
    expect(
      JunitXml.cases(merged).map((c) => `${c.suite}/${c.name}/${c.outcome}`),
    ).toEqual([
      "src/a.test.ts/adds & keeps/pass",
      "src/a.test.ts/fails/fail",
      "src/a.test.ts/skips/skip",
      "src/a.test.ts/throws/error",
      "pytest/test_a/pass",
      "e2e <web>/e2e <web>/error",
    ]);
  });
});
