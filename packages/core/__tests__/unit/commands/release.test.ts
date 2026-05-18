import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { MockLLMProvider } from "../../../src/testing/mock-llm-provider.js";
import { release, applyRelease, bumpVersion, heuristicBump } from "../../../src/commands/release.js";

const exec = promisify(execFile);

async function initRepo(dir: string, version = "1.0.0"): Promise<void> {
  await exec("git", ["init"], { cwd: dir });
  await exec("git", ["config", "user.email", "test@test.com"], { cwd: dir });
  await exec("git", ["config", "user.name", "Test"], { cwd: dir });
  await writeFile(join(dir, "package.json"), JSON.stringify({ name: "test-pkg", version }, null, 2));
  await exec("git", ["add", "."], { cwd: dir });
  await exec("git", ["commit", "-m", "initial commit"], { cwd: dir });
}

describe("bumpVersion", () => {
  it("patch: 1.0.0 → 1.0.1", () => expect(bumpVersion("1.0.0", "patch")).toBe("1.0.1"));
  it("minor: 1.0.0 → 1.1.0", () => expect(bumpVersion("1.0.0", "minor")).toBe("1.1.0"));
  it("major: 1.0.0 → 2.0.0", () => expect(bumpVersion("1.0.0", "major")).toBe("2.0.0"));
  it("handles v prefix", () => expect(bumpVersion("v1.2.3", "patch")).toBe("1.2.4"));

  describe("strict input validation", () => {
    const invalidInputs = [
      "v1.2",
      "1.2",
      "1",
      "not-a-version",
      "1.2.3-rc.1",
      "1.2.3+build.5",
      "1.2.3 ",
      " 1.2.3",
      "1.2.3.4",
      "",
      "vv1.2.3",
    ];

    for (const input of invalidInputs) {
      it(`rejects malformed input ${JSON.stringify(input)} with INVALID_VERSION`, () => {
        try {
          bumpVersion(input, "patch");
          throw new Error("expected bumpVersion to throw");
        } catch (err) {
          expect(err).toBeInstanceOf(Error);
          expect((err as Error).message).toContain("Invalid current version");
          expect((err as { code?: string }).code).toBe("INVALID_VERSION");
        }
      });
    }
  });
});

describe("heuristicBump", () => {
  it("only fix: commits → patch", () => {
    expect(heuristicBump("fix: resolve bug\nfix: another fix")).toBe("patch");
  });

  it("any feat: commit → minor", () => {
    expect(heuristicBump("fix: something\nfeat: add new command")).toBe("minor");
  });

  it("BREAKING CHANGE footer → major", () => {
    expect(heuristicBump("feat: something\n\nBREAKING CHANGE: removed API")).toBe("major");
  });

  it("! marker → major", () => {
    expect(heuristicBump("feat!: breaking feature")).toBe("major");
  });
});

describe("release()", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gitwise-release-"));
    await initRepo(tempDir);
    // Add a commit after init
    await writeFile(join(tempDir, "feature.ts"), "const x = 1;");
    await exec("git", ["add", "feature.ts"], { cwd: tempDir });
    await exec("git", ["commit", "-m", "feat: add feature"], { cwd: tempDir });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function makeMock(bump = "minor"): MockLLMProvider {
    const mock = new MockLLMProvider();
    // version suggestion call
    mock.queueByIndex({ content: JSON.stringify({ suggestion: bump, reasoning: "has features" }), tokens: { input: 50, output: 10 } });
    // changelog call
    mock.queueByIndex({ content: "### Added\n- New feature", tokens: { input: 80, output: 20 } });
    // notes call
    mock.queueByIndex({ content: "Version 1.1.0 brings exciting features.", tokens: { input: 60, output: 15 } });
    return mock;
  }

  it("returns ReleasePlan with suggestedBump and newVersion", async () => {
    const mock = makeMock("minor");
    const plan = await release({ cwd: tempDir, provider: mock });
    expect(plan.suggestedBump).toBe("minor");
    expect(plan.newVersion).toBe("1.1.0");
    expect(plan.currentVersion).toBe("1.0.0");
  });

  it("opts.bump overrides the LLM heuristic", async () => {
    const mock = new MockLLMProvider();
    // When bump is provided, only 2 LLM calls (changelog + notes), no version suggestion call
    mock.queueByIndex({ content: "### Fixed\n- Bug fix", tokens: { input: 80, output: 20 } });
    mock.queueByIndex({ content: "Patch release.", tokens: { input: 60, output: 15 } });

    const plan = await release({ cwd: tempDir, provider: mock, bump: "patch" });
    expect(plan.suggestedBump).toBe("patch");
    expect(plan.newVersion).toBe("1.0.1");
  });

  it("returns tokens summed across LLM calls", async () => {
    const mock = makeMock("minor");
    const plan = await release({ cwd: tempDir, provider: mock });
    expect(plan.tokens.input).toBe(50 + 80 + 60);
    expect(plan.tokens.output).toBe(10 + 20 + 15);
  });

  it("returns changelog and notes strings", async () => {
    const mock = makeMock("minor");
    const plan = await release({ cwd: tempDir, provider: mock });
    expect(plan.changelog).toContain("### Added");
    expect(plan.notes).toContain("Version 1.1.0");
  });
});

describe("applyRelease()", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gitwise-apply-release-"));
    await initRepo(tempDir);
    await writeFile(join(tempDir, "feature.ts"), "const x = 1;");
    await exec("git", ["add", "feature.ts"], { cwd: tempDir });
    await exec("git", ["commit", "-m", "feat: add feature"], { cwd: tempDir });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const plan = {
    suggestedBump: "minor" as const,
    newVersion: "1.1.0",
    currentVersion: "1.0.0",
    changelog: "### Added\n- New feature",
    notes: "Version 1.1.0 is here",
    commits: "feat: add feature",
    tokens: { input: 10, output: 5 },
  };

  it("updates root package.json version", async () => {
    await applyRelease(plan, { cwd: tempDir, tagAndPush: false, createGhRelease: false });
    const pkg = JSON.parse(await readFile(join(tempDir, "package.json"), "utf-8")) as { version: string };
    expect(pkg.version).toBe("1.1.0");
  });

  it("prepends changelog entry to CHANGELOG.md", async () => {
    await applyRelease(plan, { cwd: tempDir, tagAndPush: false, createGhRelease: false });
    const changelog = await readFile(join(tempDir, "CHANGELOG.md"), "utf-8");
    expect(changelog).toContain("## [1.1.0]");
    expect(changelog).toContain("### Added");
  });

  it("does not duplicate the standard header when CHANGELOG.md exists with only the header (no version entries)", async () => {
    // Seed CHANGELOG.md with the standard header but zero `## [version]` entries —
    // the exact in-between state that the previous `indexOf("## [")` branch
    // mishandled by stacking two headers.
    const seededHeader = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com),
and this project adheres to [Semantic Versioning](https://semver.org/).

`;
    await writeFile(join(tempDir, "CHANGELOG.md"), seededHeader);
    await exec("git", ["add", "CHANGELOG.md"], { cwd: tempDir });
    await exec("git", ["commit", "-m", "chore: seed changelog"], { cwd: tempDir });

    await applyRelease(plan, { cwd: tempDir, tagAndPush: false, createGhRelease: false });

    const changelog = await readFile(join(tempDir, "CHANGELOG.md"), "utf-8");
    // The literal "# Changelog" heading must appear exactly once.
    expect(changelog.match(/^# Changelog$/gm)?.length).toBe(1);
    // And the new version section must still be present.
    expect(changelog).toContain("## [1.1.0]");
    expect(changelog).toContain("### Added");
  });

  it("skips gh release create and returns successfully when createGhRelease: false", async () => {
    await expect(
      applyRelease(plan, { cwd: tempDir, tagAndPush: false, createGhRelease: false })
    ).resolves.not.toThrow();
  });

  it("tagAndPush: false does not invoke git tag", async () => {
    await applyRelease(plan, { cwd: tempDir, tagAndPush: false, createGhRelease: false });
    // Verify no tag was created
    try {
      const tags = await exec("git", ["tag", "-l"], { cwd: tempDir });
      expect(tags.stdout.trim()).toBe("");
    } catch {
      // No tags is expected
    }
  });

  it("workspacePropagation: false only updates root package.json", async () => {
    // Create a packages dir
    await mkdir(join(tempDir, "packages", "pkg-a"), { recursive: true });
    await writeFile(
      join(tempDir, "packages", "pkg-a", "package.json"),
      JSON.stringify({ name: "pkg-a", version: "1.0.0" }),
    );
    await exec("git", ["add", "."], { cwd: tempDir });
    await exec("git", ["commit", "-m", "add workspaces"], { cwd: tempDir });

    await applyRelease(plan, { cwd: tempDir, tagAndPush: false, createGhRelease: false, workspacePropagation: false });

    const pkgA = JSON.parse(await readFile(join(tempDir, "packages", "pkg-a", "package.json"), "utf-8")) as { version: string };
    expect(pkgA.version).toBe("1.0.0"); // unchanged
  });

  it("workspacePropagation: true updates packages/*/package.json", async () => {
    // Create workspace packages
    for (const pkg of ["pkg-a", "pkg-b", "pkg-c"]) {
      await mkdir(join(tempDir, "packages", pkg), { recursive: true });
      await writeFile(
        join(tempDir, "packages", pkg, "package.json"),
        JSON.stringify({ name: pkg, version: "1.0.0" }),
      );
    }
    await exec("git", ["add", "."], { cwd: tempDir });
    await exec("git", ["commit", "-m", "add workspaces"], { cwd: tempDir });

    await applyRelease(plan, { cwd: tempDir, tagAndPush: false, createGhRelease: false, workspacePropagation: true });

    for (const pkgName of ["pkg-a", "pkg-b", "pkg-c"]) {
      const pkgData = JSON.parse(await readFile(join(tempDir, "packages", pkgName, "package.json"), "utf-8")) as { version: string };
      expect(pkgData.version).toBe("1.1.0");
    }
  });

  it("workspacePropagation: true updates sibling plugin.json version alongside package.json", async () => {
    await mkdir(join(tempDir, "packages", "skills"), { recursive: true });
    await writeFile(
      join(tempDir, "packages", "skills", "package.json"),
      JSON.stringify({ name: "skills", version: "1.0.0" }),
    );
    const pluginManifest = {
      $schema: "https://claude.ai/code/plugin-schema/v1",
      name: "test-plugin",
      version: "1.0.0",
      description: "test plugin",
      skills: [{ name: "a", path: "skills/a.md" }],
    };
    await writeFile(
      join(tempDir, "packages", "skills", "plugin.json"),
      JSON.stringify(pluginManifest, null, 2) + "\n",
    );
    await exec("git", ["add", "."], { cwd: tempDir });
    await exec("git", ["commit", "-m", "add skills package"], { cwd: tempDir });

    await applyRelease(plan, { cwd: tempDir, tagAndPush: false, createGhRelease: false, workspacePropagation: true });

    const pkg = JSON.parse(await readFile(join(tempDir, "packages", "skills", "package.json"), "utf-8")) as { version: string };
    expect(pkg.version).toBe("1.1.0");
    const plugin = JSON.parse(await readFile(join(tempDir, "packages", "skills", "plugin.json"), "utf-8")) as typeof pluginManifest;
    expect(plugin.version).toBe("1.1.0");
    expect(plugin.name).toBe("test-plugin");
    expect(plugin.skills).toEqual([{ name: "a", path: "skills/a.md" }]);
  });

  it("workspacePropagation: false does not touch sibling plugin.json", async () => {
    await mkdir(join(tempDir, "packages", "skills"), { recursive: true });
    await writeFile(
      join(tempDir, "packages", "skills", "package.json"),
      JSON.stringify({ name: "skills", version: "1.0.0" }),
    );
    await writeFile(
      join(tempDir, "packages", "skills", "plugin.json"),
      JSON.stringify({ name: "test-plugin", version: "1.0.0" }, null, 2) + "\n",
    );
    await exec("git", ["add", "."], { cwd: tempDir });
    await exec("git", ["commit", "-m", "add skills package"], { cwd: tempDir });

    await applyRelease(plan, { cwd: tempDir, tagAndPush: false, createGhRelease: false, workspacePropagation: false });

    const plugin = JSON.parse(await readFile(join(tempDir, "packages", "skills", "plugin.json"), "utf-8")) as { version: string };
    expect(plugin.version).toBe("1.0.0");
  });

  it("preflight: throws WORKING_TREE_DIRTY before any mutation when working tree is dirty", async () => {
    // Make the working tree dirty
    await writeFile(join(tempDir, "dirty.ts"), "const dirty = true;");

    // Snapshot files we expect to be untouched
    const pkgBefore = await readFile(join(tempDir, "package.json"), "utf-8");

    await expect(
      applyRelease(plan, { cwd: tempDir, tagAndPush: false, createGhRelease: false }),
    ).rejects.toMatchObject({ code: "WORKING_TREE_DIRTY" });

    // package.json must NOT have been mutated — preflight ran before step 1
    const pkgAfter = await readFile(join(tempDir, "package.json"), "utf-8");
    expect(pkgAfter).toBe(pkgBefore);

    // No CHANGELOG.md created
    await expect(readFile(join(tempDir, "CHANGELOG.md"), "utf-8")).rejects.toThrow();

    // No release notes written
    await expect(
      readFile(join(tempDir, ".gitwise", `release-${plan.newVersion}.md`), "utf-8"),
    ).rejects.toThrow();
  });

  it("preflight: throws TAG_EXISTS before any mutation when target tag already exists", async () => {
    // Pre-create the tag that applyRelease will try to create
    await exec("git", ["tag", "-a", `v${plan.newVersion}`, "-m", "pre-existing"], { cwd: tempDir });

    const pkgBefore = await readFile(join(tempDir, "package.json"), "utf-8");

    await expect(
      applyRelease(plan, { cwd: tempDir, tagAndPush: true, createGhRelease: false }),
    ).rejects.toMatchObject({ code: "TAG_EXISTS" });

    // package.json must NOT have been mutated
    const pkgAfter = await readFile(join(tempDir, "package.json"), "utf-8");
    expect(pkgAfter).toBe(pkgBefore);

    // No release commit should have been created — HEAD log is still the seed commits
    const log = await exec("git", ["log", "--oneline"], { cwd: tempDir });
    expect(log.stdout).not.toContain(`chore(release): v${plan.newVersion}`);
  });

  it("preflight: TAG_EXISTS check is skipped when tagAndPush is false", async () => {
    // Tag exists, but we're not tagging — should proceed
    await exec("git", ["tag", "-a", `v${plan.newVersion}`, "-m", "pre-existing"], { cwd: tempDir });

    await expect(
      applyRelease(plan, { cwd: tempDir, tagAndPush: false, createGhRelease: false }),
    ).resolves.not.toThrow();

    const pkg = JSON.parse(await readFile(join(tempDir, "package.json"), "utf-8")) as { version: string };
    expect(pkg.version).toBe("1.1.0");
  });

  it("integration: mkdtemp repo with 3 workspace packages propagates version to all three", async () => {
    for (const pkg of ["core", "cli", "skills"]) {
      await mkdir(join(tempDir, "packages", pkg), { recursive: true });
      await writeFile(
        join(tempDir, "packages", pkg, "package.json"),
        JSON.stringify({ name: `@test/${pkg}`, version: "1.0.0" }),
      );
    }
    await exec("git", ["add", "."], { cwd: tempDir });
    await exec("git", ["commit", "-m", "add workspaces"], { cwd: tempDir });

    await applyRelease(plan, { cwd: tempDir, tagAndPush: false, createGhRelease: false, workspacePropagation: true });

    for (const pkg of ["core", "cli", "skills"]) {
      const data = JSON.parse(await readFile(join(tempDir, "packages", pkg, "package.json"), "utf-8")) as { version: string };
      expect(data.version).toBe("1.1.0");
    }
  });
});
