import { describe, it, expect, beforeAll } from "@jest/globals";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

function findRepoRoot(): string {
  let dir = resolve(process.cwd());
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "packages")) && existsSync(join(dir, "GOVERNANCE.md"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Could not locate repo root from cwd " + process.cwd());
}

const REPO_ROOT = findRepoRoot();
const CODEOWNERS_PATH = join(REPO_ROOT, ".github", "CODEOWNERS");
const COC_PATH = join(REPO_ROOT, "CODE_OF_CONDUCT.md");
const GOVERNANCE_PATH = join(REPO_ROOT, "GOVERNANCE.md");

describe(".github/CODEOWNERS", () => {
  it("exists at .github/CODEOWNERS", () => {
    expect(existsSync(CODEOWNERS_PATH)).toBe(true);
  });

  it("contains the single ownership rule * @denisvieiradev", async () => {
    const content = await readFile(CODEOWNERS_PATH, "utf-8");
    const nonCommentLines = content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));
    expect(nonCommentLines).toHaveLength(1);
    expect(nonCommentLines[0]).toBe("* @denisvieiradev");
  });
});

describe("CODE_OF_CONDUCT.md", () => {
  let content: string;

  beforeAll(async () => {
    content = await readFile(COC_PATH, "utf-8");
  });

  it("exists at the repo root", () => {
    expect(existsSync(COC_PATH)).toBe(true);
  });

  it("mentions Contributor Covenant", () => {
    expect(content).toMatch(/Contributor Covenant/);
  });

  it("references version 2.1", () => {
    expect(content).toMatch(/2\.1/);
  });

  it("contains the enforcement contact email denisvieira05@gmail.com", () => {
    expect(content).toMatch(/denisvieira05@gmail\.com/);
  });

  it("contains a TODO(community-launch) placeholder for the external CoC reviewer", () => {
    expect(content).toMatch(/TODO\(community-launch\)/);
  });

  it("contains an Our Pledge section", () => {
    expect(content).toMatch(/^## Our Pledge/m);
  });

  it("contains an Enforcement section", () => {
    expect(content).toMatch(/^## Enforcement/m);
  });

  it("contains an Attribution section referencing contributor-covenant.org", () => {
    expect(content).toMatch(/contributor-covenant\.org/);
  });
});

describe("GOVERNANCE.md", () => {
  let content: string;

  beforeAll(async () => {
    content = await readFile(GOVERNANCE_PATH, "utf-8");
  });

  it("exists at the repo root", () => {
    expect(existsSync(GOVERNANCE_PATH)).toBe(true);
  });

  it("contains an H2 Decision Process section", () => {
    expect(content).toMatch(/^## Decision Process/m);
  });

  it("contains an H2 SLA section", () => {
    expect(content).toMatch(/^## SLA/m);
  });

  it("contains an H2 Path to Co-maintainership section", () => {
    expect(content).toMatch(/^## Path to Co-maintainership/m);
  });

  it("contains an H2 Succession section", () => {
    expect(content).toMatch(/^## Succession/m);
  });

  it("references the 90-day inactivity threshold in the Succession section", () => {
    const successionSection = content
      .split(/^## /m)
      .find((s) => s.startsWith("Succession"));
    expect(successionSection).toBeDefined();
    expect(successionSection).toMatch(/90.day/i);
  });

  it("references the BDFL governance model", () => {
    expect(content).toMatch(/BDFL|Benevolent Dictator/);
  });

  it("SLA section includes 7-day PR triage target", () => {
    const slaSection = content.split(/^## /m).find((s) => s.startsWith("SLA"));
    expect(slaSection).toBeDefined();
    expect(slaSection).toMatch(/7.day/i);
  });

  it("SLA section includes 14-day bug acknowledgment target", () => {
    const slaSection = content.split(/^## /m).find((s) => s.startsWith("SLA"));
    expect(slaSection).toBeDefined();
    expect(slaSection).toMatch(/14.day/i);
  });

  it("Path to Co-maintainership section references 5 merged PRs requirement", () => {
    const pathSection = content
      .split(/^## /m)
      .find((s) => s.startsWith("Path to Co-maintainership"));
    expect(pathSection).toBeDefined();
    expect(pathSection).toMatch(/5.merged PR|5 merged PR/i);
  });

  it("links to CODE_OF_CONDUCT.md", () => {
    expect(content).toMatch(/CODE_OF_CONDUCT\.md/);
  });
});
