import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import { access, mkdtemp, rm, writeFile, mkdir, readFile, chmod } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { MockLLMProvider } from "../../../src/testing/mock-llm-provider.js";
import { release, prepareRelease, applyRelease, finishRelease, abortRelease, runReleaseInProcess, bumpVersion, heuristicBump, detectWorkspaceRoot, propagateVersionToWorkspaces, writeWorkspaceVersionStep } from "../../../src/commands/release.js";
import { Transaction } from "../../../src/infra/transaction.js";
import { GitwiseError } from "../../../src/errors.js";
import { acquireRepoLock } from "../../../src/infra/lockfile.js";
import { loadReleasePlan, saveReleasePlan } from "../../../src/commands/release-plan.js";

const exec = promisify(execFile);

async function initRepo(dir: string, version = "1.0.0"): Promise<void> {
  await exec("git", ["init", "-b", "main"], { cwd: dir });
  await exec("git", ["config", "user.email", "test@test.com"], { cwd: dir });
  await exec("git", ["config", "user.name", "Test"], { cwd: dir });
  await writeFile(join(dir, "package.json"), JSON.stringify({ name: "test-pkg", version }, null, 2));
  await exec("git", ["add", "."], { cwd: dir });
  await exec("git", ["commit", "-m", "initial commit"], { cwd: dir });
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function makePrepareMock(bump = "minor"): MockLLMProvider {
  const mock = new MockLLMProvider();
  mock.queueByIndex({ content: JSON.stringify({ suggestion: bump, reasoning: "has features" }), tokens: { input: 50, output: 10 } });
  mock.queueByIndex({ content: "### Added\n- New feature", tokens: { input: 80, output: 20 } });
  mock.queueByIndex({ content: "Version notes for this release.", tokens: { input: 60, output: 15 } });
  return mock;
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

  describe("strict bump type validation", () => {
    // Guards against JS callers (or any cast that bypasses the BumpType
    // union) smuggling in unknown bump types. The previous switch had no
    // default and silently returned undefined, which produced
    // release/undefined branches and vundefined tags downstream.
    const invalidBumps = ["huge", "feature", "PATCH", "", "0", "unknown"];
    for (const bump of invalidBumps) {
      it(`rejects unknown bump type ${JSON.stringify(bump)} with INVALID_VERSION`, () => {
        try {
          bumpVersion("1.0.0", bump as unknown as "patch");
          throw new Error("expected bumpVersion to throw");
        } catch (err) {
          expect(err).toBeInstanceOf(Error);
          expect((err as Error).message).toContain("Invalid bump type");
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

  it("parses LLM version suggestion wrapped in ```json fences", async () => {
    const mock = new MockLLMProvider();
    const payload = JSON.stringify({ suggestion: "major", reasoning: "breaking change" });
    mock.queueByIndex({ content: "```json\n" + payload + "\n```", tokens: { input: 50, output: 10 } });
    mock.queueByIndex({ content: "### Changed\n- Breaking change", tokens: { input: 80, output: 20 } });
    mock.queueByIndex({ content: "Version 2.0.0 notes.", tokens: { input: 60, output: 15 } });

    const plan = await release({ cwd: tempDir, provider: mock });
    expect(plan.suggestedBump).toBe("major");
    expect(plan.newVersion).toBe("2.0.0");
  });

  it("parses LLM version suggestion wrapped in bare ``` fences", async () => {
    const mock = new MockLLMProvider();
    const payload = JSON.stringify({ suggestion: "patch", reasoning: "bug fix" });
    mock.queueByIndex({ content: "```\n" + payload + "\n```", tokens: { input: 50, output: 10 } });
    mock.queueByIndex({ content: "### Fixed\n- Bug fix", tokens: { input: 80, output: 20 } });
    mock.queueByIndex({ content: "Patch notes.", tokens: { input: 60, output: 15 } });

    const plan = await release({ cwd: tempDir, provider: mock });
    expect(plan.suggestedBump).toBe("patch");
    expect(plan.newVersion).toBe("1.0.1");
  });

  it("falls back to heuristicBump when the LLM returns an unknown suggestion value", async () => {
    // Previously, parseVersionSuggestion only checked `typeof suggestion === "string"`,
    // so "huge" flowed through to bumpVersion which silently returned undefined
    // and minted release/undefined + vundefined artifacts. With `BREAKING CHANGE`
    // in the seeded commit body, heuristicBump deterministically picks "major"
    // — proves the bogus LLM value was rejected and the fallback fired (the
    // value mustn't be the same one we sent: "huge" → "major" is real work).
    // `feat!:` in the subject survives `git log --oneline` (which drops the
    // body), so heuristicBump's `/!:/` regex matches deterministically and
    // returns "major" regardless of the other seeded commits in this suite.
    await exec("git", ["commit", "--allow-empty", "-m", "feat!: breaking change"], { cwd: tempDir });
    const mock = new MockLLMProvider();
    mock.queueByIndex({ content: JSON.stringify({ suggestion: "huge", reasoning: "nonsense" }), tokens: { input: 50, output: 10 } });
    mock.queueByIndex({ content: "### Changed\n- Breaking change", tokens: { input: 80, output: 20 } });
    mock.queueByIndex({ content: "Notes.", tokens: { input: 60, output: 15 } });

    const plan = await release({ cwd: tempDir, provider: mock });
    expect(plan.suggestedBump).toBe("major");
    expect(plan.newVersion).toBe("2.0.0");
  });

  it("falls back to heuristicBump when the LLM omits required fields", async () => {
    // `feat!:` in the subject survives `git log --oneline` (which drops the
    // body), so heuristicBump's `/!:/` regex matches deterministically and
    // returns "major" regardless of the other seeded commits in this suite.
    await exec("git", ["commit", "--allow-empty", "-m", "feat!: breaking change"], { cwd: tempDir });
    const mock = new MockLLMProvider();
    // Missing `reasoning` should reject the suggestion even though `suggestion`
    // itself is well-formed — both fields must be present to avoid the cast.
    mock.queueByIndex({ content: JSON.stringify({ suggestion: "minor" }), tokens: { input: 50, output: 10 } });
    mock.queueByIndex({ content: "### Changed\n- Breaking change", tokens: { input: 80, output: 20 } });
    mock.queueByIndex({ content: "Notes.", tokens: { input: 60, output: 15 } });

    const plan = await release({ cwd: tempDir, provider: mock });
    expect(plan.suggestedBump).toBe("major");
    expect(plan.newVersion).toBe("2.0.0");
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

  it("preflight: TAG_EXISTS is thrown even when tagAndPush is false (unified-path stale-plan invariant)", async () => {
    // After unification, applyRelease delegates to finishRelease which treats a
    // pre-existing v<newVersion> tag as a stale-plan signal regardless of
    // whether the caller intended to push. applyRelease surfaces that upfront
    // as the legacy TAG_EXISTS code so callers see the same error name.
    await exec("git", ["tag", "-a", `v${plan.newVersion}`, "-m", "pre-existing"], { cwd: tempDir });

    const pkgBefore = await readFile(join(tempDir, "package.json"), "utf-8");

    await expect(
      applyRelease(plan, { cwd: tempDir, tagAndPush: false, createGhRelease: false }),
    ).rejects.toMatchObject({ code: "TAG_EXISTS" });

    // No mutation occurred — preflight ran before any disk write.
    const pkgAfter = await readFile(join(tempDir, "package.json"), "utf-8");
    expect(pkgAfter).toBe(pkgBefore);
    await expect(
      readFile(join(tempDir, ".gitwise", `release-${plan.newVersion}.md`), "utf-8"),
    ).rejects.toThrow();
    await expect(
      readFile(join(tempDir, ".gitwise/release-plan.json"), "utf-8"),
    ).rejects.toThrow();
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

  it("workspacePropagation: reads package.json.workspaces and walks non-`packages/` layouts", async () => {
    // Layout: workspaces = ["apps/*", "libs/foo"], no packages/ directory at all.
    // The propagation step must follow the declared workspaces, not the
    // historical `packages/*` assumption — otherwise the version stays stale.
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({
        name: "test-pkg",
        version: "1.0.0",
        workspaces: ["apps/*", "libs/foo"],
      }),
    );
    for (const dir of ["apps/web", "apps/api", "libs/foo"]) {
      await mkdir(join(tempDir, dir), { recursive: true });
      await writeFile(
        join(tempDir, dir, "package.json"),
        JSON.stringify({ name: dir.replace("/", "-"), version: "1.0.0" }),
      );
    }
    await exec("git", ["add", "."], { cwd: tempDir });
    await exec("git", ["commit", "-m", "add workspaces"], { cwd: tempDir });

    await applyRelease(plan, { cwd: tempDir, tagAndPush: false, createGhRelease: false, workspacePropagation: true });

    for (const dir of ["apps/web", "apps/api", "libs/foo"]) {
      const data = JSON.parse(await readFile(join(tempDir, dir, "package.json"), "utf-8")) as { version: string };
      expect(data.version).toBe("1.1.0");
    }
  });

  it("workspacePropagation: supports yarn-style workspaces object form", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({
        name: "test-pkg",
        version: "1.0.0",
        workspaces: { packages: ["libs/*"] },
      }),
    );
    for (const pkg of ["alpha", "beta"]) {
      await mkdir(join(tempDir, "libs", pkg), { recursive: true });
      await writeFile(
        join(tempDir, "libs", pkg, "package.json"),
        JSON.stringify({ name: pkg, version: "1.0.0" }),
      );
    }
    await exec("git", ["add", "."], { cwd: tempDir });
    await exec("git", ["commit", "-m", "add workspaces"], { cwd: tempDir });

    await applyRelease(plan, { cwd: tempDir, tagAndPush: false, createGhRelease: false, workspacePropagation: true });

    for (const pkg of ["alpha", "beta"]) {
      const data = JSON.parse(await readFile(join(tempDir, "libs", pkg, "package.json"), "utf-8")) as { version: string };
      expect(data.version).toBe("1.1.0");
    }
  });

  it("workspacePropagation: release commit stages only the modified manifests, not the whole packages/ tree", async () => {
    // Seed two packages plus a gitignored throwaway file inside one of them.
    // The old `git add packages` sweep would either drag that file in or rely
    // on .gitignore to filter it; the explicit-stage contract guarantees
    // ONLY the manifests propagation touched land in the release commit,
    // regardless of what else lives under the workspace tree.
    for (const pkg of ["alpha", "beta"]) {
      await mkdir(join(tempDir, "packages", pkg), { recursive: true });
      await writeFile(
        join(tempDir, "packages", pkg, "package.json"),
        JSON.stringify({ name: pkg, version: "1.0.0" }),
      );
      // Unrelated tracked file under each package — should NOT get bumped/staged.
      await writeFile(
        join(tempDir, "packages", pkg, "README.md"),
        "# unrelated\n",
      );
    }
    await exec("git", ["add", "."], { cwd: tempDir });
    await exec("git", ["commit", "-m", "add workspaces"], { cwd: tempDir });

    await applyRelease(plan, { cwd: tempDir, tagAndPush: false, createGhRelease: false, workspacePropagation: true });

    // Inspect the release commit's file list.
    const show = await exec("git", ["show", "--name-only", "--pretty=format:", "HEAD"], { cwd: tempDir });
    const filesInCommit = new Set(
      show.stdout.split("\n").map((l) => l.trim()).filter(Boolean),
    );
    expect(filesInCommit.has("packages/alpha/package.json")).toBe(true);
    expect(filesInCommit.has("packages/beta/package.json")).toBe(true);
    // The unrelated READMEs were unchanged — git wouldn't include them in
    // the commit even with a broad sweep, but assert anyway as a guard.
    expect(filesInCommit.has("packages/alpha/README.md")).toBe(false);
    expect(filesInCommit.has("packages/beta/README.md")).toBe(false);
  });
});

describe("prepareRelease()", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gitwise-prepare-"));
    await initRepo(tempDir);
    await writeFile(join(tempDir, "feature.ts"), "const x = 1;");
    await exec("git", ["add", "feature.ts"], { cwd: tempDir });
    await exec("git", ["commit", "-m", "feat: add feature"], { cwd: tempDir });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("github-flow (default)", () => {
    it("returns a plan with releaseBranchCreated:false and writes notes + plan file", async () => {
      const mock = makePrepareMock("minor");
      const plan = await prepareRelease({ cwd: tempDir, provider: mock });

      expect(plan.strategy).toBe("github-flow");
      expect(plan.releaseBranchCreated).toBe(false);
      expect(plan.newVersion).toBe("1.1.0");
      expect(plan.targetBranch).toBe("main");

      // package.json is unchanged
      const pkg = JSON.parse(await readFile(join(tempDir, "package.json"), "utf-8")) as { version: string };
      expect(pkg.version).toBe("1.0.0");

      // Plan file exists
      expect(await pathExists(join(tempDir, ".gitwise/release-plan.json"))).toBe(true);

      // Notes file exists
      expect(await pathExists(join(tempDir, ".gitwise/release-1.1.0.md"))).toBe(true);
      const notes = await readFile(join(tempDir, ".gitwise/release-1.1.0.md"), "utf-8");
      expect(notes).toContain("Version notes");
    });

    it("does not create CHANGELOG.md in github-flow", async () => {
      const mock = makePrepareMock("minor");
      await prepareRelease({ cwd: tempDir, provider: mock });
      expect(await pathExists(join(tempDir, "CHANGELOG.md"))).toBe(false);
    });

    it("does not create any release branch", async () => {
      const mock = makePrepareMock("minor");
      await prepareRelease({ cwd: tempDir, provider: mock });
      const { stdout } = await exec("git", ["branch", "--list", "release/*"], { cwd: tempDir });
      expect(stdout.trim()).toBe("");
    });
  });

  describe("gitflow", () => {
    async function initGitflowRepo(dir: string): Promise<void> {
      // initRepo already creates main + commits. Add develop on top.
      await exec("git", ["checkout", "-b", "develop"], { cwd: dir });
      await writeFile(join(dir, "develop-feature.ts"), "const y = 2;");
      await exec("git", ["add", "develop-feature.ts"], { cwd: dir });
      await exec("git", ["commit", "-m", "feat: develop work"], { cwd: dir });
    }

    it("creates release/<v>, commits bump+changelog, writes plan with releaseBranchCreated:true", async () => {
      await initGitflowRepo(tempDir);

      const mock = makePrepareMock("minor");
      const plan = await prepareRelease({ cwd: tempDir, provider: mock, strategy: "gitflow" });

      expect(plan.strategy).toBe("gitflow");
      expect(plan.releaseBranchCreated).toBe(true);
      expect(plan.targetBranch).toBe("release/1.1.0");

      // Currently on release/1.1.0
      const { stdout: branch } = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: tempDir });
      expect(branch.trim()).toBe("release/1.1.0");

      // package.json bumped on release branch
      const pkg = JSON.parse(await readFile(join(tempDir, "package.json"), "utf-8")) as { version: string };
      expect(pkg.version).toBe("1.1.0");

      // CHANGELOG.md created on release branch
      const changelog = await readFile(join(tempDir, "CHANGELOG.md"), "utf-8");
      expect(changelog).toContain("## [1.1.0]");
      expect(changelog).toContain("### Added");

      // Notes file present
      expect(await pathExists(join(tempDir, ".gitwise/release-1.1.0.md"))).toBe(true);

      // Plan file persisted
      expect(await pathExists(join(tempDir, ".gitwise/release-plan.json"))).toBe(true);

      // Bump committed on the release branch
      const { stdout: log } = await exec("git", ["log", "--oneline", "-1"], { cwd: tempDir });
      expect(log).toContain(`chore(release): v1.1.0`);
    });

    it("no tag is created during prepare", async () => {
      await initGitflowRepo(tempDir);
      const mock = makePrepareMock("minor");
      await prepareRelease({ cwd: tempDir, provider: mock, strategy: "gitflow" });
      const { stdout: tags } = await exec("git", ["tag", "-l"], { cwd: tempDir });
      expect(tags.trim()).toBe("");
    });

    it("rejects with STRATEGY_DEVELOP_MISSING when develop branch is absent (no plan written)", async () => {
      // tempDir only has main from initRepo — no develop branch.
      const mock = makePrepareMock("minor");
      await expect(
        prepareRelease({ cwd: tempDir, provider: mock, strategy: "gitflow" }),
      ).rejects.toMatchObject({ code: "STRATEGY_DEVELOP_MISSING" });

      expect(await pathExists(join(tempDir, ".gitwise/release-plan.json"))).toBe(false);

      // No LLM call should have happened — fail-fast before release().
      expect(mock.getCallCount()).toBe(0);
    });

    it("rejects with RELEASE_BRANCH_CONFLICT when release/<v> already exists (no plan written)", async () => {
      await initGitflowRepo(tempDir);
      // Pre-create the branch prepareRelease would try to create. From develop's HEAD.
      await exec("git", ["branch", "release/1.1.0"], { cwd: tempDir });

      const mock = makePrepareMock("minor");
      await expect(
        prepareRelease({ cwd: tempDir, provider: mock, strategy: "gitflow" }),
      ).rejects.toMatchObject({
        code: "RELEASE_BRANCH_CONFLICT",
        exitCode: 61,
      });

      expect(await pathExists(join(tempDir, ".gitwise/release-plan.json"))).toBe(false);
    });

    it("honors developBranch override and rejects when the configured name is missing", async () => {
      // Create a "trunk" develop branch but ask for "develop" via override → still fails.
      await exec("git", ["checkout", "-b", "trunk"], { cwd: tempDir });
      await exec("git", ["checkout", "main"], { cwd: tempDir });

      const mock = makePrepareMock("minor");
      await expect(
        prepareRelease({
          cwd: tempDir,
          provider: mock,
          strategy: "gitflow",
          developBranch: "develop", // does not exist
        }),
      ).rejects.toMatchObject({ code: "STRATEGY_DEVELOP_MISSING" });
    });

    it("uses developBranch from RepoConfig when opts.developBranch is omitted", async () => {
      // Set up a 'trunk' branch with a feature commit
      await exec("git", ["checkout", "-b", "trunk"], { cwd: tempDir });
      await writeFile(join(tempDir, "trunk-feature.ts"), "const z = 3;");
      await exec("git", ["add", "trunk-feature.ts"], { cwd: tempDir });
      await exec("git", ["commit", "-m", "feat: trunk work"], { cwd: tempDir });
      await exec("git", ["checkout", "main"], { cwd: tempDir });

      // Configure repo to use 'trunk' as the develop branch
      await writeFile(
        join(tempDir, ".gitwise.json"),
        JSON.stringify({ releaseStrategy: "gitflow", developBranch: "trunk" }),
        "utf-8",
      );
      await exec("git", ["add", ".gitwise.json"], { cwd: tempDir });
      await exec("git", ["commit", "-m", "chore: configure gitflow"], { cwd: tempDir });

      const mock = makePrepareMock("minor");
      const plan = await prepareRelease({ cwd: tempDir, provider: mock });

      expect(plan.strategy).toBe("gitflow");
      expect(plan.targetBranch).toBe("release/1.1.0");
    });
  });

  describe("preconditions and invariants", () => {
    it("rejects with WORKING_TREE_DIRTY when working tree is dirty (no plan written, no LLM call)", async () => {
      await writeFile(join(tempDir, "dirty.ts"), "const dirty = true;");
      const mock = makePrepareMock("minor");

      await expect(
        prepareRelease({ cwd: tempDir, provider: mock }),
      ).rejects.toMatchObject({ code: "WORKING_TREE_DIRTY" });

      expect(await pathExists(join(tempDir, ".gitwise/release-plan.json"))).toBe(false);
      expect(mock.getCallCount()).toBe(0);
    });

    it("rejects with NO_COMMITS when there are no commits since the last tag (no plan written)", async () => {
      // Tag the current HEAD so there are no commits since the tag.
      await exec("git", ["tag", "-a", "v1.0.0", "-m", "seed tag"], { cwd: tempDir });

      const mock = makePrepareMock("minor");
      await expect(
        prepareRelease({ cwd: tempDir, provider: mock }),
      ).rejects.toMatchObject({ code: "NO_COMMITS" });

      expect(await pathExists(join(tempDir, ".gitwise/release-plan.json"))).toBe(false);
    });

    it("does not create a plan file when an LLM-stage failure happens (atomic-ish)", async () => {
      const mock = new MockLLMProvider();
      // Patch chat to throw — provider failure mid-planning.
      mock.chat = async () => {
        throw new Error("LLM provider unavailable");
      };

      await expect(
        prepareRelease({ cwd: tempDir, provider: mock }),
      ).rejects.toThrow("LLM provider unavailable");

      expect(await pathExists(join(tempDir, ".gitwise/release-plan.json"))).toBe(false);
    });

    it("ensures .gitwise/release-plan.json is gitignored before the plan is saved", async () => {
      const mock = makePrepareMock("minor");
      await prepareRelease({ cwd: tempDir, provider: mock });

      const gitignore = await readFile(join(tempDir, ".gitignore"), "utf-8");
      expect(gitignore).toContain(".gitwise/release-plan.json");

      // And the plan file is indeed saved
      const loaded = await loadReleasePlan(tempDir);
      expect(loaded).not.toBeNull();
    });

    it("captures baseCommit matching HEAD at the moment prepare started", async () => {
      const { stdout: headBefore } = await exec("git", ["rev-parse", "HEAD"], { cwd: tempDir });
      const expectedHead = headBefore.trim();

      const mock = makePrepareMock("minor");
      const plan = await prepareRelease({ cwd: tempDir, provider: mock });

      expect(plan.baseCommit).toBe(expectedHead);
    });

    it("plan.tokens matches the release() planner output tokens", async () => {
      const mock = makePrepareMock("minor");
      const plan = await prepareRelease({ cwd: tempDir, provider: mock });

      // makePrepareMock queues 50+80+60 input, 10+20+15 output
      expect(plan.tokens.input).toBe(50 + 80 + 60);
      expect(plan.tokens.output).toBe(10 + 20 + 15);
    });

    it("schema is 1 and preparedAt is an ISO-8601 timestamp", async () => {
      const mock = makePrepareMock("minor");
      const plan = await prepareRelease({ cwd: tempDir, provider: mock });

      expect(plan.schema).toBe(1);
      // ISO-8601 format check
      expect(plan.preparedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(new Date(plan.preparedAt).toString()).not.toBe("Invalid Date");
    });

    it("strategy resolution: opts.strategy beats RepoConfig", async () => {
      // RepoConfig says github-flow, opts says gitflow — opts must win.
      await writeFile(
        join(tempDir, ".gitwise.json"),
        JSON.stringify({ releaseStrategy: "github-flow" }),
        "utf-8",
      );
      await exec("git", ["add", ".gitwise.json"], { cwd: tempDir });
      await exec("git", ["commit", "-m", "chore: configure"], { cwd: tempDir });
      // Need develop for gitflow
      await exec("git", ["checkout", "-b", "develop"], { cwd: tempDir });
      await exec("git", ["checkout", "main"], { cwd: tempDir });

      const mock = makePrepareMock("minor");
      const plan = await prepareRelease({ cwd: tempDir, provider: mock, strategy: "gitflow" });
      expect(plan.strategy).toBe("gitflow");
    });

    it("strategy resolution: RepoConfig used when opts.strategy is omitted", async () => {
      await exec("git", ["checkout", "-b", "develop"], { cwd: tempDir });
      await writeFile(join(tempDir, "df.ts"), "const z = 1;");
      await exec("git", ["add", "df.ts"], { cwd: tempDir });
      await exec("git", ["commit", "-m", "feat: df"], { cwd: tempDir });

      await writeFile(
        join(tempDir, ".gitwise.json"),
        JSON.stringify({ releaseStrategy: "gitflow" }),
        "utf-8",
      );
      await exec("git", ["add", ".gitwise.json"], { cwd: tempDir });
      await exec("git", ["commit", "-m", "chore: configure"], { cwd: tempDir });

      const mock = makePrepareMock("minor");
      const plan = await prepareRelease({ cwd: tempDir, provider: mock });
      expect(plan.strategy).toBe("gitflow");
      expect(plan.releaseBranchCreated).toBe(true);
    });

    it("defaults to github-flow when neither opts nor RepoConfig sets a strategy", async () => {
      const mock = makePrepareMock("minor");
      const plan = await prepareRelease({ cwd: tempDir, provider: mock });
      expect(plan.strategy).toBe("github-flow");
    });
  });
});

describe("finishRelease()", () => {
  let tempDir: string;
  let originDir: string | null;

  async function initGitflowRepo(dir: string): Promise<void> {
    await exec("git", ["checkout", "-b", "develop"], { cwd: dir });
    await writeFile(join(dir, "develop-feature.ts"), "const y = 2;");
    await exec("git", ["add", "develop-feature.ts"], { cwd: dir });
    await exec("git", ["commit", "-m", "feat: develop work"], { cwd: dir });
  }

  async function addOrigin(cwd: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "gitwise-origin-"));
    await exec("git", ["init", "--bare", "-b", "main"], { cwd: dir });
    await exec("git", ["remote", "add", "origin", dir], { cwd });
    return dir;
  }

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gitwise-finish-"));
    originDir = null;
    await initRepo(tempDir);
    await writeFile(join(tempDir, "feature.ts"), "const x = 1;");
    await exec("git", ["add", "feature.ts"], { cwd: tempDir });
    await exec("git", ["commit", "-m", "feat: add feature"], { cwd: tempDir });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    if (originDir) await rm(originDir, { recursive: true, force: true });
  });

  describe("happy paths", () => {
    it("github-flow: bumps package.json, writes CHANGELOG, deletes plan, tags HEAD", async () => {
      const mock = makePrepareMock("minor");
      await prepareRelease({ cwd: tempDir, provider: mock });
      expect(await pathExists(join(tempDir, ".gitwise/release-plan.json"))).toBe(true);

      await finishRelease({ cwd: tempDir, tagAndPush: false, createGhRelease: false });

      // Plan file deleted
      expect(await pathExists(join(tempDir, ".gitwise/release-plan.json"))).toBe(false);

      // Manifest bumped during finish (deferred from prepare)
      const pkg = JSON.parse(await readFile(join(tempDir, "package.json"), "utf-8")) as { version: string };
      expect(pkg.version).toBe("1.1.0");

      // CHANGELOG written during finish
      const changelog = await readFile(join(tempDir, "CHANGELOG.md"), "utf-8");
      expect(changelog).toContain("## [1.1.0]");
      expect(changelog).toContain("### Added");

      // Release commit on main
      const { stdout: log } = await exec("git", ["log", "--oneline", "-1"], { cwd: tempDir });
      expect(log).toContain("chore(release): v1.1.0");

      // No release branch was ever created
      const { stdout: branches } = await exec("git", ["branch", "--list", "release/*"], { cwd: tempDir });
      expect(branches.trim()).toBe("");
    });

    it("github-flow: tagAndPush creates annotated tag with reloaded notes", async () => {
      const mock = makePrepareMock("minor");
      await prepareRelease({ cwd: tempDir, provider: mock });
      originDir = await addOrigin(tempDir);

      jest.resetModules();
      jest.unstable_mockModule("../../../src/infra/github.js", () => ({
        isGhAvailable: async () => false,
        createGitHubRelease: async () => ({ url: "n/a" }),
      }));
      const { finishRelease: finish2 } = await import("../../../src/commands/release.js");

      await finish2({ cwd: tempDir, tagAndPush: true, createGhRelease: false, signTags: false });

      const { stdout: tags } = await exec("git", ["tag", "-l"], { cwd: tempDir });
      expect(tags.trim()).toBe("v1.1.0");

      const { stdout: annotation } = await exec(
        "git",
        ["tag", "-l", "--format=%(contents)", "v1.1.0"],
        { cwd: tempDir },
      );
      expect(annotation).toContain("Version notes for this release");

      jest.dontMock("../../../src/infra/github.js");
      jest.resetModules();
    });

    it("gitflow: merges release branch into main then develop, deletes branch", async () => {
      await initGitflowRepo(tempDir);
      const mock = makePrepareMock("minor");
      await prepareRelease({ cwd: tempDir, provider: mock, strategy: "gitflow" });

      // Sanity: we end up on release/1.1.0 after prepare.
      const { stdout: cur } = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: tempDir });
      expect(cur.trim()).toBe("release/1.1.0");

      await finishRelease({ cwd: tempDir, tagAndPush: false, createGhRelease: false });

      // Back on main after the merges + tag-prep checkout.
      const { stdout: after } = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: tempDir });
      expect(after.trim()).toBe("main");

      // Both main and develop contain the release commit.
      const { stdout: mainLog } = await exec("git", ["log", "main", "--oneline"], { cwd: tempDir });
      expect(mainLog).toContain("chore(release): v1.1.0");
      const { stdout: devLog } = await exec("git", ["log", "develop", "--oneline"], { cwd: tempDir });
      expect(devLog).toContain("chore(release): v1.1.0");

      // Plan deleted, release branch deleted.
      expect(await pathExists(join(tempDir, ".gitwise/release-plan.json"))).toBe(false);
      const { stdout: branches } = await exec("git", ["branch", "--list", "release/*"], { cwd: tempDir });
      expect(branches.trim()).toBe("");
    });

    it("gitflow: tagAndPush pushes main with --follow-tags and pushes develop", async () => {
      await initGitflowRepo(tempDir);
      const mock = makePrepareMock("minor");
      await prepareRelease({ cwd: tempDir, provider: mock, strategy: "gitflow" });
      originDir = await addOrigin(tempDir);

      jest.resetModules();
      jest.unstable_mockModule("../../../src/infra/github.js", () => ({
        isGhAvailable: async () => false,
        createGitHubRelease: async () => ({ url: "n/a" }),
      }));
      const { finishRelease: finish2 } = await import("../../../src/commands/release.js");

      await finish2({ cwd: tempDir, tagAndPush: true, createGhRelease: false, signTags: false });

      // Remote received the tag.
      const { stdout: remoteTags } = await exec("git", ["ls-remote", "--tags", "origin"], { cwd: tempDir });
      expect(remoteTags).toContain("refs/tags/v1.1.0");

      // Remote received develop.
      const { stdout: remoteHeads } = await exec("git", ["ls-remote", "--heads", "origin"], { cwd: tempDir });
      expect(remoteHeads).toContain("refs/heads/develop");
      expect(remoteHeads).toContain("refs/heads/main");

      jest.dontMock("../../../src/infra/github.js");
      jest.resetModules();
    });

    it("gitflow: deleteReleaseBranch:false keeps the release branch after finish", async () => {
      await initGitflowRepo(tempDir);
      const mock = makePrepareMock("minor");
      await prepareRelease({ cwd: tempDir, provider: mock, strategy: "gitflow" });

      await finishRelease({
        cwd: tempDir,
        tagAndPush: false,
        createGhRelease: false,
        deleteReleaseBranch: false,
      });

      const { stdout: branches } = await exec("git", ["branch", "--list", "release/*"], { cwd: tempDir });
      expect(branches).toContain("release/1.1.0");
    });
  });

  describe("validation failures", () => {
    it("rejects with NO_RELEASE_PLAN when no plan exists", async () => {
      await expect(
        finishRelease({ cwd: tempDir, tagAndPush: false, createGhRelease: false }),
      ).rejects.toMatchObject({ code: "NO_RELEASE_PLAN" });

      // No mutation occurred — package.json is untouched.
      const pkg = JSON.parse(await readFile(join(tempDir, "package.json"), "utf-8")) as { version: string };
      expect(pkg.version).toBe("1.0.0");
    });

    it("rejects with STALE_PLAN_TAG_EXISTS and preserves the plan file", async () => {
      const mock = makePrepareMock("minor");
      await prepareRelease({ cwd: tempDir, provider: mock });

      // Pre-create the tag finish would create.
      await exec("git", ["tag", "-a", "v1.1.0", "-m", "pre-existing"], { cwd: tempDir });

      await expect(
        finishRelease({ cwd: tempDir, tagAndPush: false, createGhRelease: false }),
      ).rejects.toMatchObject({ code: "STALE_PLAN_TAG_EXISTS" });

      // Plan file still on disk for `gw release abort`.
      expect(await pathExists(join(tempDir, ".gitwise/release-plan.json"))).toBe(true);

      // No release commit was added.
      const { stdout: log } = await exec("git", ["log", "--oneline"], { cwd: tempDir });
      expect(log).not.toContain("chore(release): v1.1.0");
    });

    it("rejects with STALE_PLAN_BRANCH_MISMATCH when current branch != plan.targetBranch", async () => {
      await initGitflowRepo(tempDir);
      const mock = makePrepareMock("minor");
      await prepareRelease({ cwd: tempDir, provider: mock, strategy: "gitflow" });

      // Drop off the release branch.
      await exec("git", ["checkout", "main"], { cwd: tempDir });

      await expect(
        finishRelease({ cwd: tempDir, tagAndPush: false, createGhRelease: false }),
      ).rejects.toMatchObject({ code: "STALE_PLAN_BRANCH_MISMATCH" });

      expect(await pathExists(join(tempDir, ".gitwise/release-plan.json"))).toBe(true);
    });

    it("rejects with STRATEGY_DEVELOP_MISSING when develop branch disappears between prepare and finish", async () => {
      await initGitflowRepo(tempDir);
      const mock = makePrepareMock("minor");
      await prepareRelease({ cwd: tempDir, provider: mock, strategy: "gitflow" });

      // Delete develop after prepare (we're on release/1.1.0, so -d is safe-ish via -D).
      await exec("git", ["branch", "-D", "develop"], { cwd: tempDir });

      await expect(
        finishRelease({ cwd: tempDir, tagAndPush: false, createGhRelease: false }),
      ).rejects.toMatchObject({ code: "STRATEGY_DEVELOP_MISSING" });

      expect(await pathExists(join(tempDir, ".gitwise/release-plan.json"))).toBe(true);
    });

    it("rejects with WORKING_TREE_DIRTY and preserves the plan", async () => {
      const mock = makePrepareMock("minor");
      await prepareRelease({ cwd: tempDir, provider: mock });

      await writeFile(join(tempDir, "dirty.ts"), "const dirty = true;");

      await expect(
        finishRelease({ cwd: tempDir, tagAndPush: false, createGhRelease: false }),
      ).rejects.toMatchObject({ code: "WORKING_TREE_DIRTY" });

      expect(await pathExists(join(tempDir, ".gitwise/release-plan.json"))).toBe(true);
    });

    it("rejects with INVALID_PLAN_SCHEMA when the persisted plan has an unknown schema", async () => {
      await mkdir(join(tempDir, ".gitwise"), { recursive: true });
      await writeFile(
        join(tempDir, ".gitwise/release-plan.json"),
        JSON.stringify({ schema: 99, newVersion: "1.1.0" }),
        "utf-8",
      );

      await expect(
        finishRelease({ cwd: tempDir, tagAndPush: false, createGhRelease: false }),
      ).rejects.toMatchObject({ code: "INVALID_PLAN_SCHEMA" });
    });
  });

  describe("notes reload and gh integration", () => {
    it("reloads notes from disk and uses the edited content for the gh release body", async () => {
      await initGitflowRepo(tempDir);
      const mock = makePrepareMock("minor");
      await prepareRelease({ cwd: tempDir, provider: mock, strategy: "gitflow" });
      originDir = await addOrigin(tempDir);

      const editedNotes = "EDITED RELEASE NOTES — produced manually between prepare and finish.";
      await writeFile(join(tempDir, ".gitwise", "release-1.1.0.md"), editedNotes, "utf-8");

      let capturedBody: string | null = null;
      let capturedTag: string | null = null;
      jest.resetModules();
      jest.unstable_mockModule("../../../src/infra/github.js", () => ({
        isGhAvailable: async () => true,
        createGitHubRelease: async (params: { tag: string; body: string }) => {
          capturedBody = params.body;
          capturedTag = params.tag;
          return { url: "https://example.com/fake-release" };
        },
      }));
      const { finishRelease: finish2 } = await import("../../../src/commands/release.js");

      await finish2({ cwd: tempDir, tagAndPush: true, createGhRelease: true, signTags: false });

      expect(capturedTag).toBe("v1.1.0");
      expect(capturedBody).toBe(editedNotes);

      // Tag annotation also reflects the edited notes.
      const { stdout: annotation } = await exec(
        "git",
        ["tag", "-l", "--format=%(contents)", "v1.1.0"],
        { cwd: tempDir },
      );
      expect(annotation).toContain(editedNotes);

      jest.dontMock("../../../src/infra/github.js");
      jest.resetModules();
    });

    it("surfaces a warning but does not throw when gh release create fails", async () => {
      await initGitflowRepo(tempDir);
      const mock = makePrepareMock("minor");
      await prepareRelease({ cwd: tempDir, provider: mock, strategy: "gitflow" });
      originDir = await addOrigin(tempDir);

      jest.resetModules();
      jest.unstable_mockModule("../../../src/infra/github.js", () => ({
        isGhAvailable: async () => true,
        createGitHubRelease: async () => {
          throw new Error("gh release create failed");
        },
      }));
      const { finishRelease: finish2 } = await import("../../../src/commands/release.js");

      await expect(
        finish2({ cwd: tempDir, tagAndPush: true, createGhRelease: true, signTags: false }),
      ).resolves.toBeUndefined();

      // Tag remains created/pushed despite the gh failure.
      const { stdout: tags } = await exec("git", ["tag", "-l"], { cwd: tempDir });
      expect(tags.trim()).toBe("v1.1.0");
      const { stdout: remoteTags } = await exec("git", ["ls-remote", "--tags", "origin"], { cwd: tempDir });
      expect(remoteTags).toContain("refs/tags/v1.1.0");

      jest.dontMock("../../../src/infra/github.js");
      jest.resetModules();
    });
  });

  describe("ADR-003 plan lifecycle", () => {
    it("deletes the plan file before any merge — provoked merge conflict still leaves the plan deleted", async () => {
      await initGitflowRepo(tempDir);
      const mock = makePrepareMock("minor");
      await prepareRelease({ cwd: tempDir, provider: mock, strategy: "gitflow" });

      const planPath = join(tempDir, ".gitwise/release-plan.json");
      expect(await pathExists(planPath)).toBe(true);

      // Provoke a merge conflict: rewrite CHANGELOG.md on main so it diverges
      // from the same file on release/1.1.0.
      await exec("git", ["checkout", "main"], { cwd: tempDir });
      await writeFile(join(tempDir, "CHANGELOG.md"), "different content on main\n", "utf-8");
      await exec("git", ["add", "CHANGELOG.md"], { cwd: tempDir });
      await exec("git", ["commit", "-m", "chore: conflict seed"], { cwd: tempDir });
      await exec("git", ["checkout", "release/1.1.0"], { cwd: tempDir });

      await expect(
        finishRelease({ cwd: tempDir, tagAndPush: false, createGhRelease: false }),
      ).rejects.toThrow();

      // Plan file was deleted BEFORE the merge step that failed.
      expect(await pathExists(planPath)).toBe(false);
    });

    it("github-flow: a failing pre-commit hook leaves the plan file on disk and creates no tag (partial-mutation hole regression)", async () => {
      // Regression for the ADR-003 step-5/step-6 reordering: on the github-flow
      // finish path the release commit must happen BEFORE the plan delete so a
      // pre-commit hook rejection leaves the plan recoverable (user can
      // `git reset --hard HEAD && gw release finish` or `gw release abort`)
      // instead of getting stuck with NO_RELEASE_PLAN on retry.
      const mock = makePrepareMock("minor");
      await prepareRelease({ cwd: tempDir, provider: mock });

      const planPath = join(tempDir, ".gitwise/release-plan.json");
      expect(await pathExists(planPath)).toBe(true);

      const hookPath = join(tempDir, ".git/hooks/pre-commit");
      await writeFile(hookPath, "#!/bin/sh\necho 'rejected by hook' >&2\nexit 1\n", "utf-8");
      await chmod(hookPath, 0o755);

      await expect(
        finishRelease({ cwd: tempDir, tagAndPush: false, createGhRelease: false }),
      ).rejects.toMatchObject({ code: "COMMIT_HOOK_FAILURE" });

      expect(await pathExists(planPath)).toBe(true);

      const { stdout: tags } = await exec("git", ["tag", "-l"], { cwd: tempDir });
      expect(tags.trim()).toBe("");

      const { stdout: log } = await exec("git", ["log", "--oneline"], { cwd: tempDir });
      expect(log).not.toContain("chore(release):");
    });

    it("loads a plan written directly via saveReleasePlan (round-trip with prepare-equivalent data)", async () => {
      // Engineer a github-flow plan without calling prepare so we exercise the
      // load + validate + finish path without any LLM activity.
      await mkdir(join(tempDir, ".gitwise"), { recursive: true });
      await writeFile(join(tempDir, ".gitwise", "release-1.0.1.md"), "from-disk notes", "utf-8");
      await saveReleasePlan(tempDir, {
        schema: 1,
        strategy: "github-flow",
        currentVersion: "1.0.0",
        newVersion: "1.0.1",
        suggestedBump: "patch",
        changelog: "### Fixed\n- Bug fix",
        notes: "stale plan notes — should be overridden by disk reload",
        commits: "fix: something",
        preparedAt: new Date().toISOString(),
        baseCommit: "deadbeef",
        targetBranch: "main",
        releaseBranchCreated: false,
        tokens: { input: 0, output: 0 },
      });

      await finishRelease({ cwd: tempDir, tagAndPush: false, createGhRelease: false });

      const pkg = JSON.parse(await readFile(join(tempDir, "package.json"), "utf-8")) as { version: string };
      expect(pkg.version).toBe("1.0.1");
      expect(await pathExists(join(tempDir, ".gitwise/release-plan.json"))).toBe(false);
    });
  });
});

describe("abortRelease()", () => {
  let tempDir: string;

  async function initGitflowRepo(dir: string): Promise<void> {
    await exec("git", ["checkout", "-b", "develop"], { cwd: dir });
    await writeFile(join(dir, "develop-feature.ts"), "const y = 2;");
    await exec("git", ["add", "develop-feature.ts"], { cwd: dir });
    await exec("git", ["commit", "-m", "feat: develop work"], { cwd: dir });
  }

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gitwise-abort-"));
    await initRepo(tempDir);
    await writeFile(join(tempDir, "feature.ts"), "const x = 1;");
    await exec("git", ["add", "feature.ts"], { cwd: tempDir });
    await exec("git", ["commit", "-m", "feat: add feature"], { cwd: tempDir });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("rejects with NO_RELEASE_PLAN when no plan exists", async () => {
    await expect(
      abortRelease({ cwd: tempDir }),
    ).rejects.toMatchObject({ code: "NO_RELEASE_PLAN" });
  });

  it("deleteBranch:false removes the plan file and leaves the release branch in place", async () => {
    await initGitflowRepo(tempDir);
    const mock = makePrepareMock("minor");
    await prepareRelease({ cwd: tempDir, provider: mock, strategy: "gitflow" });

    expect(await pathExists(join(tempDir, ".gitwise/release-plan.json"))).toBe(true);

    await abortRelease({ cwd: tempDir, deleteBranch: false });

    // Plan is gone.
    expect(await pathExists(join(tempDir, ".gitwise/release-plan.json"))).toBe(false);

    // Notes file is preserved.
    expect(await pathExists(join(tempDir, ".gitwise/release-1.1.0.md"))).toBe(true);

    // Release branch is still present.
    const { stdout: branches } = await exec("git", ["branch", "--list", "release/*"], { cwd: tempDir });
    expect(branches).toContain("release/1.1.0");
  });

  it("gitflow + deleteBranch:true + branch fully merged into main and develop: removes branch", async () => {
    await initGitflowRepo(tempDir);
    const mock = makePrepareMock("minor");
    await prepareRelease({ cwd: tempDir, provider: mock, strategy: "gitflow" });

    // Manually fast-forward main and develop to include the release commit so
    // the release branch becomes a no-op merge from both targets.
    await exec("git", ["checkout", "main"], { cwd: tempDir });
    await exec("git", ["merge", "--no-ff", "release/1.1.0", "-m", "merge release"], { cwd: tempDir });
    await exec("git", ["checkout", "develop"], { cwd: tempDir });
    await exec("git", ["merge", "--no-ff", "release/1.1.0", "-m", "merge release"], { cwd: tempDir });
    await exec("git", ["checkout", "release/1.1.0"], { cwd: tempDir });

    await abortRelease({ cwd: tempDir, deleteBranch: true });

    // Plan removed.
    expect(await pathExists(join(tempDir, ".gitwise/release-plan.json"))).toBe(false);

    // Branch removed.
    const { stdout: branches } = await exec("git", ["branch", "--list", "release/*"], { cwd: tempDir });
    expect(branches.trim()).toBe("");

    // Notes file preserved across abort.
    expect(await pathExists(join(tempDir, ".gitwise/release-1.1.0.md"))).toBe(true);
  });

  it("gitflow + deleteBranch:true + branch has commits not in main: refuses with typed error and preserves branch + plan", async () => {
    await initGitflowRepo(tempDir);
    const mock = makePrepareMock("minor");
    await prepareRelease({ cwd: tempDir, provider: mock, strategy: "gitflow" });

    await expect(
      abortRelease({ cwd: tempDir, deleteBranch: true }),
    ).rejects.toMatchObject({ code: "RELEASE_BRANCH_UNMERGED" });

    // Plan still on disk for the user to inspect / retry.
    expect(await pathExists(join(tempDir, ".gitwise/release-plan.json"))).toBe(true);

    // Release branch untouched.
    const { stdout: branches } = await exec("git", ["branch", "--list", "release/*"], { cwd: tempDir });
    expect(branches).toContain("release/1.1.0");

    // We never moved off the release branch.
    const { stdout: cur } = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: tempDir });
    expect(cur.trim()).toBe("release/1.1.0");
  });

  it("github-flow + deleteBranch:true: no branch was created, so no branch action is attempted", async () => {
    const mock = makePrepareMock("minor");
    await prepareRelease({ cwd: tempDir, provider: mock });

    // Sanity: github-flow did not create a release branch.
    const { stdout: branchesBefore } = await exec("git", ["branch", "--list", "release/*"], { cwd: tempDir });
    expect(branchesBefore.trim()).toBe("");

    await abortRelease({ cwd: tempDir, deleteBranch: true });

    // Plan removed.
    expect(await pathExists(join(tempDir, ".gitwise/release-plan.json"))).toBe(false);

    // Still no release branch and we never left main.
    const { stdout: branchesAfter } = await exec("git", ["branch", "--list", "release/*"], { cwd: tempDir });
    expect(branchesAfter.trim()).toBe("");
    const { stdout: cur } = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: tempDir });
    expect(cur.trim()).toBe("main");
  });

  it("calling twice in a row: first succeeds, second rejects with NO_RELEASE_PLAN", async () => {
    const mock = makePrepareMock("minor");
    await prepareRelease({ cwd: tempDir, provider: mock });

    await abortRelease({ cwd: tempDir });
    expect(await pathExists(join(tempDir, ".gitwise/release-plan.json"))).toBe(false);

    await expect(
      abortRelease({ cwd: tempDir }),
    ).rejects.toMatchObject({ code: "NO_RELEASE_PLAN" });
  });

  it("preserves .gitwise/release-<version>.md notes even when the branch is deleted", async () => {
    await initGitflowRepo(tempDir);
    const mock = makePrepareMock("minor");
    await prepareRelease({ cwd: tempDir, provider: mock, strategy: "gitflow" });

    // Edit notes to assert they survive verbatim.
    const editedNotes = "MANUALLY EDITED NOTES";
    await writeFile(join(tempDir, ".gitwise", "release-1.1.0.md"), editedNotes, "utf-8");

    // Merge release into main + develop so deleteBranch is allowed.
    await exec("git", ["checkout", "main"], { cwd: tempDir });
    await exec("git", ["merge", "--no-ff", "release/1.1.0", "-m", "merge release"], { cwd: tempDir });
    await exec("git", ["checkout", "develop"], { cwd: tempDir });
    await exec("git", ["merge", "--no-ff", "release/1.1.0", "-m", "merge release"], { cwd: tempDir });

    await abortRelease({ cwd: tempDir, deleteBranch: true });

    const notes = await readFile(join(tempDir, ".gitwise", "release-1.1.0.md"), "utf-8");
    expect(notes).toBe(editedNotes);
  });
});

describe("legacy release() + applyRelease() unified path (task_08)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gitwise-legacy-"));
    await initRepo(tempDir);
    await writeFile(join(tempDir, "feature.ts"), "const x = 1;");
    await exec("git", ["add", "feature.ts"], { cwd: tempDir });
    await exec("git", ["commit", "-m", "feat: add feature"], { cwd: tempDir });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("github-flow: produces the same package.json, CHANGELOG entry header, and release-<v>.md as the pre-refactor implementation", async () => {
    // Snapshot the exact artifact shape the pre-refactor `applyRelease` produced
    // for a github-flow single-branch repo with a known plan. The values are
    // computed inline (rather than golden files) so a regression in any of the
    // three serialization paths shows up here.
    const fixedPlan = {
      suggestedBump: "minor" as const,
      newVersion: "1.1.0",
      currentVersion: "1.0.0",
      changelog: "### Added\n- Snapshot feature",
      notes: "Release notes that survive verbatim.",
      commits: "feat: snapshot",
      tokens: { input: 0, output: 0 },
    };

    await applyRelease(fixedPlan, {
      cwd: tempDir,
      tagAndPush: false,
      createGhRelease: false,
    });

    // package.json: existing JSON shape preserved (writeJSON keeps key order),
    // only `version` flipped to 1.1.0.
    const pkg = JSON.parse(
      await readFile(join(tempDir, "package.json"), "utf-8"),
    ) as Record<string, unknown>;
    expect(pkg).toEqual({ name: "test-pkg", version: "1.1.0" });

    // CHANGELOG.md: file created with the standard header followed by the new
    // entry. Header content must match the constant the implementation uses.
    const changelog = await readFile(join(tempDir, "CHANGELOG.md"), "utf-8");
    const today = new Date().toISOString().split("T")[0];
    const expectedHeader = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com),
and this project adheres to [Semantic Versioning](https://semver.org/).

`;
    const expectedEntry = `## [1.1.0] - ${today}\n\n### Added\n- Snapshot feature\n\n`;
    expect(changelog).toBe(expectedHeader + expectedEntry);

    // .gitwise/release-<v>.md: the exact notes string in the input plan.
    const notes = await readFile(
      join(tempDir, ".gitwise/release-1.1.0.md"),
      "utf-8",
    );
    expect(notes).toBe(fixedPlan.notes);

    // Release commit appears on main with the expected subject.
    const { stdout: log } = await exec("git", ["log", "--oneline", "-1"], { cwd: tempDir });
    expect(log).toContain("chore(release): v1.1.0");

    // Plan file lifecycle: written and deleted within the unified flow.
    expect(await pathExists(join(tempDir, ".gitwise/release-plan.json"))).toBe(false);
  });

  it("github-flow: tagAndPush creates an annotated tag whose contents include the notes", async () => {
    const fixedPlan = {
      suggestedBump: "patch" as const,
      newVersion: "1.0.1",
      currentVersion: "1.0.0",
      changelog: "### Fixed\n- A bug",
      notes: "Patch release annotation.",
      commits: "fix: a bug",
      tokens: { input: 0, output: 0 },
    };
    // Local-only tag (no remote): finishRelease still pushes when tagAndPush
    // is true, so we need a bare remote to receive it.
    const originDir = await mkdtemp(join(tmpdir(), "gitwise-legacy-origin-"));
    try {
      await exec("git", ["init", "--bare", "-b", "main"], { cwd: originDir });
      await exec("git", ["remote", "add", "origin", originDir], { cwd: tempDir });

      jest.resetModules();
      jest.unstable_mockModule("../../../src/infra/github.js", () => ({
        isGhAvailable: async () => false,
        createGitHubRelease: async () => ({ url: "n/a" }),
      }));
      const { applyRelease: apply2 } = await import("../../../src/commands/release.js");

      await apply2(fixedPlan, { cwd: tempDir, tagAndPush: true, createGhRelease: false, signTags: false });

      const { stdout: tags } = await exec("git", ["tag", "-l"], { cwd: tempDir });
      expect(tags.trim()).toBe("v1.0.1");

      const { stdout: annotation } = await exec(
        "git",
        ["tag", "-l", "--format=%(contents)", "v1.0.1"],
        { cwd: tempDir },
      );
      expect(annotation).toContain(fixedPlan.notes);

      jest.dontMock("../../../src/infra/github.js");
      jest.resetModules();
    } finally {
      await rm(originDir, { recursive: true, force: true });
    }
  });

  it("github-flow: invokes gh release create with the in-memory plan notes", async () => {
    const fixedPlan = {
      suggestedBump: "minor" as const,
      newVersion: "1.1.0",
      currentVersion: "1.0.0",
      changelog: "### Added\n- gh hook",
      notes: "Notes destined for gh release create.",
      commits: "feat: gh",
      tokens: { input: 0, output: 0 },
    };

    const originDir = await mkdtemp(join(tmpdir(), "gitwise-legacy-origin-"));
    try {
      await exec("git", ["init", "--bare", "-b", "main"], { cwd: originDir });
      await exec("git", ["remote", "add", "origin", originDir], { cwd: tempDir });

      let captured: { tag: string; title: string; body: string } | null = null;
      jest.resetModules();
      jest.unstable_mockModule("../../../src/infra/github.js", () => ({
        isGhAvailable: async () => true,
        createGitHubRelease: async (params: { tag: string; title: string; body: string }) => {
          captured = { tag: params.tag, title: params.title, body: params.body };
          return { url: "https://example.com/r" };
        },
      }));
      const { applyRelease: apply2 } = await import("../../../src/commands/release.js");

      await apply2(fixedPlan, { cwd: tempDir, tagAndPush: true, createGhRelease: true, signTags: false });

      expect(captured).not.toBeNull();
      expect(captured!.tag).toBe("v1.1.0");
      expect(captured!.title).toBe("v1.1.0");
      expect(captured!.body).toBe(fixedPlan.notes);

      jest.dontMock("../../../src/infra/github.js");
      jest.resetModules();
    } finally {
      await rm(originDir, { recursive: true, force: true });
    }
  });
});

describe("runReleaseInProcess() (task_08)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gitwise-oneshot-"));
    await initRepo(tempDir);
    await writeFile(join(tempDir, "feature.ts"), "const x = 1;");
    await exec("git", ["add", "feature.ts"], { cwd: tempDir });
    await exec("git", ["commit", "-m", "feat: add feature"], { cwd: tempDir });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("invokes the LLM provider exactly once per release (no double-pay across phases)", async () => {
    // prepareRelease drives release() which makes 3 chat calls (version,
    // changelog, notes). finishRelease does not call the LLM. The unified path
    // must total exactly 3 — proving the explicit lifecycle does not re-plan.
    const mock = makePrepareMock("minor");
    const plan = await runReleaseInProcess({
      cwd: tempDir,
      provider: mock,
      confirm: () => true,
      finishOptions: { tagAndPush: false, createGhRelease: false },
    });
    expect(plan).not.toBeNull();
    expect(mock.getCallCount()).toBe(3);
  });

  it("happy path: writes the plan during the flow and deletes it on completion", async () => {
    const mock = makePrepareMock("minor");
    const planPath = join(tempDir, ".gitwise/release-plan.json");

    // Race the plan-file presence by observing it from inside the confirm
    // callback. prepareRelease writes the plan last, finishRelease deletes it
    // first — between the two the file must exist.
    let planFileWasPresent = false;
    await runReleaseInProcess({
      cwd: tempDir,
      provider: mock,
      confirm: async () => {
        planFileWasPresent = await pathExists(planPath);
        return true;
      },
      finishOptions: { tagAndPush: false, createGhRelease: false },
    });

    expect(planFileWasPresent).toBe(true);
    expect(await pathExists(planPath)).toBe(false);

    // Manifest bumped, CHANGELOG written, notes preserved on disk.
    const pkg = JSON.parse(await readFile(join(tempDir, "package.json"), "utf-8")) as { version: string };
    expect(pkg.version).toBe("1.1.0");
    expect(await pathExists(join(tempDir, "CHANGELOG.md"))).toBe(true);
    expect(await pathExists(join(tempDir, ".gitwise/release-1.1.0.md"))).toBe(true);
  });

  it("confirm:false aborts cleanly — plan deleted, no tag created, no manifest mutation", async () => {
    const mock = makePrepareMock("minor");
    const pkgBefore = await readFile(join(tempDir, "package.json"), "utf-8");

    const result = await runReleaseInProcess({
      cwd: tempDir,
      provider: mock,
      confirm: () => false,
      finishOptions: { tagAndPush: false, createGhRelease: false },
    });

    expect(result).toBeNull();

    // Plan file removed by abortRelease.
    expect(await pathExists(join(tempDir, ".gitwise/release-plan.json"))).toBe(false);

    // No tag created (finishRelease never ran).
    const { stdout: tags } = await exec("git", ["tag", "-l"], { cwd: tempDir });
    expect(tags.trim()).toBe("");

    // Manifest untouched on github-flow (prepare does not bump it).
    const pkgAfter = await readFile(join(tempDir, "package.json"), "utf-8");
    expect(pkgAfter).toBe(pkgBefore);

    // No CHANGELOG.md was created.
    expect(await pathExists(join(tempDir, "CHANGELOG.md"))).toBe(false);

    // Notes file is preserved by abort — the user may still want it.
    expect(await pathExists(join(tempDir, ".gitwise/release-1.1.0.md"))).toBe(true);
  });

  it("confirm callback throwing aborts (plan deleted) and rethrows the error", async () => {
    const mock = makePrepareMock("minor");
    const boom = new Error("confirm rejected");

    await expect(
      runReleaseInProcess({
        cwd: tempDir,
        provider: mock,
        confirm: () => {
          throw boom;
        },
        finishOptions: { tagAndPush: false, createGhRelease: false },
      }),
    ).rejects.toBe(boom);

    expect(await pathExists(join(tempDir, ".gitwise/release-plan.json"))).toBe(false);
    const { stdout: tags } = await exec("git", ["tag", "-l"], { cwd: tempDir });
    expect(tags.trim()).toBe("");
  });

  it("confirmAbortDeletesBranch as a callback is invoked with the prepared plan after confirm returns false", async () => {
    const mock = makePrepareMock("minor");
    const callbackCalls: Array<{ newVersion: string; releaseBranchCreated: boolean }> = [];

    const result = await runReleaseInProcess({
      cwd: tempDir,
      provider: mock,
      confirm: () => false,
      confirmAbortDeletesBranch: (plan) => {
        callbackCalls.push({
          newVersion: plan.newVersion,
          releaseBranchCreated: plan.releaseBranchCreated,
        });
        // No release branch on github-flow → callback returns false to match.
        return false;
      },
      finishOptions: { tagAndPush: false, createGhRelease: false },
    });

    expect(result).toBeNull();
    expect(callbackCalls).toHaveLength(1);
    expect(callbackCalls[0]).toEqual({
      newVersion: "1.1.0",
      releaseBranchCreated: false,
    });
    // Plan removed by abort regardless of deleteBranch.
    expect(await pathExists(join(tempDir, ".gitwise/release-plan.json"))).toBe(false);
  });

  it("a throwing confirmAbortDeletesBranch callback never blocks abort cleanup", async () => {
    const mock = makePrepareMock("minor");

    const result = await runReleaseInProcess({
      cwd: tempDir,
      provider: mock,
      confirm: () => false,
      confirmAbortDeletesBranch: () => {
        throw new Error("prompt crashed");
      },
      finishOptions: { tagAndPush: false, createGhRelease: false },
    });

    expect(result).toBeNull();
    expect(await pathExists(join(tempDir, ".gitwise/release-plan.json"))).toBe(false);
  });

  it("finishRelease validation failure leaves the plan file in place (ADR-003 — fail before delete)", async () => {
    // Dirty the working tree from inside `confirm` with a path NOT in
    // finishRelease's allow-list (the helper filters .gitwise/ and .gitignore,
    // but not arbitrary user files). finishRelease must reject with
    // WORKING_TREE_DIRTY during validation — BEFORE it deletes the plan file —
    // so the user can `gw release abort` or clean up and rerun
    // `gw release finish`.
    const mock = makePrepareMock("minor");
    await expect(
      runReleaseInProcess({
        cwd: tempDir,
        provider: mock,
        confirm: async () => {
          await writeFile(join(tempDir, "user-dirty.ts"), "const d = 1;");
          return true;
        },
        finishOptions: { tagAndPush: false, createGhRelease: false },
      }),
    ).rejects.toMatchObject({ code: "WORKING_TREE_DIRTY" });

    expect(await pathExists(join(tempDir, ".gitwise/release-plan.json"))).toBe(true);
  });
});

describe("detectWorkspaceRoot", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gitwise-detect-workspace-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns false when package.json is missing and no packages/ directory exists", async () => {
    expect(await detectWorkspaceRoot(tempDir)).toBe(false);
  });

  it("returns false when packages/ exists but is empty", async () => {
    await mkdir(join(tempDir, "packages"));
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ name: "root", version: "1.0.0" }, null, 2));
    expect(await detectWorkspaceRoot(tempDir)).toBe(false);
  });

  it("returns false when packages/* subdirs lack package.json", async () => {
    await mkdir(join(tempDir, "packages", "empty"), { recursive: true });
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ name: "root", version: "1.0.0" }, null, 2));
    expect(await detectWorkspaceRoot(tempDir)).toBe(false);
  });

  it("returns true on packages/* fallback when nested package.json exists", async () => {
    await mkdir(join(tempDir, "packages", "a"), { recursive: true });
    await writeFile(
      join(tempDir, "packages", "a", "package.json"),
      JSON.stringify({ name: "a", version: "1.0.0" }),
    );
    // Intentionally omit `workspaces` on the root to exercise the fallback.
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ name: "root", version: "1.0.0" }, null, 2));
    expect(await detectWorkspaceRoot(tempDir)).toBe(true);
  });

  it("honors npm workspaces array form pointing outside packages/ (e.g. apps/*)", async () => {
    await mkdir(join(tempDir, "apps", "web"), { recursive: true });
    await writeFile(
      join(tempDir, "apps", "web", "package.json"),
      JSON.stringify({ name: "web", version: "1.0.0" }),
    );
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({ name: "root", version: "1.0.0", workspaces: ["apps/*"] }, null, 2),
    );
    expect(await detectWorkspaceRoot(tempDir)).toBe(true);
  });

  it("honors yarn-object workspaces form (`workspaces: { packages: [...] }`)", async () => {
    await mkdir(join(tempDir, "libs", "ui"), { recursive: true });
    await writeFile(
      join(tempDir, "libs", "ui", "package.json"),
      JSON.stringify({ name: "ui", version: "1.0.0" }),
    );
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(
        { name: "root", version: "1.0.0", workspaces: { packages: ["libs/*"] } },
        null,
        2,
      ),
    );
    expect(await detectWorkspaceRoot(tempDir)).toBe(true);
  });

  it("returns false when the workspaces array points to directories with no package.json", async () => {
    await mkdir(join(tempDir, "apps", "empty"), { recursive: true });
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({ name: "root", version: "1.0.0", workspaces: ["apps/*"] }, null, 2),
    );
    expect(await detectWorkspaceRoot(tempDir)).toBe(false);
  });

  it("returns false when package.json is unparseable JSON and no packages/ fallback exists", async () => {
    await writeFile(join(tempDir, "package.json"), "{ this is not json");
    expect(await detectWorkspaceRoot(tempDir)).toBe(false);
  });
});

describe("writeWorkspaceVersionStep", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gitwise-write-step-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("apply writes the new version into the manifest", async () => {
    const pkgPath = join(tempDir, "package.json");
    await writeFile(
      pkgPath,
      JSON.stringify({ name: "a", version: "1.0.0" }, null, 2) + "\n",
    );

    const step = writeWorkspaceVersionStep(pkgPath, "1.2.3");
    const prior = await step.apply();

    expect(prior).toBeInstanceOf(Buffer);
    const parsed = JSON.parse(await readFile(pkgPath, "utf-8")) as { version: string };
    expect(parsed.version).toBe("1.2.3");
  });

  it("apply writes the canonical pretty-printed JSON with a trailing newline", async () => {
    const pkgPath = join(tempDir, "package.json");
    await writeFile(
      pkgPath,
      JSON.stringify({ name: "a", version: "1.0.0" }, null, 2) + "\n",
    );

    await writeWorkspaceVersionStep(pkgPath, "2.0.0").apply();

    const onDisk = await readFile(pkgPath, "utf-8");
    expect(onDisk).toBe(
      JSON.stringify({ name: "a", version: "2.0.0" }, null, 2) + "\n",
    );
  });

  it("compensate restores prior bytes byte-for-byte (preserving formatting)", async () => {
    const pkgPath = join(tempDir, "package.json");
    // Intentionally use an unusual formatting that writeJSON would NOT produce
    // (tabs + trailing whitespace + no trailing newline) so we can prove the
    // compensate path restores the original bytes verbatim instead of
    // re-serializing through writeJSON.
    const original = '{\n\t"name": "a",\n\t"version": "1.0.0"\n}   ';
    await writeFile(pkgPath, original, "utf-8");

    const step = writeWorkspaceVersionStep(pkgPath, "9.9.9");
    const prior = await step.apply();

    // After apply, the file is rewritten in canonical form (and the bytes
    // certainly do not equal `original` any more).
    expect(await readFile(pkgPath, "utf-8")).not.toBe(original);

    await step.compensate(prior);

    expect(await readFile(pkgPath, "utf-8")).toBe(original);
  });

  it("preserves sequential ordering across 3 mock workspaces", async () => {
    const order: string[] = [];
    const stepFor = (label: string) => ({
      name: label,
      apply: async () => {
        order.push(`apply:${label}`);
        return label;
      },
      compensate: async () => {
        order.push(`compensate:${label}`);
      },
    });

    const tx = new Transaction();
    await tx.run(stepFor("ws0"));
    await tx.run(stepFor("ws1"));
    await tx.run(stepFor("ws2"));

    expect(order).toEqual(["apply:ws0", "apply:ws1", "apply:ws2"]);

    await tx.rollback(
      new GitwiseError({ code: "GIT_FAILED", message: "x" }),
      { warn: () => {} },
    );

    expect(order).toEqual([
      "apply:ws0",
      "apply:ws1",
      "apply:ws2",
      // LIFO compensate order matches ADR-004 §Decision.
      "compensate:ws2",
      "compensate:ws1",
      "compensate:ws0",
    ]);
  });
});

describe("propagateVersionToWorkspaces (rollback boundary + lock)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gitwise-propagate-"));
  });

  afterEach(async () => {
    // Best-effort: chmod everything back so rm can remove read-only fixtures.
    try {
      await chmod(tempDir, 0o755);
    } catch {}
    await rm(tempDir, { recursive: true, force: true });
  });

  async function seedWorkspaces(
    versions: Array<{ name: string; version: string }>,
  ): Promise<string[]> {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({ name: "root", version: "1.0.0", workspaces: ["packages/*"] }, null, 2) + "\n",
    );
    const pkgPaths: string[] = [];
    for (const w of versions) {
      const dir = join(tempDir, "packages", w.name);
      await mkdir(dir, { recursive: true });
      const pkgPath = join(dir, "package.json");
      await writeFile(
        pkgPath,
        JSON.stringify({ name: w.name, version: w.version }, null, 2) + "\n",
      );
      pkgPaths.push(pkgPath);
    }
    return pkgPaths;
  }

  it("happy path: writes new version to every workspace and returns relative manifest paths", async () => {
    const pkgPaths = await seedWorkspaces([
      { name: "a", version: "1.0.0" },
      { name: "b", version: "1.0.0" },
      { name: "c", version: "1.0.0" },
    ]);

    const modified = await propagateVersionToWorkspaces(tempDir, "1.2.3");

    expect(modified.sort()).toEqual(
      [
        "packages/a/package.json",
        "packages/b/package.json",
        "packages/c/package.json",
      ].sort(),
    );
    for (const p of pkgPaths) {
      const parsed = JSON.parse(await readFile(p, "utf-8")) as { version: string };
      expect(parsed.version).toBe("1.2.3");
    }
  });

  it("rolls back already-written manifests when a mid-loop write fails", async () => {
    const pkgPaths = await seedWorkspaces([
      { name: "a", version: "1.0.0" },
      { name: "b", version: "1.0.0" },
      { name: "c", version: "1.0.0" },
    ]);
    const priorContents = await Promise.all(
      pkgPaths.map((p) => readFile(p, "utf-8")),
    );

    // Make packages/b/package.json read-only so the second write fails with EACCES.
    await chmod(pkgPaths[1]!, 0o444);

    await expect(
      propagateVersionToWorkspaces(tempDir, "2.0.0"),
    ).rejects.toBeInstanceOf(GitwiseError);

    // workspaces[0] (a) was written, then must have been reverted.
    expect(await readFile(pkgPaths[0]!, "utf-8")).toBe(priorContents[0]);
    // workspaces[1] (b) was the failing write — it should still hold the
    // pre-flow bytes (chmod kept it read-only; the write was blocked before
    // any partial mutation).
    expect(await readFile(pkgPaths[1]!, "utf-8")).toBe(priorContents[1]);
    // workspaces[2] (c) was never reached.
    expect(await readFile(pkgPaths[2]!, "utf-8")).toBe(priorContents[2]);
  });

  it("releases the lock on the success path", async () => {
    await seedWorkspaces([{ name: "a", version: "1.0.0" }]);
    await propagateVersionToWorkspaces(tempDir, "1.2.3");

    // After success the lock file must be gone — a fresh acquire should succeed.
    const release = await acquireRepoLock(tempDir, { command: "test" });
    await release();
  });

  it("releases the lock on the failure path", async () => {
    const pkgPaths = await seedWorkspaces([
      { name: "a", version: "1.0.0" },
      { name: "b", version: "1.0.0" },
    ]);
    await chmod(pkgPaths[1]!, 0o444);

    await expect(
      propagateVersionToWorkspaces(tempDir, "2.0.0"),
    ).rejects.toBeInstanceOf(GitwiseError);

    const release = await acquireRepoLock(tempDir, { command: "test" });
    await release();
  });

  it("rejects a concurrent invocation while the lock is held with REPO_LOCKED", async () => {
    await seedWorkspaces([{ name: "a", version: "1.0.0" }]);

    // Hold the lock externally so the propagate call races against it.
    const release = await acquireRepoLock(tempDir, {
      command: "test-holder",
    });
    try {
      await expect(
        propagateVersionToWorkspaces(tempDir, "1.2.3"),
      ).rejects.toMatchObject({ code: "REPO_LOCKED" });
    } finally {
      await release();
    }
  });
});
