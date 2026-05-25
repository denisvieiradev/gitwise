import { describe, it, expect, beforeEach } from "@jest/globals";
import { GitwiseError } from "@denisvieiradev/gitwise-core";
import {
  formatErrorEnvelope,
  formatVersionEnvelope,
  handleTopLevelError,
  isDebugMode,
  isJsonMode,
  isVersionRequest,
} from "../src/error-handler.js";

describe("isJsonMode / isDebugMode / isVersionRequest", () => {
  it("detects --json anywhere in argv", () => {
    expect(isJsonMode(["commit", "--json"])).toBe(true);
    expect(isJsonMode(["--json", "commit"])).toBe(true);
    expect(isJsonMode(["commit"])).toBe(false);
  });

  it("detects --debug anywhere in argv", () => {
    expect(isDebugMode(["commit", "--debug"])).toBe(true);
    expect(isDebugMode(["commit"])).toBe(false);
  });

  it("detects --version and -V", () => {
    expect(isVersionRequest(["--version"])).toBe(true);
    expect(isVersionRequest(["-V"])).toBe(true);
    expect(isVersionRequest(["commit"])).toBe(false);
  });
});

describe("formatErrorEnvelope", () => {
  it("includes code, message, exitCode for a basic GitwiseError", () => {
    const err = new GitwiseError({
      code: "NOTHING_STAGED",
      message: "No staged changes to commit",
    });
    const envelope = JSON.parse(formatErrorEnvelope(err)) as {
      error: { code: string; message: string; exitCode: number };
    };
    expect(envelope.error.code).toBe("NOTHING_STAGED");
    expect(envelope.error.message).toBe("No staged changes to commit");
    expect(envelope.error.exitCode).toBe(10);
  });

  it("omits details when not provided", () => {
    const err = new GitwiseError({ code: "GIT_FAILED", message: "boom" });
    const parsed = JSON.parse(formatErrorEnvelope(err)) as {
      error: Record<string, unknown>;
    };
    expect("details" in parsed.error).toBe(false);
  });

  it("includes details when provided", () => {
    const err = new GitwiseError({
      code: "GIT_FAILED",
      message: "push refused",
      details: { stderr: "non-fast-forward" },
    });
    const parsed = JSON.parse(formatErrorEnvelope(err)) as {
      error: { details?: { stderr: string } };
    };
    expect(parsed.error.details).toEqual({ stderr: "non-fast-forward" });
  });
});

describe("formatVersionEnvelope", () => {
  it("emits {\"version\":\"x.y.z\"}", () => {
    const parsed = JSON.parse(formatVersionEnvelope("1.2.3")) as { version: string };
    expect(parsed.version).toBe("1.2.3");
  });
});

interface Harness {
  stdout: string[];
  stderr: string[];
  exitCode: number | undefined;
  exit: (code: number) => never;
  writeOut: (chunk: string) => void;
  writeErr: (chunk: string) => void;
}

function makeHarness(): Harness {
  const stdout: string[] = [];
  const stderr: string[] = [];
  let exitCode: number | undefined;
  return {
    stdout,
    stderr,
    get exitCode(): number | undefined {
      return exitCode;
    },
    exit: ((code: number): never => {
      exitCode = code;
      throw new Error(`__exit:${code}`);
    }) as (code: number) => never,
    writeOut: (chunk: string) => {
      stdout.push(chunk);
    },
    writeErr: (chunk: string) => {
      stderr.push(chunk);
    },
  };
}

describe("handleTopLevelError", () => {
  let h: Harness;

  beforeEach(() => {
    h = makeHarness();
  });

  it("exits with err.exitCode for a GitwiseError (NOTHING_STAGED → 10)", () => {
    const err = new GitwiseError({
      code: "NOTHING_STAGED",
      message: "No staged changes to commit",
    });
    expect(() =>
      handleTopLevelError(err, {
        json: false,
        debug: false,
        stdout: h.writeOut,
        stderr: h.writeErr,
        exit: h.exit,
      }),
    ).toThrow("__exit:10");
    expect(h.exitCode).toBe(10);
  });

  it("wraps plain Error and exits 1 with code UNKNOWN in JSON mode", () => {
    expect(() =>
      handleTopLevelError(new Error("boom"), {
        json: true,
        debug: false,
        stdout: h.writeOut,
        stderr: h.writeErr,
        exit: h.exit,
      }),
    ).toThrow("__exit:1");
    expect(h.exitCode).toBe(1);
    expect(h.stdout.length).toBe(1);
    const parsed = JSON.parse(h.stdout[0]!.trim()) as {
      error: { code: string; message: string; exitCode: number };
    };
    expect(parsed.error.code).toBe("UNKNOWN");
    expect(parsed.error.exitCode).toBe(1);
    expect(parsed.error.message).toBe("boom");
  });

  it("in JSON mode emits a parseable envelope on stdout (no stderr)", () => {
    const err = new GitwiseError({
      code: "API_KEY_MISSING",
      message: "ANTHROPIC_API_KEY is not configured",
    });
    expect(() =>
      handleTopLevelError(err, {
        json: true,
        debug: false,
        stdout: h.writeOut,
        stderr: h.writeErr,
        exit: h.exit,
      }),
    ).toThrow("__exit:31");
    expect(h.stderr.length).toBe(0);
    expect(h.stdout.length).toBe(1);
    const parsed = JSON.parse(h.stdout[0]!.trim()) as {
      error: { code: string; exitCode: number; message: string };
    };
    expect(parsed.error.code).toBe("API_KEY_MISSING");
    expect(parsed.error.exitCode).toBe(31);
  });

  it("in non-JSON mode writes the human message AND a single-line hint to stderr referencing exit-codes.md", () => {
    const err = new GitwiseError({
      code: "GIT_FAILED",
      message: "git push refused",
    });
    expect(() =>
      handleTopLevelError(err, {
        json: false,
        debug: false,
        stdout: h.writeOut,
        stderr: h.writeErr,
        exit: h.exit,
      }),
    ).toThrow("__exit:20");

    expect(h.stdout.length).toBe(0);
    const joined = h.stderr.join("");
    expect(joined).toContain("git push refused");
    expect(joined).toContain("exit-codes");
    const hintLines = h.stderr.filter((line) => line.includes("Hint:"));
    expect(hintLines.length).toBe(1);
  });

  it("--debug surfaces a stack trace; default mode does not", () => {
    expect(() =>
      handleTopLevelError(new GitwiseError({ code: "GIT_FAILED", message: "boom" }), {
        json: false,
        debug: true,
        stdout: h.writeOut,
        stderr: h.writeErr,
        exit: h.exit,
      }),
    ).toThrow("__exit:20");
    const joinedDebug = h.stderr.join("");
    expect(joinedDebug).toMatch(/at\s/);

    const h2 = makeHarness();
    expect(() =>
      handleTopLevelError(new GitwiseError({ code: "GIT_FAILED", message: "boom" }), {
        json: false,
        debug: false,
        stdout: h2.writeOut,
        stderr: h2.writeErr,
        exit: h2.exit,
      }),
    ).toThrow("__exit:20");
    const joinedDefault = h2.stderr.join("");
    expect(joinedDefault).not.toMatch(/at\s/);
  });
});
