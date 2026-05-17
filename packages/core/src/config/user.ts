import { join } from "node:path";
import os from "node:os";
import { fileExists, readJSON, writeJSON } from "../infra/filesystem.js";
import { debug } from "../infra/logger.js";
import { writeEnvVar } from "../infra/env.js";
import { DEFAULT_USER_CONFIG, type UserConfig } from "./types.js";

const GITWISE_DIR = ".gitwise";
const USER_CONFIG_FILE = "config.json";

function getUserConfigPath(homeDir?: string): string {
  return join(homeDir ?? os.homedir(), GITWISE_DIR, USER_CONFIG_FILE);
}

export function mergeWithDefaults(partial: Partial<UserConfig>): UserConfig {
  return {
    ...DEFAULT_USER_CONFIG,
    ...partial,
    models: {
      ...DEFAULT_USER_CONFIG.models,
      ...(partial.models ?? {}),
    },
  };
}

export async function readUserConfig(homeDir?: string): Promise<UserConfig> {
  const configPath = getUserConfigPath(homeDir);
  if (!(await fileExists(configPath))) {
    debug("User config not found, using defaults", { path: configPath });
    return { ...DEFAULT_USER_CONFIG };
  }
  const raw = await readJSON<Partial<UserConfig>>(configPath);
  return mergeWithDefaults(raw);
}

export async function writeUserConfig(
  partial: Partial<UserConfig>,
  homeDir?: string,
): Promise<void> {
  const configPath = getUserConfigPath(homeDir);
  const existing = await readUserConfig(homeDir);
  const updated = mergeWithDefaults({ ...existing, ...partial });
  debug("Writing user config", { path: configPath });
  await writeJSON(configPath, updated);
}

/**
 * Write ANTHROPIC_API_KEY to ~/.gitwise/.env with file mode 0600.
 * Keys MUST NOT be written to config.json.
 *
 * Note: writeEnvVar(root, key, val) writes to root/.gitwise/.env.
 * We pass homeDir (default: os.homedir()) so the file lands at ~/.gitwise/.env.
 */
export async function writeApiKey(value: string, homeDir?: string): Promise<void> {
  const home = homeDir ?? os.homedir();
  await writeEnvVar(home, "ANTHROPIC_API_KEY", value);
}
