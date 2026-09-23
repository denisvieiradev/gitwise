import type { ReleaseStrategyName } from "../strategies/release.js";
import type { ProviderKind } from "../providers/types.js";

export type ModelTier = "fast" | "balanced" | "powerful";
export type Language = "en" | "pt-br" | "es" | "fr" | "de" | "zh" | "ja" | "ko";
export type CommitConvention = "conventional" | "gitmoji" | "angular" | "kernel" | "custom";

export interface ModelConfig {
  fast: string;
  balanced: string;
  powerful: string;
}

/** MDL-01: per-provider model map — each ProviderKind keeps its own tier IDs. */
export type ModelsByProvider = Record<ProviderKind, ModelConfig>;

/** Persisted in ~/.gitwise/config.json */
export interface UserConfig {
  provider: ProviderKind;
  claudeCliPath?: string;
  codexCliPath?: string;
  copilotCliPath?: string;
  kiroCliPath?: string;
  models: ModelsByProvider;
  language: Language;
  defaultBaseBranch?: string;
  commitConvention: CommitConvention;
}

/** Loaded from <cwd>/.gitwise.json — all fields are optional */
export interface RepoConfig {
  models?: Partial<ModelConfig>;
  language?: Language;
  defaultBaseBranch?: string;
  commitConvention?: CommitConvention;
  templatesPath?: string;
  /** When true, applyRelease() propagates the new version to all packages/* */
  workspacePropagation?: boolean;
  /** Release lifecycle strategy. Unset = "github-flow" at the consumer level. */
  releaseStrategy?: ReleaseStrategyName;
  /** Develop branch name for gitflow; consumers default to "develop" when unset. */
  developBranch?: string;
}

/** The merged result of UserConfig + RepoConfig overrides */
export interface MergedConfig extends UserConfig {
  templatesPath?: string;
  releaseStrategy?: ReleaseStrategyName;
  developBranch?: string;
}

// MDL-02: default model IDs per provider, checked 2026-09-23 against the
// CLIs installed on the maintainer's machine (help text and model listings
// only, no model calls). Every value is user-overridable via
// `gw config models.<provider>.<tier>`.
// - api / claude-code: gitwise's pre-existing Claude defaults, unchanged.
// - codex: the model catalog of codex-cli 0.156.1 (`codex debug models`,
//   cached in ~/.codex/models_cache.json) lists gpt-6-luna ("fast and
//   affordable"), gpt-6-sol ("workhorse model for coding") and gpt-6-astra
//   ("frontier intelligence"). The old gpt-5.1-codex* IDs are not in it.
//   The catalog is fetched per account, so another plan may list more models.
// - copilot: the `model` values listed by `copilot help config` in GitHub
//   Copilot CLI 1.0.88. The tiers mirror gitwise's Claude defaults
//   (haiku-4.5 / sonnet-4.6 / opus-4.7); claude-sonnet-4.5 and
//   claude-opus-4.1 are not in that list.
// - kiro: checked 2026-09-23. https://kiro.dev/docs/cli/chat/model-selection/
//   lists Claude Haiku 4.5, Sonnet 4.6 and Opus 4.7 on every plan (Free
//   included) and shows the model ID format by example
//   (`kiro-cli settings chat.defaultModel claude-opus-4.8`), so the tiers
//   mirror gitwise's Claude defaults: claude-haiku-4.5 / claude-sonnet-4.6 /
//   claude-opus-4.7. The installed kiro-cli 2.23.1 is older: its
//   `kiro-cli chat --list-models` catalog is narrower (claude-haiku-4.5 and
//   claude-sonnet-4.5, no Sonnet 4.6, no Opus). Users on an older CLI can
//   override a tier, e.g. `gw config models.kiro.powerful claude-sonnet-4.5`.
const CLAUDE_MODELS: ModelConfig = {
  fast: "claude-haiku-4-5-20251001",
  balanced: "claude-sonnet-4-6",
  powerful: "claude-opus-4-7",
};

export const DEFAULT_USER_CONFIG: UserConfig = {
  provider: "api",
  models: {
    api: { ...CLAUDE_MODELS },
    "claude-code": { ...CLAUDE_MODELS },
    codex: {
      fast: "gpt-6-luna",
      balanced: "gpt-6-sol",
      powerful: "gpt-6-astra",
    },
    copilot: {
      fast: "claude-haiku-4.5",
      balanced: "claude-sonnet-4.6",
      powerful: "claude-opus-4.7",
    },
    kiro: {
      fast: "claude-haiku-4.5",
      balanced: "claude-sonnet-4.6",
      powerful: "claude-opus-4.7",
    },
  },
  language: "en",
  commitConvention: "conventional",
};
