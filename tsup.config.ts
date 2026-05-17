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
