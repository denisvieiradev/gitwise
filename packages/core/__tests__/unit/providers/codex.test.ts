import { describe, it, expect, afterEach } from "@jest/globals";
import { mkdtempSync, rmSync, writeFileSync, chmodSync, readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { CliSubprocessProvider } from "../../../src/providers/cli-subprocess.js";
import { codexSpec } from "../../../src/providers/codex.js";
import type * as CodexModule from "../../../src/providers/codex.js";
import type { GitwiseError } from "../../../src/errors.js";
import { importWithFakeFs } from "../../_helpers/binary-resolution.js";

const MODELS = { fast: "gpt-fast", balanced: "gpt-bal", powerful: "gpt-pow" };
const CODEX_MODULE = "../../src/providers/codex.js"; // relative to the helper

// Verbatim `codex exec --json` output captured from codex-cli 0.155.1.
const REAL_SUCCESS_JSONL = [
  '{"type":"thread.started","thread_id":"01a0cb4a-ad90-7a21-91bb-f974ab328785"}',
  '{"type":"turn.started"}',
  '{"type":"item.completed","item":{"id":"item_0","type":"error","message":"Skill descriptions were shortened to fit the skills context budget."}}',
  '{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"PONG"}}',
  '{"type":"turn.completed","usage":{"input_tokens":18049,"cached_input_tokens":0,"cache_write_input_tokens":0,"output_tokens":6,"reasoning_output_tokens":0}}',
].join("\n");

const REAL_FAILURE_MESSAGE =
  '{"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The \'no-such-model-xyz\' model is not supported when using Codex with a ChatGPT account."}}';
const REAL_FAILURE_JSONL = [
  '{"type":"thread.started","thread_id":"01a0cb4b-135d-7611-ad5c-ade6e5e8b2de"}',
  '{"type":"turn.started"}',
  JSON.stringify({ type: "error", message: REAL_FAILURE_MESSAGE }),
  JSON.stringify({ type: "turn.failed", error: { message: REAL_FAILURE_MESSAGE } }),
].join("\n");

let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

// Fake `codex` executable: records argv + stdin, then emits scripted output.
function fakeCodex(stdout: string, opts: { stderr?: string; exitCode?: number } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "gitwise-codex-"));
  dirs.push(dir);
  const path = join(dir, "codex");
  writeFileSync(
    path,
    `#!/usr/bin/env node
const fs = require("node:fs");
const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("end", () => {
  fs.writeFileSync(__dirname + "/rec.json", JSON.stringify({ argv: process.argv.slice(2), stdin: Buffer.concat(chunks).toString("utf8") }));
  process.stdout.write(${JSON.stringify(stdout)});
  process.stderr.write(${JSON.stringify(opts.stderr ?? "")});
  process.exit(${opts.exitCode ?? 0});
});
`,
  );
  chmodSync(path, 0o755);
  return { path, recorded: () => JSON.parse(readFileSync(join(dir, "rec.json"), "utf8")) };
}

function fakeCodexRequiringDefaultModel() {
  const dir = mkdtempSync(join(tmpdir(), "gitwise-codex-fallback-"));
  dirs.push(dir);
  const path = join(dir, "codex");
  writeFileSync(
    path,
    [
      "#!/usr/bin/env node",
      'const fs = require("node:fs");',
      'const callsPath = __dirname + "/calls.json";',
      'const calls = fs.existsSync(callsPath) ? JSON.parse(fs.readFileSync(callsPath, "utf8")) : [];',
      "const argv = process.argv.slice(2);",
      "calls.push(argv);",
      "fs.writeFileSync(callsPath, JSON.stringify(calls));",
      "process.stdin.resume();",
      'process.stdin.on("end", () => {',
      '  if (argv.includes("--model")) {',
      "    process.stdout.write(" + JSON.stringify(REAL_FAILURE_JSONL) + ");",
      "    process.exit(1);",
      "  }",
      "  process.stdout.write(" + JSON.stringify(REAL_SUCCESS_JSONL) + ");",
      "});",
    ].join("\n"),
  );
  chmodSync(path, 0o755);
  return { path, calls: () => JSON.parse(readFileSync(join(dir, "calls.json"), "utf8")) as string[][] };
}

const chat = (provider: CliSubprocessProvider, userMessage = "the diff", tier: "fast" | "powerful" = "fast") =>
  provider.chat({ systemPrompt: "You are gitwise.", userMessage, tier });

describe("resolveCodexBinary (PROV-01 AC6: same precedence as resolveClaudeBinary)", () => {
  it("returns an explicit custom path when it is executable", async () => {
    const m = await importWithFakeFs<typeof CodexModule>(CODEX_MODULE, {
      binary: "codex",
      executables: ["/custom/codex", "/opt/homebrew/bin/codex"],
      which: "/usr/bin/codex",
      nvmVersions: null,
    });
    expect(m.resolveCodexBinary("/custom/codex")).toBe("/custom/codex");
  });

  it("returns null for a non-executable explicit path without falling back", async () => {
    const m = await importWithFakeFs<typeof CodexModule>(CODEX_MODULE, {
      binary: "codex",
      executables: ["/opt/homebrew/bin/codex"],
      which: "/opt/homebrew/bin/codex",
      nvmVersions: null,
    });
    expect(m.resolveCodexBinary("/custom/codex")).toBeNull();
  });

  it("prefers a common install path over the PATH lookup", async () => {
    const m = await importWithFakeFs<typeof CodexModule>(CODEX_MODULE, {
      binary: "codex",
      executables: ["/opt/homebrew/bin/codex", "/elsewhere/bin/codex"],
      which: "/elsewhere/bin/codex",
      nvmVersions: null,
    });
    expect(m.resolveCodexBinary()).toBe("/opt/homebrew/bin/codex");
  });

  it("finds the standalone installer location (~/.local/bin/codex) as a common path", async () => {
    const standalone = join(homedir(), ".local", "bin", "codex");
    const m = await importWithFakeFs<typeof CodexModule>(CODEX_MODULE, {
      binary: "codex",
      executables: [standalone],
      which: null,
      nvmVersions: null,
    });
    expect(m.resolveCodexBinary()).toBe(standalone);
  });

  it("falls back to the PATH lookup when no common path exists", async () => {
    const m = await importWithFakeFs<typeof CodexModule>(CODEX_MODULE, {
      binary: "codex",
      executables: ["/elsewhere/bin/codex"],
      which: "/elsewhere/bin/codex",
      nvmVersions: null,
    });
    expect(m.resolveCodexBinary()).toBe("/elsewhere/bin/codex");
  });

  it("falls back to nvm global installs when not in PATH", async () => {
    const nvmBin = join(homedir(), ".nvm", "versions", "node", "v22.12.0", "bin", "codex");
    const m = await importWithFakeFs<typeof CodexModule>(CODEX_MODULE, {
      binary: "codex",
      executables: [nvmBin],
      which: null,
      nvmVersions: ["v20.0.0", "v22.12.0"],
    });
    expect(m.resolveCodexBinary()).toBe(nvmBin);
  });

  it("returns null when Codex is installed nowhere", async () => {
    const m = await importWithFakeFs<typeof CodexModule>(CODEX_MODULE, {
      binary: "codex",
      executables: [],
      which: null,
      nvmVersions: ["v22.12.0"],
    });
    expect(m.resolveCodexBinary()).toBeNull();
  });
});

describe("Codex provider spec (PROV-01, PROV-02)", () => {
  it("AC1: invokes `codex exec` non-interactively with the combined system+user prompt and the tier's model", async () => {
    const cli = fakeCodex(REAL_SUCCESS_JSONL);
    const provider = new CliSubprocessProvider(codexSpec, MODELS, cli.path);

    await chat(provider, "the diff", "powerful");

    const { argv, stdin } = cli.recorded();
    expect(argv).toEqual([
      "exec",
      "--json",
      "--ephemeral",
      "--skip-git-repo-check",
      "--sandbox",
      "read-only",
      "--model",
      "gpt-pow",
      "--",
      "You are gitwise.\n\nthe diff",
    ]);
    expect(stdin).toBe("");
  });

  it("AC1: a large combined prompt is sent over stdin with `-` as the prompt argument", async () => {
    const cli = fakeCodex(REAL_SUCCESS_JSONL);
    const provider = new CliSubprocessProvider(codexSpec, MODELS, cli.path);
    const big = "d".repeat(100_001);

    await chat(provider, big);

    const { argv, stdin } = cli.recorded();
    expect(argv.slice(-2)).toEqual(["--", "-"]);
    expect(argv).not.toContain(big);
    expect(stdin).toBe(`You are gitwise.\n\n${big}`);
  });

  it("AC1: returns the final agent_message text as content", async () => {
    const cli = fakeCodex(REAL_SUCCESS_JSONL);
    const res = await chat(new CliSubprocessProvider(codexSpec, MODELS, cli.path));
    expect(res.content).toBe("PONG");
  });

  it("AC1: when several agent messages are emitted, the last one is the final response", async () => {
    const jsonl = [
      '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"Let me look at the diff."}}',
      '{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"feat: final answer"}}',
      '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":2}}',
    ].join("\n");
    const cli = fakeCodex(jsonl);
    const res = await chat(new CliSubprocessProvider(codexSpec, MODELS, cli.path));
    expect(res.content).toBe("feat: final answer");
  });

  it("AC2: populates tokens with the exact input/output counts from turn.completed usage", async () => {
    const cli = fakeCodex(REAL_SUCCESS_JSONL);
    const res = await chat(new CliSubprocessProvider(codexSpec, MODELS, cli.path));
    expect(res.tokens).toEqual({ input: 18049, output: 6 });
    expect(res.tokensAvailable).toBe(true);
  });

  it("AC3: with no usage data in the output, tokens are 0/0 and tokensAvailable is false", async () => {
    const jsonl = [
      '{"type":"turn.started"}',
      '{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"PONG"}}',
      '{"type":"turn.completed"}',
    ].join("\n");
    const cli = fakeCodex(jsonl);
    const res = await chat(new CliSubprocessProvider(codexSpec, MODELS, cli.path));
    expect(res.content).toBe("PONG");
    expect(res.tokens).toEqual({ input: 0, output: 0 });
    expect(res.tokensAvailable).toBe(false);
  });

  it("malformed output with no agent message rejects instead of returning empty content", async () => {
    const cli = fakeCodex("not json at all\n{\"type\":\"turn.started\"}\n");
    await expect(chat(new CliSubprocessProvider(codexSpec, MODELS, cli.path))).rejects.toThrow(
      "Codex CLI returned no final agent message",
    );
  });

  it("AC4: a missing binary raises PROVIDER_UNAVAILABLE naming Codex and pointing at `gw provider`", async () => {
    const missing = join(tmpdir(), "gitwise-no-such-codex-binary");
    const err = (await chat(new CliSubprocessProvider(codexSpec, MODELS, missing)).catch(
      (e: unknown) => e,
    )) as GitwiseError;
    expect(err.code).toBe("PROVIDER_UNAVAILABLE");
    expect(err.message).toContain("Codex CLI");
    expect(err.message).toContain(missing);
    expect(err.message).toContain("gw provider");
  });

  it("AC5: a non-zero exit surfaces the CLI's own JSONL error message verbatim", async () => {
    const cli = fakeCodex(REAL_FAILURE_JSONL, { stderr: "Reading additional input from stdin...\n", exitCode: 1 });
    const err = (await chat(new CliSubprocessProvider(codexSpec, MODELS, cli.path)).catch(
      (e: unknown) => e,
    )) as Error;
    expect(err.message).toBe(`Codex CLI exited with code 1: ${REAL_FAILURE_MESSAGE}`);
  });

  it("retries with Codex's configured default when the ChatGPT account rejects the selected model", async () => {
    const cli = fakeCodexRequiringDefaultModel();
    const res = await chat(new CliSubprocessProvider(codexSpec, MODELS, cli.path));

    expect(res.content).toBe("PONG");
    expect(cli.calls()).toHaveLength(2);
    expect(cli.calls()[0]).toContain("--model");
    expect(cli.calls()[1]).not.toContain("--model");
  });

  it("AC5: a non-zero exit with no JSONL error surfaces stderr verbatim", async () => {
    const cli = fakeCodex("", { stderr: "Not inside a trusted directory.\n", exitCode: 1 });
    const err = (await chat(new CliSubprocessProvider(codexSpec, MODELS, cli.path)).catch(
      (e: unknown) => e,
    )) as Error;
    expect(err.message).toBe("Codex CLI exited with code 1: Not inside a trusted directory.");
  });
});
