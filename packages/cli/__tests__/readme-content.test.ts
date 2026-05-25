import { describe, it, expect, beforeAll } from "@jest/globals";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

function findRepoRoot(): string {
  let dir = resolve(process.cwd());
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "packages")) && existsSync(join(dir, "README.md"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Could not locate repo root from cwd " + process.cwd());
}

const REPO_ROOT = findRepoRoot();
const README_PATH = join(REPO_ROOT, "README.md");
const GOVERNANCE_PATH = join(REPO_ROOT, "GOVERNANCE.md");

let readme: string;
let governance: string;

beforeAll(async () => {
  [readme, governance] = await Promise.all([
    readFile(README_PATH, "utf-8"),
    readFile(GOVERNANCE_PATH, "utf-8"),
  ]);
});

function sectionContent(md: string, heading: string): string {
  const lines = md.split("\n");
  const startIdx = lines.findIndex((l) => l.trimEnd() === `## ${heading}`);
  if (startIdx === -1) return "";
  const endIdx = lines.findIndex((l, i) => i > startIdx && /^## /.test(l));
  const sectionLines =
    endIdx === -1 ? lines.slice(startIdx) : lines.slice(startIdx, endIdx);
  return sectionLines.join("\n");
}

describe("README.md — badges", () => {
  it("contains a CI status badge", () => {
    expect(readme).toMatch(/actions\/workflows\/ci\.yml\/badge\.svg/);
  });

  it("contains a CodeQL status badge", () => {
    expect(readme).toMatch(/actions\/workflows\/codeql\.yml\/badge\.svg/);
  });

  it("contains an OSV-Scanner status badge", () => {
    expect(readme).toMatch(/actions\/workflows\/osv-scanner\.yml\/badge\.svg/);
  });

  it("contains an npm provenance badge", () => {
    expect(readme).toMatch(/npm.{0,10}provenance/i);
  });

  it("contains an npm version badge", () => {
    expect(readme).toMatch(/img\.shields\.io\/npm\/v\//);
  });
});

describe("README.md — sections", () => {
  it("contains an H2 Security section", () => {
    expect(readme).toMatch(/^## Security$/m);
  });

  it("contains an H2 Supply Chain section", () => {
    expect(readme).toMatch(/^## Supply Chain$/m);
  });

  it("contains an H2 Governance section", () => {
    expect(readme).toMatch(/^## Governance$/m);
  });

  it("contains an H2 Exit Codes section", () => {
    expect(readme).toMatch(/^## Exit Codes$/m);
  });

  it("Security section links to SECURITY.md", () => {
    const sec = sectionContent(readme, "Security");
    expect(sec).toMatch(/\(SECURITY\.md\)/);
  });

  it("Security section links to CODE_OF_CONDUCT.md", () => {
    const sec = sectionContent(readme, "Security");
    expect(sec).toMatch(/\(CODE_OF_CONDUCT\.md\)/);
  });

  it("Supply Chain section links to docs supply-chain page", () => {
    const sec = sectionContent(readme, "Supply Chain");
    expect(sec).toMatch(/supply-chain\.md/);
  });

  it("Supply Chain section links to KEYS.asc", () => {
    const sec = sectionContent(readme, "Supply Chain");
    expect(sec).toMatch(/KEYS\.asc/);
  });

  it("Supply Chain section includes the npm view verification one-liner", () => {
    const sec = sectionContent(readme, "Supply Chain");
    expect(sec).toMatch(/npm view @denisvieiradev\/gitwise/);
  });

  it("Governance section links to GOVERNANCE.md", () => {
    const sec = sectionContent(readme, "Governance");
    expect(sec).toMatch(/\(GOVERNANCE\.md\)/);
  });

  it("Exit Codes section links to exit-codes page", () => {
    const sec = sectionContent(readme, "Exit Codes");
    expect(sec).toMatch(/exit-codes\.md/);
  });

  it("Exit Codes section mentions the --json envelope", () => {
    const sec = sectionContent(readme, "Exit Codes");
    expect(sec).toMatch(/--json/);
  });

  it("contains a Reporting Issues section referencing CODEOWNERS", () => {
    expect(readme).toMatch(/## Reporting Issues/);
    const sec = sectionContent(readme, "Reporting Issues");
    expect(sec).toMatch(/CODEOWNERS/);
  });
});

describe("README.md — link integrity", () => {
  it("all relative links resolve to existing files", () => {
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const missing: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(readme)) !== null) {
      const target = match[2] ?? "";
      if (
        !target ||
        target.startsWith("http") ||
        target.startsWith("#") ||
        target.startsWith("`") ||
        target.includes(" ")
      ) {
        continue;
      }
      const full = join(REPO_ROOT, target);
      if (!existsSync(full)) {
        missing.push(target);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe("GOVERNANCE.md — placeholder gate", () => {
  it("does not contain TODO(community-launch) placeholder", () => {
    expect(governance).not.toMatch(/TODO\(community-launch\)/);
  });
});
