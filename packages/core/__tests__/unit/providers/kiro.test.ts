import { describe, it, expect, afterEach } from "@jest/globals";
import { mkdtempSync, rmSync, writeFileSync, chmodSync, readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { CliSubprocessProvider } from "../../../src/providers/cli-subprocess.js";
import { kiroSpec } from "../../../src/providers/kiro.js";
import type * as KiroModule from "../../../src/providers/kiro.js";
import type { GitwiseError } from "../../../src/errors.js";
import { importWithFakeFs } from "../../_helpers/binary-resolution.js";

const MODELS = { fast: "kiro-fast", balanced: "kiro-bal", powerful: "kiro-pow" };
const KIRO_MODULE = "../../src/providers/kiro.js"; // relative to the helper
const MAC_APP = "/Applications/Kiro CLI.app/Contents/MacOS/kiro-cli";

let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

// Fake `kiro-cli` executable (mocked subprocess I/O; no live Kiro account per spec assumption): records argv + stdin, then emits scripted output.
function fakeKiro(stdout: string, opts: { stderr?: string; exitCode?: number } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "gitwise-kiro-"));
  dirs.push(dir);
  const path = join(dir, "kiro-cli");
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

describe("resolveKiroBinary (PROV-06 AC4: same precedence pattern as resolveClaudeBinary)", () => {
  it("returns an explicit custom path when it is executable", async () => {
    const m = await importWithFakeFs<typeof KiroModule>(KIRO_MODULE, {
      executables: ["/custom/kiro-cli", MAC_APP],
      which: "/usr/bin/kiro-cli",
      nvmVersions: null,
    });
    expect(m.resolveKiroBinary("/custom/kiro-cli")).toBe("/custom/kiro-cli");
  });

  it("returns null for a non-executable explicit path without falling back", async () => {
    const m = await importWithFakeFs<typeof KiroModule>(KIRO_MODULE, {
      executables: [MAC_APP],
      which: MAC_APP,
      nvmVersions: null,
    });
    expect(m.resolveKiroBinary("/custom/kiro-cli")).toBeNull();
  });

  it("prefers a common install path (macOS app bundle) over the PATH lookup", async () => {
    const m = await importWithFakeFs<typeof KiroModule>(KIRO_MODULE, {
      executables: [MAC_APP, "/elsewhere/bin/kiro-cli"],
      which: "/elsewhere/bin/kiro-cli",
      nvmVersions: null,
    });
    expect(m.resolveKiroBinary()).toBe(MAC_APP);
  });

  it("finds the installer location (~/.local/bin/kiro-cli) as a common path", async () => {
    const local = join(homedir(), ".local", "bin", "kiro-cli");
    const m = await importWithFakeFs<typeof KiroModule>(KIRO_MODULE, {
      executables: [local],
      which: null,
      nvmVersions: null,
    });
    expect(m.resolveKiroBinary()).toBe(local);
  });

  it("falls back to the PATH lookup when no common path exists", async () => {
    const m = await importWithFakeFs<typeof KiroModule>(KIRO_MODULE, {
      executables: ["/elsewhere/bin/kiro-cli"],
      which: "/elsewhere/bin/kiro-cli",
      nvmVersions: null,
    });
    expect(m.resolveKiroBinary()).toBe("/elsewhere/bin/kiro-cli");
  });

  it("falls back to nvm-managed bins when not in PATH", async () => {
    const nvmBin = join(homedir(), ".nvm", "versions", "node", "v22.12.0", "bin", "kiro-cli");
    const m = await importWithFakeFs<typeof KiroModule>(KIRO_MODULE, {
      executables: [nvmBin],
      which: null,
      nvmVersions: ["v22.12.0"],
    });
    expect(m.resolveKiroBinary()).toBe(nvmBin);
  });

  it("returns null when Kiro CLI is installed nowhere", async () => {
    const m = await importWithFakeFs<typeof KiroModule>(KIRO_MODULE, {
      executables: [],
      which: null,
      nvmVersions: null,
    });
    expect(m.resolveKiroBinary()).toBeNull();
  });
});

describe("Kiro provider spec (PROV-05, PROV-06)", () => {
  it("AC1: invokes `kiro-cli chat --no-interactive` with the combined prompt and the tier's model, trusting no tools", async () => {
    const cli = fakeKiro("PONG\n");
    const provider = new CliSubprocessProvider(kiroSpec, MODELS, cli.path);

    await chat(provider, "the diff", "powerful");

    const { argv, stdin } = cli.recorded();
    expect(argv).toEqual([
      "chat",
      "--no-interactive",
      "--trust-tools=",
      "--wrap",
      "never",
      "--model",
      "kiro-pow",
      "You are gitwise.\n\nthe diff",
    ]);
    expect(stdin).toBe("");
  });

  it("AC1: a large combined prompt is piped over stdin with no positional argument", async () => {
    const cli = fakeKiro("ok");
    const provider = new CliSubprocessProvider(kiroSpec, MODELS, cli.path);
    const big = "d".repeat(100_001);

    await chat(provider, big);

    const { argv, stdin } = cli.recorded();
    expect(argv).toEqual(["chat", "--no-interactive", "--trust-tools=", "--wrap", "never", "--model", "kiro-fast"]);
    expect(stdin).toBe(`You are gitwise.\n\n${big}`);
  });

  it("AC1: returns the response text as content, with ANSI styling and surrounding whitespace removed", async () => {
    const cli = fakeKiro("\u001b[32mfeat(core): add thing\u001b[0m\n\nBody line\n");
    const res = await chat(new CliSubprocessProvider(kiroSpec, MODELS, cli.path));
    expect(res.content).toBe("feat(core): add thing\n\nBody line");
  });

  it("AC2: Kiro output carries no token usage, so tokens are 0/0 and tokensAvailable is false", async () => {
    const cli = fakeKiro("PONG\n");
    const res = await chat(new CliSubprocessProvider(kiroSpec, MODELS, cli.path));
    expect(res.tokens).toEqual({ input: 0, output: 0 });
    expect(res.tokensAvailable).toBe(false);
  });

  it("AC3: a missing binary raises PROVIDER_UNAVAILABLE naming Kiro and pointing at `gw provider`", async () => {
    const missing = join(tmpdir(), "gitwise-no-such-kiro-binary");
    const err = (await chat(new CliSubprocessProvider(kiroSpec, MODELS, missing)).catch(
      (e: unknown) => e,
    )) as GitwiseError;
    expect(err.code).toBe("PROVIDER_UNAVAILABLE");
    expect(err.message).toContain("Kiro CLI");
    expect(err.message).toContain(missing);
    expect(err.message).toContain("gw provider");
  });

  it("AC3: an auth/subscription failure from an invocable binary surfaces the CLI's stderr verbatim (not PROVIDER_UNAVAILABLE)", async () => {
    const cli = fakeKiro("", {
      stderr: "error: Your Kiro subscription does not include CLI access. Upgrade at kiro.dev\n",
      exitCode: 1,
    });
    const err = (await chat(new CliSubprocessProvider(kiroSpec, MODELS, cli.path)).catch(
      (e: unknown) => e,
    )) as GitwiseError;
    expect(err.code).toBeUndefined();
    expect(err.message).toBe(
      "Kiro CLI exited with code 1: error: Your Kiro subscription does not include CLI access. Upgrade at kiro.dev",
    );
  });

  it("AC3: when the failure text is written to stdout instead of stderr, it is surfaced verbatim", async () => {
    const cli = fakeKiro("You are not logged in, please log in with kiro-cli login\n", { exitCode: 1 });
    const err = (await chat(new CliSubprocessProvider(kiroSpec, MODELS, cli.path)).catch(
      (e: unknown) => e,
    )) as Error;
    expect(err.message).toBe(
      "Kiro CLI exited with code 1: You are not logged in, please log in with kiro-cli login",
    );
  });
});
