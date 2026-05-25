export const EXIT_CODES: Readonly<Record<string, number>> = Object.freeze({
  OK: 0,
  UNKNOWN: 1,
  NOTHING_STAGED: 10,
  INVALID_INTENT: 11,
  GIT_FAILED: 20,
  GH_FAILED: 21,
  REPO_STATE_INVALID: 22,
  API_FAILED: 30,
  API_KEY_MISSING: 31,
  API_RATE_LIMITED: 32,
  USER_ABORT: 40,
  CONFIG_INVALID: 50,
  RELEASE_PLAN_STALE: 60,
  RELEASE_BRANCH_CONFLICT: 61,
  SENSITIVE_FILE_BLOCKED: 70,
  REPO_LOCKED: 80,
  ROLLBACK_PARTIAL: 81,
});

export interface GitwiseErrorArgs {
  code: string;
  message: string;
  exitCode?: number;
  cause?: unknown;
  details?: Record<string, unknown>;
}

export class GitwiseError extends Error {
  readonly code: string;
  readonly exitCode: number;
  override readonly cause?: unknown;
  readonly details?: Record<string, unknown>;

  constructor(args: GitwiseErrorArgs) {
    super(args.message);
    this.name = "GitwiseError";
    this.code = args.code;
    this.exitCode = args.exitCode ?? EXIT_CODES[args.code] ?? 1;
    this.cause = args.cause;
    this.details = args.details;
  }

  toJSON(): {
    name: string;
    code: string;
    exitCode: number;
    message: string;
    details?: Record<string, unknown>;
  } {
    return {
      name: this.name,
      code: this.code,
      exitCode: this.exitCode,
      message: this.message,
      ...(this.details !== undefined ? { details: this.details } : {}),
    };
  }
}

export function wrapError(err: unknown): GitwiseError {
  if (err instanceof GitwiseError) return err;
  if (err instanceof Error) {
    return new GitwiseError({
      code: "UNKNOWN",
      message: err.message,
      cause: err,
    });
  }
  return new GitwiseError({
    code: "UNKNOWN",
    message: typeof err === "string" ? err : "Unknown error",
    cause: err,
  });
}
