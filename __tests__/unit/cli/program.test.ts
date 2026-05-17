import { describe, it, expect, jest } from "@jest/globals";

jest.unstable_mockModule("../../../src/infra/env.js", () => ({
  loadEnv: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

const { createProgram } = await import("../../../src/cli/program.js");

describe("createProgram", () => {
  it("registers exactly four subcommands", () => {
    const program = createProgram();
    const commandNames = program.commands.map((c) => c.name());
    expect(commandNames).toHaveLength(4);
    expect(commandNames).toContain("commit");
    expect(commandNames).toContain("review");
    expect(commandNames).toContain("pr");
    expect(commandNames).toContain("release");
  });

  it("does not register deprecated pipeline commands", () => {
    const program = createProgram();
    const commandNames = program.commands.map((c) => c.name());
    const deprecated = ["init", "prd", "techspec", "tasks", "run-tasks", "test", "done", "status"];
    for (const name of deprecated) {
      expect(commandNames).not.toContain(name);
    }
  });

  it("uses 'gw' as the program name", () => {
    const program = createProgram();
    expect(program.name()).toBe("gw");
  });

  it("commit subcommand does not throw when queried", () => {
    const program = createProgram();
    const commit = program.commands.find((c) => c.name() === "commit");
    expect(commit).toBeDefined();
    expect(commit!.description()).toBeTruthy();
  });

  it("review subcommand does not throw when queried", () => {
    const program = createProgram();
    const review = program.commands.find((c) => c.name() === "review");
    expect(review).toBeDefined();
    expect(review!.description()).toBeTruthy();
  });

  it("pr subcommand does not throw when queried", () => {
    const program = createProgram();
    const pr = program.commands.find((c) => c.name() === "pr");
    expect(pr).toBeDefined();
    expect(pr!.description()).toBeTruthy();
  });

  it("release subcommand does not throw when queried", () => {
    const program = createProgram();
    const release = program.commands.find((c) => c.name() === "release");
    expect(release).toBeDefined();
    expect(release!.description()).toBeTruthy();
  });
});
