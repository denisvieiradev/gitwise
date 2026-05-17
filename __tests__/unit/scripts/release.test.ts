import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const exec = promisify(execFile);

import {
  bumpVersion,
  isExplicitVersion,
  listWorkspaceManifests,
  parseArgs,
  propagateVersion,
  resolveNewVersion,
  runRelease,
} from "../../../scripts/release.mjs";

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

async function createWorkspaceFixture(version: string): Promise<{
  root: string;
  rootManifest: string;
  pkgA: string;
  pkgB: string;
  outside: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "gitwise-release-"));
  const rootManifest = join(root, "package.json");
  await writeJson(rootManifest, {
    name: "fixture-root",
    version,
    private: true,
    workspaces: ["packages/*"],
  });
  await mkdir(join(root, "packages", "a"), { recursive: true });
  await mkdir(join(root, "packages", "b"), { recursive: true });
  const pkgA = join(root, "packages", "a", "package.json");
  const pkgB = join(root, "packages", "b", "package.json");
  await writeJson(pkgA, { name: "@fixture/a", version });
  await writeJson(pkgB, { name: "@fixture/b", version });
  const outside = join(root, "other.json");
  await writeJson(outside, { sentinel: true, version: "999.999.999" });
  return { root, rootManifest, pkgA, pkgB, outside };
}

describe("release.mjs — argument parsing", () => {
  it("accepts 'patch'", () => {
    expect(parseArgs(["patch"])).toEqual({
      bump: "patch",
      cwd: undefined,
      explicitVersion: undefined,
    });
  });

  it("accepts 'minor'", () => {
    expect(parseArgs(["minor"]).bump).toBe("minor");
  });

  it("accepts 'major'", () => {
    expect(parseArgs(["major"]).bump).toBe("major");
  });

  it("accepts an explicit semver", () => {
    expect(parseArgs(["1.5.0"]).explicitVersion).toBe("1.5.0");
  });

  it("accepts an explicit semver with a prerelease suffix", () => {
    expect(parseArgs(["1.5.0-beta.1"]).explicitVersion).toBe("1.5.0-beta.1");
  });

  it("supports --cwd <path>", () => {
    expect(parseArgs(["patch", "--cwd", "/tmp/repo"])).toEqual({
      bump: "patch",
      cwd: "/tmp/repo",
      explicitVersion: undefined,
    });
  });

  it("supports --cwd=<path>", () => {
    expect(parseArgs(["--cwd=/tmp/repo", "minor"]).cwd).toBe("/tmp/repo");
  });

  it("rejects an unknown argument", () => {
    expect(() => parseArgs(["foo"])).toThrow(/Invalid argument "foo"/);
  });

  it("rejects an empty argv", () => {
    expect(() => parseArgs([])).toThrow(/Usage:/);
  });

  it("rejects more than one positional argument", () => {
    expect(() => parseArgs(["patch", "minor"])).toThrow(/Usage:/);
  });
});

describe("release.mjs — bumpVersion", () => {
  it("bumps patch", () => {
    expect(bumpVersion("0.1.2", "patch")).toBe("0.1.3");
  });

  it("bumps minor and resets patch", () => {
    expect(bumpVersion("0.1.2", "minor")).toBe("0.2.0");
  });

  it("bumps major and resets minor + patch", () => {
    expect(bumpVersion("0.1.2", "major")).toBe("1.0.0");
  });

  it("ignores prerelease suffixes for the bump base", () => {
    expect(bumpVersion("1.2.3-beta.1", "patch")).toBe("1.2.4");
  });

  it("throws on a non-semver current version", () => {
    expect(() => bumpVersion("not-a-version", "patch")).toThrow(
      /non-semver/,
    );
  });

  it("throws on an unknown bump kind", () => {
    expect(() =>
      bumpVersion("1.0.0", "huge" as unknown as "patch"),
    ).toThrow(/Unknown bump/);
  });
});

describe("release.mjs — isExplicitVersion", () => {
  it("accepts standard X.Y.Z", () => {
    expect(isExplicitVersion("0.0.1")).toBe(true);
    expect(isExplicitVersion("10.20.30")).toBe(true);
  });

  it("rejects bump keywords", () => {
    expect(isExplicitVersion("patch")).toBe(false);
  });

  it("rejects partial versions", () => {
    expect(isExplicitVersion("1.0")).toBe(false);
  });
});

describe("release.mjs — resolveNewVersion", () => {
  it("prefers explicitVersion over bump", () => {
    expect(
      resolveNewVersion({
        currentVersion: "1.0.0",
        bump: "patch",
        explicitVersion: "9.9.9",
      }),
    ).toBe("9.9.9");
  });

  it("falls back to bumpVersion when no explicit version", () => {
    expect(
      resolveNewVersion({
        currentVersion: "0.1.2",
        bump: "minor",
      }),
    ).toBe("0.2.0");
  });

  it("throws when neither input is provided", () => {
    expect(() => resolveNewVersion({ currentVersion: "1.0.0" })).toThrow();
  });
});

describe("release.mjs — workspace manifest discovery", () => {
  let fixture: Awaited<ReturnType<typeof createWorkspaceFixture>>;

  beforeEach(async () => {
    fixture = await createWorkspaceFixture("0.1.2");
  });

  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it("returns each packages/*/package.json sorted", () => {
    const manifests = listWorkspaceManifests(fixture.root);
    expect(manifests).toEqual([fixture.pkgA, fixture.pkgB]);
  });

  it("returns an empty array when no packages directory exists", async () => {
    const empty = await mkdtemp(join(tmpdir(), "gitwise-release-empty-"));
    try {
      expect(listWorkspaceManifests(empty)).toEqual([]);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  it("skips entries under packages/ that are not directories or that lack a package.json", async () => {
    // A loose file under packages/ (not a directory).
    await writeFile(join(fixture.root, "packages", ".keep"), "");
    // A workspace directory without a manifest.
    await mkdir(join(fixture.root, "packages", "empty"), { recursive: true });
    const manifests = listWorkspaceManifests(fixture.root);
    expect(manifests).toEqual([fixture.pkgA, fixture.pkgB]);
  });
});

describe("release.mjs — propagateVersion", () => {
  let fixture: Awaited<ReturnType<typeof createWorkspaceFixture>>;

  beforeEach(async () => {
    fixture = await createWorkspaceFixture("0.1.2");
  });

  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it("updates the root manifest and every workspace manifest", async () => {
    const updated = propagateVersion(fixture.root, "0.2.0");
    expect(updated).toEqual([fixture.rootManifest, fixture.pkgA, fixture.pkgB]);
    expect((await readJson(fixture.rootManifest)).version).toBe("0.2.0");
    expect((await readJson(fixture.pkgA)).version).toBe("0.2.0");
    expect((await readJson(fixture.pkgB)).version).toBe("0.2.0");
  });

  it("does not touch JSON files outside the root + workspaces", async () => {
    const before = await readJson(fixture.outside);
    propagateVersion(fixture.root, "0.2.0");
    const after = await readJson(fixture.outside);
    expect(after).toEqual(before);
  });

  it("preserves the JSON formatting contract (2-space indent + trailing newline)", async () => {
    propagateVersion(fixture.root, "1.0.0");
    const contents = await readFile(fixture.rootManifest, "utf8");
    expect(contents.endsWith("\n")).toBe(true);
    expect(contents).toContain('  "version": "1.0.0"');
  });

  it("is idempotent when the requested version already matches every manifest", async () => {
    const updated = propagateVersion(fixture.root, "0.1.2");
    expect(updated).toEqual([fixture.rootManifest, fixture.pkgA, fixture.pkgB]);
    expect((await readJson(fixture.rootManifest)).version).toBe("0.1.2");
  });
});

describe("release.mjs — runRelease (no git side effects via injection)", () => {
  let fixture: Awaited<ReturnType<typeof createWorkspaceFixture>>;

  beforeEach(async () => {
    fixture = await createWorkspaceFixture("0.1.2");
  });

  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it("runs end-to-end with an injected git client and returns the resolved version + tag", async () => {
    const calls: Array<{ op: string; args: unknown }> = [];
    const logs: string[] = [];
    const git = {
      add: (paths: string[]) => calls.push({ op: "add", args: paths }),
      commit: (message: string) => calls.push({ op: "commit", args: message }),
      tag: (name: string) => calls.push({ op: "tag", args: name }),
    };
    const result = await runRelease({
      argv: ["patch", "--cwd", fixture.root],
      git,
      log: (line: string) => logs.push(line),
    });
    expect(result.newVersion).toBe("0.1.3");
    expect(result.tag).toBe("v0.1.3");
    expect(result.updated).toEqual([
      fixture.rootManifest,
      fixture.pkgA,
      fixture.pkgB,
    ]);
    expect(calls).toEqual([
      { op: "add", args: [fixture.rootManifest, fixture.pkgA, fixture.pkgB] },
      { op: "commit", args: "chore(release): v0.1.3" },
      { op: "tag", args: "v0.1.3" },
    ]);
    expect(logs.some((l) => l.includes("Released v0.1.3"))).toBe(true);
    expect(logs.some((l) => l.includes("git push origin v0.1.3"))).toBe(true);
  });

  it("honours an explicit version argument", async () => {
    const git = { add: () => {}, commit: () => {}, tag: () => {} };
    const result = await runRelease({
      argv: ["2.5.7", "--cwd", fixture.root],
      git,
      log: () => {},
    });
    expect(result.newVersion).toBe("2.5.7");
    expect(result.tag).toBe("v2.5.7");
  });

  it("uses the real git client when none is injected", async () => {
    // Initialize the fixture as a real git repo so defaultGit's commit/tag work.
    await exec("git", ["init", "-q", "-b", "main"], { cwd: fixture.root });
    await exec("git", ["config", "user.email", "release-unit@example.com"], {
      cwd: fixture.root,
    });
    await exec("git", ["config", "user.name", "Release Unit"], { cwd: fixture.root });
    await exec("git", ["config", "commit.gpgsign", "false"], { cwd: fixture.root });
    await exec("git", ["add", "."], { cwd: fixture.root });
    await exec("git", ["commit", "-q", "-m", "chore: bootstrap"], { cwd: fixture.root });

    const result = await runRelease({
      argv: ["minor", "--cwd", fixture.root],
      log: () => {},
    });
    expect(result.tag).toBe("v0.2.0");

    const { stdout: subject } = await exec(
      "git",
      ["log", "-1", "--pretty=%s"],
      { cwd: fixture.root },
    );
    expect(subject.trim()).toBe("chore(release): v0.2.0");

    const { stdout: tags } = await exec("git", ["tag", "--list"], {
      cwd: fixture.root,
    });
    expect(tags.split("\n").map((s) => s.trim())).toContain("v0.2.0");
  }, 20000);
});
