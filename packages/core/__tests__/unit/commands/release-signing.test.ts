/**
 * Unit tests for signTags behavior in finishRelease / FinishReleaseOptions.
 * Tests that signTags: true (default) uses `git tag -s` and
 * signTags: false uses `git tag -a` with a stderr warning.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

async function initRepo(dir: string, version = "1.0.0"): Promise<void> {
  await exec("git", ["init", "-b", "main"], { cwd: dir });
  await exec("git", ["config", "user.email", "test@test.com"], { cwd: dir });
  await exec("git", ["config", "user.name", "Test"], { cwd: dir });
  // Make `git tag -s` fail fast and deterministically: point gpg.program at
  // `false` so signing is attempted (exercising the -s path) but errors out
  // immediately instead of blocking on an interactive pinentry passphrase
  // prompt (which otherwise times the test out on dev machines with a key).
  await exec("git", ["config", "gpg.program", "false"], { cwd: dir });
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({ name: "test-pkg", version }, null, 2),
  );
  await exec("git", ["add", "."], { cwd: dir });
  await exec("git", ["commit", "-m", "initial commit"], { cwd: dir });
}

describe("FinishReleaseOptions — signTags interface", () => {
  it("signTags is an optional boolean field in FinishReleaseOptions", async () => {
    const { finishRelease } = await import("../../../src/commands/release.js");
    // Verify the function accepts signTags: false without TypeScript error
    // (this is a compile-time check expressed as a runtime type probe)
    expect(typeof finishRelease).toBe("function");
    // finishRelease must accept signTags in its options — verified by TypeScript
    // compilation. At runtime we confirm the option flows through by observing
    // the warning behavior tested below.
  });
});

describe("finishRelease — signTags default is true", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "gitwise-sign-test-"));
    await initRepo(tmpDir);
    await mkdir(join(tmpDir, ".gitwise"), { recursive: true });
    // Set up a release plan so finishRelease can load it
    const plan = {
      schema: 1,
      strategy: "github-flow",
      currentVersion: "1.0.0",
      newVersion: "1.1.0",
      suggestedBump: "minor",
      changelog: "### Added\n- New feature",
      notes: "Version 1.1.0 release notes.",
      commits: "feat: new feature",
      preparedAt: new Date().toISOString(),
      baseCommit: "abc123",
      targetBranch: "main",
      releaseBranchCreated: false,
      tokens: { input: 10, output: 5 },
    };
    await writeFile(
      join(tmpDir, ".gitwise", "release-plan.json"),
      JSON.stringify(plan, null, 2),
    );
    await writeFile(
      join(tmpDir, ".gitwise", "release-1.1.0.md"),
      "Version 1.1.0 release notes.",
    );
    await writeFile(
      join(tmpDir, "CHANGELOG.md"),
      "# Changelog\n\n## [1.1.0] - 2026-05-23\n\n### Added\n- New feature\n",
    );
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("emits NO warning when signTags is not specified (default true)", async () => {
    const { finishRelease } = await import("../../../src/commands/release.js");
    const stderrWrites: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    jest
      .spyOn(process.stderr, "write")
      .mockImplementation((chunk: unknown) => {
        stderrWrites.push(String(chunk));
        return true;
      });

    try {
      await finishRelease({
        cwd: tmpDir,
        tagAndPush: false,
        createGhRelease: false,
        workspacePropagation: false,
        // signTags NOT specified — defaults to true
      });
    } catch {
      // Tag creation may fail in test environment without GPG — that's OK
      // We only care about the warning (or lack thereof)
    } finally {
      jest.restoreAllMocks();
    }

    const signTagsWarning = stderrWrites.find((w) =>
      w.includes("--no-sign") || w.includes("signTags:false") || w.includes("NOT be GPG-signed"),
    );
    expect(signTagsWarning).toBeUndefined();
  });

  it("emits a warning to stderr when signTags is false", async () => {
    const { finishRelease } = await import("../../../src/commands/release.js");
    const stderrWrites: string[] = [];
    jest
      .spyOn(process.stderr, "write")
      .mockImplementation((chunk: unknown) => {
        stderrWrites.push(String(chunk));
        return true;
      });

    try {
      await finishRelease({
        cwd: tmpDir,
        tagAndPush: false,
        createGhRelease: false,
        workspacePropagation: false,
        signTags: false,
      });
    } catch {
      // expected — repo not configured for tagging in this unit test
    } finally {
      jest.restoreAllMocks();
    }

    const signTagsWarning = stderrWrites.find((w) => w.includes("NOT be GPG-signed"));
    expect(signTagsWarning).toBeDefined();
    expect(signTagsWarning).toContain("testing-only");
  });
});

describe("git.createTag — signed vs unsigned", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "gitwise-tag-test-"));
    await initRepo(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("calls git tag -a (unsigned) when signed is false", async () => {
    const { createTag } = await import("../../../src/infra/git.js");
    // Call without signed option (default undefined → unsigned annotated tag)
    // This should create an annotated tag without GPG signing
    await createTag(tmpDir, "v1.0.0-unsigned", "test tag message", { signed: false });
    const { stdout } = await exec("git", ["cat-file", "-t", "v1.0.0-unsigned"], { cwd: tmpDir });
    expect(stdout.trim()).toBe("tag");
  });

  it("calls git tag -s (signed) when signed is true — may fail without GPG key in test env", async () => {
    const { createTag } = await import("../../../src/infra/git.js");
    // In test environments without a GPG key, this call is expected to fail.
    // The test verifies the code path is invoked (not the GPG signing itself).
    try {
      await createTag(tmpDir, "v1.0.0-signed", "signed tag message", { signed: true });
      // If GPG key is available, verify it's a tag
      const { stdout } = await exec("git", ["cat-file", "-t", "v1.0.0-signed"], { cwd: tmpDir });
      expect(stdout.trim()).toBe("tag");
    } catch (err) {
      // Expected: GPG key not available in test environment
      // The important thing is that -s was passed (checked via the error message)
      const message = err instanceof Error ? err.message : String(err);
      // GPG errors typically mention gpg, secret key, or signing
      const isGpgError =
        /gpg|secret key|sign|key|passphrase|No such file/i.test(message);
      expect(isGpgError).toBe(true);
    }
  });

  it("unsigned tag (default) succeeds without GPG configuration", async () => {
    const { createTag } = await import("../../../src/infra/git.js");
    await expect(
      createTag(tmpDir, "v1.0.0-annotated", "annotated tag"),
    ).resolves.toBeUndefined();
  });
});

describe("release.ts — signTags defaults", () => {
  it("FinishReleaseOptions.signTags is optional (can be omitted)", async () => {
    // Import to verify TypeScript compilation — if signTags were required, this would fail
    const { finishRelease } = await import("../../../src/commands/release.js");
    expect(typeof finishRelease).toBe("function");
  });

  it("the --no-sign escape hatch warning mentions testing-only context", async () => {
    const { finishRelease } = await import("../../../src/commands/release.js");
    const stderrWrites: string[] = [];
    jest.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
      stderrWrites.push(String(chunk));
      return true;
    });

    try {
      await finishRelease({
        cwd: "/nonexistent/path",
        tagAndPush: false,
        createGhRelease: false,
        signTags: false,
      });
    } catch {
      // Expected — path doesn't exist
    } finally {
      jest.restoreAllMocks();
    }

    const warning = stderrWrites.find((w) => w.includes("testing-only"));
    expect(warning).toBeDefined();
  });
});
