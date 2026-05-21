import type { ReleaseStrategyName } from "../strategies/release.js";

export type ModelTier = "fast" | "balanced" | "powerful";
export type Language = "en" | "pt-br" | "es" | "fr" | "de" | "zh" | "ja" | "ko";
export type CommitConvention = "conventional" | "gitmoji" | "angular" | "kernel" | "custom";

export interface ModelConfig {
  fast: string;
  balanced: string;
  powerful: string;
}

/** Persisted in ~/.gitwise/config.json */
export interface UserConfig {
  provider: "api" | "claude-code";
  claudeCliPath?: string;
  models: ModelConfig;
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

export const DEFAULT_USER_CONFIG: UserConfig = {
  provider: "api",
  models: {
    fast: "claude-haiku-4-5-20251001",
    balanced: "claude-sonnet-4-6",
    powerful: "claude-opus-4-7",
  },
  language: "en",
  commitConvention: "conventional",
};
