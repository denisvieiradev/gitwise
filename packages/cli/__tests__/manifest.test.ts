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

// Regression guard: `npm publish --provenance` compares package.json's
// repository.url against the GitHub repo that built the tarball and rejects the
// publish with E422 when it is missing, which left v1.3.0 half-published.
describe("published packages declare their repository", () => {
  const skillsPkg = requireFromHere("../../skills/package.json") as {
    name: string;
    repository?: { url?: string; directory?: string };
  };
  const packages = [
    { dir: "core", pkg: requireFromHere("../../core/package.json") as typeof skillsPkg },
    { dir: "cli", pkg: pkg as unknown as typeof skillsPkg },
    { dir: "skills", pkg: skillsPkg },
  ];

  it.each(packages)("$dir points repository at the GitHub repo and its own directory", ({ dir, pkg: p }) => {
    expect(p.repository?.url).toBe("git+https://github.com/denisvieiradev/gitwise.git");
    expect(p.repository?.directory).toBe(`packages/${dir}`);
  });
});
