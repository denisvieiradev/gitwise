import { readFile, open, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { fileExists, ensureDir } from "./filesystem.js";

const ENV_DIR = ".gitwise";
const ENV_FILE = ".env";

function getEnvPath(projectRoot: string): string {
  return join(projectRoot, ENV_DIR, ENV_FILE);
}

function parseLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const eq = trimmed.indexOf("=");
  if (eq < 1) return null;
  return [trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1).trim()];
}

export async function loadEnv(projectRoot: string): Promise<void> {
  const envPath = getEnvPath(projectRoot);
  if (!(await fileExists(envPath))) return;
  const content = await readFile(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    const [key, value] = parsed;
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export async function writeEnvVar(
  projectRoot: string,
  key: string,
  value: string,
): Promise<void> {
  const envPath = getEnvPath(projectRoot);
  await ensureDir(join(projectRoot, ENV_DIR));

  let lines: string[] = [];
  if (await fileExists(envPath)) {
    const content = await readFile(envPath, "utf-8");
    lines = content.split("\n");
  }

  const prefix = `${key}=`;
  const idx = lines.findIndex((l) => l.trim().startsWith(prefix));
  const entry = `${key}=${value}`;

  if (idx >= 0) {
    lines[idx] = entry;
  } else {
    if (lines.length === 1 && lines[0] === "") {
      lines[0] = entry;
    } else {
      lines.push(entry);
    }
  }

  const final = lines.join("\n").replace(/\n{3,}/g, "\n\n");
  const payload = final.endsWith("\n") ? final : final + "\n";

  const tmpPath = `${envPath}.${process.pid}.${Date.now()}.tmp`;
  const fd = await open(tmpPath, "w", 0o600);
  try {
    await fd.writeFile(payload, "utf-8");
  } finally {
    await fd.close();
  }
  try {
    await rename(tmpPath, envPath);
  } catch (err) {
    await unlink(tmpPath).catch(() => undefined);
    throw err;
  }
}

export async function readEnvVar(
  projectRoot: string,
  key: string,
): Promise<string | undefined> {
  const envPath = getEnvPath(projectRoot);
  if (!(await fileExists(envPath))) return undefined;
  const content = await readFile(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const parsed = parseLine(line);
    if (parsed && parsed[0] === key) return parsed[1];
  }
  return undefined;
}

/**
 * Read a key from process.env, with optional fallback to the project .env file.
 */
export async function read(
  key: string,
  projectRoot?: string,
): Promise<string | undefined> {
  if (process.env[key] !== undefined) {
    return process.env[key];
  }
  if (projectRoot) {
    return readEnvVar(projectRoot, key);
  }
  return undefined;
}
