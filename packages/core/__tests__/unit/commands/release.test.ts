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

    await applyRelease(plan, { cwd: tempDir, tagAndPush: false, createGhRelease: false, workspacePropagation: true });

    for (const pkgName of ["pkg-a", "pkg-b", "pkg-c"]) {
      const pkgData = JSON.parse(await readFile(join(tempDir, "packages", pkgName, "package.json"), "utf-8")) as { version: string };
      expect(pkgData.version).toBe("1.1.0");
    }
  });

  it("integration: mkdtemp repo with 3 workspace packages propagates version to all three", async () => {
    for (const pkg of ["core", "cli", "skills"]) {
      await mkdir(join(tempDir, "packages", pkg), { recursive: true });
      await writeFile(
        join(tempDir, "packages", pkg, "package.json"),
        JSON.stringify({ name: `@test/${pkg}`, version: "1.0.0" }),
      );
    }

    await applyRelease(plan, { cwd: tempDir, tagAndPush: false, createGhRelease: false, workspacePropagation: true });

    for (const pkg of ["core", "cli", "skills"]) {
      const data = JSON.parse(await readFile(join(tempDir, "packages", pkg, "package.json"), "utf-8")) as { version: string };
      expect(data.version).toBe("1.1.0");
    }
  });
});
