import { join } from "node:path";
import { fileExists, readJSON } from "../infra/filesystem.js";
import { debug } from "../infra/logger.js";
import type { RepoConfig } from "./types.js";

const REPO_CONFIG_FILE = ".gitwise.json";

export async function readRepoConfig(cwd: string): Promise<RepoConfig | null> {
  const configPath = join(cwd, REPO_CONFIG_FILE);
  if (!(await fileExists(configPath))) {
    debug("Repo config not found", { path: configPath });
    return null;
  }
  try {
    const raw = await readJSON<RepoConfig>(configPath);
    return raw;
  } catch (err) {
    throw Object.assign(
      new Error(`Invalid repo config at ${configPath}: ${err instanceof Error ? err.message : String(err)}`),
      { code: "INVALID_REPO_CONFIG" },
    );
  }
}
