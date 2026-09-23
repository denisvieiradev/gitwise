import { describe, it, expect, beforeEach, jest } from "@jest/globals";

// The config command reads/writes via os.homedir(), which we never want a
// test to touch for real — mock the core module entirely (same pattern as
// release-wiring.test.ts) so every getMergedConfig/writeUserConfig call is
// observed instead of hitting the real filesystem.
const getMergedConfigMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const writeUserConfigMock = jest.fn<(...args: unknown[]) => Promise<void>>();

jest.unstable_mockModule("@denisvieiradev/gitwise-core", () => ({
  getMergedConfig: getMergedConfigMock,
  writeUserConfig: writeUserConfigMock,
}));

let makeConfigCommand: typeof import("../src/commands/config.js").makeConfigCommand;

const DEFAULT_MODELS = {
  api: { fast: "api-fast", balanced: "api-balanced", powerful: "api-powerful" },
  "claude-code": { fast: "cc-fast", balanced: "cc-balanced", powerful: "cc-powerful" },
  codex: { fast: "codex-fast", balanced: "codex-balanced", powerful: "codex-powerful" },
  copilot: { fast: "copilot-fast", balanced: "copilot-balanced", powerful: "copilot-powerful" },
  kiro: { fast: "kiro-fast", balanced: "kiro-balanced", powerful: "kiro-powerful" },
};

function mockConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    provider: "api",
    models: DEFAULT_MODELS,
    language: "en",
    commitConvention: "conventional",
    ...overrides,
  };
}

async function run(cmd: import("commander").Command, args: string[]): Promise<void> {
  await cmd.parseAsync(["node", "config", ...args]);
}

describe("config command", () => {
  beforeEach(async () => {
    getMergedConfigMock.mockReset();
    writeUserConfigMock.mockReset();
    getMergedConfigMock.mockResolvedValue(mockConfig());
    writeUserConfigMock.mockResolvedValue(undefined);
    const mod = await import("../src/commands/config.js");
    makeConfigCommand = mod.makeConfigCommand;
  });

  it("command is registered with name 'config'", () => {
    const cmd = makeConfigCommand();
    expect(cmd.name()).toBe("config");
  });

  it("accepts key and optional value arguments", () => {
    const cmd = makeConfigCommand();
    expect(cmd.registeredArguments.length).toBeGreaterThanOrEqual(1);
  });

  it("prints error and exits for unknown key", async () => {
    const cmd = makeConfigCommand();
    const stdoutSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = jest.spyOn(process, "exit").mockImplementation(((code: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);

    await expect(run(cmd, ["bogus-key", "value"])).rejects.toThrow("process.exit(1)");

    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown config key"));
    stdoutSpy.mockRestore();
    exitSpy.mockRestore();
  });

  describe("provider validation (CFG-03)", () => {
    it.each(["codex", "copilot", "kiro", "claude-code", "api"])(
      "gw config provider %s succeeds and persists provider: %s",
      async (value) => {
        const cmd = makeConfigCommand();
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

        await run(cmd, ["provider", value]);

        expect(writeUserConfigMock).toHaveBeenCalledWith({ provider: value }, expect.any(String));
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(`Set provider = ${value}`));
        logSpy.mockRestore();
      },
    );

    it("gw config provider bogus fails with a clear, valid-values-listing error and does not write", async () => {
      const cmd = makeConfigCommand();
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      const exitSpy = jest.spyOn(process, "exit").mockImplementation(((code: number) => {
        throw new Error(`process.exit(${code})`);
      }) as never);

      await expect(run(cmd, ["provider", "bogus"])).rejects.toThrow("process.exit(1)");

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown provider 'bogus'"));
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("api, claude-code, codex, copilot, kiro"),
      );
      expect(writeUserConfigMock).not.toHaveBeenCalled();

      errorSpy.mockRestore();
      exitSpy.mockRestore();
    });
  });

  describe("per-provider models keys (MDL-07)", () => {
    it("gw config models.fast <id> writes to the active provider's block", async () => {
      getMergedConfigMock.mockResolvedValue(mockConfig({ provider: "codex" }));
      const cmd = makeConfigCommand();
      const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

      await run(cmd, ["models.fast", "new-codex-fast"]);

      expect(writeUserConfigMock).toHaveBeenCalledWith(
        {
          models: {
            ...DEFAULT_MODELS,
            codex: { fast: "new-codex-fast", balanced: "codex-balanced", powerful: "codex-powerful" },
          },
        },
        expect.any(String),
      );
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Set models.fast = new-codex-fast"));
      logSpy.mockRestore();
    });

    it("gw config models.codex.fast <id> writes to Codex's block regardless of the active provider", async () => {
      // Active provider is "api", not codex — the explicit-provider form must
      // still target codex.
      getMergedConfigMock.mockResolvedValue(mockConfig({ provider: "api" }));
      const cmd = makeConfigCommand();
      const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

      await run(cmd, ["models.codex.fast", "explicit-codex-fast"]);

      const call = writeUserConfigMock.mock.calls[0]?.[0] as { models: Record<string, unknown> };
      expect(call.models["codex"]).toEqual({
        fast: "explicit-codex-fast",
        balanced: "codex-balanced",
        powerful: "codex-powerful",
      });
      // The active provider's own block is untouched by this explicit write.
      expect(call.models["api"]).toEqual(DEFAULT_MODELS.api);
      logSpy.mockRestore();
    });

    it("preserves every other provider's block when writing models.<tier>", async () => {
      getMergedConfigMock.mockResolvedValue(mockConfig({ provider: "copilot" }));
      const cmd = makeConfigCommand();
      jest.spyOn(console, "log").mockImplementation(() => {});

      await run(cmd, ["models.powerful", "new-copilot-powerful"]);

      const call = writeUserConfigMock.mock.calls[0]?.[0] as { models: Record<string, unknown> };
      expect(call.models["api"]).toEqual(DEFAULT_MODELS.api);
      expect(call.models["claude-code"]).toEqual(DEFAULT_MODELS["claude-code"]);
      expect(call.models["codex"]).toEqual(DEFAULT_MODELS.codex);
      expect(call.models["kiro"]).toEqual(DEFAULT_MODELS.kiro);
    });

    it("rejects models.<provider>.<tier> with an unrecognized provider segment", async () => {
      const cmd = makeConfigCommand();
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      const exitSpy = jest.spyOn(process, "exit").mockImplementation(((code: number) => {
        throw new Error(`process.exit(${code})`);
      }) as never);

      await expect(run(cmd, ["models.bogus-tool.fast", "x"])).rejects.toThrow("process.exit(1)");
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown config key"));
      expect(writeUserConfigMock).not.toHaveBeenCalled();

      errorSpy.mockRestore();
      exitSpy.mockRestore();
    });

    it("reads models.<tier> from the active provider's block", async () => {
      getMergedConfigMock.mockResolvedValue(mockConfig({ provider: "kiro" }));
      const cmd = makeConfigCommand();
      const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

      await run(cmd, ["models.balanced"]);

      expect(logSpy).toHaveBeenCalledWith("kiro-balanced");
      logSpy.mockRestore();
    });

    it("reads models.<provider>.<tier> explicitly, regardless of active provider", async () => {
      getMergedConfigMock.mockResolvedValue(mockConfig({ provider: "api" }));
      const cmd = makeConfigCommand();
      const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

      await run(cmd, ["models.copilot.powerful"]);

      expect(logSpy).toHaveBeenCalledWith("copilot-powerful");
      logSpy.mockRestore();
    });
  });

  describe("new CLI-path keys", () => {
    it.each(["codexCliPath", "copilotCliPath", "kiroCliPath"])("accepts %s as a valid key", async (key) => {
      const cmd = makeConfigCommand();
      const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

      await run(cmd, [key, "/usr/local/bin/tool"]);

      expect(writeUserConfigMock).toHaveBeenCalledWith({ [key]: "/usr/local/bin/tool" }, expect.any(String));
      logSpy.mockRestore();
    });
  });
});
