import { describe, it, expect } from "@jest/globals";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const BINARY = join(__dirname, "..", "..", "dist", "index.js");

describe("CLI binary (e2e)", () => {
  it("should exit 0 and list exactly the four supported commands on --help", async () => {
    const { stdout } = await exec("node", [BINARY, "--help"], { timeout: 10000 });
    expect(stdout).toContain("gw");
    expect(stdout).toContain("commit");
    expect(stdout).toContain("review");
    expect(stdout).toContain("pr");
    expect(stdout).toContain("release");
    // deprecated commands must NOT appear
    expect(stdout).not.toContain("init");
    expect(stdout).not.toContain("prd");
    expect(stdout).not.toContain("techspec");
    expect(stdout).not.toContain("tasks");
    expect(stdout).not.toContain("run-tasks");
    expect(stdout).not.toContain("done");
    expect(stdout).not.toContain("status");
  }, 15000);

  it("should return a valid version on --version", async () => {
    const { stdout } = await exec("node", [BINARY, "--version"], { timeout: 10000 });
    const version = stdout.trim();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
    expect(version).not.toBe("0.0.0");
  }, 15000);

  it("should show help for commit subcommand", async () => {
    const { stdout } = await exec("node", [BINARY, "commit", "--help"], { timeout: 10000 });
    expect(stdout).toContain("commit");
  }, 15000);

  it("should show help for review subcommand", async () => {
    const { stdout } = await exec("node", [BINARY, "review", "--help"], { timeout: 10000 });
    expect(stdout).toContain("review");
  }, 15000);

  it("should show help for pr subcommand", async () => {
    const { stdout } = await exec("node", [BINARY, "pr", "--help"], { timeout: 10000 });
    expect(stdout).toContain("pr");
  }, 15000);

  it("should show help for release subcommand", async () => {
    const { stdout } = await exec("node", [BINARY, "release", "--help"], { timeout: 10000 });
    expect(stdout).toContain("release");
  }, 15000);
});
