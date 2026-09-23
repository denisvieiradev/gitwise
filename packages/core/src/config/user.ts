import { join } from "node:path";
import os from "node:os";
import { fileExists, readJSON, writeJSON } from "../infra/filesystem.js";
import { debug } from "../infra/logger.js";
import { writeEnvVar } from "../infra/env.js";
import { DEFAULT_USER_CONFIG, type ModelConfig, type ModelsByProvider, type UserConfig } from "./types.js";
import { PROVIDER_KINDS, type ProviderKind } from "../providers/types.js";

const GITWISE_DIR = ".gitwise";
const USER_CONFIG_FILE = "config.json";

function getUserConfigPath(homeDir?: string): string {
  return join(homeDir ?? os.homedir(), GITWISE_DIR, USER_CONFIG_FILE);
}

/**
 * MDL-05: detects the pre-this-feature flat `models` shape
 * (`{fast, balanced, powerful}`), as opposed to the current per-provider map
 * (`{api: {...}, "claude-code": {...}, ...}`) — distinguished by whether
 * `.fast` itself is a string (legacy) or an object (current).
 */
function isLegacyFlatModels(value: unknown): value is ModelConfig {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v["fast"] === "string" && typeof v["balanced"] === "string" && typeof v["powerful"] === "string";
}

/**
 * MDL-05 / Edge Cases: migrates a legacy flat `models` block into
 * `models[<configured provider>]`, backfilling every other provider key from
 * defaults. When `provider` is itself unrecognized, every key — including
 * the one the flat block might have belonged to — is backfilled from
 * defaults instead of guessing which provider it was meant for.
 */
function migrateFlatModels(flat: ModelConfig, provider: unknown): ModelsByProvider {
  const migrated: ModelsByProvider = { ...DEFAULT_USER_CONFIG.models };
  if (typeof provider === "string" && PROVIDER_KINDS.includes(provider as ProviderKind)) {
    migrated[provider as ProviderKind] = { ...flat };
  }
  return migrated;
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

  if (isLegacyFlatModels(raw.models)) {
    const migratedModels = migrateFlatModels(raw.models, raw.provider);
    const merged = mergeWithDefaults({ ...raw, models: migratedModels });
    debug("Migrated legacy flat models config to per-provider shape", { path: configPath });
    await writeJSON(configPath, merged);
    return merged;
  }

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
