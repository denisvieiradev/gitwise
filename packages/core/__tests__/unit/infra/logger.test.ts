import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import { setVerbose, isVerbose, info, error, debug } from "../../../src/infra/logger.js";

describe("Logger", () => {
  let logSpy: ReturnType<typeof jest.spyOn>;
  let errorSpy: ReturnType<typeof jest.spyOn>;
  let stderrSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    setVerbose(false);
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    stderrSpy = jest.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  describe("setVerbose / isVerbose", () => {
    it("should default to false", () => {
      expect(isVerbose()).toBe(false);
    });

    it("should enable verbose mode", () => {
      setVerbose(true);
      expect(isVerbose()).toBe(true);
    });

    it("should disable verbose mode", () => {
      setVerbose(true);
      setVerbose(false);
      expect(isVerbose()).toBe(false);
    });
  });

  describe("info", () => {
    it("should log message without context", () => {
      info("hello");
      expect(logSpy).toHaveBeenCalledWith("hello");
    });

    it("should log message with context", () => {
      const ctx = { key: "value" };
      info("hello", ctx);
      expect(logSpy).toHaveBeenCalledWith("hello", ctx);
    });
  });

  describe("error", () => {
    it("should log error without context", () => {
      error("fail");
      expect(errorSpy).toHaveBeenCalledWith("fail");
    });

    it("should log error with context", () => {
      const ctx = { code: 500 };
      error("fail", ctx);
      expect(errorSpy).toHaveBeenCalledWith("fail", ctx);
    });
  });

  describe("debug", () => {
    it("should be silent when GITWISE_DEBUG is unset (verbose disabled)", () => {
      setVerbose(false);
      debug("hidden");
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it("should write to stderr when verbose is enabled", () => {
      setVerbose(true);
      debug("visible");
      expect(stderrSpy).toHaveBeenCalledWith("[debug] visible\n");
    });

    it("should write to stderr with context when verbose is enabled", () => {
      setVerbose(true);
      const ctx = { step: 1 };
      debug("visible", ctx);
      expect(stderrSpy).toHaveBeenCalledWith(`[debug] visible ${JSON.stringify(ctx)}\n`);
    });
  });
});
