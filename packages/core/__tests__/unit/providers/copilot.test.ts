import { describe, it, expect, afterEach } from "@jest/globals";
import { mkdtempSync, rmSync, writeFileSync, chmodSync, readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { CliSubprocessProvider } from "../../../src/providers/cli-subprocess.js";
import { copilotSpec } from "../../../src/providers/copilot.js";
import type * as CopilotModule from "../../../src/providers/copilot.js";
import type { GitwiseError } from "../../../src/errors.js";
import { importWithFakeFs } from "../../_helpers/binary-resolution.js";

const MODELS = { fast: "cp-fast", balanced: "cp-bal", powerful: "cp-pow" };
const COPILOT_MODULE = "../../src/providers/copilot.js"; // relative to the helper

let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

// Fake `copilot` executable: records argv + stdin, then emits scripted output.
function fakeCopilot(stdout: string, opts: { stderr?: string; exitCode?: number } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "gitwise-copilot-"));
  dirs.push(dir);
  const path = join(dir, "copilot");
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

const chat = (provider: CliSubprocessProvider, userMessage = "the diff", tier: "fast" | "powerful" = "fast") =>
  provider.chat({ systemPrompt: "You are gitwise.", userMessage, tier });

describe("resolveCopilotBinary (PROV-04 AC5: same precedence pattern as resolveClaudeBinary)", () => {
  it("returns an explicit custom path when it is executable", async () => {
    const m = await importWithFakeFs<typeof CopilotModule>(COPILOT_MODULE, {
      binary: "copilot",
      executables: ["/custom/copilot", "/opt/homebrew/bin/copilot"],
      which: "/usr/bin/copilot",
      nvmVersions: null,
    });
    expect(m.resolveCopilotBinary("/custom/copilot")).toBe("/custom/copilot");
  });

  it("returns null for a non-executable explicit path without falling back", async () => {
    const m = await importWithFakeFs<typeof CopilotModule>(COPILOT_MODULE, {
      binary: "copilot",
      executables: ["/opt/homebrew/bin/copilot"],
      which: "/opt/homebrew/bin/copilot",
      nvmVersions: null,
    });
    expect(m.resolveCopilotBinary("/custom/copilot")).toBeNull();
  });

  it("prefers a common install path over the PATH lookup", async () => {
    const m = await importWithFakeFs<typeof CopilotModule>(COPILOT_MODULE, {
      binary: "copilot",
      executables: ["/opt/homebrew/bin/copilot", "/elsewhere/bin/copilot"],
      which: "/elsewhere/bin/copilot",
      nvmVersions: null,
    });
    expect(m.resolveCopilotBinary()).toBe("/opt/homebrew/bin/copilot");
  });

  it("finds the install-script location (~/.local/bin/copilot) as a common path", async () => {
    const local = join(homedir(), ".local", "bin", "copilot");
    const m = await importWithFakeFs<typeof CopilotModule>(COPILOT_MODULE, {
      binary: "copilot",
      executables: [local],
      which: null,
      nvmVersions: null,
    });
    expect(m.resolveCopilotBinary()).toBe(local);
  });

  it("falls back to the PATH lookup when no common path exists", async () => {
    const m = await importWithFakeFs<typeof CopilotModule>(COPILOT_MODULE, {
      binary: "copilot",
      executables: ["/elsewhere/bin/copilot"],
      which: "/elsewhere/bin/copilot",
      nvmVersions: null,
    });
    expect(m.resolveCopilotBinary()).toBe("/elsewhere/bin/copilot");
  });

  it("falls back to nvm global installs when not in PATH", async () => {
    const nvmBin = join(homedir(), ".nvm", "versions", "node", "v22.12.0", "bin", "copilot");
    const m = await importWithFakeFs<typeof CopilotModule>(COPILOT_MODULE, {
      binary: "copilot",
      executables: [nvmBin],
      which: null,
      nvmVersions: ["v22.12.0"],
    });
    expect(m.resolveCopilotBinary()).toBe(nvmBin);
  });

  it("returns null when Copilot CLI is installed nowhere", async () => {
    const m = await importWithFakeFs<typeof CopilotModule>(COPILOT_MODULE, {
      binary: "copilot",
      executables: [],
      which: null,
      nvmVersions: null,
    });
    expect(m.resolveCopilotBinary()).toBeNull();
  });
});

describe("Copilot provider spec (PROV-03, PROV-04)", () => {
  it("AC1: invokes `copilot` non-interactively (prompt mode, --no-ask-user) with the combined prompt and the tier's model", async () => {
    const cli = fakeCopilot("PONG\n\n");
    const provider = new CliSubprocessProvider(copilotSpec, MODELS, cli.path);

    await chat(provider, "the diff", "powerful");

    const { argv, stdin } = cli.recorded();
    expect(argv).toEqual([
      "--prompt=You are gitwise.\n\nthe diff",
      "--no-ask-user",
      "--silent",
      "--model",
      "cp-pow",
    ]);
    expect(stdin).toBe("");
  });

  it("AC1: a large combined prompt is piped over stdin instead of argv", async () => {
    const cli = fakeCopilot("ok");
    const provider = new CliSubprocessProvider(copilotSpec, MODELS, cli.path);
    const big = "d".repeat(100_001);

    await chat(provider, big);

    const { argv, stdin } = cli.recorded();
    expect(argv).toEqual(["--no-ask-user", "--silent", "--model", "cp-fast"]);
    expect(stdin).toBe(`You are gitwise.\n\n${big}`);
  });

  it("AC1: returns the silent-mode response text (surrounding whitespace trimmed) as content", async () => {
    const cli = fakeCopilot("feat(core): add thing\n\nBody line\n\n");
    const res = await chat(new CliSubprocessProvider(copilotSpec, MODELS, cli.path));
    expect(res.content).toBe("feat(core): add thing\n\nBody line");
  });

  it("an exit-0 run with no response text rejects instead of returning empty content", async () => {
    const cli = fakeCopilot("\n");
    await expect(chat(new CliSubprocessProvider(copilotSpec, MODELS, cli.path))).rejects.toThrow(
      "Copilot CLI returned an empty response",
    );
  });

  it("AC2: Copilot output carries no token usage, so tokens are 0/0 and tokensAvailable is false", async () => {
    const cli = fakeCopilot("PONG\n");
    const res = await chat(new CliSubprocessProvider(copilotSpec, MODELS, cli.path));
    expect(res.tokens).toEqual({ input: 0, output: 0 });
    expect(res.tokensAvailable).toBe(false);
  });

  it("AC3: a missing binary raises PROVIDER_UNAVAILABLE naming Copilot and pointing at `gw provider`", async () => {
    const missing = join(tmpdir(), "gitwise-no-such-copilot-binary");
    const err = (await chat(new CliSubprocessProvider(copilotSpec, MODELS, missing)).catch(
      (e: unknown) => e,
    )) as GitwiseError;
    expect(err.code).toBe("PROVIDER_UNAVAILABLE");
    expect(err.message).toContain("Copilot CLI");
    expect(err.message).toContain(missing);
    expect(err.message).toContain("gw provider");
  });

  it("AC4: a non-zero exit surfaces the CLI's own stderr verbatim", async () => {
    // Verbatim stderr from copilot 1.0.82 for an unavailable model.
    const cli = fakeCopilot("", {
      stderr: 'Error: Model "no-such-model-xyz" from --model flag is not available.\n',
      exitCode: 1,
    });
    const err = (await chat(new CliSubprocessProvider(copilotSpec, MODELS, cli.path)).catch(
      (e: unknown) => e,
    )) as Error;
    expect(err.message).toBe(
      'Copilot CLI exited with code 1: Error: Model "no-such-model-xyz" from --model flag is not available.',
    );
  });
});
