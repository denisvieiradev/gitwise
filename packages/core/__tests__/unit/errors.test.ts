import { describe, it, expect } from "@jest/globals";
import { GitwiseError, EXIT_CODES, wrapError } from "../../src/errors.js";

describe("GitwiseError", () => {
  describe("constructor", () => {
    it("sets code, message, and name = 'GitwiseError'", () => {
      const err = new GitwiseError({ code: "GIT_FAILED", message: "boom" });
      expect(err.code).toBe("GIT_FAILED");
      expect(err.message).toBe("boom");
      expect(err.name).toBe("GitwiseError");
      expect(err).toBeInstanceOf(Error);
    });

    it("defaults exitCode to the value in EXIT_CODES[code] when omitted", () => {
      const err = new GitwiseError({ code: "GIT_FAILED", message: "git push failed" });
      expect(err.exitCode).toBe(EXIT_CODES.GIT_FAILED);
      expect(err.exitCode).toBe(20);
    });

    it("defaults exitCode to 1 for unknown codes", () => {
      const err = new GitwiseError({ code: "TOTALLY_MADE_UP", message: "x" });
      expect(err.exitCode).toBe(1);
    });

    it("uses an explicit exitCode argument when provided, overriding the table lookup", () => {
      const err = new GitwiseError({
        code: "GIT_FAILED",
        message: "x",
        exitCode: 99,
      });
      expect(err.exitCode).toBe(99);
    });

    it("preserves cause and details on the instance", () => {
      const cause = new Error("root cause");
      const details = { stderr: "non-fast-forward" };
      const err = new GitwiseError({
        code: "GIT_FAILED",
        message: "push refused",
        cause,
        details,
      });
      expect(err.cause).toBe(cause);
      expect(err.details).toEqual(details);
    });

    it("leaves cause and details undefined when not supplied", () => {
      const err = new GitwiseError({ code: "OK", message: "fine" });
      expect(err.cause).toBeUndefined();
      expect(err.details).toBeUndefined();
    });
  });
});

describe("EXIT_CODES table", () => {
  it("maps the documented constants to the ADR-003 / TechSpec numbers", () => {
    expect(EXIT_CODES.OK).toBe(0);
    expect(EXIT_CODES.UNKNOWN).toBe(1);
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
    expect(EXIT_CODES.REPO_LOCKED).toBe(80);
    expect(EXIT_CODES.ROLLBACK_PARTIAL).toBe(81);
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

  it("keeps category ranges aligned with ADR-003 so future codes slot in cleanly", () => {
    const inRange = (code: string, min: number, max: number): boolean => {
      const value = EXIT_CODES[code];
      return value !== undefined && value >= min && value < max;
    };

    expect(EXIT_CODES.OK).toBe(0);
    expect(EXIT_CODES.UNKNOWN).toBe(1);

    for (const c of ["NOTHING_STAGED", "INVALID_INTENT"]) {
      expect(inRange(c, 10, 20)).toBe(true);
    }
    for (const c of ["GIT_FAILED", "GH_FAILED", "REPO_STATE_INVALID"]) {
      expect(inRange(c, 20, 30)).toBe(true);
    }
    for (const c of ["API_FAILED", "API_KEY_MISSING", "API_RATE_LIMITED"]) {
      expect(inRange(c, 30, 40)).toBe(true);
    }
    expect(inRange("USER_ABORT", 40, 50)).toBe(true);
    expect(inRange("CONFIG_INVALID", 50, 60)).toBe(true);
    for (const c of ["RELEASE_PLAN_STALE", "RELEASE_BRANCH_CONFLICT"]) {
      expect(inRange(c, 60, 70)).toBe(true);
    }
    expect(inRange("SENSITIVE_FILE_BLOCKED", 70, 80)).toBe(true);
    for (const c of ["REPO_LOCKED", "ROLLBACK_PARTIAL"]) {
      expect(inRange(c, 80, 90)).toBe(true);
    }
  });

  it("has unique exit numbers", () => {
    const values = Object.values(EXIT_CODES);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("wrapError", () => {
  it("returns the input unchanged when it is already a GitwiseError", () => {
    const original = new GitwiseError({ code: "GIT_FAILED", message: "boom" });
    const wrapped = wrapError(original);
    expect(wrapped).toBe(original);
  });

  it("wraps a plain Error under code: 'UNKNOWN' and preserves the cause", () => {
    const raw = new Error("plain boom");
    const wrapped = wrapError(raw);
    expect(wrapped).toBeInstanceOf(GitwiseError);
    expect(wrapped.code).toBe("UNKNOWN");
    expect(wrapped.exitCode).toBe(1);
    expect(wrapped.message).toBe("plain boom");
    expect(wrapped.cause).toBe(raw);
  });

  it("does not crash on a string-thrown value and yields code: 'UNKNOWN'", () => {
    const wrapped = wrapError("string thrown");
    expect(wrapped).toBeInstanceOf(GitwiseError);
    expect(wrapped.code).toBe("UNKNOWN");
    expect(wrapped.exitCode).toBe(1);
    expect(wrapped.message).toBe("string thrown");
    expect(wrapped.cause).toBe("string thrown");
  });

  it("handles non-Error, non-string thrown values without crashing", () => {
    const wrapped = wrapError({ weird: "object" });
    expect(wrapped.code).toBe("UNKNOWN");
    expect(wrapped.exitCode).toBe(1);
    expect(wrapped.cause).toEqual({ weird: "object" });
  });
});

describe("GitwiseError JSON shape (precondition for --json mode)", () => {
  it("JSON.stringify includes code, exitCode, message, and details", () => {
    const err = new GitwiseError({
      code: "GIT_FAILED",
      message: "git push refused: non-fast-forward",
      details: { stderr: "non-fast-forward" },
    });

    const parsed = JSON.parse(JSON.stringify(err)) as Record<string, unknown>;
    expect(parsed.code).toBe("GIT_FAILED");
    expect(parsed.exitCode).toBe(20);
    expect(parsed.message).toBe("git push refused: non-fast-forward");
    expect(parsed.details).toEqual({ stderr: "non-fast-forward" });
    expect(parsed.name).toBe("GitwiseError");
  });

  it("JSON.stringify omits details when not provided", () => {
    const err = new GitwiseError({ code: "USER_ABORT", message: "declined" });
    const parsed = JSON.parse(JSON.stringify(err)) as Record<string, unknown>;
    expect(parsed.code).toBe("USER_ABORT");
    expect(parsed.exitCode).toBe(40);
    expect(parsed).not.toHaveProperty("details");
  });
});

describe("integration: wrapError passthrough on existing core error shapes", () => {
  it("wraps the legacy 'Object.assign(new Error, { code })' pattern under UNKNOWN with the original as cause", () => {
    const legacy = Object.assign(new Error("nothing staged"), { code: "NOTHING_STAGED" });
    const wrapped = wrapError(legacy);
    expect(wrapped).toBeInstanceOf(GitwiseError);
    expect(wrapped.code).toBe("UNKNOWN");
    expect(wrapped.message).toBe("nothing staged");
    expect(wrapped.cause).toBe(legacy);
  });

  it("public barrel exposes GitwiseError, EXIT_CODES, and wrapError", async () => {
    const mod = (await import("../../src/index.js")) as Record<string, unknown>;
    expect(mod.GitwiseError).toBe(GitwiseError);
    expect(mod.EXIT_CODES).toBe(EXIT_CODES);
    expect(mod.wrapError).toBe(wrapError);
  });
});
