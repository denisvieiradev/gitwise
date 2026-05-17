import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  REMOVED_DEVFLOW_COMMANDS,
  REQUIRED_README_SECTIONS,
  lintMarkdownFile,
} from "../../scripts/docs-lint.mjs";

const REPO_ROOT = process.cwd();

describe("README.md", () => {
  const readmePath = join(REPO_ROOT, "README.md");

  it("contains every required top-level section", () => {
    const result = lintMarkdownFile(readmePath, REPO_ROOT, {
      requiredSections: REQUIRED_README_SECTIONS,
    });
    expect(result.missingSections).toEqual([]);
  });

  it("has no broken relative links", () => {
    const result = lintMarkdownFile(readmePath, REPO_ROOT);
    expect(result.brokenLinks).toEqual([]);
  });

  it("documents both install modes", () => {
    const content = readFileSync(readmePath, "utf8");
    expect(content).toContain("npm install -g @denisvieiradev/gitwise");
    expect(content.toLowerCase()).toContain("claude code plugin");
  });

  it("discloses the privacy posture", () => {
    const content = readFileSync(readmePath, "utf8").toLowerCase();
    expect(content).toContain("sensitive");
    expect(content).toMatch(/diff(s)? .*(sent|are sent).*claude/);
  });
});

describe("docs/migrating-from-devflow.md", () => {
  const path = join(REPO_ROOT, "docs", "migrating-from-devflow.md");

  it("has no broken relative links", () => {
    const result = lintMarkdownFile(path, REPO_ROOT);
    expect(result.brokenLinks).toEqual([]);
  });

  it("mentions every removed devflow command", () => {
    const content = readFileSync(path, "utf8");
    for (const cmd of REMOVED_DEVFLOW_COMMANDS) {
      expect(content).toContain(`devflow ${cmd}`);
    }
  });

  it("points to the gitwise replacement command surface", () => {
    const content = readFileSync(path, "utf8");
    for (const cmd of ["gw commit", "gw review", "gw pr", "gw release"]) {
      expect(content).toContain(cmd);
    }
  });
});

describe("docs/deprecation-banner.md", () => {
  const path = join(REPO_ROOT, "docs", "deprecation-banner.md");

  it("is non-empty", () => {
    const content = readFileSync(path, "utf8");
    expect(content.trim().length).toBeGreaterThan(0);
  });

  it("contains the new package name", () => {
    const content = readFileSync(path, "utf8");
    expect(content).toContain("@denisvieiradev/gitwise");
  });

  it("has no broken relative links", () => {
    const result = lintMarkdownFile(path, REPO_ROOT);
    expect(result.brokenLinks).toEqual([]);
  });
});

describe("CHANGELOG.md", () => {
  it("has a 0.1.0 gitwise refactor entry", () => {
    const content = readFileSync(join(REPO_ROOT, "CHANGELOG.md"), "utf8");
    expect(content).toMatch(/##\s*\[0\.1\.0\].*gitwise/i);
  });
});
