import type { ModelTier } from "./types.js";

// Four supported commands and their default tiers
// commit/pr/release default to fast; review defaults to powerful
const COMMAND_TIER_MAP: Record<string, ModelTier> = {
  commit: "fast",
  review: "powerful",
  pr: "fast",
  release: "fast",
};

export function resolveModelTier(command: string): ModelTier {
  return COMMAND_TIER_MAP[command] ?? "balanced";
}

export const SUPPORTED_COMMANDS = Object.keys(COMMAND_TIER_MAP) as (keyof typeof COMMAND_TIER_MAP)[];
