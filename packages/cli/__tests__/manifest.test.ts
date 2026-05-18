import { describe, it, expect } from "@jest/globals";
import { createRequire } from "node:module";

const requireFromHere = createRequire(import.meta.url);
const pkg = requireFromHere("../package.json") as {
  name: string;
  version: string;
  dependencies: Record<string, string>;
};
const corePkg = requireFromHere("../../core/package.json") as { version: string };

describe("@denisvieiradev/gitwise package.json", () => {
  // Regression guard for ADR-005 (locked-version monorepo releases). A wildcard
  // range is left as-is by `npm publish --workspaces`, so the published tarball
  // would let consumers resolve `gitwise-core` to whatever happens to be latest
  // on the registry, defeating the locked-version contract.
  it("pins @denisvieiradev/gitwise-core to an exact semver, never a wildcard", () => {
    const spec = pkg.dependencies["@denisvieiradev/gitwise-core"];
    expect(spec).toBeDefined();
    expect(spec).not.toBe("*");
    expect(spec).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  });

  it("keeps the gitwise-core dependency in lockstep with the sibling package version", () => {
    expect(pkg.dependencies["@denisvieiradev/gitwise-core"]).toBe(corePkg.version);
  });
});
