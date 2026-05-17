import { describe, it, expect } from "@jest/globals";
import { createProgram } from "../src/program.js";

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

  it("registers --api-key flag", () => {
    const program = createProgram();
    const apiKeyOpt = program.options.find((o) => o.long === "--api-key");
    expect(apiKeyOpt).toBeDefined();
  });
});
