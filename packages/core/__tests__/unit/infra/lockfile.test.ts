import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from "node:fs/promises";
import { tmpdir, hostname } from "node:os";
import { join } from "node:path";
import {
  acquireRepoLock,
  STALE_LOCK_MS,
  type LockPayload,
} from "../../../src/infra/lockfile.js";
import { GitwiseError } from "../../../src/errors.js";

async function readLock(repoPath: string): Promise<LockPayload> {
  const raw = await readFile(join(repoPath, ".gitwise", ".lock"), "utf-8");
  return JSON.parse(raw) as LockPayload;
}

async function lockExists(repoPath: string): Promise<boolean> {
  try {
    await stat(join(repoPath, ".gitwise", ".lock"));
    return true;
  } catch {
    return false;
  }
}

async function writeLockManually(
  repoPath: string,
  payload: LockPayload,
): Promise<void> {
  await mkdir(join(repoPath, ".gitwise"), { recursive: true });
  await writeFile(
    join(repoPath, ".gitwise", ".lock"),
    JSON.stringify(payload, null, 2) + "\n",
    "utf-8",
  );
}

describe("acquireRepoLock", () => {
  let repoPath: string;

  beforeEach(async () => {
    repoPath = await mkdtemp(join(tmpdir(), "gitwise-lock-"));
  });

  afterEach(async () => {
    await rm(repoPath, { recursive: true, force: true });
  });

  it("writes pid/host/command/acquiredAt to .gitwise/.lock", async () => {
    const fixedNow = new Date("2026-05-21T10:00:00.000Z");
    const release = await acquireRepoLock(repoPath, {
      command: "release prepare",
      now: () => fixedNow,
    });
    const payload = await readLock(repoPath);
    expect(payload.pid).toBe(process.pid);
    expect(payload.host).toBe(hostname());
    expect(payload.command).toBe("release prepare");
    expect(payload.acquiredAt).toBe(fixedNow.toISOString());
    await release();
  });

  it("uses 'unknown' as the default command when none is provided", async () => {
    const release = await acquireRepoLock(repoPath);
    const payload = await readLock(repoPath);
    expect(payload.command).toBe("unknown");
    await release();
  });

  it("creates the .gitwise directory if it does not exist", async () => {
    const release = await acquireRepoLock(repoPath);
    expect(await lockExists(repoPath)).toBe(true);
    await release();
  });

  it("throws REPO_LOCKED when a live lock is held by another process", async () => {
    await writeLockManually(repoPath, {
      pid: 99999,
      host: "other-host",
      command: "release prepare",
      acquiredAt: new Date().toISOString(),
    });

    await expect(
      acquireRepoLock(repoPath, {
        command: "commit",
        isProcessAlive: () => true,
      }),
    ).rejects.toMatchObject({
      code: "REPO_LOCKED",
    });
  });

  it("reclaims a lock whose pid is no longer alive", async () => {
    await writeLockManually(repoPath, {
      pid: 99999,
      host: "other-host",
      command: "release prepare",
      acquiredAt: new Date().toISOString(),
    });

    const release = await acquireRepoLock(repoPath, {
      command: "commit",
      isProcessAlive: () => false,
    });
    const payload = await readLock(repoPath);
    expect(payload.pid).toBe(process.pid);
    expect(payload.command).toBe("commit");
    await release();
  });

  it("reclaims a lock older than the configured staleness window even if PID is alive", async () => {
    const acquiredAt = new Date("2026-05-21T09:00:00.000Z");
    await writeLockManually(repoPath, {
      pid: 99999,
      host: "other-host",
      command: "release prepare",
      acquiredAt: acquiredAt.toISOString(),
    });

    const release = await acquireRepoLock(repoPath, {
      command: "commit",
      isProcessAlive: () => true,
      now: () => new Date("2026-05-21T09:11:00.000Z"),
      staleMs: 10 * 60 * 1000,
    });
    const payload = await readLock(repoPath);
    expect(payload.pid).toBe(process.pid);
    await release();
  });

  it("does NOT reclaim a fresh lock with a live pid", async () => {
    const acquiredAt = new Date("2026-05-21T09:09:00.000Z");
    await writeLockManually(repoPath, {
      pid: 99999,
      host: "other-host",
      command: "release prepare",
      acquiredAt: acquiredAt.toISOString(),
    });

    await expect(
      acquireRepoLock(repoPath, {
        command: "commit",
        isProcessAlive: () => true,
        now: () => new Date("2026-05-21T09:10:00.000Z"),
        staleMs: 10 * 60 * 1000,
      }),
    ).rejects.toMatchObject({ code: "REPO_LOCKED" });
  });

  it("REPO_LOCKED error uses exit code 80", async () => {
    await writeLockManually(repoPath, {
      pid: 99999,
      host: "other-host",
      command: "release prepare",
      acquiredAt: new Date().toISOString(),
    });

    try {
      await acquireRepoLock(repoPath, { isProcessAlive: () => true });
      throw new Error("expected REPO_LOCKED");
    } catch (err) {
      expect(err).toBeInstanceOf(GitwiseError);
      expect((err as GitwiseError).code).toBe("REPO_LOCKED");
      expect((err as GitwiseError).exitCode).toBe(80);
    }
  });

  it("release closure removes the lockfile on success", async () => {
    const release = await acquireRepoLock(repoPath);
    expect(await lockExists(repoPath)).toBe(true);
    await release();
    expect(await lockExists(repoPath)).toBe(false);
  });

  it("release closure is idempotent", async () => {
    const release = await acquireRepoLock(repoPath);
    await release();
    await expect(release()).resolves.toBeUndefined();
    expect(await lockExists(repoPath)).toBe(false);
  });

  it("release closure tolerates an externally-removed lockfile", async () => {
    const release = await acquireRepoLock(repoPath);
    await rm(join(repoPath, ".gitwise", ".lock"), { force: true });
    await expect(release()).resolves.toBeUndefined();
  });

  it("release runs cleanup even when the calling flow throws", async () => {
    const release = await acquireRepoLock(repoPath);
    try {
      throw new Error("flow blew up");
    } catch {
      await release();
    }
    expect(await lockExists(repoPath)).toBe(false);
  });

  it("treats a malformed existing lockfile as stale and reclaims it", async () => {
    await mkdir(join(repoPath, ".gitwise"), { recursive: true });
    await writeFile(join(repoPath, ".gitwise", ".lock"), "not json", "utf-8");

    const release = await acquireRepoLock(repoPath, {
      command: "commit",
      isProcessAlive: () => true,
    });
    const payload = await readLock(repoPath);
    expect(payload.pid).toBe(process.pid);
    await release();
  });

  it("exposes STALE_LOCK_MS as 10 minutes by default", () => {
    expect(STALE_LOCK_MS).toBe(10 * 60 * 1000);
  });

  it("treats a JSON object missing required fields as stale", async () => {
    await mkdir(join(repoPath, ".gitwise"), { recursive: true });
    await writeFile(
      join(repoPath, ".gitwise", ".lock"),
      JSON.stringify({ pid: 99999, host: "x" }) + "\n",
      "utf-8",
    );

    const release = await acquireRepoLock(repoPath, {
      command: "commit",
      isProcessAlive: () => true,
    });
    const payload = await readLock(repoPath);
    expect(payload.pid).toBe(process.pid);
    await release();
  });

  it("treats an unparseable acquiredAt timestamp as stale", async () => {
    await writeLockManually(repoPath, {
      pid: 99999,
      host: "x",
      command: "commit",
      acquiredAt: "not-a-date",
    });
    const release = await acquireRepoLock(repoPath, {
      command: "commit",
      isProcessAlive: () => true,
    });
    const payload = await readLock(repoPath);
    expect(payload.pid).toBe(process.pid);
    await release();
  });

  it("default PID-liveness check returns false for a clearly dead PID", async () => {
    // A pid of 1 is alive (init), so we use a synthesized large pid to hit ESRCH.
    // Some OSes don't recycle pids below ~1, so use 999999 — likely non-existent.
    await writeLockManually(repoPath, {
      pid: 999999,
      host: "ghost",
      command: "commit",
      acquiredAt: new Date().toISOString(),
    });
    // Use default isProcessAlive — should detect dead pid and reclaim.
    const release = await acquireRepoLock(repoPath, { command: "commit" });
    const payload = await readLock(repoPath);
    expect(payload.pid).toBe(process.pid);
    await release();
  });

  it("default PID-liveness check treats invalid pids as dead", async () => {
    await writeLockManually(repoPath, {
      pid: -1,
      host: "ghost",
      command: "commit",
      acquiredAt: new Date().toISOString(),
    });
    const release = await acquireRepoLock(repoPath, { command: "commit" });
    const payload = await readLock(repoPath);
    expect(payload.pid).toBe(process.pid);
    await release();
  });

  it("tolerates an ENOENT during stale-lock unlink (race with another reclaimer)", async () => {
    await writeLockManually(repoPath, {
      pid: 99999,
      host: "x",
      command: "commit",
      acquiredAt: new Date().toISOString(),
    });
    const fs = await import("node:fs");
    let raced = false;
    const release = await acquireRepoLock(repoPath, {
      command: "commit",
      isProcessAlive: () => {
        if (!raced) {
          raced = true;
          try {
            fs.unlinkSync(join(repoPath, ".gitwise", ".lock"));
          } catch {
            /* ignore */
          }
        }
        return false;
      },
    });
    const payload = await readLock(repoPath);
    expect(payload.pid).toBe(process.pid);
    await release();
  });

  it("fails fast with REPO_LOCKED when a fresh lock re-appears between reclaim and re-acquire", async () => {
    await writeLockManually(repoPath, {
      pid: 99999,
      host: "old",
      command: "old",
      acquiredAt: new Date("2026-05-21T08:00:00.000Z").toISOString(),
    });

    const fs = await import("node:fs");
    await expect(
      acquireRepoLock(repoPath, {
        command: "commit",
        // The stale lock's pid is treated as dead, so it gets reclaimed.
        isProcessAlive: () => false,
        // Deterministic race: right after the stale lock is unlinked and
        // before re-acquire, another process grabs the lock. The re-open with
        // `wx` then hits EEXIST on attempt >= 1 → REPO_LOCKED.
        onReclaim: () => {
          fs.writeFileSync(
            join(repoPath, ".gitwise", ".lock"),
            JSON.stringify({
              pid: 88888,
              host: "racer",
              command: "racer",
              acquiredAt: new Date().toISOString(),
            }),
            "utf-8",
          );
        },
      }),
    ).rejects.toMatchObject({ code: "REPO_LOCKED" });
  });
});
