import { describe, it, expect, afterEach } from "@jest/globals";
import chalk from "chalk";
import { applyNoColor, createProgram } from "../src/program.js";

describe("program (cli)", () => {
  it("registers commit, review, pr, release, and config commands", () => {
    const program = createProgram();
    const commandNames = program.commands.map((c) => c.name());
    expect(commandNames).toContain("commit");
    expect(commandNames).toContain("review");
    expect(commandNames).toContain("pr");
    expect(commandNames).toContain("release");
    expect(commandNames).toContain("config");
  });

  it("has a version string", () => {
    const program = createProgram();
    expect(program.version()).toBeTruthy();
  });

  it("registers --no-color flag", () => {
    const program = createProgram();
    const colorOpt = program.options.find((o) => o.long === "--no-color");
    expect(colorOpt).toBeDefined();
  });

  it("registers --api-key flag (kept this release; deprecated)", () => {
    const program = createProgram();
    const apiKeyOpt = program.options.find((o) => o.long === "--api-key");
    expect(apiKeyOpt).toBeDefined();
  });

  it("marks --api-key as DEPRECATED in its help text (visible in --help output)", () => {
    const program = createProgram();
    const apiKeyOpt = program.options.find((o) => o.long === "--api-key");
    expect(apiKeyOpt?.description).toMatch(/DEPRECATED/);
    expect(apiKeyOpt?.description).toMatch(/v0\.next\+1/);
  });

  it("registers --json global flag", () => {
    const program = createProgram();
    const jsonOpt = program.options.find((o) => o.long === "--json");
    expect(jsonOpt).toBeDefined();
  });

  it("registers --debug global flag", () => {
    const program = createProgram();
    const debugOpt = program.options.find((o) => o.long === "--debug");
    expect(debugOpt).toBeDefined();
  });

  describe("--no-color handling", () => {
    const originalLevel = chalk.level;
    const originalEnv = process.env.NO_COLOR;

    afterEach(() => {
      chalk.level = originalLevel;
      if (originalEnv === undefined) {
        delete process.env.NO_COLOR;
      } else {
        process.env.NO_COLOR = originalEnv;
      }
    });

    it("applyNoColor disables chalk and sets NO_COLOR env", () => {
      chalk.level = 3;
      delete process.env.NO_COLOR;

      applyNoColor();

      expect(chalk.level).toBe(0);
      expect(process.env.NO_COLOR).toBe("1");
    });

    it("invoking a subcommand with --no-color disables chalk via preAction hook", async () => {
      chalk.level = 3;
      delete process.env.NO_COLOR;

      const program = createProgram();
      program
        .command("__test_noop")
        .description("test-only no-op command")
        .action(() => {
          // intentionally empty
        });

      await program.parseAsync(["node", "gw", "--no-color", "__test_noop"]);

      expect(chalk.level).toBe(0);
      expect(process.env.NO_COLOR).toBe("1");
      expect(chalk.cyan("hello")).toBe("hello");
    });

    it("invoking a subcommand without --no-color leaves chalk untouched", async () => {
      chalk.level = 3;
      delete process.env.NO_COLOR;

      const program = createProgram();
      program
        .command("__test_noop")
        .description("test-only no-op command")
        .action(() => {
          // intentionally empty
        });

      await program.parseAsync(["node", "gw", "__test_noop"]);

      expect(chalk.level).toBe(3);
      expect(process.env.NO_COLOR).toBeUndefined();
    });
  });
});
