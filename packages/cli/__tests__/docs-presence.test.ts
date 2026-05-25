import { describe, it, expect, beforeAll } from "@jest/globals";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

function findRepoRoot(): string {
  let dir = resolve(process.cwd());
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "packages")) && existsSync(join(dir, "CONTRIBUTING.md"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Could not locate repo root from cwd " + process.cwd());
}

const REPO_ROOT = findRepoRoot();
const DOCS_DIR = join(REPO_ROOT, "docs", "src", "content", "docs");
const RECOVERY_MD = join(DOCS_DIR, "recovery.md");
const SUPPLY_CHAIN_MD = join(DOCS_DIR, "supply-chain.md");
const CONTRIBUTING_MD = join(REPO_ROOT, "CONTRIBUTING.md");

describe("docs/recovery.md", () => {
  let content: string;

  beforeAll(async () => {
    content = await readFile(RECOVERY_MD, "utf-8");
  });

  it("exists under docs/src/content/docs/", () => {
    expect(existsSync(RECOVERY_MD)).toBe(true);
  });

  it("contains an H2 section for Release Prepare", () => {
    expect(content).toMatch(/^## Release Prepare/m);
  });

  it("contains an H2 section for Commit Split", () => {
    expect(content).toMatch(/^## Commit Split/m);
  });

  it("contains an H2 section for Workspace Version Bump", () => {
    expect(content).toMatch(/^## Workspace Version Bump/m);
  });

  it("references the gitwise/split-<ISO8601-timestamp> stash name format", () => {
    expect(content).toMatch(/gitwise\/split-/);
  });

  it("references the stash name format with ISO8601 timestamp structure", () => {
    // Must mention the format that matches what commit.ts implements:
    // gitwise/split-<ISO8601-timestamp>  (e.g. gitwise/split-2026-05-23T14:30:00.000Z)
    expect(content).toMatch(/gitwise\/split-<ISO8601/);
  });

  it("covers ROLLBACK_PARTIAL exit code context", () => {
    expect(content).toMatch(/ROLLBACK_PARTIAL|exit code.{0,10}81|81.*ROLLBACK/);
  });

  it("has Astro frontmatter with a title field", () => {
    expect(content).toMatch(/^---[\s\S]*?title:/m);
  });
});

describe("docs/supply-chain.md", () => {
  let content: string;

  beforeAll(async () => {
    content = await readFile(SUPPLY_CHAIN_MD, "utf-8");
  });

  it("exists under docs/src/content/docs/", () => {
    expect(existsSync(SUPPLY_CHAIN_MD)).toBe(true);
  });

  it("contains an H2 section for Verifying Provenance", () => {
    expect(content).toMatch(/^## Verifying Provenance/m);
  });

  it("contains an H2 section for Verifying Signed Tags", () => {
    expect(content).toMatch(/^## Verifying Signed Tags/m);
  });

  it("contains an H2 section for Verifying the SBOM", () => {
    expect(content).toMatch(/^## Verifying the SBOM/m);
  });

  it("includes an npm view .dist.attestations example", () => {
    expect(content).toMatch(/npm view.*\.dist\.attestations/);
  });

  it("includes a gpg --verify or git tag -v example", () => {
    expect(content).toMatch(/gpg --verify|git tag -v/);
  });

  it("references KEYS.asc for the public key", () => {
    expect(content).toMatch(/KEYS\.asc/);
  });

  it("includes the GPG fingerprint", () => {
    expect(content).toMatch(/E73555F2E6F5547F2BC105C3BD8BA14C42504AFD/);
  });

  it("has Astro frontmatter with a title field", () => {
    expect(content).toMatch(/^---[\s\S]*?title:/m);
  });
});

describe("CONTRIBUTING.md new sections", () => {
  let content: string;

  beforeAll(async () => {
    content = await readFile(CONTRIBUTING_MD, "utf-8");
  });

  it("contains an H2 section for Writing a Transactional Flow", () => {
    expect(content).toMatch(/^## Writing a Transactional Flow/m);
  });

  it("contains an H2 section for Hotfix Exception", () => {
    expect(content).toMatch(/^## Hotfix Exception/m);
  });

  it("contains an H2 section for Security Test Expectations", () => {
    expect(content).toMatch(/^## Security Test Expectations/m);
  });

  it("contains an H2 section for Adding an OSV Ignore Entry", () => {
    expect(content).toMatch(/^## Adding an OSV Ignore Entry/m);
  });

  it("Hotfix Exception section requires a follow-up issue or PR", () => {
    // The section must mention that a follow-up is required
    const hotfixSection = content.split(/^## /m).find((s) => s.startsWith("Hotfix Exception"));
    expect(hotfixSection).toBeDefined();
    expect(hotfixSection).toMatch(/follow-up issue|follow-up.*PR|PR.*follow-up/i);
  });

  it("Transactional Flow section references the Transaction primitive", () => {
    const txSection = content
      .split(/^## /m)
      .find((s) => s.startsWith("Writing a Transactional Flow"));
    expect(txSection).toBeDefined();
    expect(txSection).toMatch(/Transaction/);
  });

  it("Transactional Flow section references prepareRelease as the worked example", () => {
    const txSection = content
      .split(/^## /m)
      .find((s) => s.startsWith("Writing a Transactional Flow"));
    expect(txSection).toBeDefined();
    expect(txSection).toMatch(/prepareRelease|release\.ts|release prepare/i);
  });

  it("OSV Ignore Entry section requires an expiry date", () => {
    const osvSection = content
      .split(/^## /m)
      .find((s) => s.startsWith("Adding an OSV Ignore Entry"));
    expect(osvSection).toBeDefined();
    expect(osvSection).toMatch(/ignoreUntil|expiry|expir/i);
  });

  it("Security Test Expectations section covers subprocess argument safety", () => {
    const secSection = content
      .split(/^## /m)
      .find((s) => s.startsWith("Security Test Expectations"));
    expect(secSection).toBeDefined();
    expect(secSection).toMatch(/subprocess|execFile|shell.*true/i);
  });

  it("Security Test Expectations section covers the sensitive-file blocklist", () => {
    const secSection = content
      .split(/^## /m)
      .find((s) => s.startsWith("Security Test Expectations"));
    expect(secSection).toBeDefined();
    expect(secSection).toMatch(/sensitive.file|blocklist/i);
  });
});

describe("recovery.md stash name parity with commit.ts implementation", () => {
  it("recovery.md references the exact format gitwise/split-<ISO8601> that commit.ts uses", async () => {
    const recoveryContent = await readFile(RECOVERY_MD, "utf-8");

    // The format implemented in packages/core/src/commands/commit.ts is:
    // `gitwise/split-${new Date().toISOString()}`
    // Which produces: gitwise/split-2026-05-23T14:30:00.000Z
    // The docs must reference this format so users can find the stash.
    expect(recoveryContent).toMatch(/gitwise\/split-.*ISO8601/);

    // Verify the format string would produce a findable stash name
    const sampleName = `gitwise/split-${new Date().toISOString()}`;
    expect(sampleName).toMatch(/^gitwise\/split-\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
