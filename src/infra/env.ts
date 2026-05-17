import { readFile, writeFile, chmod } from "node:fs/promises";
import { join } from "node:path";
import { fileExists, ensureDir } from "./filesystem.js";

const ENV_DIR = ".devflow";
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
  await writeFile(envPath, final.endsWith("\n") ? final : final + "\n", "utf-8");
  await chmod(envPath, 0o600);
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
