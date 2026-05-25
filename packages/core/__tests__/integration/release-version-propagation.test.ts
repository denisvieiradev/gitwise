import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { propagateVersionToWorkspaces } from "../../src/commands/release.js";
import { acquireRepoLock } from "../../src/infra/lockfile.js";
import { GitwiseError } from "../../src/errors.js";

async function seedRoot(repo: string): Promise<void> {
  await writeFile(
    join(repo, "package.json"),
    JSON.stringify(
      { name: "root", version: "1.0.0", workspaces: ["packages/*"] },
      null,
      2,
    ) + "\n",
  );
}

async function seedWorkspace(
  repo: string,
  name: string,
  version: string,
  extras: Record<string, unknown> = {},
): Promise<string> {
  const dir = join(repo, "packages", name);
  await mkdir(dir, { recursive: true });
  const path = join(dir, "package.json");
  await writeFile(
    path,
    JSON.stringify({ name, version, ...extras }, null, 2) + "\n",
  );
  return path;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

describe("propagateVersionToWorkspaces (integration)", () => {
  let repo: string;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "gitwise-prop-int-"));
    await seedRoot(repo);
  });

  afterEach(async () => {
    // chmod any read-only fixtures back so rm can succeed.
    try {
      await chmod(join(repo, "packages", "b", "package.json"), 0o644);
    } catch {}
    await rm(repo, { recursive: true, force: true });
  });

  it("3 fixture workspaces: write failure on the second reverts the first and never touches the third", async () => {
    const a = await seedWorkspace(repo, "a", "1.0.0");
    const b = await seedWorkspace(repo, "b", "1.0.0");
    const c = await seedWorkspace(repo, "c", "1.0.0");

    const priorA = await readFile(a, "utf-8");
    const priorB = await readFile(b, "utf-8");
    const priorC = await readFile(c, "utf-8");

    // Read-only on the second package's manifest forces a mid-loop write
    // failure exactly at the second iteration (ordering is deterministic
    // because propagateVersionToWorkspaces sorts workspace dirs).
    await chmod(b, 0o444);

    await expect(
      propagateVersionToWorkspaces(repo, "2.0.0"),
    ).rejects.toBeInstanceOf(GitwiseError);

    expect(await readFile(a, "utf-8")).toBe(priorA);
    expect(await readFile(b, "utf-8")).toBe(priorB);
    expect(await readFile(c, "utf-8")).toBe(priorC);
  });

  it("repo lock is held during the flow and released on success", async () => {
    await seedWorkspace(repo, "a", "1.0.0");
    const lockPath = join(repo, ".gitwise", ".lock");

    expect(await pathExists(lockPath)).toBe(false);
    await propagateVersionToWorkspaces(repo, "1.2.3");
    expect(await pathExists(lockPath)).toBe(false);

    // Sanity: a follow-up acquire must succeed (proves the lock is truly free).
    const release = await acquireRepoLock(repo, { command: "follow-up" });
    await release();
  });

  it("repo lock is released on failure", async () => {
    const a = await seedWorkspace(repo, "a", "1.0.0");
    const b = await seedWorkspace(repo, "b", "1.0.0");
    await chmod(b, 0o444);

    await expect(
      propagateVersionToWorkspaces(repo, "2.0.0"),
    ).rejects.toBeInstanceOf(GitwiseError);

    const lockPath = join(repo, ".gitwise", ".lock");
    expect(await pathExists(lockPath)).toBe(false);

    // Lock is genuinely free.
    const release = await acquireRepoLock(repo, { command: "follow-up" });
    await release();
    // Suppress unused-variable warning while keeping the file path live.
    void a;
  });

  it("rejects a concurrent invocation that races against an existing lock holder with REPO_LOCKED", async () => {
    await seedWorkspace(repo, "a", "1.0.0");

    const release = await acquireRepoLock(repo, { command: "holder" });
    try {
      await expect(
        propagateVersionToWorkspaces(repo, "1.2.3"),
      ).rejects.toMatchObject({ code: "REPO_LOCKED", exitCode: 80 });
    } finally {
      await release();
    }
  });
});
