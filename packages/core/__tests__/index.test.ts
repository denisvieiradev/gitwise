import { describe, it, expect } from "@jest/globals";
import { createRequire } from "node:module";

import { version, __placeholder__ } from "../src/index.js";
import { __testingPlaceholder__ } from "../src/testing/index.js";

const requireFromHere = createRequire(import.meta.url);
const pkg = requireFromHere("../package.json") as {
  name: string;
  version: string;
  type: string;
  engines: { node: string };
  files: string[];
  exports: Record<string, unknown>;
};

describe("@denisvieiradev/gitwise-core (skeleton)", () => {
  it("re-exports the package.json version", () => {
    expect(version).toBe(pkg.version);
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("exposes a placeholder symbol so subsequent porting tasks have a target export to replace", () => {
    expect(typeof __placeholder__).toBe("symbol");
    expect(__placeholder__).toBe(Symbol.for("@denisvieiradev/gitwise-core#placeholder"));
  });

  it("exposes a placeholder symbol from the ./testing subpath", () => {
    expect(typeof __testingPlaceholder__).toBe("symbol");
    expect(__testingPlaceholder__).toBe(
      Symbol.for("@denisvieiradev/gitwise-core/testing#placeholder"),
    );
  });
});

describe("@denisvieiradev/gitwise-core package.json", () => {
  it("uses the canonical workspace package name", () => {
    expect(pkg.name).toBe("@denisvieiradev/gitwise-core");
  });

  it("declares ESM and Node >= 22.12.0", () => {
    expect(pkg.type).toBe("module");
    expect(pkg.engines.node).toBe(">=22.12.0");
  });

  it("publishes only the artifacts listed in the spec (dist, templates, README, LICENSE)", () => {
    expect(pkg.files).toEqual(expect.arrayContaining(["dist", "templates", "README.md", "LICENSE"]));
    expect(pkg.files).toHaveLength(4);
  });

  it("declares both the root entry and the ./testing subpath in exports", () => {
    expect(pkg.exports).toBeDefined();
    expect(pkg.exports["."]).toBeDefined();
    expect(pkg.exports["./testing"]).toBeDefined();
  });
});
