import type {
  ActorInfo,
  PolicyInfo,
  RunInfo,
  SourceInfo,
  ToolInfo,
} from "../evidence";
import type { EnvironmentVariables } from "../settings";
import type { GitFacts } from "./types";

const COMMIT = /^[0-9a-f]{40}$/;
const TARGET_PREFIX = "QUALIFY_TARGET_";

const value = (text: string | undefined): null | string =>
  text === undefined || text.length === 0 ? null : text;

/** Builds the run envelope of section 6.4 from facts the caller gathered. */
export class Envelope {
  /**
   * Who ran the tests. On GitHub Actions: the actor and the run's URL.
   * Outside CI: the user name from `USER` or `USERNAME`.
   */
  static actor(env: EnvironmentVariables): ActorInfo {
    if (env.GITHUB_ACTIONS === "true") {
      const server = value(env.GITHUB_SERVER_URL);
      const repository = value(env.GITHUB_REPOSITORY);
      const runId = value(env.GITHUB_RUN_ID);
      return {
        name: value(env.GITHUB_ACTOR),
        ci: "github-actions",
        ciRunUrl:
          server && repository && runId
            ? `${server}/${repository}/actions/runs/${runId}`
            : null,
      };
    }
    return {
      name: value(env.USER) ?? value(env.USERNAME),
      ci: null,
      ciRunUrl: null,
    };
  }

  /** The full envelope. */
  static build(input: {
    env: EnvironmentVariables;
    environment: string;
    git: GitFacts;
    policy: PolicyInfo;
    runId: string;
    tool: ToolInfo;
  }): RunInfo {
    return {
      id: input.runId,
      environment: input.environment,
      tool: { ...input.tool },
      source: Envelope.source(input.git, input.env),
      actor: Envelope.actor(input.env),
      target: Envelope.target(input.env),
      policy: input.policy,
    };
  }

  /**
   * The code under test. A detached head, as CI checks out, takes the branch
   * from `GITHUB_HEAD_REF` or `GITHUB_REF_NAME` when GitHub Actions sets them.
   */
  static source(git: GitFacts, env: EnvironmentVariables): SourceInfo {
    const commit =
      git.commit !== null && COMMIT.test(git.commit) ? git.commit : null;
    let branch = value(git.branch ?? undefined);
    if (
      branch === null &&
      git.commit !== null &&
      env.GITHUB_ACTIONS === "true"
    ) {
      branch = value(env.GITHUB_HEAD_REF) ?? value(env.GITHUB_REF_NAME);
    }
    return { commit, branch, dirty: git.dirty };
  }

  /**
   * Declared facts about the target: `QUALIFY_TARGET_<NAME>` becomes
   * `target.<name>`, lower-cased. A variable set but empty becomes `null`.
   */
  static target(env: EnvironmentVariables): Record<string, null | string> {
    const target: Record<string, null | string> = {};
    for (const [name, text] of Object.entries(env)) {
      if (!name.startsWith(TARGET_PREFIX) || text === undefined) continue;
      const key = name.slice(TARGET_PREFIX.length).toLowerCase();
      if (key.length === 0) continue;
      target[key] = value(text);
    }
    return target;
  }
}
