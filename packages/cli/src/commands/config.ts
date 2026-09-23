import { Command } from "commander";
import { getMergedConfig, readUserConfig, writeUserConfig, PROVIDER_KINDS } from "@denisvieiradev/gitwise-core";
import type { ProviderKind } from "@denisvieiradev/gitwise-core";
import os from "node:os";

// CFG-03 / MDL-07: parses `provider` and `models.<tier>` /
// `models.<provider>.<tier>` dot-paths below. PROVIDER_KINDS is imported from
// core (the single source of truth for the five supported provider values —
// never redefine it here or it can drift from the real ProviderKind union).
type ProviderKindValue = ProviderKind;

function isProviderKind(value: string): value is ProviderKindValue {
  return (PROVIDER_KINDS as readonly string[]).includes(value);
}

const MODEL_TIERS = ["fast", "balanced", "powerful"] as const;
type ModelTierValue = (typeof MODEL_TIERS)[number];

function isModelTier(value: string): value is ModelTierValue {
  return (MODEL_TIERS as readonly string[]).includes(value);
}

// Supported dot-notation config keys that don't involve `models.*` (those are
// validated dynamically below, since `models.<tier>` and
// `models.<provider>.<tier>` both need to be accepted).
const STATIC_VALID_KEYS = [
  "provider",
  "claudeCliPath",
  "codexCliPath",
  "copilotCliPath",
  "kiroCliPath",
  "language",
  "defaultBaseBranch",
  "commitConvention",
] as const;

type ModelsKeyKind = { kind: "tier"; tier: ModelTierValue } | { kind: "provider-tier"; provider: ProviderKindValue; tier: ModelTierValue };

/**
 * Parses a `models.*` dot-path into either the active-provider shorthand
 * (`models.<tier>`) or the explicit-provider form (`models.<provider>.<tier>`).
 * Returns null for anything else (including malformed `models.*` paths).
 */
function parseModelsKey(key: string): ModelsKeyKind | null {
  const parts = key.split(".");
  if (parts[0] !== "models") return null;
  if (parts.length === 2 && isModelTier(parts[1]!)) {
    return { kind: "tier", tier: parts[1] as ModelTierValue };
  }
  if (parts.length === 3 && isProviderKind(parts[1]!) && isModelTier(parts[2]!)) {
    return { kind: "provider-tier", provider: parts[1] as ProviderKindValue, tier: parts[2] as ModelTierValue };
  }
  return null;
}

function isValidKey(key: string): boolean {
  if ((STATIC_VALID_KEYS as readonly string[]).includes(key)) return true;
  return parseModelsKey(key) !== null;
}

function getNestedValue(obj: Record<string, unknown>, key: string): unknown {
  const parsedModelsKey = parseModelsKey(key);
  if (parsedModelsKey) {
    const modelsMap = obj["models"] as Record<string, Record<string, string>> | undefined;
    const provider = parsedModelsKey.kind === "tier" ? (obj["provider"] as string) : parsedModelsKey.provider;
    return modelsMap?.[provider]?.[parsedModelsKey.tier];
  }
  const parts = key.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function makeConfigCommand(): Command {
  return new Command("config")
    .description("Get or set gitwise configuration")
    .argument("<key>", "Config key (e.g., provider, models.balanced, models.codex.fast, language)")
    .argument("[value]", "Value to set (omit to read current value)")
    .action(async (key: string, value?: string) => {
      if (!isValidKey(key)) {
        console.error(`Error: Unknown config key '${key}'.`);
        console.error(`Valid keys: ${STATIC_VALID_KEYS.join(", ")}, models.<tier>, models.<provider>.<tier>`);
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

      // CFG-03: reject an unrecognized `provider` value before any write,
      // listing the valid choices instead of silently persisting bad state.
      if (key === "provider" && !isProviderKind(value)) {
        console.error(`Error: Unknown provider '${value}'.`);
        console.error(`Valid providers: ${PROVIDER_KINDS.join(", ")}`);
        process.exit(1);
      }

      const parsedModelsKey = parseModelsKey(key);
      if (parsedModelsKey) {
        // MDL-07: `models.<tier>` writes to the currently active provider's
        // block; `models.<provider>.<tier>` writes to that specific
        // provider's block regardless of which provider is currently active.
        //
        // Deliberately re-reads the RAW user config here (not the `config`
        // merged-with-repo-overrides view read above) — using the merged view
        // as the base would bake any active `<repo>/.gitwise.json` models
        // override permanently into ~/.gitwise/config.json, silently leaking
        // a repo-scoped override into every other project.
        const userConfig = await readUserConfig(homeDir);
        const targetProvider = parsedModelsKey.kind === "tier" ? userConfig.provider : parsedModelsKey.provider;
        if (!isProviderKind(targetProvider)) {
          // A hand-edited/corrupted config.json can hold a `provider` value
          // outside the known set; refuse to silently add a stray key to the
          // persisted models map instead of erroring like `gw config provider
          // <bogus>` does.
          console.error(`Error: Current provider '${String(targetProvider)}' is not a recognized provider.`);
          console.error(`Valid providers: ${PROVIDER_KINDS.join(", ")}. Run \`gw config provider <value>\` to fix it.`);
          process.exit(1);
        }
        const modelsMap = userConfig.models;
        const currentBlock = modelsMap[targetProvider] ?? { fast: "", balanced: "", powerful: "" };
        // Spread every provider's current block through, not just the target
        // one — writeUserConfig/mergeWithDefaults backfills any key missing
        // from this object from DEFAULTS, which would otherwise silently
        // reset every other provider's saved models to defaults.
        await writeUserConfig(
          {
            models: {
              ...modelsMap,
              [targetProvider]: {
                fast: currentBlock.fast,
                balanced: currentBlock.balanced,
                powerful: currentBlock.powerful,
                [parsedModelsKey.tier]: value,
              },
            },
          } as Parameters<typeof writeUserConfig>[0],
          homeDir,
        );
      } else {
        const update: Record<string, unknown> = {};
        update[key] = value;
        await writeUserConfig(update as Parameters<typeof writeUserConfig>[0], homeDir);
      }

      console.log(`Set ${key} = ${value}`);
    });
}
