import { createRequire } from "node:module";
import chalk from "chalk";
import { needsFirstRun, runFirstRun } from "./first-run.js";
import { createProgram } from "./program.js";
import {
  formatVersionEnvelope,
  handleTopLevelError,
  isDebugMode,
  isJsonMode,
  isVersionRequest,
} from "./error-handler.js";

const requireFromHere = createRequire(import.meta.url);
const pkg = requireFromHere("../package.json") as { version: string };

export const API_KEY_DEPRECATION_WARNING =
  "[gitwise] --api-key is deprecated and will be removed in v0.next+1. Set ANTHROPIC_API_KEY in the environment or use the interactive first-run prompt instead.";

export interface RunCliOptions {
  /** Override stdout writer (default: process.stdout.write). */
  stdoutWrite?: (chunk: string) => void;
  /** Override stderr writer (default: process.stderr.write). */
  stderrWrite?: (chunk: string) => void;
  /** Skip the first-run wizard check (default: false). Tests pass true to keep things deterministic. */
  skipFirstRun?: boolean;
  /** Replace `process.exit`. Mock in tests so the runner isn't killed. */
  exit?: (code: number) => never;
}

/**
 * Entry-point logic, extracted so tests can drive the CLI in-process.
 * Production callers wire `process.argv` and the real exit/writers; tests pass
 * custom argv, mock writers, and a `mockExit` that throws.
 */
export async function runCli(
  argv: readonly string[],
  opts: RunCliOptions = {},
): Promise<void> {
  const args = argv.slice(2);
  const json = isJsonMode(args);

  const rawStdoutWrite =
    opts.stdoutWrite ?? ((chunk: string) => void process.stdout.write(chunk));
  const stderrWrite =
    opts.stderrWrite ?? ((chunk: string) => void process.stderr.write(chunk));
  const exit =
    opts.exit ??
    ((code: number) => {
      process.exit(code);
    });

  const apiKeyIdx = args.indexOf("--api-key");
  const apiKey = apiKeyIdx >= 0 ? args[apiKeyIdx + 1] : undefined;
  if (apiKeyIdx >= 0) {
    stderrWrite(`${API_KEY_DEPRECATION_WARNING}\n`);
  }

  // `--version` is handled by commander, but in --json mode we want a
  // structured envelope on stdout instead of the bare "0.1.0\n" string. Run
  // this BEFORE any try/catch so the test-injected `exit` throw isn't caught
  // and re-wrapped as an UNKNOWN error.
  if (isVersionRequest(args) && json) {
    rawStdoutWrite(`${formatVersionEnvelope(pkg.version)}\n`);
    return exit(0);
  }

  // In --json mode, the envelope MUST be the only stdout content. Suppress
  // progress chatter (clack spinners, chalk intros) by routing every other
  // stdout write to a sink; the error handler uses the captured rawStdoutWrite
  // to emit the envelope on the real stdout. Skipped when callers pass a
  // custom stdoutWrite (tests own their own capture).
  let restoreStdout: (() => void) | undefined;
  if (json && !opts.stdoutWrite) {
    chalk.level = 0;
    process.env["NO_COLOR"] = "1";
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = (() => true) as typeof process.stdout.write;
    restoreStdout = () => {
      process.stdout.write = original;
    };
  }

  try {
    const isHelp = args.includes("--help") || args.includes("-h");
    const isVersion = isVersionRequest(args);
    const isConfig = args[0] === "config";

    if (!opts.skipFirstRun && !isHelp && !isVersion && !isConfig) {
      if (await needsFirstRun()) {
        await runFirstRun({ apiKey });
      }
    }

    const program = createProgram();
    await program.parseAsync(argv as string[]);
  } catch (err: unknown) {
    handleTopLevelError(err, {
      json,
      debug: isDebugMode(args),
      stdout: json ? rawStdoutWrite : undefined,
      stderr: stderrWrite,
      exit,
    });
  } finally {
    restoreStdout?.();
  }
}
