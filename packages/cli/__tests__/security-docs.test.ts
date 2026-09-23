import { describe, it, expect, beforeAll } from "@jest/globals";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function findRepoRoot(): string {
  let dir = resolve(process.cwd());
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "packages")) && existsSync(join(dir, "SECURITY.md"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Could not locate repo root from cwd " + process.cwd());
}

const REPO_ROOT = findRepoRoot();
const KEYS_ASC_PATH = join(REPO_ROOT, "KEYS.asc");
const SECURITY_MD_PATH = join(REPO_ROOT, "SECURITY.md");
const COC_PATH = join(REPO_ROOT, "CODE_OF_CONDUCT.md");

async function findGpg(): Promise<string | null> {
  for (const candidate of [
    "/opt/homebrew/bin/gpg",
    "/usr/local/bin/gpg",
    "/usr/bin/gpg",
    "gpg",
    "gpg2",
  ]) {
    try {
      await execFileAsync(candidate, ["--version"]);
      return candidate;
    } catch {
      // not found, try next
    }
  }
  return null;
}

describe("KEYS.asc", () => {
  it("exists at the repo root", () => {
    expect(existsSync(KEYS_ASC_PATH)).toBe(true);
  });

  it("starts with -----BEGIN PGP PUBLIC KEY BLOCK-----", async () => {
    const content = await readFile(KEYS_ASC_PATH, "utf-8");
    expect(content.trimStart()).toMatch(/^-----BEGIN PGP PUBLIC KEY BLOCK-----/);
  });

  it("ends with -----END PGP PUBLIC KEY BLOCK-----", async () => {
    const content = await readFile(KEYS_ASC_PATH, "utf-8");
    expect(content.trimEnd()).toMatch(/-----END PGP PUBLIC KEY BLOCK-----\s*$/);
  });
});

describe("SECURITY.md structure", () => {
  let securityContent: string;

  beforeAll(async () => {
    securityContent = await readFile(SECURITY_MD_PATH, "utf-8");
  });

  it("contains an H2 section titled Supply Chain", () => {
    expect(securityContent).toMatch(/^## Supply Chain/m);
  });

  it("contains an H3 Key Rotation subsection", () => {
    expect(securityContent).toMatch(/^### Key Rotation/m);
  });

  it("contains a 40-character uppercase hex fingerprint", () => {
    // Matches both compact (40 chars) and grouped (with spaces) forms
    const compactFingerprintRe = /[0-9A-F]{40}/;
    const groupedFingerprintRe = /([0-9A-F]{4}\s){9}[0-9A-F]{4}/;
    const hasCompact = compactFingerprintRe.test(securityContent);
    const hasGrouped = groupedFingerprintRe.test(securityContent);
    expect(hasCompact || hasGrouped).toBe(true);
  });

  it("contains a gpg --verify or git tag -v example", () => {
    expect(securityContent).toMatch(/gpg --verify|git tag -v/);
  });

  it("links to docs/supply-chain.md as a forward reference", () => {
    expect(securityContent).toMatch(/docs\/supply-chain\.md/);
  });

  it("links to CODE_OF_CONDUCT.md for conduct issues", () => {
    expect(securityContent).toMatch(/CODE_OF_CONDUCT\.md/);
  });

  it("links to KEYS.asc", () => {
    expect(securityContent).toMatch(/KEYS\.asc/);
  });
});

// DOC-01 (consistency with README Privacy): the data-egress claim in
// "Security by Design" must depend on the configured provider, not name Claude alone.
describe("SECURITY.md data-egress claim is provider-conditional", () => {
  let designSection: string;

  beforeAll(async () => {
    const content = await readFile(SECURITY_MD_PATH, "utf-8");
    const start = content.indexOf("## Security by Design");
    expect(start).toBeGreaterThanOrEqual(0);
    const next = content.indexOf("\n## ", start + 1);
    designSection = content.slice(start, next === -1 ? undefined : next);
  });

  it("does not claim diffs go unconditionally to Claude", () => {
    expect(designSection).not.toMatch(/Diffs are sent to Claude/);
  });

  it("says diffs go to the vendor behind the configured provider", () => {
    expect(designSection).toMatch(/Diffs are sent to the vendor behind the `provider` you configure/);
  });

  it.each([
    ["api", "Anthropic"],
    ["claude-code", "Anthropic"],
    ["codex", "OpenAI"],
    ["copilot", "GitHub"],
    ["kiro", "AWS"],
  ])("maps provider %s to vendor %s", (provider, vendor) => {
    const egressBullet = designSection.split("\n").find((l) => l.startsWith("- **Diffs are sent")) ?? "";
    // "<Vendor> for ... `<provider>`" within one comma-delimited clause.
    expect(egressBullet).toMatch(new RegExp(`${vendor} for [^,]*\`${provider}\``));
  });
});

// The subprocess claim in "Security by Design" must name every CLI binary
// gitwise spawns, including the Codex, Copilot and Kiro provider CLIs.
describe("SECURITY.md subprocess claim covers every provider CLI", () => {
  let subprocessBullet: string;

  beforeAll(async () => {
    const content = await readFile(SECURITY_MD_PATH, "utf-8");
    const start = content.indexOf("## Security by Design");
    expect(start).toBeGreaterThanOrEqual(0);
    const next = content.indexOf("\n## ", start + 1);
    const designSection = content.slice(start, next === -1 ? undefined : next);
    subprocessBullet =
      designSection.split("\n").find((l) => l.includes("invoked as subprocesses")) ?? "";
  });

  it("keeps the no-shell subprocess claim", () => {
    expect(subprocessBullet).toMatch(/invoked as subprocesses with no `shell: true`/);
  });

  it.each(["gh", "claude", "codex", "copilot", "kiro-cli"])("names the `%s` binary", (binary) => {
    expect(subprocessBullet).toContain(`\`${binary}\``);
  });
});

describe("Fingerprint parity: KEYS.asc matches SECURITY.md", () => {
  it("fingerprint from KEYS.asc matches the fingerprint quoted in SECURITY.md", async () => {
    const gpg = await findGpg();
    if (!gpg) {
      console.warn("gpg not found on PATH — skipping fingerprint parity integration test");
      return;
    }

    // Parse the fingerprint from KEYS.asc using gpg
    const { stdout } = await execFileAsync(gpg, [
      "--with-fingerprint",
      "--show-keys",
      KEYS_ASC_PATH,
    ]);

    // GPG outputs fingerprints in grouped form: "E735 55F2 E6F5 ..."
    // Compact to 40-char hex for comparison
    const fingerprintLineMatch = stdout.match(/^\s+([0-9A-F]{4}(?:\s+[0-9A-F]{4})+)\s*$/m);
    expect(fingerprintLineMatch).not.toBeNull();
    const fingerprintFromKey = (fingerprintLineMatch?.[1] ?? "").replace(/\s+/g, "");

    // Read SECURITY.md and find the compact fingerprint
    const securityContent = await readFile(SECURITY_MD_PATH, "utf-8");
    const compactMatch = securityContent.match(/[0-9A-F]{40}/);
    expect(compactMatch).not.toBeNull();
    const fingerprintFromDoc = compactMatch?.[0] ?? "";

    expect(fingerprintFromKey).toBe(fingerprintFromDoc);
  });

  it("gpg --verify example in SECURITY.md has syntactically valid command structure", async () => {
    const securityContent = await readFile(SECURITY_MD_PATH, "utf-8");
    // Extract the gpg --verify or git tag -v line(s) from code blocks
    const codeBlocks = [...securityContent.matchAll(/```sh\n([\s\S]*?)\n```/g)].map(
      (m) => m[1] ?? ""
    );
    const verifyLines = codeBlocks
      .flatMap((b) => b.split("\n"))
      .filter((l) => l.includes("gpg --verify") || l.includes("git tag -v"));

    expect(verifyLines.length).toBeGreaterThan(0);
    for (const line of verifyLines) {
      // Must contain a version placeholder or actual version pattern
      expect(line).toMatch(/v<version>|v\d+\.\d+\.\d+/);
    }
  });
});
