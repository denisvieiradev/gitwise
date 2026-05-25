import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { commit } from "../src/commands/commit.js";
import { MockLLMProvider } from "../src/testing/mock-llm-provider.js";

const exec = promisify(execFile);

async function initRepo(dir: string): Promise<void> {
  await exec("git", ["init"], { cwd: dir });
  await exec("git", ["config", "user.email", "test@test.com"], { cwd: dir });
  await exec("git", ["config", "user.name", "Test"], { cwd: dir });
  await writeFile(join(dir, "README.md"), "# Test");
  await exec("git", ["add", "."], { cwd: dir });
  await exec("git", ["commit", "-m", "initial commit"], { cwd: dir });
}

// ─── Blocked patterns ─────────────────────────────────────────────────────────
// Every entry in SENSITIVE_PATTERNS (commit.ts:44-60) must be covered by at
// least one representative path below. If a pattern is ever removed from
// production code, the corresponding test case here will still pass — but the
// reverse is also true: adding a new pattern without a test case here will
// prompt the author to extend this suite.

describe("sensitive-file blocklist — blocked patterns", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gitwise-blocklist-"));
    await initRepo(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it.each([
    // /^\.env$/ — exact bare .env
    ".env",
    // /^\.env\./ — .env with any suffix
    ".env.local",
    ".env.production",
    ".env.test",
    // /\.pem$/ — PEM certificate/key files
    "cert.pem",
    // /\.key$/ — generic key files
    "private.key",
    // /^id_rsa/ — RSA SSH private key (and .pub variant)
    "id_rsa",
    "id_rsa.pub",
    // /^id_dsa/ — DSA SSH private key
    "id_dsa",
    // /^id_ecdsa/ — ECDSA SSH private key
    "id_ecdsa",
    // /^id_ed25519/ — Ed25519 SSH private key
    "id_ed25519",
    // /credentials\.json$/ — GCP/OAuth credential files
    "credentials.json",
    "google-credentials.json",
    // /secrets\.json$/ — secrets store files
    "secrets.json",
    // /auth\.json$/ — auth config files
    "auth.json",
    // /service-account\.json$/ — GCP service account keys
    "service-account.json",
    // /\.p12$/ — PKCS#12 certificate bundles
    "cert.p12",
    // /\.pfx$/ — PFX (PKCS#12 variant)
    "cert.pfx",
    // /\.pkcs12$/ — explicit PKCS#12 extension
    "cert.pkcs12",
  ])("blocks '%s' from commit with SENSITIVE_FILE_BLOCKED", async (filename) => {
    await writeFile(join(tempDir, filename), "sensitive content");
    await exec("git", ["add", "--", filename], { cwd: tempDir });

    await expect(
      commit({ cwd: tempDir, provider: new MockLLMProvider() })
    ).rejects.toMatchObject({ code: "SENSITIVE_FILE_BLOCKED" });
  });
});

// ─── Anti-overmatch ───────────────────────────────────────────────────────────
// These paths must NOT be blocked. A future change that causes the blocklist to
// match these will fail this suite.

describe("sensitive-file blocklist — anti-overmatch (safe paths must not be blocked)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gitwise-blocklist-safe-"));
    await initRepo(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it.each([
    // Standard source / config files referenced in task spec
    "index.ts",
    "README.md",
    "package.json",
    // Additional cases: names that partially overlap with blocked patterns
    "config.json",              // ends with .json but is not a blocked pattern
    "environment.ts",           // contains 'env' but does not start with '.env'
    "app-credentials-example.txt", // contains 'credentials' but not *.credentials.json
  ])("does not block '%s' from the sensitive-file check", async (filename) => {
    const mock = new MockLLMProvider();

    await writeFile(join(tempDir, filename), `export const value = "safe file";`);
    await exec("git", ["add", "--", filename], { cwd: tempDir });

    // commit() must not throw SENSITIVE_FILE_BLOCKED.
    // It may succeed (returning a CommitPlan) or throw a different error.
    const result = await commit({ cwd: tempDir, provider: mock }).catch((e: unknown) => e);
    if (result instanceof Error) {
      expect((result as Error & { code?: string }).code).not.toBe("SENSITIVE_FILE_BLOCKED");
    }
  });
});
