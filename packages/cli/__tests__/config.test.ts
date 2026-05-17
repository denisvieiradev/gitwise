import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { makeConfigCommand } from "../src/commands/config.js";

describe("config command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gitwise-config-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
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

    await expect(
      cmd.parseAsync(["node", "config", "bogus-key", "value"])
    ).rejects.toThrow("process.exit(1)");

    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown config key"));
    stdoutSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
