import { describe, it, expect, afterEach, jest } from "@jest/globals";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, writeFileSync, chmodSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as realTimers from "node:timers";
import { setTimeout as sleep } from "node:timers/promises";
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

    const err = (await provider.chat(req("x")).catch((e: unknown) => e)) as Error;

    expect(err.message).toBe("Fake CLI was terminated by signal SIGTERM");
  });

  it("treats an empty-string cliPath as unset and falls back to spec.resolveBinary()", async () => {
    const f = script(`process.stdin.resume(); process.stdin.on("end", () => process.stdout.write("resolved"));`);
    const provider = new CliSubprocessProvider(makeSpec({ resolveBinary: () => f.path }), MODELS, "");

    const res = await provider.chat(req("x"));

    expect(res.content).toBe("resolved");
  });
});

// Spawns through a mocked `node:child_process` and returns the options object
// the provider passed to `spawn`. `loadSpec` runs inside the isolated registry
// so a real provider spec can be imported against the same mock.
async function spawnOptionsFor(
  loadSpec: () => Promise<CliProviderSpec>,
): Promise<{ timeout?: number; detached?: boolean }> {
  let captured: { detached?: boolean } | undefined;
  const delays: number[] = [];
  await jest.isolateModulesAsync(async () => {
    jest.unstable_mockModule("node:timers", () => ({
      ...realTimers,
      setTimeout: (fn: () => void, ms: number) => {
        delays.push(ms);
        return realTimers.setTimeout(fn, ms);
      },
    }));
    jest.unstable_mockModule("node:child_process", () => ({
      execSync: jest.fn(),
      spawn: jest.fn((_binary: string, _args: string[], options: { detached?: boolean }) => {
        captured = options;
        const child = new EventEmitter() as EventEmitter & {
          stdout: EventEmitter;
          stderr: EventEmitter;
          stdin: EventEmitter & { write: () => void; end: () => void };
        };
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.stdin = Object.assign(new EventEmitter(), { write: () => undefined, end: () => undefined });
        process.nextTick(() => {
          child.stdout.emit("data", Buffer.from("ok"));
          child.emit("close", 0, null);
        });
        return child;
      }),
    }));
    const { CliSubprocessProvider: Isolated } = await import("../../../src/providers/cli-subprocess.js");
    const spec = await loadSpec();
    // Real specs parse tool-specific stdout; only the spawn options matter here.
    const provider = new Isolated({ ...spec, parseOutput: () => ({ content: "ok", tokens: null }) }, MODELS, "/fake/bin");
    await provider.chat(req("x"));
  });
  if (!captured) throw new Error("spawn was not called");
  // The timeout is a manual timer (so it can kill the whole process group).
  return { ...captured, timeout: delays[0] };
}

describe("CliSubprocessProvider subprocess timeout", () => {
  it("spawns the CLI in its own process group on POSIX so a timeout can kill its tool subprocesses", async () => {
    const options = await spawnOptionsFor(async () => makeSpec());
    expect(options.detached).toBe(process.platform !== "win32");
  });

  it("passes the spec's timeoutMs to spawn when the spec sets one", async () => {
    const options = await spawnOptionsFor(async () => makeSpec({ timeoutMs: 45_000 }));
    expect(options.timeout).toBe(45_000);
  });

  it("falls back to 120_000 ms when the spec sets no timeoutMs", async () => {
    const options = await spawnOptionsFor(async () => makeSpec());
    expect(options.timeout).toBe(120_000);
  });

  it("keeps Claude Code at 120_000 ms", async () => {
    const options = await spawnOptionsFor(async () => (await import("../../../src/providers/claude-code.js")).claudeCodeSpec);
    expect(options.timeout).toBe(120_000);
  });

  it("gives Codex 300_000 ms", async () => {
    const options = await spawnOptionsFor(async () => (await import("../../../src/providers/codex.js")).codexSpec);
    expect(options.timeout).toBe(300_000);
  });

  it("gives Copilot 300_000 ms", async () => {
    const options = await spawnOptionsFor(async () => (await import("../../../src/providers/copilot.js")).copilotSpec);
    expect(options.timeout).toBe(300_000);
  });

  it("gives Kiro 300_000 ms", async () => {
    const options = await spawnOptionsFor(async () => (await import("../../../src/providers/kiro.js")).kiroSpec);
    expect(options.timeout).toBe(300_000);
  });
});

const posixIt = process.platform === "win32" ? it.skip : it;

describe("CliSubprocessProvider timeout process tree", () => {
  posixIt("kills tool subprocesses spawned by the CLI, not just the CLI itself, when the timeout fires", async () => {
    const f = script(`
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const grandchild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
fs.writeFileSync(__dirname + "/grandchild.pid", String(grandchild.pid));
setInterval(() => {}, 1000);`);
    const provider = new CliSubprocessProvider(makeSpec({ timeoutMs: 1_000 }), MODELS, f.path);

    const err = (await provider.chat(req("x")).catch((e: unknown) => e)) as Error;
    expect(err.message).toBe("Fake CLI timed out after 1s");

    const pid = Number(readFileSync(join(f.dir, "grandchild.pid"), "utf8"));
    let alive = true;
    for (let i = 0; i < 20 && alive; i++) {
      try {
        process.kill(pid, 0);
        await sleep(50);
      } catch {
        alive = false;
      }
    }
    if (alive) process.kill(pid, "SIGKILL");
    expect(alive).toBe(false);
  });
});

describe("CliSubprocessProvider parent signals", () => {
  posixIt("kills the CLI's process group and rejects when the parent receives SIGINT", async () => {
    const f = script(`
const fs = require("node:fs");
fs.writeFileSync(__dirname + "/cli.pid", String(process.pid));
setInterval(() => {}, 1000);`);
    const provider = new CliSubprocessProvider(makeSpec({ timeoutMs: 30_000 }), MODELS, f.path);
    // A listener stands in for clack's spinner handler, so the test process itself is not signalled.
    const noop = (): void => undefined;
    process.on("SIGINT", noop);
    try {
      const pending = provider.chat(req("x")).catch((e: unknown) => e);
      for (let i = 0; i < 100 && !existsSync(join(f.dir, "cli.pid")); i++) await sleep(50);
      process.emit("SIGINT");
      const err = (await pending) as Error;
      expect(err.message).toBe("Fake CLI was interrupted by SIGINT");
    } finally {
      process.off("SIGINT", noop);
    }

    const pid = Number(readFileSync(join(f.dir, "cli.pid"), "utf8"));
    let alive = true;
    for (let i = 0; i < 20 && alive; i++) {
      try {
        process.kill(pid, 0);
        await sleep(50);
      } catch {
        alive = false;
      }
    }
    if (alive) process.kill(pid, "SIGKILL");
    expect(alive).toBe(false);
  });

  posixIt("removes its signal listeners once the CLI has finished", async () => {
    const f = script(`process.stdin.resume(); process.stdin.on("end", () => process.stdout.write("ok"));`);
    const provider = new CliSubprocessProvider(makeSpec(), MODELS, f.path);
    const before = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];

    await provider.chat(req("x"));

    expect([process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")]).toEqual(before);
  });
});

describe("CliSubprocessProvider timeout message", () => {
  posixIt("says the CLI timed out and how long the limit was, instead of naming a bare signal", async () => {
    const f = script(`setInterval(() => {}, 1000);`);
    const provider = new CliSubprocessProvider(makeSpec({ timeoutMs: 1_000 }), MODELS, f.path);

    const err = (await provider.chat(req("x")).catch((e: unknown) => e)) as Error;

    expect(err.message).toBe("Fake CLI timed out after 1s");
  });
});
