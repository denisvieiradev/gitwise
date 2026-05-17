import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  REQUIRED_README_SECTIONS,
  REMOVED_DEVFLOW_COMMANDS,
  extractHeadings,
  extractRelativeLinks,
  findBrokenLinks,
  findMissingSections,
  lintMarkdownFile,
  resolveLinkTarget,
} from "../../../scripts/docs-lint.mjs";

describe("extractHeadings", () => {
  it("returns all level-1..6 headings in order", () => {
    const md = [
      "# Top",
      "",
      "## Middle",
      "###### Deep",
      "Not a heading",
    ].join("\n");
    expect(extractHeadings(md)).toEqual(["Top", "Middle", "Deep"]);
  });

  it("ignores headings inside fenced code blocks", () => {
    const md = [
      "# Real",
      "```",
      "# Fake",
      "## Also fake",
      "```",
      "## Real two",
    ].join("\n");
    expect(extractHeadings(md)).toEqual(["Real", "Real two"]);
  });

  it("trims surrounding markdown emphasis from heading text", () => {
    const md = "## *Emphasized*\n## `Code`";
    expect(extractHeadings(md)).toEqual(["Emphasized", "Code"]);
  });

  it("returns an empty array when there are no headings", () => {
    expect(extractHeadings("just a paragraph")).toEqual([]);
  });
});

describe("findMissingSections", () => {
  it("returns all required sections when none are present", () => {
    expect(findMissingSections("# Other")).toEqual(REQUIRED_README_SECTIONS);
  });

  it("matches section names case-insensitively", () => {
    const md = ["# install", "# COMMANDS", "# Privacy", "# configuration"].join("\n");
    expect(findMissingSections(md)).toEqual([]);
  });

  it("supports custom required sections", () => {
    const md = "# Foo\n# Bar";
    expect(findMissingSections(md, ["Foo", "Baz"])).toEqual(["Baz"]);
  });

  it("flags the README as missing sections when partial", () => {
    const md = "# Install\n# Commands";
    expect(findMissingSections(md)).toEqual(["Privacy", "Configuration"]);
  });
});

describe("extractRelativeLinks", () => {
  it("collects relative links and their line numbers", () => {
    const md = ["See [docs](docs/index.md).", "Also [other](other.md)"].join("\n");
    const links = extractRelativeLinks(md);
    expect(links).toEqual([
      { target: "docs/index.md", line: 1 },
      { target: "other.md", line: 2 },
    ]);
  });

  it("ignores http, https, mailto, and anchor-only links", () => {
    const md = [
      "[ext](https://example.com)",
      "[mail](mailto:a@b.c)",
      "[anchor](#section)",
      "[rel](./real.md)",
    ].join("\n");
    expect(extractRelativeLinks(md)).toEqual([
      { target: "./real.md", line: 4 },
    ]);
  });

  it("strips fragments and query strings from targets", () => {
    const md = "[a](path/to/file.md#section?x=1)";
    expect(extractRelativeLinks(md)).toEqual([
      { target: "path/to/file.md", line: 1 },
    ]);
  });

  it("ignores links inside fenced code blocks", () => {
    const md = [
      "[before](before.md)",
      "```",
      "[fenced](fenced.md)",
      "```",
      "[after](after.md)",
    ].join("\n");
    expect(extractRelativeLinks(md).map((l) => l.target)).toEqual([
      "before.md",
      "after.md",
    ]);
  });

  it("handles bracketed (angle-bracket) link targets", () => {
    const md = "[x](<docs/file.md>)";
    expect(extractRelativeLinks(md)).toEqual([
      { target: "docs/file.md", line: 1 },
    ]);
  });
});

describe("resolveLinkTarget", () => {
  it("resolves relative links against the link's directory", () => {
    const resolved = resolveLinkTarget(
      { target: "../sibling.md", line: 1 },
      "/repo/docs",
      "/repo",
    );
    expect(resolved).toBe("/repo/sibling.md");
  });

  it("resolves absolute repo-rooted links against the repo root", () => {
    const resolved = resolveLinkTarget(
      { target: "/CHANGELOG.md", line: 1 },
      "/repo/docs",
      "/repo",
    );
    expect(resolved).toBe("/repo/CHANGELOG.md");
  });
});

describe("findBrokenLinks + lintMarkdownFile", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "gitwise-docs-lint-"));
    await mkdir(join(dir, "docs"), { recursive: true });
    await writeFile(join(dir, "docs", "exists.md"), "# Exists\n");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns no broken links when all targets resolve", async () => {
    const readme = join(dir, "README.md");
    await writeFile(readme, "[ok](docs/exists.md)\n");
    expect(findBrokenLinks(readme, dir)).toEqual([]);
  });

  it("flags links whose targets do not exist", async () => {
    const readme = join(dir, "README.md");
    await writeFile(readme, "[missing](docs/missing.md)\n");
    const broken = findBrokenLinks(readme, dir);
    expect(broken).toHaveLength(1);
    expect(broken[0]?.target).toBe("docs/missing.md");
    expect(broken[0]?.line).toBe(1);
  });

  it("lintMarkdownFile aggregates missing sections and broken links", async () => {
    const readme = join(dir, "README.md");
    await writeFile(
      readme,
      ["# Install", "[gone](docs/gone.md)"].join("\n"),
    );
    const result = lintMarkdownFile(readme, dir, {
      requiredSections: ["Install", "Privacy"],
    });
    expect(result.missingSections).toEqual(["Privacy"]);
    expect(result.brokenLinks).toHaveLength(1);
    expect(result.file).toBe(readme);
  });

  it("lintMarkdownFile skips section checks when requiredSections is omitted", async () => {
    const readme = join(dir, "README.md");
    await writeFile(readme, "no headings here\n");
    const result = lintMarkdownFile(readme, dir);
    expect(result.missingSections).toEqual([]);
  });
});

describe("REMOVED_DEVFLOW_COMMANDS", () => {
  it("matches the PRD's dropped-command list", () => {
    expect([...REMOVED_DEVFLOW_COMMANDS].sort()).toEqual(
      ["init", "prd", "techspec", "tasks", "run-tasks", "test", "done", "status"].sort(),
    );
  });
});
