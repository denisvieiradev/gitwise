import { join } from "node:path";
import { fileExists, readJSON, writeJSON } from "../infra/filesystem.js";
import { debug } from "../infra/logger.js";
import { DEFAULT_CONFIG, type DevflowConfig } from "./types.js";

const CONFIG_DIR = ".devflow";
const CONFIG_FILE = "config.json";

function getConfigPath(projectRoot: string): string {
  return join(projectRoot, CONFIG_DIR, CONFIG_FILE);
}

export function mergeWithDefaults(
  partial: Partial<DevflowConfig>,
): DevflowConfig {
  return {
    ...DEFAULT_CONFIG,
    ...partial,
    models: {
      ...DEFAULT_CONFIG.models,
      ...partial.models,
    },
    project: {
      ...DEFAULT_CONFIG.project,
      ...partial.project,
    },
  };
}

export function validateConfig(config: DevflowConfig): string[] {
  const errors: string[] = [];
  if (!config.provider) {
    errors.push("provider is required");
  }
  if (!config.models?.fast || !config.models?.balanced || !config.models?.powerful) {
    errors.push("all model tiers (fast, balanced, powerful) are required");
  }
  if (!["light", "normal"].includes(config.contextMode)) {
    errors.push("contextMode must be 'light' or 'normal'");
  }
  return errors;
}

export async function readConfig(
  projectRoot: string,
): Promise<DevflowConfig | null> {
  const configPath = getConfigPath(projectRoot);
  if (!(await fileExists(configPath))) {
    debug("Config file not found", { path: configPath });
    return null;
  }
  const raw = await readJSON<Partial<DevflowConfig>>(configPath);
  return mergeWithDefaults(raw);
}

export async function writeConfig(
  projectRoot: string,
  config: DevflowConfig,
): Promise<void> {
  const configPath = getConfigPath(projectRoot);
  debug("Writing config", { path: configPath });
  await writeJSON(configPath, config);
}
