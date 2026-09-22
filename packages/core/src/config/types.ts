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

// MDL-02: default model IDs per provider, checked 2026-09-22 via the
// Knowledge Verification Chain's web-search step (no local install of any of
// the three CLIs to verify `--model` output against). `api`/`claude-code`
// keep gitwise's pre-existing, already-shipped Claude defaults unchanged.
// Codex/Copilot/Kiro's exact current catalogue could not be confirmed with
// high confidence — public search results for all three disagreed with each
// other and included implausible version strings (e.g. unreleased-sounding
// major bumps), a known failure mode of AI-model-name search results. These
// defaults use each vendor's last-confirmed-real model family/naming
// convention instead of the unverifiable search output, and are always
// user-overridable via `gw provider` / `gw config models.<provider>.<tier>`.
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
      fast: "gpt-5.1-codex-mini",
      balanced: "gpt-5.1-codex",
      powerful: "gpt-5.1-codex-max",
    },
    copilot: {
      fast: "claude-haiku-4.5",
      balanced: "claude-sonnet-4.5",
      powerful: "claude-opus-4.1",
    },
    kiro: {
      fast: "claude-haiku-4.5",
      balanced: "claude-sonnet-4.5",
      powerful: "claude-opus-4.1",
    },
  },
  language: "en",
  commitConvention: "conventional",
};
