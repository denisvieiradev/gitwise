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
const CODEQL_PATH = join(REPO_ROOT, ".github", "workflows", "codeql.yml");

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

function isPinnedToSha(usesValue: string): boolean {
  const atPos = usesValue.lastIndexOf("@");
  if (atPos === -1) return false;
  const ref = usesValue.slice(atPos + 1);
  return SHA_RE.test(ref);
}

describe("codeql.yml — file existence", () => {
  it("exists at .github/workflows/codeql.yml", () => {
    expect(existsSync(CODEQL_PATH)).toBe(true);
  });
});

describe("codeql.yml — YAML validity", () => {
  let content: string;

  beforeAll(async () => {
    content = await readFile(CODEQL_PATH, "utf-8");
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

describe("codeql.yml — required Action references", () => {
  let content: string;

  beforeAll(async () => {
    content = await readFile(CODEQL_PATH, "utf-8");
  });

  it("contains github/codeql-action/init pinned to a 40-char SHA", () => {
    const usesEntries = extractUsesValues(content);
    const initEntry = usesEntries.find((e) => e.raw.startsWith("github/codeql-action/init@"));
    expect(initEntry).toBeDefined();
    expect(isPinnedToSha(initEntry!.raw)).toBe(true);
  });

  it("contains github/codeql-action/analyze pinned to a 40-char SHA", () => {
    const usesEntries = extractUsesValues(content);
    const analyzeEntry = usesEntries.find((e) => e.raw.startsWith("github/codeql-action/analyze@"));
    expect(analyzeEntry).toBeDefined();
    expect(isPinnedToSha(analyzeEntry!.raw)).toBe(true);
  });
});

describe("codeql.yml — query suites", () => {
  let content: string;

  beforeAll(async () => {
    content = await readFile(CODEQL_PATH, "utf-8");
  });

  it("includes the security-and-quality query suite", () => {
    expect(content).toContain("security-and-quality");
  });

  it("includes the security-extended query suite", () => {
    expect(content).toContain("security-extended");
  });
});

describe("codeql.yml — language configuration", () => {
  let content: string;

  beforeAll(async () => {
    content = await readFile(CODEQL_PATH, "utf-8");
  });

  it("configures javascript-typescript language", () => {
    expect(content).toMatch(/languages?:\s+javascript-typescript/);
  });
});

describe("codeql.yml — triggers", () => {
  let content: string;

  beforeAll(async () => {
    content = await readFile(CODEQL_PATH, "utf-8");
  });

  it("triggers on push to main", () => {
    expect(content).toMatch(/push:/);
    expect(content).toMatch(/branches:\s*\[main\]/m);
  });

  it("triggers on pull_request targeting main", () => {
    expect(content).toMatch(/pull_request:/);
  });

  it("triggers on a weekly schedule cron", () => {
    expect(content).toMatch(/schedule:/);
    expect(content).toMatch(/cron:/);
  });
});

describe("codeql.yml — permissions", () => {
  let content: string;

  beforeAll(async () => {
    content = await readFile(CODEQL_PATH, "utf-8");
  });

  it("declares security-events: write", () => {
    expect(content).toMatch(/security-events:\s+write/);
  });

  it("declares actions: read", () => {
    expect(content).toMatch(/actions:\s+read/);
  });

  it("declares contents: read", () => {
    expect(content).toMatch(/contents:\s+read/);
  });
});

describe("codeql.yml — SHA pinning (integration)", () => {
  let content: string;

  beforeAll(async () => {
    content = await readFile(CODEQL_PATH, "utf-8");
  });

  it("every uses: line in codeql.yml is pinned to a 40-char hex SHA", () => {
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
