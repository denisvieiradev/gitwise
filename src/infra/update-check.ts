import { homedir } from "node:os";
import { join } from "node:path";
import chalk from "chalk";
import { fileExists, readJSON, writeJSON } from "./filesystem.js";

const CACHE_PATH = join(homedir(), ".devflow", "update-check.json");
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const REGISTRY_URL = "https://registry.npmjs.org/devflow-cli/latest";
const FETCH_TIMEOUT_MS = 3000;

interface UpdateCheckCache {
  lastCheck: number;
  latestVersion: string;
}

interface UpdateResult {
  latest: string;
  current: string;
}

function isNewerVersion(latest: string, current: string): boolean {
  const latestParts = latest.split(".").map(Number);
  const currentParts = current.split(".").map(Number);

  for (let i = 0; i < 3; i++) {
    const l = latestParts[i] ?? 0;
    const c = currentParts[i] ?? 0;
    if (l !== c) return l > c;
  }
  return false;
}

export async function startUpdateCheck(
  currentVersion: string,
): Promise<UpdateResult | null> {
  try {
    if (process.env.CI || process.env.NO_UPDATE_NOTIFIER) {
      return null;
    }

    let latestVersion: string | undefined;

    if (await fileExists(CACHE_PATH)) {
      const cache = await readJSON<UpdateCheckCache>(CACHE_PATH);
      if (Date.now() - cache.lastCheck < CHECK_INTERVAL_MS) {
        latestVersion = cache.latestVersion;
      }
    }

    if (!latestVersion) {
      const response = await fetch(REGISTRY_URL, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const data = (await response.json()) as { version?: string };
      latestVersion = data.version;

      if (typeof latestVersion === "string") {
        writeJSON<UpdateCheckCache>(CACHE_PATH, {
          lastCheck: Date.now(),
          latestVersion,
        }).catch(() => {});
      }
    }

    if (
      typeof latestVersion === "string" &&
      isNewerVersion(latestVersion, currentVersion)
    ) {
      return { latest: latestVersion, current: currentVersion };
    }

    return null;
  } catch {
    return null;
  }
}

export function formatUpdateNotification(
  current: string,
  latest: string,
): string {
  const message = `Update available! ${chalk.dim(current)} → ${chalk.green(latest)}`;
  const command = `Run: ${chalk.cyan("npm install -g devflow-cli")} to upgrade`;

  const maxLen = Math.max(stripAnsi(message).length, stripAnsi(command).length);
  const pad = (text: string) =>
    text + " ".repeat(maxLen - stripAnsi(text).length);

  const border = chalk.yellow("│");
  const top = chalk.yellow(`╭${"─".repeat(maxLen + 6)}╮`);
  const bottom = chalk.yellow(`╰${"─".repeat(maxLen + 6)}╯`);
  const empty = `${border}${" ".repeat(maxLen + 6)}${border}`;

  return [
    "",
    top,
    empty,
    `${border}   ${pad(message)}   ${border}`,
    `${border}   ${pad(command)}   ${border}`,
    empty,
    bottom,
    "",
  ].join("\n");
}

function stripAnsi(text: string): string {
  return text.replace(
    // eslint-disable-next-line no-control-regex
    /\u001b\[[0-9;]*m/g,
    "",
  );
}
