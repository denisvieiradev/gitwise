import { describe, it, expect } from "@jest/globals";

import { GitwiseError, EXIT_CODES, wrapError } from "../src/errors.js";

describe("GitwiseError construction", () => {
  it("sets code, message, and name = 'GitwiseError'", () => {
    const err = new GitwiseError({ code: "GIT_FAILED", message: "git push failed" });
    expect(err.code).toBe("GIT_FAILED");
    expect(err.message).toBe("git push failed");
    expect(err.name).toBe("GitwiseError");
  });

  it("is an instance of Error and GitwiseError", () => {
    const err = new GitwiseError({ code: "UNKNOWN", message: "boom" });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(GitwiseError);
  });

  it("defaults exitCode to EXIT_CODES[code] when omitted", () => {
    const err = new GitwiseError({ code: "GIT_FAILED", message: "x" });
    expect(err.exitCode).toBe(EXIT_CODES.GIT_FAILED);
    expect(err.exitCode).toBe(20);
  });

  it("defaults exitCode to 1 for an unknown code not present in EXIT_CODES", () => {
    const err = new GitwiseError({ code: "NOT_IN_TABLE", message: "x" });
    expect(err.exitCode).toBe(1);
  });

  it("uses an explicit exitCode argument over the table lookup", () => {
    const err = new GitwiseError({ code: "GIT_FAILED", message: "x", exitCode: 99 });
    expect(err.exitCode).toBe(99);
  });

  it("preserves cause and details on the instance", () => {
    const cause = new Error("root cause");
    const details = { stderr: "fatal: not a git repository" } as const;
    const err = new GitwiseError({
      code: "GIT_FAILED",
      message: "git failed",
      cause,
      details,
    });
    expect(err.cause).toBe(cause);
    expect(err.details).toEqual(details);
  });
});

describe("EXIT_CODES table", () => {
  it("declares OK=0 and UNKNOWN=1", () => {
    expect(EXIT_CODES.OK).toBe(0);
    expect(EXIT_CODES.UNKNOWN).toBe(1);
  });

  it("covers every code listed in ADR-003 with the documented numbers", () => {
    expect(EXIT_CODES.NOTHING_STAGED).toBe(10);
    expect(EXIT_CODES.INVALID_INTENT).toBe(11);
    expect(EXIT_CODES.GIT_FAILED).toBe(20);
    expect(EXIT_CODES.GH_FAILED).toBe(21);
    expect(EXIT_CODES.REPO_STATE_INVALID).toBe(22);
    expect(EXIT_CODES.API_FAILED).toBe(30);
    expect(EXIT_CODES.API_KEY_MISSING).toBe(31);
    expect(EXIT_CODES.API_RATE_LIMITED).toBe(32);
    expect(EXIT_CODES.USER_ABORT).toBe(40);
    expect(EXIT_CODES.CONFIG_INVALID).toBe(50);
    expect(EXIT_CODES.RELEASE_PLAN_STALE).toBe(60);
    expect(EXIT_CODES.RELEASE_BRANCH_CONFLICT).toBe(61);
    expect(EXIT_CODES.SENSITIVE_FILE_BLOCKED).toBe(70);
  });

  it("includes the rollback/concurrency codes from the TechSpec", () => {
    expect(EXIT_CODES.REPO_LOCKED).toBe(80);
    expect(EXIT_CODES.ROLLBACK_PARTIAL).toBe(81);
  });

  it("groups codes into the documented category number ranges so future codes slot in cleanly", () => {
    const categoryFor = (n: number): string | null => {
      if (n === 0) return "success";
      if (n === 1) return "unknown";
      if (n >= 10 && n < 20) return "input";
      if (n >= 20 && n < 30) return "git";
      if (n >= 30 && n < 40) return "api";
      if (n >= 40 && n < 50) return "user";
      if (n >= 50 && n < 60) return "config";
      if (n >= 60 && n < 70) return "release";
      if (n >= 70 && n < 80) return "security";
      if (n >= 80 && n < 90) return "concurrency";
      return null;
    };

    const expectations: Record<string, string> = {
      OK: "success",
      UNKNOWN: "unknown",
      NOTHING_STAGED: "input",
      INVALID_INTENT: "input",
      GIT_FAILED: "git",
      GH_FAILED: "git",
      REPO_STATE_INVALID: "git",
      API_FAILED: "api",
      API_KEY_MISSING: "api",
      API_RATE_LIMITED: "api",
      USER_ABORT: "user",
      CONFIG_INVALID: "config",
      RELEASE_PLAN_STALE: "release",
      RELEASE_BRANCH_CONFLICT: "release",
      SENSITIVE_FILE_BLOCKED: "security",
      REPO_LOCKED: "concurrency",
      ROLLBACK_PARTIAL: "concurrency",
    };

    for (const [code, expectedCategory] of Object.entries(expectations)) {
      const numeric = EXIT_CODES[code];
      expect(numeric).toBeDefined();
      expect(categoryFor(numeric as number)).toBe(expectedCategory);
    }
  });

  it("is frozen — direct mutation throws in strict mode", () => {
    expect(Object.isFrozen(EXIT_CODES)).toBe(true);
    expect(() => {
      (EXIT_CODES as Record<string, number>).GIT_FAILED = 999;
    }).toThrow(TypeError);
    expect(() => {
      (EXIT_CODES as Record<string, number>).NEW_CODE = 42;
    }).toThrow(TypeError);
    expect(EXIT_CODES.GIT_FAILED).toBe(20);
  });
});

describe("wrapError", () => {
  it("returns the same instance when the input is already a GitwiseError", () => {
    const original = new GitwiseError({ code: "GIT_FAILED", message: "git failed" });
    const wrapped = wrapError(original);
    expect(wrapped).toBe(original);
  });

  it("wraps a plain Error as code: 'UNKNOWN' preserving the original message and cause", () => {
    const original = new Error("boom");
    const wrapped = wrapError(original);
    expect(wrapped).toBeInstanceOf(GitwiseError);
    expect(wrapped.code).toBe("UNKNOWN");
    expect(wrapped.exitCode).toBe(EXIT_CODES.UNKNOWN);
    expect(wrapped.message).toBe("boom");
    expect(wrapped.cause).toBe(original);
  });

  it("wraps a thrown string without crashing", () => {
    const wrapped = wrapError("string thrown");
    expect(wrapped).toBeInstanceOf(GitwiseError);
    expect(wrapped.code).toBe("UNKNOWN");
    expect(wrapped.message).toBe("string thrown");
    expect(wrapped.cause).toBe("string thrown");
  });

  it("wraps non-string non-Error throws (null, undefined, objects) into UNKNOWN", () => {
    const cases: unknown[] = [null, undefined, 42, { reason: "x" }];
    for (const value of cases) {
      const wrapped = wrapError(value);
      expect(wrapped).toBeInstanceOf(GitwiseError);
      expect(wrapped.code).toBe("UNKNOWN");
      expect(typeof wrapped.message).toBe("string");
      expect(wrapped.cause).toBe(value);
    }
  });
});

describe("GitwiseError JSON serialization (precondition for --json mode)", () => {
  it("JSON.stringify includes code, exitCode, and details", () => {
    const err = new GitwiseError({
      code: "GIT_FAILED",
      message: "git push refused: non-fast-forward",
      details: { stderr: "fatal: non-fast-forward" },
    });
    const json = JSON.parse(JSON.stringify(err)) as Record<string, unknown>;
    expect(json.code).toBe("GIT_FAILED");
    expect(json.exitCode).toBe(20);
    expect(json.details).toEqual({ stderr: "fatal: non-fast-forward" });
  });
});
