import { describe, it, expect, afterEach, jest } from "@jest/globals";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, writeFileSync, chmodSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClaudeCodeProvider, resolveClaudeBinary } from "../../../src/providers/claude-code.js";
import type { GitwiseError } from "../../../src/errors.js";

const DEFAULT_MODELS = {
  fast: "claude-haiku-4-5-20251001",
  balanced: "claude-sonnet-4-6",
  powerful: "claude-opus-4-7",
};

// This fixture only responds once it observes EOF on stdin — exactly how the
// real `claude` CLI behaves. It reproduces the hang that `execFile`'s async
// variant causes when a caller passes an `input` option: that option is only
// honored by the *synchronous* exec family, so stdin is silently left open.
function writeStdinEchoFixture(): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "gitwise-claude-fixture-"));
  const path = join(dir, "fake-claude");
  writeFileSync(
    path,
    `#!/usr/bin/env node
let data = "";
process.stdin.on("data", (c) => { data += c; });
process.stdin.on("end", () => {
  process.stdout.write(JSON.stringify({
    result: "ok",
    is_error: false,
    usage: { input_tokens: 1, output_tokens: 2 },
  }));
  process.exit(0);
});
`,
  );
  chmodSync(path, 0o755);
  return { dir, path };
}

describe("ClaudeCodeProvider — direct-arg (small prompt) stdin handling", () => {
  let fixtureDir: string | undefined;

  afterEach(() => {
    if (fixtureDir) rmSync(fixtureDir, { recursive: true, force: true });
    fixtureDir = undefined;
  });

  it("resolves promptly instead of hanging when the CLI only replies after stdin closes", async () => {
    const fixture = writeStdinEchoFixture();
    fixtureDir = fixture.dir;

    const provider = new ClaudeCodeProvider(DEFAULT_MODELS, fixture.path);

    const response = await provider.chat({
      systemPrompt: "system prompt",
      userMessage: "short user message",
      tier: "fast",
    });

    expect(response.content).toBe("ok");
  }, 8000);
});

// ---------------------------------------------------------------------------
// Characterization tests (pre-refactor safety net for AD-001 extraction).
// Each fixture is a fake `claude` executable that records the argv and stdin
// it received into a sidecar JSON file, then emits a scripted stdout/stderr
// and exit code — exercising the real spawn path end to end.
// ---------------------------------------------------------------------------

interface FakeCliBehavior {
  stdout: string;
  stderr?: string;
  exitCode?: number;
}

interface FakeCli {
  dir: string;
  path: string;
  recorded(): { argv: string[]; stdin: string };
}

function writeRecordingFixture(behavior: FakeCliBehavior): FakeCli {
  const dir = mkdtempSync(join(tmpdir(), "gitwise-claude-char-"));
  const path = join(dir, "fake-claude");
  const recordPath = join(dir, "record.json");
  writeFileSync(
    path,
    `#!/usr/bin/env node
const fs = require("node:fs");
let data = "";
process.stdin.on("data", (c) => { data += c; });
process.stdin.on("end", () => {
  fs.writeFileSync(${JSON.stringify(recordPath)}, JSON.stringify({ argv: process.argv.slice(2), stdin: data }));
  process.stdout.write(${JSON.stringify(behavior.stdout)});
  process.stderr.write(${JSON.stringify(behavior.stderr ?? "")});
  process.exit(${behavior.exitCode ?? 0});
});
`,
  );
  chmodSync(path, 0o755);
  return {
    dir,
    path,
    recorded: () => JSON.parse(readFileSync(recordPath, "utf8")),
  };
}

const SUCCESS_JSON = JSON.stringify({
  result: "generated text",
  is_error: false,
  usage: { input_tokens: 123, output_tokens: 45 },
});

describe("ClaudeCodeProvider — characterization", () => {
  let fixtureDir: string | undefined;

  afterEach(() => {
    if (fixtureDir) rmSync(fixtureDir, { recursive: true, force: true });
    fixtureDir = undefined;
  });

  function fixture(behavior: FakeCliBehavior): FakeCli {
    const f = writeRecordingFixture(behavior);
    fixtureDir = f.dir;
    return f;
  }

  it("spawn success: returns the CLI's result text and exact usage token counts", async () => {
    const f = fixture({ stdout: SUCCESS_JSON });
    const provider = new ClaudeCodeProvider(DEFAULT_MODELS, f.path);

    const response = await provider.chat({ systemPrompt: "sys", userMessage: "hello", tier: "fast" });

    expect(response.content).toBe("generated text");
    expect(response.tokens).toEqual({ input: 123, output: 45 });
    expect(response.tokensAvailable).toBe(true);
  });

  it("small prompt: passes the user message via argv (-p) with system prompt, tier model, and json output format; stdin is empty", async () => {
    const f = fixture({ stdout: SUCCESS_JSON });
    const provider = new ClaudeCodeProvider(DEFAULT_MODELS, f.path);

    await provider.chat({ systemPrompt: "the system", userMessage: "the user msg", tier: "powerful" });

    const { argv, stdin } = f.recorded();
    expect(argv).toEqual([
      "-p",
      "the user msg",
      "--system-prompt",
      "the system",
      "--model",
      DEFAULT_MODELS.powerful,
      "--output-format",
      "json",
    ]);
    expect(stdin).toBe("");
  });

  it("large prompt (> 100_000 chars): sends the user message over stdin and omits it from argv", async () => {
    const f = fixture({ stdout: SUCCESS_JSON });
    const provider = new ClaudeCodeProvider(DEFAULT_MODELS, f.path);
    const big = "x".repeat(100_001);

    const response = await provider.chat({ systemPrompt: "sys", userMessage: big, tier: "balanced" });

    const { argv, stdin } = f.recorded();
    expect(argv).toEqual([
      "-p",
      "--system-prompt",
      "sys",
      "--model",
      DEFAULT_MODELS.balanced,
      "--output-format",
      "json",
    ]);
    expect(stdin).toBe(big);
    expect(response.content).toBe("generated text");
  });

  it("prompt of exactly 100_000 chars still travels via argv (threshold is strictly greater-than)", async () => {
    const f = fixture({ stdout: SUCCESS_JSON });
    const provider = new ClaudeCodeProvider(DEFAULT_MODELS, f.path);
    const edge = "y".repeat(100_000);

    await provider.chat({ systemPrompt: "sys", userMessage: edge, tier: "fast" });

    const { argv, stdin } = f.recorded();
    expect(argv[1]).toBe(edge);
    expect(stdin).toBe("");
  });

  it("non-zero exit with parseable is_error stdout: rejects with the CLI's own error result", async () => {
    const f = fixture({
      stdout: JSON.stringify({ result: "Invalid API key", is_error: true }),
      exitCode: 1,
    });
    const provider = new ClaudeCodeProvider(DEFAULT_MODELS, f.path);

    await expect(
      provider.chat({ systemPrompt: "sys", userMessage: "hi", tier: "fast" }),
    ).rejects.toThrow("Claude CLI error: Invalid API key");
  });

  it("non-zero exit without JSON stdout: rejects with exit code and stderr, filtering the 'no stdin data' warning", async () => {
    const f = fixture({
      stdout: "not json",
      stderr: "Warning: no stdin data received in 3s\nreal failure reason\n",
      exitCode: 2,
    });
    const provider = new ClaudeCodeProvider(DEFAULT_MODELS, f.path);

    const err = await provider
      .chat({ systemPrompt: "sys", userMessage: "hi", tier: "fast" })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("Claude CLI exited with code 2: real failure reason");
  });

  it("non-zero exit with empty stderr: rejects with the exit code only", async () => {
    const f = fixture({ stdout: "", stderr: "", exitCode: 3 });
    const provider = new ClaudeCodeProvider(DEFAULT_MODELS, f.path);

    await expect(
      provider.chat({ systemPrompt: "sys", userMessage: "hi", tier: "fast" }),
    ).rejects.toThrow(/^Claude CLI exited with code 3$/);
  });

  it("exit 0 but is_error in JSON: rejects with 'Claude CLI returned error'", async () => {
    const f = fixture({ stdout: JSON.stringify({ result: "quota exceeded", is_error: true }) });
    const provider = new ClaudeCodeProvider(DEFAULT_MODELS, f.path);

    await expect(
      provider.chat({ systemPrompt: "sys", userMessage: "hi", tier: "fast" }),
    ).rejects.toThrow("Claude CLI returned error: quota exceeded");
  });

  it("exit 0 without a usage object: reports tokens as 0/0", async () => {
    const f = fixture({ stdout: JSON.stringify({ result: "no usage here", is_error: false }) });
    const provider = new ClaudeCodeProvider(DEFAULT_MODELS, f.path);

    const response = await provider.chat({ systemPrompt: "sys", userMessage: "hi", tier: "fast" });

    expect(response.content).toBe("no usage here");
    expect(response.tokens).toEqual({ input: 0, output: 0 });
    // Claude Code always reports usage: a missing block is genuine zero, not "unavailable".
    expect(response.tokensAvailable).toBe(true);
  });

  it("binary missing (ENOENT): rejects with GitwiseError PROVIDER_UNAVAILABLE naming the binary path", async () => {
    // Node's own spawn ENOENT error is created in the host realm, which fails
    // `instanceof Error` inside Jest's VM sandbox. Mock `spawn` so the child
    // emits an ENOENT error shaped exactly like Node's (message + code) but
    // created in the sandbox realm, exercising the provider's wrapping branch.
    const missing = join(tmpdir(), "gitwise-definitely-missing-claude-binary");
    await jest.isolateModulesAsync(async () => {
      jest.unstable_mockModule("node:child_process", () => ({
        execSync: jest.fn(),
        spawn: jest.fn((binary: string) => {
          const child = new EventEmitter() as EventEmitter & {
            stdout: EventEmitter;
            stderr: EventEmitter;
            stdin: { write: () => void; end: () => void };
          };
          child.stdout = new EventEmitter();
          child.stderr = new EventEmitter();
          child.stdin = { write: () => undefined, end: () => undefined };
          process.nextTick(() => {
            const err = Object.assign(new Error(`spawn ${binary} ENOENT`), { code: "ENOENT" });
            child.emit("error", err);
            child.emit("close", -2);
          });
          return child;
        }),
      }));
      const { ClaudeCodeProvider: Isolated } = await import("../../../src/providers/claude-code.js");
      const { GitwiseError: IsolatedGitwiseError } = await import("../../../src/errors.js");
      const provider = new Isolated(DEFAULT_MODELS, missing);

      const err = await provider
        .chat({ systemPrompt: "sys", userMessage: "hi", tier: "fast" })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(IsolatedGitwiseError);
      expect((err as GitwiseError).code).toBe("PROVIDER_UNAVAILABLE");
      expect((err as GitwiseError).message).toContain(missing);
    });
  });
});

describe("resolveClaudeBinary — explicit path precedence", () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("returns the explicit custom path when it is executable", () => {
    dir = mkdtempSync(join(tmpdir(), "gitwise-resolve-"));
    const p = join(dir, "claude");
    writeFileSync(p, "#!/bin/sh\n");
    chmodSync(p, 0o755);

    expect(resolveClaudeBinary(p)).toBe(p);
  });

  it("returns null for an explicit custom path that is not executable (no fallback search)", () => {
    dir = mkdtempSync(join(tmpdir(), "gitwise-resolve-"));
    const p = join(dir, "claude");
    writeFileSync(p, "not executable");
    chmodSync(p, 0o644);

    expect(resolveClaudeBinary(p)).toBeNull();
  });
});
