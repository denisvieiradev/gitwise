// Type declarations for scripts/docs-lint.mjs. Kept alongside the script so
// tests written in TypeScript can import it without enabling allowJs.

export const REQUIRED_README_SECTIONS: readonly string[];
export const REMOVED_DEVFLOW_COMMANDS: readonly string[];

export interface RelativeLink {
  target: string;
  line: number;
}

export interface BrokenLink extends RelativeLink {
  resolved: string;
}

export interface LintResult {
  file: string;
  missingSections: string[];
  brokenLinks: BrokenLink[];
}

export interface LintOptions {
  requiredSections?: readonly string[];
}

export function extractHeadings(markdown: string): string[];
export function findMissingSections(
  markdown: string,
  required?: readonly string[],
): string[];
export function extractRelativeLinks(markdown: string): RelativeLink[];
export function resolveLinkTarget(
  link: RelativeLink,
  baseDir: string,
  repoRoot: string,
): string;
export function findBrokenLinks(
  filePath: string,
  repoRoot: string,
): BrokenLink[];
export function lintMarkdownFile(
  filePath: string,
  repoRoot: string,
  opts?: LintOptions,
): LintResult;
