import { describe, expect, test } from "bun:test";

import { Envelope } from "../../src/envelope";

const git = { root: "/r", commit: "a".repeat(40), branch: "main", dirty: true };

describe("Envelope", () => {
  test("actor on GitHub Actions", () => {
    expect(
      Envelope.actor({
        GITHUB_ACTIONS: "true",
        GITHUB_ACTOR: "octo",
        GITHUB_SERVER_URL: "https://github.com",
        GITHUB_REPOSITORY: "acme/app",
        GITHUB_RUN_ID: "42",
      }),
    ).toEqual({
      name: "octo",
      ci: "github-actions",
      ciRunUrl: "https://github.com/acme/app/actions/runs/42",
    });
    expect(Envelope.actor({ GITHUB_ACTIONS: "true" })).toEqual({
      name: null,
      ci: "github-actions",
      ciRunUrl: null,
    });
  });

  test("actor outside CI", () => {
    expect(Envelope.actor({ USER: "dev" })).toEqual({
      name: "dev",
      ci: null,
      ciRunUrl: null,
    });
    expect(Envelope.actor({ USERNAME: "win" })).toEqual({
      name: "win",
      ci: null,
      ciRunUrl: null,
    });
    expect(Envelope.actor({})).toEqual({
      name: null,
      ci: null,
      ciRunUrl: null,
    });
  });

  test("source from git, with the CI branch on a detached head", () => {
    expect(Envelope.source(git, {})).toEqual({
      commit: "a".repeat(40),
      branch: "main",
      dirty: true,
    });
    expect(
      Envelope.source(
        { ...git, branch: null },
        { GITHUB_ACTIONS: "true", GITHUB_HEAD_REF: "feat/x" },
      ).branch,
    ).toBe("feat/x");
    expect(
      Envelope.source(
        { ...git, branch: null },
        { GITHUB_ACTIONS: "true", GITHUB_REF_NAME: "main" },
      ).branch,
    ).toBe("main");
    expect(Envelope.source({ ...git, branch: null }, {}).branch).toBeNull();
    expect(
      Envelope.source(
        { root: null, commit: "short", branch: null, dirty: null },
        {},
      ),
    ).toEqual({
      commit: null,
      branch: null,
      dirty: null,
    });
  });

  test("target from QUALIFY_TARGET_ variables", () => {
    expect(
      Envelope.target({
        QUALIFY_TARGET_DIGEST: "sha256:abc",
        QUALIFY_TARGET_IMAGE_TAG: "",
        QUALIFY_TARGET_: "x",
        OTHER: "y",
      }),
    ).toEqual({ digest: "sha256:abc", image_tag: null });
  });

  test("build", () => {
    const run = Envelope.build({
      env: { USER: "dev" },
      environment: "local",
      git,
      policy: { productionWriteBlocked: false, overrides: [] },
      runId: "01HQA1ZQJ0C0NF0RMANCE00000",
      tool: {
        name: "q",
        version: "1",
        language: "typescript",
        runtime: "node",
      },
    });
    expect(run.id).toBe("01HQA1ZQJ0C0NF0RMANCE00000");
    expect(run.actor.name).toBe("dev");
    expect(run.target).toEqual({});
  });
});
