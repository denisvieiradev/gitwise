import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  acquireRepoLock,
  type LockPayload,
} from "../../src/infra/lockfile.js";
import { GitwiseError } from "../../src/errors.js";

async function lockExists(repoPath: string): Promise<boolean> {
  try {
    await stat(join(repoPath, ".gitwise", ".lock"));
    return true;
  } catch {
    return false;
  }
}

describe("acquireRepoLock (integration with a real filesystem)", () => {
  let repoPath: string;

  beforeEach(async () => {
    repoPath = await mkdtemp(join(tmpdir(), "gitwise-lock-int-"));
  });

  afterEach(async () => {
    await rm(repoPath, { recursive: true, force: true });
  });

  it("rejects a second concurrent acquire with REPO_LOCKED", async () => {
    const release = await acquireRepoLock(repoPath, {
      command: "release prepare",
    });

    const results = await Promise.allSettled([
      acquireRepoLock(repoPath, {
        command: "release prepare",
        // Force the second caller to see the lock we just acquired as 'live'.
        isProcessAlive: () => true,
      }),
      acquireRepoLock(repoPath, {
        command: "commit",
        isProcessAlive: () => true,
      }),
    ]);

    for (const r of results) {
      expect(r.status).toBe("rejected");
      if (r.status === "rejected") {
        expect(r.reason).toBeInstanceOf(GitwiseError);
        expect((r.reason as GitwiseError).code).toBe("REPO_LOCKED");
        expect((r.reason as GitwiseError).exitCode).toBe(80);
      }
    }

    await release();
    expect(await lockExists(repoPath)).toBe(false);
  });

  it("reclaims a stale lock written by a dead process", async () => {
    const staleLock: LockPayload = {
      pid: 99999,
      host: "ghost-host",
      command: "release prepare",
      acquiredAt: new Date("2026-05-21T08:00:00.000Z").toISOString(),
    };
    await mkdir(join(repoPath, ".gitwise"), { recursive: true });
    await writeFile(
      join(repoPath, ".gitwise", ".lock"),
      JSON.stringify(staleLock, null, 2) + "\n",
      "utf-8",
    );

    const release = await acquireRepoLock(repoPath, {
      command: "release prepare",
      isProcessAlive: () => false,
    });

    const payload = JSON.parse(
      await readFile(join(repoPath, ".gitwise", ".lock"), "utf-8"),
    ) as LockPayload;
    expect(payload.pid).toBe(process.pid);
    expect(payload.command).toBe("release prepare");

    await release();
    expect(await lockExists(repoPath)).toBe(false);
  });

  it("releases the lock after the holder completes a normal flow", async () => {
    const release = await acquireRepoLock(repoPath, { command: "commit" });
    expect(await lockExists(repoPath)).toBe(true);
    await release();
    expect(await lockExists(repoPath)).toBe(false);

    // Second acquire should now succeed and the new payload should be visible.
    const release2 = await acquireRepoLock(repoPath, { command: "commit" });
    const payload = JSON.parse(
      await readFile(join(repoPath, ".gitwise", ".lock"), "utf-8"),
    ) as LockPayload;
    expect(payload.command).toBe("commit");
    await release2();
  });
});
