import { describe, it, expect } from "@jest/globals";
import {
  GITWISE_TSUP_DEFAULTS,
  defineGitwiseTsup,
} from "../../../tsup.config.js";

describe("defineGitwiseTsup", () => {
  it("produces a valid config object with defaults when given only entry", () => {
    const config = defineGitwiseTsup({ entry: ["src/index.ts"] });

    expect(config).toMatchObject({
      entry: ["src/index.ts"],
      format: ["esm"],
      target: "node18",
      outDir: "dist",
      clean: true,
      splitting: false,
      sourcemap: true,
      dts: true,
      shims: true,
    });
  });

  it("merges per-package overrides (entry, outDir) on top of the defaults", () => {
    const config = defineGitwiseTsup({
      entry: ["packages/core/src/index.ts"],
      outDir: "packages/core/dist",
    });

    expect(config.entry).toEqual(["packages/core/src/index.ts"]);
    expect(config.outDir).toBe("packages/core/dist");
    // unspecified defaults are preserved
    expect(config.format).toEqual(["esm"]);
    expect(config.target).toBe("node18");
    expect(config.clean).toBe(true);
  });

  it("lets overrides replace defaults explicitly (e.g. dts: false)", () => {
    const config = defineGitwiseTsup({
      entry: ["src/script.ts"],
      dts: false,
      sourcemap: false,
      clean: false,
    });

    expect(config.dts).toBe(false);
    expect(config.sourcemap).toBe(false);
    expect(config.clean).toBe(false);
    // untouched defaults remain
    expect(config.format).toEqual(["esm"]);
    expect(config.target).toBe("node18");
  });

  it("accepts a record-form entry override", () => {
    const config = defineGitwiseTsup({
      entry: { cli: "packages/cli/src/index.ts" },
    });

    expect(config.entry).toEqual({ cli: "packages/cli/src/index.ts" });
  });

  it("does not mutate the shared defaults object across invocations", () => {
    const snapshot = JSON.parse(JSON.stringify(GITWISE_TSUP_DEFAULTS));
    defineGitwiseTsup({
      entry: ["src/a.ts"],
      outDir: "out-a",
      dts: false,
    });
    defineGitwiseTsup({
      entry: ["src/b.ts"],
      outDir: "out-b",
    });

    expect(GITWISE_TSUP_DEFAULTS).toEqual(snapshot);
  });

  it("supports an external dependency list so per-package overrides can prevent bundling runtime deps", () => {
    const config = defineGitwiseTsup({
      entry: ["packages/cli/src/index.ts"],
      outDir: "packages/cli/dist",
      external: ["commander", "@clack/prompts"],
    });

    expect(config.external).toEqual(["commander", "@clack/prompts"]);
  });

  it("exposes the documented defaults that downstream packages rely on", () => {
    expect(GITWISE_TSUP_DEFAULTS).toMatchObject({
      format: ["esm"],
      target: "node18",
      outDir: "dist",
      clean: true,
      splitting: false,
      sourcemap: true,
      dts: true,
      shims: true,
    });
  });
});
