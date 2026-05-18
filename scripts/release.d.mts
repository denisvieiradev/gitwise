// Type declarations for scripts/release.mjs. Kept alongside the script so
// tests written in TypeScript can import it without enabling allowJs.

export type Bump = "patch" | "minor" | "major";

export interface ParsedArgs {
  cwd: string | undefined;
  bump: Bump | undefined;
  explicitVersion: string | undefined;
}

export interface GitClient {
  add(paths: string[]): void;
  commit(message: string): void;
  tag(name: string): void;
  // Optional pre-flight hooks. runRelease() skips the corresponding guard
  // when the method is absent, which keeps existing test doubles compatible.
  statusPorcelain?(): string;
  tagExists?(name: string): boolean;
}

export interface RunReleaseOptions {
  argv?: string[];
  cwd?: string;
  git?: GitClient;
  log?: (line: string) => void;
}

export interface RunReleaseResult {
  newVersion: string;
  tag: string;
  updated: string[];
}

export function isExplicitVersion(value: unknown): boolean;
export function parseArgs(argv: string[]): ParsedArgs;
export function bumpVersion(current: string, kind: Bump): string;
export function listWorkspaceManifests(rootDir: string): string[];
export function propagateVersion(rootDir: string, newVersion: string): string[];
export function resolveNewVersion(opts: {
  currentVersion: string;
  bump?: Bump;
  explicitVersion?: string;
}): string;
export function runRelease(options?: RunReleaseOptions): Promise<RunReleaseResult>;
