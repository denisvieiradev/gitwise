import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { debug } from "./logger.js";

const exec = promisify(execFile);

export interface CreatePRParams {
  title: string;
  body: string;
  base?: string;
  cwd: string;
}

export interface PRResult {
  url: string;
}

export async function isGhAvailable(): Promise<boolean> {
  try {
    await exec("gh", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

export async function createPR(params: CreatePRParams): Promise<PRResult> {
  debug("Creating PR via gh", { title: params.title });
  const args = ["pr", "create", "--title", params.title, "--body", params.body];
  if (params.base) {
    args.push("--base", params.base);
  }
  const result = await exec("gh", args, { cwd: params.cwd });
  const url = result.stdout?.trim();
  if (!url) {
    throw new Error("gh pr create returned empty output — check gh auth status");
  }
  return { url };
}

export interface CreateReleaseParams {
  tag: string;
  title: string;
  body: string;
  cwd: string;
}

export async function createGitHubRelease(
  params: CreateReleaseParams,
): Promise<PRResult> {
  debug("Creating GitHub release via gh", { tag: params.tag });
  const args = [
    "release",
    "create",
    params.tag,
    "--title",
    params.title,
    "--notes",
    params.body,
  ];
  const result = await exec("gh", args, { cwd: params.cwd });
  const url = result.stdout?.trim();
  if (!url) {
    throw new Error("gh release create returned empty output — check gh auth status");
  }
  return { url };
}
