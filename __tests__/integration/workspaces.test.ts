import { describe, it, expect } from "@jest/globals";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

describe("npm workspaces wiring (root)", () => {
  it("'npm run build:workspaces' exits 0 with no packages (empty workspaces is OK)", async () => {
    const { stdout, stderr } = await exec(
      "npm",
      ["run", "--silent", "build:workspaces"],
      { cwd: REPO_ROOT, timeout: 60000 },
    );
    expect(stdout + stderr).not.toMatch(/\b(error|missing script)\b/i);
  }, 90000);

  it("'npm run -ws --if-present lint' exits 0 when no workspace defines lint", async () => {
    await exec(
      "npm",
      ["run", "--workspaces", "--if-present", "lint"],
      { cwd: REPO_ROOT, timeout: 60000 },
    );
  }, 90000);

  it("'npm run -ws --if-present typecheck' exits 0 when no workspace defines typecheck", async () => {
    await exec(
      "npm",
      ["run", "--workspaces", "--if-present", "typecheck"],
      { cwd: REPO_ROOT, timeout: 60000 },
    );
  }, 90000);
});
