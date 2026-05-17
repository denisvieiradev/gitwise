import { describe, it, expect } from "@jest/globals";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const BINARY = join(__dirname, "..", "..", "dist", "index.js");

describe("CLI binary (e2e)", () => {
  it("should exit 0 and list commands on --help", async () => {
    const { stdout } = await exec("node", [BINARY, "--help"], { timeout: 10000 });
    expect(stdout).toContain("devflow");
    expect(stdout).toContain("init");
    expect(stdout).toContain("prd");
    expect(stdout).toContain("techspec");
    expect(stdout).toContain("tasks");
    expect(stdout).toContain("commit");
    expect(stdout).toContain("run-tasks");
    expect(stdout).toContain("review");
    expect(stdout).toContain("pr");
    expect(stdout).toContain("done");
    expect(stdout).toContain("status");
  }, 15000);

  it("should return a valid version on --version", async () => {
    const { stdout } = await exec("node", [BINARY, "--version"], { timeout: 10000 });
    const version = stdout.trim();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
    expect(version).not.toBe("0.0.0");
  }, 15000);

  it("should show help for init subcommand", async () => {
    const { stdout } = await exec("node", [BINARY, "init", "--help"], { timeout: 10000 });
    expect(stdout).toContain("init");
    expect(stdout).toContain("Initialize");
  }, 15000);
});
