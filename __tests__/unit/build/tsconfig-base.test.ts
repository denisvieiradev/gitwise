import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TSCONFIG_BASE_PATH = resolve(__dirname, "..", "..", "..", "tsconfig.base.json");

describe("tsconfig.base.json", () => {
  const raw = readFileSync(TSCONFIG_BASE_PATH, "utf8");

  it("is valid JSON", () => {
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  const parsed = JSON.parse(raw) as { compilerOptions?: Record<string, unknown> };

  it("defines the shared compilerOptions every workspace package depends on", () => {
    const opts = parsed.compilerOptions ?? {};
    expect(opts.target).toBeDefined();
    expect(opts.module).toBeDefined();
    expect(opts.moduleResolution).toBeDefined();
    expect(opts.strict).toBe(true);
    expect(opts.esModuleInterop).toBe(true);
  });

  it("does not pin a per-package rootDir/outDir (those belong to extenders)", () => {
    const opts = parsed.compilerOptions ?? {};
    expect(opts.rootDir).toBeUndefined();
    expect(opts.outDir).toBeUndefined();
  });
});
