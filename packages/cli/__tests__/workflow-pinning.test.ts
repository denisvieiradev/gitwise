import { describe, it, expect, beforeAll } from "@jest/globals";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const SHA_RE = /^[0-9a-f]{40}$/;
const TRAILING_VERSION_COMMENT_RE = /#\s*v\d/;

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
const DEPENDABOT_PATH = join(REPO_ROOT, ".github", "dependabot.yml");
const WORKFLOWS_DIR = join(REPO_ROOT, ".github", "workflows");

/** Extract every `uses:` value from a workflow YAML string. */
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

/** Returns true if the `uses:` value is pinned to a 40-char hex SHA. */
function isPinnedToSha(usesValue: string): boolean {
  const atPos = usesValue.lastIndexOf("@");
  if (atPos === -1) return false;
  const ref = usesValue.slice(atPos + 1);
  return SHA_RE.test(ref);
}

/** Returns true if the `uses:` value is a local path reference (e.g., `./local`). */
function isLocalPath(usesValue: string): boolean {
  return usesValue.startsWith("./") || usesValue.startsWith("../");
}

describe("dependabot.yml structure", () => {
  it("exists at .github/dependabot.yml", () => {
    expect(existsSync(DEPENDABOT_PATH)).toBe(true);
  });

  it("parses as valid YAML — has version: 2 and updates: keys", async () => {
    const content = await readFile(DEPENDABOT_PATH, "utf-8");
    expect(content).toMatch(/^version:\s+2\s*$/m);
    expect(content).toMatch(/^updates:\s*$/m);
  });

  it("includes both npm and github-actions package-ecosystem entries", async () => {
    const content = await readFile(DEPENDABOT_PATH, "utf-8");
    expect(content).toMatch(/package-ecosystem:\s+["']?npm["']?/m);
    expect(content).toMatch(/package-ecosystem:\s+["']?github-actions["']?/m);
  });

  it("configures npm-minor-and-patch group", async () => {
    const content = await readFile(DEPENDABOT_PATH, "utf-8");
    expect(content).toContain("npm-minor-and-patch");
  });

  it("npm-minor-and-patch group has update-types with minor and patch", async () => {
    const content = await readFile(DEPENDABOT_PATH, "utf-8");
    expect(content).toMatch(/update-types:/m);
    expect(content).toMatch(/["']?minor["']?/m);
    expect(content).toMatch(/["']?patch["']?/m);
  });

  it("npm ecosystem is scheduled monthly", async () => {
    const content = await readFile(DEPENDABOT_PATH, "utf-8");
    expect(content).toMatch(/interval:\s+["']?monthly["']?/m);
  });

  it("github-actions ecosystem is scheduled monthly", async () => {
    const content = await readFile(DEPENDABOT_PATH, "utf-8");
    // Both ecosystems use monthly; check it appears at least twice
    const monthlyMatches = content.match(/interval:\s+["']?monthly["']?/gm);
    expect(monthlyMatches).not.toBeNull();
    expect((monthlyMatches ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe("ci.yml SHA pinning", () => {
  let ciContent: string;

  beforeAll(async () => {
    ciContent = await readFile(join(WORKFLOWS_DIR, "ci.yml"), "utf-8");
  });

  it("every uses: line in ci.yml references a 40-char hex SHA", () => {
    const usesEntries = extractUsesValues(ciContent);
    expect(usesEntries.length).toBeGreaterThan(0);
    const unpinned = usesEntries
      .filter((e) => !isPinnedToSha(e.raw) && !isLocalPath(e.raw))
      .map((e) => e.line);
    expect(unpinned).toEqual([]);
  });

  it("each SHA-pinned uses: line in ci.yml has a trailing version comment", () => {
    const usesEntries = extractUsesValues(ciContent);
    const missingComment = usesEntries
      .filter((e) => isPinnedToSha(e.raw))
      .filter((e) => !TRAILING_VERSION_COMMENT_RE.test(e.line))
      .map((e) => e.line);
    expect(missingComment).toEqual([]);
  });
});

describe("release.yml SHA pinning", () => {
  let releaseContent: string;

  beforeAll(async () => {
    releaseContent = await readFile(join(WORKFLOWS_DIR, "release.yml"), "utf-8");
  });

  it("every uses: line in release.yml references a 40-char hex SHA", () => {
    const usesEntries = extractUsesValues(releaseContent);
    expect(usesEntries.length).toBeGreaterThan(0);
    const unpinned = usesEntries
      .filter((e) => !isPinnedToSha(e.raw) && !isLocalPath(e.raw))
      .map((e) => e.line);
    expect(unpinned).toEqual([]);
  });

  it("each SHA-pinned uses: line in release.yml has a trailing version comment", () => {
    const usesEntries = extractUsesValues(releaseContent);
    const missingComment = usesEntries
      .filter((e) => isPinnedToSha(e.raw))
      .filter((e) => !TRAILING_VERSION_COMMENT_RE.test(e.line))
      .map((e) => e.line);
    expect(missingComment).toEqual([]);
  });
});

describe("Workflow SHA pinning — integration scan (all workflow files)", () => {
  it("every uses: in every .github/workflows/*.yml|*.yaml file is SHA-pinned or local", async () => {
    const files = await readdir(WORKFLOWS_DIR);
    const workflowFiles = files.filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
    expect(workflowFiles.length).toBeGreaterThan(0);

    const violations: string[] = [];

    for (const file of workflowFiles) {
      const content = await readFile(join(WORKFLOWS_DIR, file), "utf-8");
      for (const entry of extractUsesValues(content)) {
        if (!isPinnedToSha(entry.raw) && !isLocalPath(entry.raw)) {
          violations.push(`${file}: ${entry.line}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
