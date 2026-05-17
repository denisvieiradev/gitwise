import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { debug } from "./logger.js";

const exec = promisify(execFile);

export interface CreatePRParams {
  title: string;
  body: string;
  base?: string;
  cwd: string;
  draft?: boolean;
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

export async function getGhVersion(): Promise<string | null> {
  try {
    const result = await exec("gh", ["--version"]);
    const firstLine = result.stdout.split("\n")[0] ?? "";
    return firstLine.trim() || null;
  } catch {
    return null;
  }
}

export async function createPR(params: CreatePRParams): Promise<PRResult> {
  debug("Creating PR via gh", { title: params.title });
  const args = ["pr", "create", "--title", params.title, "--body", params.body];
  if (params.base) {
    args.push("--base", params.base);
  }
  if (params.draft) {
    args.push("--draft");
  }
  const result = await exec("gh", args, { cwd: params.cwd });
  const url = result.stdout?.trim();
  if (!url) {
    throw new Error("gh pr create returned empty output — check gh auth status");
  }
  return { url };
}

export interface UpdatePRParams {
  prNumber: string | number;
  title?: string;
  body?: string;
  cwd: string;
}

export async function updatePR(params: UpdatePRParams): Promise<void> {
  debug("Updating PR via gh", { prNumber: params.prNumber });
  const args = ["pr", "edit", String(params.prNumber)];
  if (params.title) args.push("--title", params.title);
  if (params.body) args.push("--body", params.body);
  await exec("gh", args, { cwd: params.cwd });
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

// Alias: openPr — used by downstream tasks expecting this name
export const openPr = createPR;
