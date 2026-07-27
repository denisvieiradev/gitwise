import { describe, it, expect, afterEach } from "@jest/globals";
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClaudeCodeProvider } from "../../../src/providers/claude-code.js";

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
