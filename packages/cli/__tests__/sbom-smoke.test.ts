/**
 * SBOM smoke integration test.
 *
 * Guards on SBOM_SMOKE=1 to avoid downloading @cyclonedx/cdxgen on every
 * normal test run (cdxgen can take 30-120 s on first npx invocation).
 *
 * To run:
 *   SBOM_SMOKE=1 npm run -w packages/cli test -- --testPathPattern=sbom-smoke
 */
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const exec = promisify(execFile);

const RUN_SBOM = process.env["SBOM_SMOKE"] === "1";
const describeIf = (cond: boolean) => (cond ? describe : describe.skip);

function findRepoRoot(): string {
  let dir = resolve(process.cwd());
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "packages")) && existsSync(join(dir, ".github"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Could not locate repo root from cwd " + process.cwd());
}

const REPO_ROOT = findRepoRoot();
const SBOM_OUTPUT = join(tmpdir(), `sbom-test-${Date.now()}.cdx.json`);

interface CycloneDXBom {
  bomFormat?: string;
  specVersion?: string;
  metadata?: {
    component?: { name?: string; version?: string };
  };
  components?: Array<{ name?: string; version?: string; type?: string }>;
}

let parsedBom: CycloneDXBom = {};

describeIf(RUN_SBOM)("SBOM smoke test — CycloneDX generation", () => {
  beforeAll(async () => {
    await exec(
      "npx",
      ["--yes", "@cyclonedx/cdxgen", "-t", "npm", "-o", SBOM_OUTPUT, "."],
      {
        cwd: REPO_ROOT,
      },
    );
    const raw = await readFile(SBOM_OUTPUT, "utf-8");
    parsedBom = JSON.parse(raw) as CycloneDXBom;
  }, 180_000);

  afterAll(async () => {
    try {
      await rm(SBOM_OUTPUT, { force: true });
    } catch {
      // best-effort cleanup
    }
  });

  it("produces a non-empty output file", () => {
    expect(existsSync(SBOM_OUTPUT)).toBe(true);
  });

  it("bomFormat is CycloneDX", () => {
    expect(parsedBom.bomFormat).toBe("CycloneDX");
  });

  it("specVersion is 1.5", () => {
    expect(parsedBom.specVersion).toBe("1.5");
  });

  it("has at least one component", () => {
    const allComponents = [
      ...(parsedBom.components ?? []),
      ...(parsedBom.metadata?.component ? [parsedBom.metadata.component] : []),
    ];
    expect(allComponents.length).toBeGreaterThan(0);
  });

  it("SBOM references all three published workspace packages", () => {
    const allComponents = [
      ...(parsedBom.components ?? []),
      ...(parsedBom.metadata?.component ? [parsedBom.metadata.component] : []),
    ];
    const names = allComponents.map((c) => c.name ?? "");

    const hasCore = names.some(
      (n) => n === "@denisvieiradev/gitwise-core" || n.includes("gitwise-core"),
    );
    const hasCli = names.some(
      (n) => n === "@denisvieiradev/gitwise" || n === "gitwise",
    );
    const hasSkills = names.some(
      (n) =>
        n === "@denisvieiradev/gitwise-skills" || n.includes("gitwise-skills"),
    );

    expect(hasCore).toBe(true);
    expect(hasCli).toBe(true);
    expect(hasSkills).toBe(true);
  });
});

// When SBOM_SMOKE is not set, emit a single skipped placeholder so jest
// reports the suite as skipped rather than empty.
if (!RUN_SBOM) {
  describe("SBOM smoke test (skipped — set SBOM_SMOKE=1 to enable)", () => {
    it.skip("cdxgen produces a non-empty CycloneDX 1.5 document", () => {});
    it.skip("SBOM references all three published workspace packages", () => {});
  });
}
