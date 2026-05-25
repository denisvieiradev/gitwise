import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";
import { GitwiseError } from "../errors.js";

export const STALE_LOCK_MS = 10 * 60 * 1000;

export interface LockPayload {
  pid: number;
  host: string;
  command: string;
  acquiredAt: string;
}

export interface AcquireRepoLockOptions {
  command?: string;
  staleMs?: number;
  isProcessAlive?: (pid: number) => boolean;
  now?: () => Date;
}

export async function acquireRepoLock(
  repoPath: string,
  options: AcquireRepoLockOptions = {},
): Promise<() => Promise<void>> {
  const command = options.command ?? "unknown";
  const staleMs = options.staleMs ?? STALE_LOCK_MS;
  const isAlive = options.isProcessAlive ?? defaultIsProcessAlive;
  const now = options.now ?? (() => new Date());

  const dir = path.join(repoPath, ".gitwise");
  const lockPath = path.join(dir, ".lock");
  await mkdir(dir, { recursive: true });

  const payload: LockPayload = {
    pid: process.pid,
    host: hostname(),
    command,
    acquiredAt: now().toISOString(),
  };

  await tryAcquire(lockPath, payload, staleMs, isAlive, now, 0);

  let released = false;
  return async () => {
    if (released) return;
    released = true;
    try {
      await unlink(lockPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  };
}

async function tryAcquire(
  lockPath: string,
  payload: LockPayload,
  staleMs: number,
  isAlive: (pid: number) => boolean,
  now: () => Date,
  attempt: number,
): Promise<void> {
  try {
    const handle = await open(lockPath, "wx");
    try {
      await handle.writeFile(JSON.stringify(payload, null, 2) + "\n", "utf-8");
    } finally {
      await handle.close();
    }
    return;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
  }

  if (attempt >= 1) {
    throw new GitwiseError({
      code: "REPO_LOCKED",
      message: "Another gitwise process holds the lock on this repository",
      details: { lockPath },
    });
  }

  const existing = await readExisting(lockPath);
  if (existing && !isStale(existing, staleMs, isAlive, now)) {
    throw new GitwiseError({
      code: "REPO_LOCKED",
      message: `gitwise lock held by pid ${existing.pid} (command: ${existing.command}) since ${existing.acquiredAt}`,
      details: { existing, lockPath },
    });
  }

  try {
    await unlink(lockPath);
  } catch (unlinkErr) {
    if ((unlinkErr as NodeJS.ErrnoException).code !== "ENOENT") throw unlinkErr;
  }
  return tryAcquire(lockPath, payload, staleMs, isAlive, now, attempt + 1);
}

async function readExisting(lockPath: string): Promise<LockPayload | null> {
  try {
    const content = await readFile(lockPath, "utf-8");
    const parsed = JSON.parse(content) as Partial<LockPayload>;
    if (
      typeof parsed.pid !== "number" ||
      typeof parsed.host !== "string" ||
      typeof parsed.command !== "string" ||
      typeof parsed.acquiredAt !== "string"
    ) {
      return null;
    }
    return {
      pid: parsed.pid,
      host: parsed.host,
      command: parsed.command,
      acquiredAt: parsed.acquiredAt,
    };
  } catch {
    return null;
  }
}

function isStale(
  existing: LockPayload,
  staleMs: number,
  isAlive: (pid: number) => boolean,
  now: () => Date,
): boolean {
  if (!isAlive(existing.pid)) return true;
  const acquiredAt = Date.parse(existing.acquiredAt);
  if (Number.isNaN(acquiredAt)) return true;
  const age = now().getTime() - acquiredAt;
  return age > staleMs;
}

function defaultIsProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return false;
    if (code === "EPERM") return true;
    return false;
  }
}
