import { createRequire } from "node:module";

const requireFromHere = createRequire(import.meta.url);
const packageJson = requireFromHere("../package.json") as { version: string };

export const version: string = packageJson.version;

export const __placeholder__ = Symbol.for("@denisvieiradev/gitwise-core#placeholder");

// Error exports
export { GitwiseError, EXIT_CODES, wrapError } from "./errors.js";
export type { GitwiseErrorArgs } from "./errors.js";

// Infra exports
export * from "./infra/logger.js";
export * from "./infra/filesystem.js";
export { git } from "./infra/index.js";
export { github } from "./infra/index.js";
export { env } from "./infra/index.js";
export type { ChangedFile, ApplyCommitParams } from "./infra/git.js";
export { stashList } from "./infra/git.js";
export type { CreatePRParams, PRResult, UpdatePRParams, CreateReleaseParams } from "./infra/github.js";
export { Transaction } from "./infra/transaction.js";
export type {
  Step,
  Logger,
  RollbackFailure,
  RollbackResult,
} from "./infra/transaction.js";
export { acquireRepoLock, STALE_LOCK_MS } from "./infra/lockfile.js";
export type { LockPayload, AcquireRepoLockOptions } from "./infra/lockfile.js";
// Export resolveClaudeBinary for CLI use
export { resolveClaudeBinary } from "./providers/claude-code.js";

// Config exports — note: ModelConfig here is the config-layer version
export type { UserConfig, RepoConfig, MergedConfig, Language, CommitConvention } from "./config/types.js";
export type { ModelConfig as ConfigModelConfig } from "./config/types.js";
export { DEFAULT_USER_CONFIG } from "./config/types.js";
export { getMergedConfig, getApiKey } from "./config/merge.js";
export { readUserConfig, writeUserConfig, writeApiKey } from "./config/user.js";
export { readRepoConfig } from "./config/repo.js";

// Template exports
export { loadTemplate, loadAndInterpolate, interpolate } from "./template/index.js";
export type { LoadTemplateOptions } from "./template/index.js";

// Command exports
export {
  commit,
  applyCommitPlan,
  parseCommitResponse,
  takeNamedStashStep,
  applyOneCommitStep,
} from "./commands/commit.js";
export { review } from "./commands/review.js";
export { pr, applyPr } from "./commands/pr.js";
export {
  release,
  prepareRelease,
  applyRelease,
  finishRelease,
  abortRelease,
  runReleaseInProcess,
  bumpVersion,
  heuristicBump,
  detectWorkspaceRoot,
  propagateVersionToWorkspaces,
  writeWorkspaceVersionStep,
} from "./commands/release.js";
export type {
  ReleaseOptions,
  ReleasePlan,
  PrepareReleaseOptions,
  ApplyReleaseOptions,
  FinishReleaseOptions,
  AbortReleaseOptions,
  RunReleaseInProcessOptions,
  BumpType,
} from "./commands/release.js";
export { createReleaseStrategy } from "./strategies/release.js";
export type { ReleaseStrategy, ReleaseStrategyName } from "./strategies/release.js";
export {
  saveReleasePlan,
  loadReleasePlan,
  deleteReleasePlan,
  ensureGitignored,
} from "./commands/release-plan.js";
export type { PersistedReleasePlan } from "./commands/release-plan.js";
export type { PrOptions, PrDraft, ApplyPrOptions, ApplyPrResult } from "./commands/pr.js";
export type { ReviewOptions, ReviewResult, ReviewFinding } from "./commands/review.js";
export type { CommitOptions, CommitPlan, CommitEntry, SplitMode, ApplyCommitPlanOptions, CommitStepResult } from "./commands/commit.js";

// Provider exports — ModelConfig here is the provider-layer version
export type { LLMProvider, LLMChatRequest, LLMChatResponse, ModelTier, ModelConfig, ProviderConfig } from "./providers/types.js";
export { createProvider } from "./providers/factory.js";
export { resolveModelTier, SUPPORTED_COMMANDS } from "./providers/model-router.js";
