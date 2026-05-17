import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

jest.mock("@clack/prompts", () => ({
  cancel: jest.fn(),
}));

describe("validateApiKey", () => {
  const originalApiKey = process.env.ANTHROPIC_API_KEY;
  const mockExit = jest.spyOn(process, "exit").mockImplementation((() => {
    throw new Error("process.exit");
  }) as never);

  afterEach(() => {
    if (originalApiKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalApiKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it("should exit when ANTHROPIC_API_KEY is not set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { validateApiKey } = await import("../../../src/providers/claude.js");
    expect(() => validateApiKey()).toThrow("process.exit");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("should not exit when ANTHROPIC_API_KEY is set", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const { validateApiKey } = await import("../../../src/providers/claude.js");
    mockExit.mockClear();
    validateApiKey();
    expect(mockExit).not.toHaveBeenCalled();
  });
});

describe("handleLLMError", () => {
  const mockExit = jest.spyOn(process, "exit").mockImplementation((() => {
    throw new Error("process.exit");
  }) as never);
  const originalApiKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (originalApiKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalApiKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it("should handle APIError with status 401", async () => {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const { handleLLMError } = await import("../../../src/providers/claude.js");
    const err = new Anthropic.APIError(401, undefined, "Unauthorized", {});
    expect(() => handleLLMError(err)).toThrow("process.exit");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("should handle APIError with status 400", async () => {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const { handleLLMError } = await import("../../../src/providers/claude.js");
    const err = new Anthropic.APIError(400, undefined, "Bad request", {});
    expect(() => handleLLMError(err)).toThrow("process.exit");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("should handle APIError with other status", async () => {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const { handleLLMError } = await import("../../../src/providers/claude.js");
    const err = new Anthropic.APIError(500, undefined, "Server error", {});
    expect(() => handleLLMError(err)).toThrow("process.exit");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("should handle network error ENOTFOUND", async () => {
    const { handleLLMError } = await import("../../../src/providers/claude.js");
    const err = new Error("getaddrinfo ENOTFOUND api.anthropic.com");
    expect(() => handleLLMError(err)).toThrow("process.exit");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("should handle network error ETIMEDOUT", async () => {
    const { handleLLMError } = await import("../../../src/providers/claude.js");
    const err = new Error("connect ETIMEDOUT");
    expect(() => handleLLMError(err)).toThrow("process.exit");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("should handle network error ECONNREFUSED", async () => {
    const { handleLLMError } = await import("../../../src/providers/claude.js");
    const err = new Error("connect ECONNREFUSED");
    expect(() => handleLLMError(err)).toThrow("process.exit");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("should handle generic Error", async () => {
    const { handleLLMError } = await import("../../../src/providers/claude.js");
    const err = new Error("Something went wrong");
    expect(() => handleLLMError(err)).toThrow("process.exit");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("should handle non-Error thrown value", async () => {
    const { handleLLMError } = await import("../../../src/providers/claude.js");
    expect(() => handleLLMError("string error")).toThrow("process.exit");
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
