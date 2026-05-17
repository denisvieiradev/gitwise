import type { ModelTier } from "./types.js";

const COMMAND_TIER_MAP: Record<string, ModelTier> = {
  init: "fast",
  prd: "powerful",
  techspec: "powerful",
  tasks: "balanced",
  "run-tasks": "balanced",
  test: "balanced",
  review: "powerful",
  commit: "fast",
  pr: "fast",
  release: "balanced",
  done: "fast",
  status: "fast",
};

export function resolveModelTier(command: string): ModelTier {
  return COMMAND_TIER_MAP[command] ?? "balanced";
}
