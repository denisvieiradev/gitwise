import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { fileExists } from "../infra/filesystem.js";
import { debug } from "../infra/logger.js";
import { interpolate } from "./interpolate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Bundled templates live at packages/core/templates/. The relative ascent
// differs depending on where this module ends up at runtime:
//   - source layout:   packages/core/src/template/loader.ts → ../../templates
//   - bundled dist:    packages/core/dist/index.js          → ../templates
// We probe both so the loader works whether consumers import the source via
// ts-jest or the built dist via `node`.
const BUNDLED_TEMPLATES_CANDIDATES = [
  join(__dirname, "..", "templates"),
  join(__dirname, "..", "..", "templates"),
];

function validateTemplateName(name: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw Object.assign(
      new Error(`Invalid template name: '${name}'. Only alphanumeric characters, hyphens, and underscores are allowed.`),
      { code: "TEMPLATE_INVALID_NAME" },
    );
  }
}

export interface LoadTemplateOptions {
  /** Override the user-global templates directory (default: ~/.gitwise/templates). */
  templatesPath?: string;
  /** Repo root for repo-level override lookup (default: process.cwd()). */
  repoRoot?: string;
}

/**
 * Load a template by name, applying 3-level precedence:
 *   1. <repoRoot>/.gitwise/templates/<name>.md  (highest priority)
 *   2. templatesPath (default: ~/.gitwise/templates/<name>.md)
 *   3. packages/core/templates/<name>.md         (bundled fallback)
 *
 * Returns the raw template string (not interpolated).
 * Throws TEMPLATE_NOT_FOUND if no file found at any level.
 */
export async function loadTemplate(
  name: string,
  options: LoadTemplateOptions = {},
): Promise<string> {
  validateTemplateName(name);

  const repoRoot = options.repoRoot ?? process.cwd();
  const userTemplatesPath = options.templatesPath ?? join(os.homedir(), ".gitwise", "templates");

  // Level 1: repo-level override
  const repoOverride = join(repoRoot, ".gitwise", "templates", `${name}.md`);
  if (await fileExists(repoOverride)) {
    debug("Loading repo-level template override", { path: repoOverride });
    return readFile(repoOverride, "utf-8");
  }

  // Level 2: user-global (or configured templatesPath)
  const userOverride = join(userTemplatesPath, `${name}.md`);
  if (await fileExists(userOverride)) {
    debug("Loading user-global template override", { path: userOverride });
    return readFile(userOverride, "utf-8");
  }

  // Level 3: bundled (probe each candidate layout)
  for (const candidate of BUNDLED_TEMPLATES_CANDIDATES) {
    const bundled = join(candidate, `${name}.md`);
    if (await fileExists(bundled)) {
      debug("Loading bundled template", { path: bundled });
      return readFile(bundled, "utf-8");
    }
  }

  throw Object.assign(
    new Error(`Template '${name}' not found`),
    { code: "TEMPLATE_NOT_FOUND" },
  );
}

/**
 * Load and interpolate a template in one call.
 */
export async function loadAndInterpolate(
  name: string,
  ctx: Record<string, string>,
  options: LoadTemplateOptions = {},
): Promise<string> {
  const template = await loadTemplate(name, options);
  return interpolate(template, ctx);
}
