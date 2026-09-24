import os from "node:os";
import { read as readEnvValue } from "../infra/env.js";
import { readUserConfig } from "./user.js";
import { readRepoConfig } from "./repo.js";
import { PROVIDER_KINDS, type ProviderKind } from "../providers/types.js";
import type { MergedConfig, ModelConfig, ModelsByProvider, RepoConfig, UserConfig } from "./types.js";

function mergeRepoModels(base: UserConfig, override: RepoConfig["models"]): ModelsByProvider {
  if (!override) return base.models;
  // MDL-06: flat overrides target the active provider; per-provider maps target each named provider.
  const isPerProvider = PROVIDER_KINDS.some((kind) => kind in override);
  const perProvider: Partial<Record<ProviderKind, Partial<ModelConfig>>> = isPerProvider
    ? (override as Partial<Record<ProviderKind, Partial<ModelConfig>>>)
    : { [base.provider]: override as Partial<ModelConfig> };
  const merged = { ...base.models };
  for (const kind of PROVIDER_KINDS) {
    if (perProvider[kind]) merged[kind] = { ...base.models[kind], ...perProvider[kind] };
  }
  return merged;
}

export function deepMerge(base: UserConfig, override: RepoConfig): MergedConfig {
  return {
    ...base,
    ...(override.language !== undefined && { language: override.language }),
    ...(override.defaultBaseBranch !== undefined && { defaultBaseBranch: override.defaultBaseBranch }),
    ...(override.commitConvention !== undefined && { commitConvention: override.commitConvention }),
    ...(override.templatesPath !== undefined && { templatesPath: override.templatesPath }),
    ...(override.releaseStrategy !== undefined && { releaseStrategy: override.releaseStrategy }),
    ...(override.developBranch !== undefined && { developBranch: override.developBranch }),
    models: mergeRepoModels(base, override.models),
  };
}

export interface GetMergedConfigOptions {
  cwd: string;
  homeDir?: string;
}

/**
 * Load and merge config:
 *   1. Start from defaults
 *   2. Layer user config (~/.gitwise/config.json)
 *   3. Layer repo config (<cwd>/.gitwise.json)
 *
 * Note: the API key is NOT included in the returned config.
 */
export async function getMergedConfig(options: GetMergedConfigOptions): Promise<MergedConfig> {
  const { cwd, homeDir } = options;
  const userConfig = await readUserConfig(homeDir);
  const repoConfig = await readRepoConfig(cwd);
  if (!repoConfig) {
    return userConfig;
  }
  return deepMerge(userConfig, repoConfig);
}

/**
 * Read the Anthropic API key from process.env first, then ~/.gitwise/.env.
 * Returns undefined if not found anywhere.
 */
export async function getApiKey(homeDir?: string): Promise<string | undefined> {
  const home = homeDir ?? os.homedir();
  return readEnvValue("ANTHROPIC_API_KEY", home);
}
