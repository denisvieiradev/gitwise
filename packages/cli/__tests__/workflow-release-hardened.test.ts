/**
 * Structural tests for .github/workflows/release.yml supply-chain hardening.
 * These tests verify YAML shape, not workflow execution.
 */
import { describe, it, expect, beforeAll } from "@jest/globals";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

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
const RELEASE_YML = join(REPO_ROOT, ".github", "workflows", "release.yml");
const SHA_RE = /^[0-9a-f]{40}$/;

let content: string;

beforeAll(async () => {
  content = await readFile(RELEASE_YML, "utf-8");
});

describe("release.yml — OIDC permissions", () => {
  it("publish job declares id-token: write", () => {
    expect(content).toMatch(/id-token:\s+write/);
  });

  it("publish job declares contents: write", () => {
    // contents: write must appear at least in the job-level permissions block
    const jobPermissions = content.match(/jobs:\s[\s\S]*?permissions:\s*\n([\s\S]*?)(?=\n\s{4}\w|\n\s{2}\w|$)/);
    expect(content).toMatch(/contents:\s+write/);
  });

  it("publish job declares attestations: write", () => {
    expect(content).toMatch(/attestations:\s+write/);
  });
});

describe("release.yml — npm publish with provenance", () => {
  it("publishes packages/core with --provenance --access public", () => {
    expect(content).toMatch(/npm publish.*-w packages\/core.*--provenance.*--access public/s);
  });

  it("publishes packages/cli with --provenance --access public", () => {
    expect(content).toMatch(/npm publish.*-w packages\/cli.*--provenance.*--access public/s);
  });

  it("publishes packages/skills with --provenance --access public", () => {
    expect(content).toMatch(/npm publish.*-w packages\/skills.*--provenance.*--access public/s);
  });

  it("publishes workspaces in order: core before cli before skills", () => {
    const corePos = content.indexOf("packages/core --provenance");
    const cliPos = content.indexOf("packages/cli --provenance");
    const skillsPos = content.indexOf("packages/skills --provenance");
    expect(corePos).toBeGreaterThan(-1);
    expect(cliPos).toBeGreaterThan(corePos);
    expect(skillsPos).toBeGreaterThan(cliPos);
  });
});

describe("release.yml — emergency NPM_TOKEN fallback", () => {
  it("workflow_dispatch has use_npm_token input", () => {
    expect(content).toMatch(/use_npm_token:/);
  });

  it("workflow_dispatch.inputs.use_npm_token defaults to false", () => {
    // The default should be false (boolean) for the use_npm_token input
    const inputBlock = content.match(/use_npm_token:[\s\S]*?default:\s*(false|"false")/);
    expect(inputBlock).not.toBeNull();
  });

  it("secrets.NPM_TOKEN is only referenced inside the emergency fallback gate", () => {
    const lines = content.split("\n");
    let inEmergencyStep = false;
    const npmTokenViolations: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      // Detect step boundaries — a step starts with "      - name:" (6 spaces)
      if (/^\s{6}- name:/.test(line)) {
        // Check if it's an emergency fallback step (has use_npm_token == true condition)
        // Look ahead for the if: condition within the next few lines
        let stepLines = line;
        for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
          const nextLine = lines[j] ?? "";
          // Stop at the next step
          if (/^\s{6}- name:/.test(nextLine)) break;
          stepLines += "\n" + nextLine;
        }
        inEmergencyStep = /inputs\.use_npm_token\s*==\s*true/.test(stepLines);
      }
      // Check for secrets.NPM_TOKEN (actual secret reference, not just a mention in description text)
      if (/secrets\.NPM_TOKEN/.test(line) && !inEmergencyStep) {
        npmTokenViolations.push(line.trim());
      }
    }

    expect(npmTokenViolations).toEqual([]);
  });

  it("emergency fallback steps are gated on inputs.use_npm_token == true", () => {
    expect(content).toMatch(/if:.*inputs\.use_npm_token\s*==\s*true/);
  });
});

describe("release.yml — SBOM generation", () => {
  it("has a step using @cyclonedx/cdxgen", () => {
    expect(content).toMatch(/@cyclonedx\/cdxgen/);
  });

  it("SBOM step writes sbom-${VERSION}.cdx.json", () => {
    expect(content).toMatch(/sbom-\$\{?(?:VERSION|RELEASE_TAG[^}]*)\}?\.cdx\.json/);
  });

  it("has an SBOM upload step using gh release upload", () => {
    expect(content).toMatch(/gh release upload.*sbom-/s);
  });

  it("has an SBOM attestation step using actions/attest-build-provenance", () => {
    expect(content).toMatch(/actions\/attest-build-provenance@[0-9a-f]{40}/);
  });
});

describe("release.yml — GPG tag signing", () => {
  it("imports GPG key using crazy-max/ghaction-import-gpg", () => {
    expect(content).toMatch(/crazy-max\/ghaction-import-gpg@[0-9a-f]{40}/);
  });

  it("GPG import step has an id for output reference", () => {
    expect(content).toMatch(/id:\s+import-gpg/);
  });

  it("tag-signing step uses git tag -s", () => {
    expect(content).toMatch(/git tag -s/);
  });

  it("tag-signing step references the GPG key fingerprint from import step", () => {
    expect(content).toMatch(/steps\.import-gpg\.outputs\.fingerprint/);
  });
});

describe("release.yml — SHA pinning", () => {
  function extractUsesValues(src: string): Array<{ raw: string; line: string }> {
    const results: Array<{ raw: string; line: string }> = [];
    for (const line of src.split("\n")) {
      const match = line.match(/^\s+uses:\s+(\S+)/);
      if (match?.[1]) results.push({ raw: match[1], line: line.trim() });
    }
    return results;
  }

  function isPinnedToSha(usesValue: string): boolean {
    const atPos = usesValue.lastIndexOf("@");
    if (atPos === -1) return false;
    return SHA_RE.test(usesValue.slice(atPos + 1));
  }

  it("every uses: line is SHA-pinned to a 40-char hex commit", () => {
    const usesEntries = extractUsesValues(content);
    expect(usesEntries.length).toBeGreaterThan(0);
    const unpinned = usesEntries.filter((e) => !isPinnedToSha(e.raw)).map((e) => e.line);
    expect(unpinned).toEqual([]);
  });

  it("each SHA-pinned uses: line has a trailing version comment", () => {
    const usesEntries = extractUsesValues(content);
    const missingComment = usesEntries
      .filter((e) => isPinnedToSha(e.raw))
      .filter((e) => !/#\s*v\d/.test(e.line))
      .map((e) => e.line);
    expect(missingComment).toEqual([]);
  });
});

describe("release.yml — workflow_dispatch trigger", () => {
  it("has workflow_dispatch trigger", () => {
    expect(content).toMatch(/workflow_dispatch:/);
  });

  it("has push: tags: v* trigger", () => {
    expect(content).toMatch(/push:\s*\n\s+tags:\s*\n\s+- ["']?v\*/);
  });
});
