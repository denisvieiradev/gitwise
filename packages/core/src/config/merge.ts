import os from "node:os";
import { read as readEnvValue } from "../infra/env.js";
import { readUserConfig } from "./user.js";
import { readRepoConfig } from "./repo.js";
import type { MergedConfig, RepoConfig, UserConfig } from "./types.js";

export function deepMerge(base: UserConfig, override: RepoConfig): MergedConfig {
  return {
    ...base,
    ...(override.language !== undefined && { language: override.language }),
    ...(override.defaultBaseBranch !== undefined && { defaultBaseBranch: override.defaultBaseBranch }),
    ...(override.commitConvention !== undefined && { commitConvention: override.commitConvention }),
    ...(override.templatesPath !== undefined && { templatesPath: override.templatesPath }),
    ...(override.releaseStrategy !== undefined && { releaseStrategy: override.releaseStrategy }),
    ...(override.developBranch !== undefined && { developBranch: override.developBranch }),
    models: {
      ...base.models,
      ...(override.models ?? {}),
    },
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
