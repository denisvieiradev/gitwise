import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ensureGitignored } from "../../src/commands/release-plan.js";

describe("ensureGitignored (integration with a real .gitignore)", () => {
  let cwd: string;
  let logSpy: jest.SpiedFunction<typeof console.log>;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "gitwise-ensure-gitignored-"));
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    logSpy.mockRestore();
    await rm(cwd, { recursive: true, force: true });
  });

  it("preserves unrelated content and appends the entry with a trailing newline", async () => {
    const original = [
      "# Build artifacts",
      "node_modules/",
      "dist/",
      "",
      "# Local env",
      ".env.local",
      "",
    ].join("\n");
    await writeFile(join(cwd, ".gitignore"), original, "utf-8");

    await ensureGitignored(cwd, ".gitwise/release-plan.json");

    const updated = await readFile(join(cwd, ".gitignore"), "utf-8");
    expect(updated.startsWith(original)).toBe(true);
    expect(updated.endsWith("\n.gitwise/release-plan.json\n")).toBe(true);
    expect(updated).toBe(`${original}.gitwise/release-plan.json\n`);
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it("rerunning against an already-ignored file is a no-op", async () => {
    const original = "node_modules/\n.gitwise/release-plan.json\n";
    await writeFile(join(cwd, ".gitignore"), original, "utf-8");

    await ensureGitignored(cwd, ".gitwise/release-plan.json");

    const updated = await readFile(join(cwd, ".gitignore"), "utf-8");
    expect(updated).toBe(original);
    expect(logSpy).not.toHaveBeenCalled();
  });
});
