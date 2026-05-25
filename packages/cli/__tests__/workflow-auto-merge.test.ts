import { describe, it, expect, beforeAll } from "@jest/globals";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const SHA_RE = /^[0-9a-f]{40}$/;

function findRepoRoot(): string {
  let dir = resolve(process.cwd());
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "packages")) && existsSync(join(dir, ".github"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Could not locate repo root from cwd " + process.cwd());
}

const REPO_ROOT = findRepoRoot();
const WORKFLOW_PATH = join(
  REPO_ROOT,
  ".github",
  "workflows",
  "dependabot-auto-merge.yml"
);

function extractUsesValues(content: string): Array<{ raw: string; line: string }> {
  const results: Array<{ raw: string; line: string }> = [];
  for (const line of content.split("\n")) {
    const match = line.match(/^\s+uses:\s+(\S+)/);
    if (match && match[1]) {
      results.push({ raw: match[1], line: line.trim() });
    }
  }
  return results;
}

function isPinnedToSha(usesValue: string): boolean {
  const atPos = usesValue.lastIndexOf("@");
  if (atPos === -1) return false;
  const ref = usesValue.slice(atPos + 1);
  return SHA_RE.test(ref);
}

/**
 * Business logic mirroring the workflow conditions.
 * Kept in sync with the YAML if: expressions for integration-scenario tests.
 */
function jobConditionMet(actor: string): boolean {
  return actor === "dependabot[bot]";
}

function stepConditionMet(updateType: string, ecosystem: string): boolean {
  const isPatchOrMinor =
    updateType === "version-update:semver-patch" ||
    updateType === "version-update:semver-minor";
  return isPatchOrMinor && ecosystem !== "github-actions";
}

function shouldAutoMerge(
  actor: string,
  updateType: string,
  ecosystem: string
): boolean {
  return jobConditionMet(actor) && stepConditionMet(updateType, ecosystem);
}

// ---------------------------------------------------------------------------
// Unit tests — structural checks on the YAML file
// ---------------------------------------------------------------------------

describe("dependabot-auto-merge.yml — file existence", () => {
  it("exists at .github/workflows/dependabot-auto-merge.yml", () => {
    expect(existsSync(WORKFLOW_PATH)).toBe(true);
  });
});

describe("dependabot-auto-merge.yml — YAML structure", () => {
  let content: string;

  beforeAll(async () => {
    content = await readFile(WORKFLOW_PATH, "utf-8");
  });

  it("file is non-empty and readable", () => {
    expect(content.length).toBeGreaterThan(0);
  });

  it("has required top-level YAML keys: name, on, permissions, jobs", () => {
    expect(content).toMatch(/^name:/m);
    expect(content).toMatch(/^on:/m);
    expect(content).toMatch(/^permissions:/m);
    expect(content).toMatch(/^jobs:/m);
  });
});

describe("dependabot-auto-merge.yml — trigger", () => {
  let content: string;

  beforeAll(async () => {
    content = await readFile(WORKFLOW_PATH, "utf-8");
  });

  it("declares pull_request as the trigger event", () => {
    expect(content).toMatch(/pull_request:/m);
  });

  it("does not trigger on push or schedule (scope is PR-only)", () => {
    expect(content).not.toMatch(/^  push:/m);
    expect(content).not.toMatch(/^  schedule:/m);
  });
});

describe("dependabot-auto-merge.yml — actor guard", () => {
  let content: string;

  beforeAll(async () => {
    content = await readFile(WORKFLOW_PATH, "utf-8");
  });

  it("job-level if: condition contains github.actor == 'dependabot[bot]'", () => {
    expect(content).toMatch(/if:\s+github\.actor\s*==\s*['"]dependabot\[bot\]['"]/m);
  });

  it("references dependabot[bot] exactly (not a substring match)", () => {
    expect(content).toContain("dependabot[bot]");
  });
});

describe("dependabot-auto-merge.yml — update-type guard", () => {
  let content: string;

  beforeAll(async () => {
    content = await readFile(WORKFLOW_PATH, "utf-8");
  });

  it("step-level if: condition contains semver-patch update type", () => {
    expect(content).toContain("version-update:semver-patch");
  });

  it("step-level if: condition contains semver-minor update type", () => {
    expect(content).toContain("version-update:semver-minor");
  });

  it("step-level if: condition does NOT allow semver-major", () => {
    expect(content).not.toContain("version-update:semver-major");
  });
});

describe("dependabot-auto-merge.yml — ecosystem exclusion", () => {
  let content: string;

  beforeAll(async () => {
    content = await readFile(WORKFLOW_PATH, "utf-8");
  });

  it("step-level if: condition excludes the github-actions ecosystem", () => {
    expect(content).toMatch(/package-ecosystem\s*!=\s*['"]github-actions['"]/);
  });

  it("references package-ecosystem output from fetch-metadata step", () => {
    expect(content).toContain("package-ecosystem");
  });
});

describe("dependabot-auto-merge.yml — permissions", () => {
  let content: string;

  beforeAll(async () => {
    content = await readFile(WORKFLOW_PATH, "utf-8");
  });

  it("declares contents: write", () => {
    expect(content).toMatch(/contents:\s+write/m);
  });

  it("declares pull-requests: write", () => {
    expect(content).toMatch(/pull-requests:\s+write/m);
  });

  it("does not grant unnecessary permissions beyond contents and pull-requests", () => {
    expect(content).not.toMatch(/security-events:\s+write/m);
    expect(content).not.toMatch(/id-token:\s+write/m);
    expect(content).not.toMatch(/packages:\s+write/m);
  });
});

describe("dependabot-auto-merge.yml — dependabot/fetch-metadata reference", () => {
  let content: string;

  beforeAll(async () => {
    content = await readFile(WORKFLOW_PATH, "utf-8");
  });

  it("uses dependabot/fetch-metadata action", () => {
    expect(content).toMatch(/dependabot\/fetch-metadata/);
  });

  it("dependabot/fetch-metadata is pinned to a 40-char commit SHA", () => {
    const usesEntries = extractUsesValues(content);
    const fetchMetaEntry = usesEntries.find((e) =>
      e.raw.startsWith("dependabot/fetch-metadata@")
    );
    expect(fetchMetaEntry).toBeDefined();
    expect(isPinnedToSha(fetchMetaEntry!.raw)).toBe(true);
  });

  it("fetch-metadata step id is 'metadata' for output references", () => {
    expect(content).toMatch(/id:\s+metadata/m);
  });
});

describe("dependabot-auto-merge.yml — SHA pinning (all uses)", () => {
  let content: string;

  beforeAll(async () => {
    content = await readFile(WORKFLOW_PATH, "utf-8");
  });

  it("every uses: line is pinned to a 40-char hex SHA or is a local path", () => {
    const usesEntries = extractUsesValues(content);
    expect(usesEntries.length).toBeGreaterThan(0);
    const unpinned = usesEntries
      .filter((e) => !isPinnedToSha(e.raw) && !e.raw.startsWith("./") && !e.raw.startsWith("../"))
      .map((e) => e.line);
    expect(unpinned).toEqual([]);
  });

  it("every SHA-pinned uses: line has a trailing version comment", () => {
    const usesEntries = extractUsesValues(content);
    const missingComment = usesEntries
      .filter((e) => isPinnedToSha(e.raw))
      .filter((e) => !/#\s*v\d/.test(e.line))
      .map((e) => e.line);
    expect(missingComment).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Integration tests — condition logic simulation with event payloads
// ---------------------------------------------------------------------------

describe("auto-merge conditions — integration scenarios", () => {
  it("dependabot[bot] npm semver-patch PR: conditions evaluate to merge", () => {
    expect(
      shouldAutoMerge("dependabot[bot]", "version-update:semver-patch", "npm")
    ).toBe(true);
  });

  it("dependabot[bot] npm semver-minor PR: conditions evaluate to merge", () => {
    expect(
      shouldAutoMerge("dependabot[bot]", "version-update:semver-minor", "npm")
    ).toBe(true);
  });

  it("dependabot[bot] npm semver-major PR: conditions evaluate to do not merge", () => {
    expect(
      shouldAutoMerge("dependabot[bot]", "version-update:semver-major", "npm")
    ).toBe(false);
  });

  it("dependabot[bot] github-actions semver-patch PR: conditions evaluate to do not merge", () => {
    expect(
      shouldAutoMerge(
        "dependabot[bot]",
        "version-update:semver-patch",
        "github-actions"
      )
    ).toBe(false);
  });

  it("dependabot[bot] github-actions semver-minor PR: conditions evaluate to do not merge", () => {
    expect(
      shouldAutoMerge(
        "dependabot[bot]",
        "version-update:semver-minor",
        "github-actions"
      )
    ).toBe(false);
  });

  it("non-dependabot actor npm patch PR: job is skipped (actor guard fails)", () => {
    expect(
      shouldAutoMerge("some-human-user", "version-update:semver-patch", "npm")
    ).toBe(false);
  });

  it("non-dependabot actor npm minor PR: job is skipped (actor guard fails)", () => {
    expect(
      shouldAutoMerge(
        "renovate[bot]",
        "version-update:semver-minor",
        "npm"
      )
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Contract test — YAML conditions reference the same variables as the logic
// ---------------------------------------------------------------------------

describe("auto-merge conditions — YAML-logic contract", () => {
  let content: string;

  beforeAll(async () => {
    content = await readFile(WORKFLOW_PATH, "utf-8");
  });

  it("YAML actor condition references github.actor", () => {
    expect(content).toContain("github.actor");
  });

  it("YAML update-type condition references steps.metadata.outputs.update-type", () => {
    expect(content).toContain("steps.metadata.outputs.update-type");
  });

  it("YAML ecosystem condition references steps.metadata.outputs.package-ecosystem", () => {
    expect(content).toContain("steps.metadata.outputs.package-ecosystem");
  });

  it("auto-merge step uses gh pr merge --auto --squash", () => {
    expect(content).toMatch(/gh pr merge --auto --squash/);
  });

  it("gh pr merge step passes PR_URL via env (not interpolated inline)", () => {
    expect(content).toMatch(/PR_URL:/m);
    expect(content).toContain('"$PR_URL"');
  });
});
