import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { join } from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readConfig } from "../../src/core/config.js";
import { readState } from "../../src/core/state.js";
import { fileExists } from "../../src/infra/filesystem.js";

const exec = promisify(execFile);

describe("devflow init (integration)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "devflow-init-"));
    await exec("git", ["init"], { cwd: tempDir });
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ name: "test-project" }));
    await writeFile(join(tempDir, "tsconfig.json"), "{}");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should detect project as typescript with jest", async () => {
    await writeFile(join(tempDir, "jest.config.ts"), "export default {}");
    // We test the scanner and config modules directly since the CLI needs interactive input
    const { scanProject } = await import("../../src/core/scanner.js");
    const scan = await scanProject(tempDir);
    expect(scan.language).toBe("typescript");
    expect(scan.testFramework).toBe("jest");
  });

  it("should write config and state files", async () => {
    const { writeConfig } = await import("../../src/core/config.js");
    const { initState } = await import("../../src/core/state.js");
    const { DEFAULT_CONFIG } = await import("../../src/core/types.js");
    const { scanProject } = await import("../../src/core/scanner.js");
    const scan = await scanProject(tempDir);
    const config = { ...DEFAULT_CONFIG, project: scan };
    await writeConfig(tempDir, config);
    await initState(tempDir);
    const configResult = await readConfig(tempDir);
    expect(configResult).not.toBeNull();
    expect(configResult!.project.language).toBe("typescript");
    const stateResult = await readState(tempDir);
    expect(stateResult.features).toEqual({});
    expect(await fileExists(join(tempDir, ".devflow", "config.json"))).toBe(true);
    expect(await fileExists(join(tempDir, ".devflow", "state.json"))).toBe(true);
  });
});
