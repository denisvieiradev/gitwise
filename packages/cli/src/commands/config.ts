import { Command } from "commander";
import { getMergedConfig, writeUserConfig } from "@denisvieiradev/gitwise-core";
import os from "node:os";

// Supported dot-notation config keys
const VALID_KEYS = [
  "provider",
  "claudeCliPath",
  "language",
  "defaultBaseBranch",
  "commitConvention",
  "models.fast",
  "models.balanced",
  "models.powerful",
] as const;

type ValidKey = typeof VALID_KEYS[number];

function isValidKey(key: string): key is ValidKey {
  return VALID_KEYS.includes(key as ValidKey);
}

function getNestedValue(obj: Record<string, unknown>, key: string): unknown {
  const parts = key.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function setNestedValue(obj: Record<string, unknown>, key: string, value: string): void {
  const parts = key.split(".");
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (typeof current[part] !== "object" || current[part] === null) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]!] = value;
}

export function makeConfigCommand(): Command {
  return new Command("config")
    .description("Get or set gitwise configuration")
    .argument("<key>", "Config key (e.g., provider, models.balanced, language)")
    .argument("[value]", "Value to set (omit to read current value)")
    .action(async (key: string, value?: string) => {
      if (!isValidKey(key)) {
        console.error(`Error: Unknown config key '${key}'.`);
        console.error(`Valid keys: ${VALID_KEYS.join(", ")}`);
        process.exit(1);
      }

      const homeDir = os.homedir();
      const config = await getMergedConfig({ cwd: process.cwd(), homeDir }) as unknown as Record<string, unknown>;

      if (value === undefined) {
        // Read mode
        const current = getNestedValue(config, key);
        console.log(current !== undefined ? String(current) : "(not set)");
        return;
      }

      // Write mode
      const update: Record<string, unknown> = {};
      setNestedValue(update, key, value);

      // Handle nested models key specially
      if (key.startsWith("models.")) {
        const tier = key.split(".")[1] as "fast" | "balanced" | "powerful";
        const currentModels = (config["models"] as Record<string, string>) ?? {};
        await writeUserConfig({ models: { fast: currentModels["fast"] ?? "", balanced: currentModels["balanced"] ?? "", powerful: currentModels["powerful"] ?? "", [tier]: value } }, homeDir);
      } else {
        await writeUserConfig(update as Parameters<typeof writeUserConfig>[0], homeDir);
      }

      console.log(`Set ${key} = ${value}`);
    });
}
