import type { Options } from "tsup";

export interface GitwiseTsupOverrides extends Partial<Options> {
  entry: NonNullable<Options["entry"]>;
}

export const GITWISE_TSUP_DEFAULTS = {
  format: ["esm"] as const,
  target: "node18" as const,
  outDir: "dist",
  clean: true,
  splitting: false,
  sourcemap: true,
  dts: true,
  shims: true,
} satisfies Partial<Options>;

export function defineGitwiseTsup(overrides: GitwiseTsupOverrides): Options {
  return {
    ...GITWISE_TSUP_DEFAULTS,
    ...overrides,
  } as Options;
}

// Transitional default config for the legacy `src/cli/index.ts` bundle.
// The runtime deps live under devDependencies on the workspaces root (so they
// are not "shipped" from the private root), which means tsup no longer
// auto-externalizes them via package.json — list them explicitly here so the
// legacy CLI bundle stays small and ESM-compatible until task_03+ moves the
// source into `packages/core` and `packages/cli`.
export default defineGitwiseTsup({
  entry: ["src/cli/index.ts"],
  external: [
    "@anthropic-ai/sdk",
    "@clack/prompts",
    "chalk",
    "commander",
    "ora",
  ],
});
