import { describe, it, expect, jest, afterEach } from "@jest/globals";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const SRC_ROOT = join(__dirname, "../src");

function walkTs(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      files.push(...walkTs(join(dir, entry.name)));
    } else if (entry.name.endsWith(".ts")) {
      files.push(join(dir, entry.name));
    }
  }
  return files;
}

// ─── Static scans ────────────────────────────────────────────────────────────

describe("subprocess argument safety — static scan", () => {
  it("no file under packages/core/src/ contains shell: true", () => {
    const files = walkTs(SRC_ROOT);
    const violations = files.filter((file) => {
      const content = readFileSync(file, "utf8");
      return /shell\s*:\s*true/.test(content);
    });
    expect(violations).toHaveLength(0);
  });

  it("no file under packages/core/src/ uses the shell-executing child_process.exec() variant", () => {
    const files = walkTs(SRC_ROOT);
    const violations = files.filter((file) => {
      const content = readFileSync(file, "utf8");
      return /child_process\.exec\s*\(/.test(content);
    });
    expect(violations).toHaveLength(0);
  });
});

// ─── Runtime array-args assertions (git.ts) ──────────────────────────────────

describe("subprocess argument safety — runtime array-args assertion (git.ts)", () => {
  afterEach(() => {
    jest.dontMock("node:child_process");
    jest.resetModules();
  });

  it("git.status() calls execFile with 'git' as command", async () => {
    const capturedCalls: Array<{ cmd: string; args: unknown }> = [];

    jest.resetModules();
    jest.unstable_mockModule("node:child_process", () => ({
      execFile: (
        cmd: string,
        args: string[],
        _opts: unknown,
        cb: (err: null, result: { stdout: string; stderr: string }) => void,
      ): void => {
        capturedCalls.push({ cmd, args });
        cb(null, { stdout: "", stderr: "" });
      },
    }));

    const git = await import("../src/infra/git.js");
    await git.status("/tmp");

    expect(capturedCalls.length).toBeGreaterThan(0);
    for (const call of capturedCalls) {
      expect(call.cmd).toBe("git");
    }
  });

  it("git.status() passes ['status', '--porcelain'] as an array to execFile (not a string)", async () => {
    const capturedCalls: Array<{ cmd: string; args: string[] }> = [];

    jest.resetModules();
    jest.unstable_mockModule("node:child_process", () => ({
      execFile: (
        cmd: string,
        args: string[],
        _opts: unknown,
        cb: (err: null, result: { stdout: string; stderr: string }) => void,
      ): void => {
        capturedCalls.push({ cmd, args });
        cb(null, { stdout: "", stderr: "" });
      },
    }));

    const git = await import("../src/infra/git.js");
    await git.status("/tmp");

    expect(capturedCalls.length).toBeGreaterThan(0);
    const firstCall = capturedCalls[0]!;
    expect(Array.isArray(firstCall.args)).toBe(true);
    expect(firstCall.args).toEqual(["status", "--porcelain"]);
  });

  it("git.getStagedFilesList() calls execFile with array args (not a shell string)", async () => {
    const capturedCalls: Array<{ cmd: string; args: unknown }> = [];

    jest.resetModules();
    jest.unstable_mockModule("node:child_process", () => ({
      execFile: (
        cmd: string,
        args: string[],
        _opts: unknown,
        cb: (err: null, result: { stdout: string; stderr: string }) => void,
      ): void => {
        capturedCalls.push({ cmd, args });
        cb(null, { stdout: "src/index.ts\n", stderr: "" });
      },
    }));

    const git = await import("../src/infra/git.js");
    await git.getStagedFilesList("/tmp");

    expect(capturedCalls.length).toBeGreaterThan(0);
    for (const call of capturedCalls) {
      expect(Array.isArray(call.args)).toBe(true);
      expect(call.cmd).toBe("git");
    }
  });
});

// ─── Runtime array-args assertions (github.ts) ───────────────────────────────

describe("subprocess argument safety — runtime array-args assertion (github.ts)", () => {
  afterEach(() => {
    jest.dontMock("node:child_process");
    jest.resetModules();
  });

  it("createPR() calls execFile with 'gh' as command and array args", async () => {
    const capturedCalls: Array<{ cmd: string; args: unknown }> = [];

    jest.resetModules();
    jest.unstable_mockModule("node:child_process", () => ({
      execFile: (
        cmd: string,
        args: string[],
        _opts: unknown,
        cb: (err: null, result: { stdout: string; stderr: string }) => void,
      ): void => {
        capturedCalls.push({ cmd, args });
        cb(null, { stdout: "https://github.com/org/repo/pull/1\n", stderr: "" });
      },
    }));

    const { createPR } = await import("../src/infra/github.js");
    await createPR({ title: "Test PR", body: "body text", cwd: "/tmp" });

    expect(capturedCalls.length).toBeGreaterThan(0);
    for (const call of capturedCalls) {
      expect(call.cmd).toBe("gh");
      expect(Array.isArray(call.args)).toBe(true);
    }
  });

  it("createPR() passes ['pr', 'create', '--title', ..., '--body', ...] — title and body as discrete array elements", async () => {
    const capturedCalls: Array<{ cmd: string; args: string[] }> = [];

    jest.resetModules();
    jest.unstable_mockModule("node:child_process", () => ({
      execFile: (
        cmd: string,
        args: string[],
        _opts: unknown,
        cb: (err: null, result: { stdout: string; stderr: string }) => void,
      ): void => {
        capturedCalls.push({ cmd, args });
        cb(null, { stdout: "https://github.com/org/repo/pull/1\n", stderr: "" });
      },
    }));

    const { createPR } = await import("../src/infra/github.js");
    await createPR({ title: "Test PR", body: "body text", cwd: "/tmp" });

    expect(capturedCalls.length).toBeGreaterThan(0);
    const firstCall = capturedCalls[0]!;
    expect(firstCall.args).toContain("pr");
    expect(firstCall.args).toContain("create");
    expect(firstCall.args).toContain("--title");
    expect(firstCall.args).toContain("--body");
    // The title and body must be separate array elements, never shell-interpolated
    const titleIdx = firstCall.args.indexOf("--title");
    expect(firstCall.args[titleIdx + 1]).toBe("Test PR");
    const bodyIdx = firstCall.args.indexOf("--body");
    expect(firstCall.args[bodyIdx + 1]).toBe("body text");
  });
});

// ─── Runtime array-args assertions (claude-code.ts) ──────────────────────────

describe("subprocess argument safety — runtime array-args assertion (claude-code.ts)", () => {
  afterEach(() => {
    jest.dontMock("node:child_process");
    jest.resetModules();
  });

  it("ClaudeCodeProvider.chat() calls execFile with array args (not a shell string)", async () => {
    const capturedCalls: Array<{ cmd: string; args: unknown }> = [];
    const fakeResponse = JSON.stringify({
      result: "test response",
      is_error: false,
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    jest.resetModules();
    jest.unstable_mockModule("node:child_process", () => ({
      execFile: (
        cmd: string,
        args: string[],
        _opts: unknown,
        cb: (err: null, result: { stdout: string; stderr: string }) => void,
      ): void => {
        capturedCalls.push({ cmd, args });
        cb(null, { stdout: fakeResponse, stderr: "" });
      },
      execSync: () => Buffer.from(""),
      spawn: () => ({}),
    }));

    const { ClaudeCodeProvider } = await import("../src/providers/claude-code.js");
    const provider = new ClaudeCodeProvider(
      { fast: "claude-haiku-4-5-20251001", balanced: "claude-sonnet-4-6", powerful: "claude-opus-4-7" },
      "/fake/claude",
    );

    await provider.chat({ systemPrompt: "system prompt", userMessage: "user message", tier: "fast" });

    expect(capturedCalls.length).toBeGreaterThan(0);
    for (const call of capturedCalls) {
      expect(Array.isArray(call.args)).toBe(true);
    }
  });

  it("ClaudeCodeProvider.chat() passes the binary path as a discrete first argument, not shell-interpolated", async () => {
    const capturedCalls: Array<{ cmd: string; args: string[] }> = [];
    const fakeResponse = JSON.stringify({
      result: "test",
      is_error: false,
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    jest.resetModules();
    jest.unstable_mockModule("node:child_process", () => ({
      execFile: (
        cmd: string,
        args: string[],
        _opts: unknown,
        cb: (err: null, result: { stdout: string; stderr: string }) => void,
      ): void => {
        capturedCalls.push({ cmd, args });
        cb(null, { stdout: fakeResponse, stderr: "" });
      },
      execSync: () => Buffer.from(""),
      spawn: () => ({}),
    }));

    const { ClaudeCodeProvider } = await import("../src/providers/claude-code.js");
    const fakeBinary = "/usr/local/bin/claude";
    const provider = new ClaudeCodeProvider(
      { fast: "claude-haiku-4-5-20251001", balanced: "claude-sonnet-4-6", powerful: "claude-opus-4-7" },
      fakeBinary,
    );

    await provider.chat({ systemPrompt: "system", userMessage: "test", tier: "fast" });

    expect(capturedCalls.length).toBeGreaterThan(0);
    const firstCall = capturedCalls[0]!;
    expect(firstCall.cmd).toBe(fakeBinary);
    expect(typeof firstCall.cmd).toBe("string");
    expect(Array.isArray(firstCall.args)).toBe(true);
  });
});

// ─── Integration: representative commit-flow subprocess calls ─────────────────

describe("subprocess argument safety — integration (representative commit flow subprocess calls)", () => {
  afterEach(() => {
    jest.dontMock("node:child_process");
    jest.resetModules();
  });

  it("every execFile call during getStagedFilesList + getStagedDiff uses an array as the second argument", async () => {
    const capturedCalls: Array<{ cmd: string; args: unknown }> = [];

    jest.resetModules();
    jest.unstable_mockModule("node:child_process", () => ({
      execFile: (
        cmd: string,
        args: string[],
        _opts: unknown,
        cb: (err: null, result: { stdout: string; stderr: string }) => void,
      ): void => {
        capturedCalls.push({ cmd, args });
        cb(null, { stdout: "src/index.ts\n", stderr: "" });
      },
    }));

    const git = await import("../src/infra/git.js");

    // Simulate the pre-LLM portion of a typical commit flow
    await git.getStagedFilesList("/tmp");
    await git.getStagedDiff("/tmp");
    await git.status("/tmp");

    expect(capturedCalls.length).toBeGreaterThan(0);
    const badCalls = capturedCalls.filter((c) => !Array.isArray(c.args));
    expect(badCalls).toHaveLength(0);
  });
});
