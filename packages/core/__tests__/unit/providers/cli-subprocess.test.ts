import { describe, it, expect, afterEach } from "@jest/globals";
import { mkdtempSync, rmSync, writeFileSync, chmodSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CliSubprocessProvider } from "../../../src/providers/cli-subprocess.js";
import type { CliProviderSpec } from "../../../src/providers/types.js";

const MODELS = { fast: "m-fast", balanced: "m-bal", powerful: "m-pow" };

// Minimal spec: prompt via argv (or "-" + stdin when large), stdout returned verbatim.
function makeSpec(overrides: Partial<CliProviderSpec> = {}): CliProviderSpec {
  return {
    toolName: "Fake CLI",
    installHint: "Re-run `gw provider`.",
    defaultCommand: "fake-cli-not-installed",
    foldSystemPrompt: true,
    resolveBinary: () => null,
    buildArgs: ({ prompt, large }) => (large ? ["-"] : [prompt]),
    parseOutput: (stdout) => ({ content: stdout, tokens: null }),
    ...overrides,
  };
}

let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

function script(body: string): { path: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "gitwise-clisub-"));
  dirs.push(dir);
  const path = join(dir, "fake");
  writeFileSync(path, `#!/usr/bin/env node\n${body}\n`);
  chmodSync(path, 0o755);
  return { path, dir };
}

const req = (userMessage: string) => ({ systemPrompt: "SYS", userMessage, tier: "fast" as const });

describe("CliSubprocessProvider", () => {
  it("folds the system prompt into the prompt and reports tokensAvailable:false when the spec returns null tokens", async () => {
    const f = script(`process.stdin.resume(); process.stdin.on("end", () => process.stdout.write(process.argv[2]));`);
    const provider = new CliSubprocessProvider(makeSpec(), MODELS, f.path);

    const res = await provider.chat(req("USER"));

    expect(res.content).toBe("SYS\n\nUSER");
    expect(res.tokens).toEqual({ input: 0, output: 0 });
    expect(res.tokensAvailable).toBe(false);
  });

  it("decodes multi-byte UTF-8 output split across stdout chunks without corruption", async () => {
    // "日本" = e6 97 a5 e6 9c ac — split mid-character across two writes.
    const f = script(`
process.stdin.resume();
process.stdin.on("end", () => {
  const b = Buffer.from("日本", "utf8");
  process.stdout.write(b.subarray(0, 2));
  setTimeout(() => { process.stdout.write(b.subarray(2)); }, 50);
});`);
    const provider = new CliSubprocessProvider(makeSpec(), MODELS, f.path);

    const res = await provider.chat(req("x"));

    expect(res.content).toBe("日本");
  });

  it("measures the stdin threshold in UTF-8 bytes: a < 100_000-char prompt over 100_000 bytes goes via stdin", async () => {
    const f = script(`
const fs = require("node:fs");
const chunks = [];
process.stdin.on("data", (c) => { chunks.push(c); });
process.stdin.on("end", () => {
  fs.writeFileSync(__dirname + "/rec.json", JSON.stringify({ argv: process.argv.slice(2), stdinLen: Buffer.concat(chunks).length }));
  process.stdout.write("ok");
});`);
    const provider = new CliSubprocessProvider(makeSpec({ foldSystemPrompt: false }), MODELS, f.path);
    const cjk = "日".repeat(40_000); // 40_000 chars, 120_000 bytes

    await provider.chat(req(cjk));

    const rec = JSON.parse(readFileSync(join(f.dir, "rec.json"), "utf8"));
    expect(rec.argv).toEqual(["-"]);
    expect(rec.stdinLen).toBe(120_000);
  });

  it("rejects with the CLI's stderr (no crash) when the CLI exits without reading a large stdin payload", async () => {
    const f = script(`process.stderr.write("auth expired"); process.exit(1);`);
    const provider = new CliSubprocessProvider(makeSpec(), MODELS, f.path);

    await expect(provider.chat(req("z".repeat(2_000_000)))).rejects.toThrow(
      "Fake CLI exited with code 1: auth expired",
    );
  });

  it("names the terminating signal instead of 'code null' when the CLI is killed", async () => {
    const f = script(`process.stdin.resume(); process.stdin.on("end", () => process.kill(process.pid, "SIGTERM"));`);
    const provider = new CliSubprocessProvider(makeSpec(), MODELS, f.path);

    const err = await provider.chat(req("x")).catch((e: unknown) => e as Error);

    expect(err.message).toBe("Fake CLI was terminated by signal SIGTERM");
  });

  it("treats an empty-string cliPath as unset and falls back to spec.resolveBinary()", async () => {
    const f = script(`process.stdin.resume(); process.stdin.on("end", () => process.stdout.write("resolved"));`);
    const provider = new CliSubprocessProvider(makeSpec({ resolveBinary: () => f.path }), MODELS, "");

    const res = await provider.chat(req("x"));

    expect(res.content).toBe("resolved");
  });
});
