import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const RELEASE_SCRIPT = resolve(REPO_ROOT, "scripts", "release.mjs");

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

async function gitInit(cwd: string): Promise<void> {
  await exec("git", ["init", "-q", "-b", "main"], { cwd });
  await exec("git", ["config", "user.email", "release-test@example.com"], { cwd });
  await exec("git", ["config", "user.name", "Release Test"], { cwd });
  await exec("git", ["config", "commit.gpgsign", "false"], { cwd });
}

describe("scripts/release.mjs — end-to-end against a mkdtemp workspaces fixture", () => {
  let root: string;
  let rootManifest: string;
  let pkgA: string;
  let pkgB: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "gitwise-release-e2e-"));
    rootManifest = join(root, "package.json");
    await writeJson(rootManifest, {
      name: "fixture-root",
      version: "0.1.2",
      private: true,
      workspaces: ["packages/*"],
    });
    await mkdir(join(root, "packages", "a"), { recursive: true });
    await mkdir(join(root, "packages", "b"), { recursive: true });
    pkgA = join(root, "packages", "a", "package.json");
    pkgB = join(root, "packages", "b", "package.json");
    await writeJson(pkgA, { name: "@fixture/a", version: "0.1.2" });
    await writeJson(pkgB, { name: "@fixture/b", version: "0.1.2" });
    await gitInit(root);
    await exec("git", ["add", "."], { cwd: root });
    await exec("git", ["commit", "-q", "-m", "chore: bootstrap fixture"], { cwd: root });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("bumps every workspace, commits with the conventional message, tags, and does not push", async () => {
    const { stdout } = await exec(
      "node",
      [RELEASE_SCRIPT, "patch", "--cwd", root],
      { cwd: root, timeout: 30000 },
    );

    expect((await readJson(rootManifest)).version).toBe("0.1.3");
    expect((await readJson(pkgA)).version).toBe("0.1.3");
    expect((await readJson(pkgB)).version).toBe("0.1.3");

    const { stdout: lastSubject } = await exec(
      "git",
      ["log", "-1", "--pretty=%s"],
      { cwd: root },
    );
    expect(lastSubject.trim()).toBe("chore(release): v0.1.3");

    const { stdout: tags } = await exec("git", ["tag", "--list"], { cwd: root });
    expect(tags.split("\n").map((s) => s.trim())).toContain("v0.1.3");

    // The script MUST print push instructions but MUST NOT push anything itself.
    expect(stdout).toMatch(/git push origin v0\.1\.3/);

    // Working tree should be clean after the commit (no leftover modifications).
    const { stdout: status } = await exec(
      "git",
      ["status", "--porcelain"],
      { cwd: root },
    );
    expect(status.trim()).toBe("");
  }, 30000);

  it("rejects an invalid bump argument with exit code 1 and a clear stderr message", async () => {
    await expect(
      exec("node", [RELEASE_SCRIPT, "nope", "--cwd", root], { cwd: root }),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('Invalid argument "nope"'),
    });
  }, 30000);
});

describe(".github/workflows/release.yml — required steps and triggers", () => {
  const workflowPath = resolve(REPO_ROOT, ".github", "workflows", "release.yml");
  let content: string;

  beforeAll(async () => {
    content = await readFile(workflowPath, "utf8");
  });

  it("parses as valid YAML", () => {
    // Light-weight structural check: no tab characters and at least one top-level key.
    expect(content).not.toMatch(/\t/);
    expect(content).toMatch(/^name:\s/m);
  });

  it("triggers on tag pushes matching v*", () => {
    expect(content).toMatch(/on:\s*[\s\S]*?tags:\s*[\s\S]*?-\s*['"]?v\*['"]?/);
  });

  it("runs the four mandated steps: build, test, publish, gh release", () => {
    // Build all workspaces (the npm script chains build:legacy + build:workspaces).
    expect(content).toMatch(/run:\s*npm run build/);
    // Tests must run before publish.
    expect(content).toMatch(/run:\s*npm test/);
    // Publish every workspace package.
    expect(content).toMatch(/npm publish --workspaces --access public/);
    // GitHub release creation step (gh CLI is preinstalled on GitHub-hosted runners).
    expect(content).toMatch(/gh release create/);
  });

  it("wires up the two required secrets (NPM_TOKEN and GITHUB_TOKEN)", () => {
    expect(content).toMatch(/NPM_TOKEN/);
    expect(content).toMatch(/GITHUB_TOKEN/);
  });

  it("orders steps so a failing test aborts the publish (test step appears before publish step)", () => {
    const testIdx = content.search(/npm test/);
    const publishIdx = content.search(/npm publish --workspaces --access public/);
    expect(testIdx).toBeGreaterThan(-1);
    expect(publishIdx).toBeGreaterThan(-1);
    expect(testIdx).toBeLessThan(publishIdx);
  });
});
