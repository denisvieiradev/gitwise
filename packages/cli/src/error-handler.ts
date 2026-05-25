import { GitwiseError, wrapError } from "@denisvieiradev/gitwise-core";

export interface ErrorHandlerOptions {
  json: boolean;
  debug: boolean;
  stdout?: (chunk: string) => void;
  stderr?: (chunk: string) => void;
  /** Replace `process.exit`. Mock in tests so the runner isn't killed. */
  exit?: (code: number) => never;
}

const EXIT_CODES_DOC_HINT =
  "See https://gitwise.dev/exit-codes/ (docs/exit-codes.md) for the full table.";

export function isJsonMode(argv: readonly string[]): boolean {
  return argv.includes("--json");
}

export function isDebugMode(argv: readonly string[]): boolean {
  return argv.includes("--debug");
}

export function isVersionRequest(argv: readonly string[]): boolean {
  return argv.includes("--version") || argv.includes("-V");
}

export function formatErrorEnvelope(err: GitwiseError): string {
  const payload: {
    error: {
      code: string;
      message: string;
      exitCode: number;
      details?: Record<string, unknown>;
    };
  } = {
    error: {
      code: err.code,
      message: err.message,
      exitCode: err.exitCode,
    },
  };
  if (err.details !== undefined) {
    payload.error.details = err.details;
  }
  return JSON.stringify(payload);
}

export function formatVersionEnvelope(version: string): string {
  return JSON.stringify({ version });
}

/**
 * Top-level error handler. Wraps unknown errors via `wrapError`, emits either
 * a JSON envelope (stdout) or a human message + hint (stderr), surfaces a
 * stack trace only under `--debug`, and exits with the GitwiseError exit code.
 */
export function handleTopLevelError(err: unknown, opts: ErrorHandlerOptions): never {
  const gw = err instanceof GitwiseError ? err : wrapError(err);
  const writeOut = opts.stdout ?? ((c: string) => void process.stdout.write(c));
  const writeErr = opts.stderr ?? ((c: string) => void process.stderr.write(c));
  const exit =
    opts.exit ??
    ((code: number) => {
      process.exit(code);
    });

  if (opts.json) {
    writeOut(`${formatErrorEnvelope(gw)}\n`);
  } else {
    writeErr(`${gw.message}\n`);
    writeErr(`  Hint: ${EXIT_CODES_DOC_HINT}\n`);
    if (opts.debug && gw.stack) {
      writeErr(`${gw.stack}\n`);
    }
  }

  return exit(gw.exitCode);
}

export const __exitCodesDocHint = EXIT_CODES_DOC_HINT;
