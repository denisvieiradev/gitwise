import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { mkdtemp, readFile, rm, writeFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  deleteReleasePlan,
  ensureGitignored,
  loadReleasePlan,
  saveReleasePlan,
  type PersistedReleasePlan,
} from "../../../src/commands/release-plan.js";

const PLAN_REL = ".gitwise/release-plan.json";

function makePlan(overrides: Partial<PersistedReleasePlan> = {}): PersistedReleasePlan {
  return {
    schema: 1,
    strategy: "gitflow",
    currentVersion: "1.0.0",
    newVersion: "1.1.0",
    suggestedBump: "minor",
    changelog: "### Added\n- something",
    notes: "## v1.1.0\n\nFancy release.",
    commits: "feat: add thing\nfix: tighten edge case",
    preparedAt: "2026-05-18T12:34:56.000Z",
    baseCommit: "deadbeefcafebabefacefeedfeedfacecafedead",
    targetBranch: "release/1.1.0",
    releaseBranchCreated: true,
    tokens: { input: 1234, output: 567 },
    ...overrides,
  };
}

describe("release-plan persistence", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "gitwise-release-plan-"));
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  describe("saveReleasePlan + loadReleasePlan", () => {
    it("round-trips a plan with identical field values", async () => {
      const plan = makePlan();
      await saveReleasePlan(cwd, plan);
      const loaded = await loadReleasePlan(cwd);
      expect(loaded).toEqual(plan);
    });

    it("creates .gitwise/ when missing", async () => {
      const plan = makePlan();
      await saveReleasePlan(cwd, plan);
      const dirStat = await stat(join(cwd, ".gitwise"));
      expect(dirStat.isDirectory()).toBe(true);
    });

    it("loadReleasePlan returns null when the plan file does not exist", async () => {
      expect(await loadReleasePlan(cwd)).toBeNull();
    });

    it("loadReleasePlan throws INVALID_PLAN_SCHEMA when schema is not 1", async () => {
      const wrong = { ...makePlan(), schema: 2 };
      await mkdir(join(cwd, ".gitwise"), { recursive: true });
      await writeFile(join(cwd, PLAN_REL), JSON.stringify(wrong), "utf-8");

      await expect(loadReleasePlan(cwd)).rejects.toMatchObject({
        code: "INVALID_PLAN_SCHEMA",
      });
    });

    it("loadReleasePlan throws a typed error when the file is not valid JSON", async () => {
      await mkdir(join(cwd, ".gitwise"), { recursive: true });
      await writeFile(join(cwd, PLAN_REL), "{ not: valid json", "utf-8");

      await expect(loadReleasePlan(cwd)).rejects.toMatchObject({
        code: "INVALID_PLAN_JSON",
      });
    });

    it("loadReleasePlan throws INVALID_PLAN_SCHEMA when JSON parses to a non-object", async () => {
      await mkdir(join(cwd, ".gitwise"), { recursive: true });
      await writeFile(join(cwd, PLAN_REL), "null", "utf-8");

      await expect(loadReleasePlan(cwd)).rejects.toMatchObject({
        code: "INVALID_PLAN_SCHEMA",
      });
    });

    describe("loadReleasePlan rejects schema:1 payloads with malformed fields", () => {
      async function writeRawPlan(payload: unknown): Promise<void> {
        await mkdir(join(cwd, ".gitwise"), { recursive: true });
        await writeFile(join(cwd, PLAN_REL), JSON.stringify(payload), "utf-8");
      }

      const requiredStringFields: Array<keyof PersistedReleasePlan> = [
        "currentVersion",
        "newVersion",
        "changelog",
        "notes",
        "commits",
        "preparedAt",
        "baseCommit",
        "targetBranch",
      ];

      it.each(requiredStringFields)(
        "throws INVALID_PLAN_SCHEMA when %s is missing",
        async (field) => {
          const plan = makePlan();
          const { [field]: _omit, ...rest } = plan;
          await writeRawPlan(rest);

          await expect(loadReleasePlan(cwd)).rejects.toMatchObject({
            code: "INVALID_PLAN_SCHEMA",
          });
        },
      );

      it.each(requiredStringFields)(
        "throws INVALID_PLAN_SCHEMA when %s has a non-string value",
        async (field) => {
          await writeRawPlan({ ...makePlan(), [field]: 42 });

          await expect(loadReleasePlan(cwd)).rejects.toMatchObject({
            code: "INVALID_PLAN_SCHEMA",
          });
        },
      );

      it("throws INVALID_PLAN_SCHEMA when strategy is missing", async () => {
        const { strategy: _strategy, ...rest } = makePlan();
        await writeRawPlan(rest);

        await expect(loadReleasePlan(cwd)).rejects.toMatchObject({
          code: "INVALID_PLAN_SCHEMA",
        });
      });

      it("throws INVALID_PLAN_SCHEMA when strategy is an unknown value", async () => {
        await writeRawPlan({ ...makePlan(), strategy: "trunk-based" });

        await expect(loadReleasePlan(cwd)).rejects.toMatchObject({
          code: "INVALID_PLAN_SCHEMA",
        });
      });

      it("throws INVALID_PLAN_SCHEMA when suggestedBump is missing", async () => {
        const { suggestedBump: _bump, ...rest } = makePlan();
        await writeRawPlan(rest);

        await expect(loadReleasePlan(cwd)).rejects.toMatchObject({
          code: "INVALID_PLAN_SCHEMA",
        });
      });

      it("throws INVALID_PLAN_SCHEMA when suggestedBump is an unknown value", async () => {
        await writeRawPlan({ ...makePlan(), suggestedBump: "prerelease" });

        await expect(loadReleasePlan(cwd)).rejects.toMatchObject({
          code: "INVALID_PLAN_SCHEMA",
        });
      });

      it("throws INVALID_PLAN_SCHEMA when releaseBranchCreated is missing", async () => {
        const { releaseBranchCreated: _flag, ...rest } = makePlan();
        await writeRawPlan(rest);

        await expect(loadReleasePlan(cwd)).rejects.toMatchObject({
          code: "INVALID_PLAN_SCHEMA",
        });
      });

      it("throws INVALID_PLAN_SCHEMA when releaseBranchCreated is not a boolean", async () => {
        await writeRawPlan({ ...makePlan(), releaseBranchCreated: "true" });

        await expect(loadReleasePlan(cwd)).rejects.toMatchObject({
          code: "INVALID_PLAN_SCHEMA",
        });
      });

      it("throws INVALID_PLAN_SCHEMA when tokens is missing", async () => {
        const { tokens: _tokens, ...rest } = makePlan();
        await writeRawPlan(rest);

        await expect(loadReleasePlan(cwd)).rejects.toMatchObject({
          code: "INVALID_PLAN_SCHEMA",
        });
      });

      it("throws INVALID_PLAN_SCHEMA when tokens.input is not a finite number", async () => {
        await writeRawPlan({ ...makePlan(), tokens: { input: "1234", output: 567 } });

        await expect(loadReleasePlan(cwd)).rejects.toMatchObject({
          code: "INVALID_PLAN_SCHEMA",
        });
      });

      it("throws INVALID_PLAN_SCHEMA when tokens.output is missing", async () => {
        await writeRawPlan({ ...makePlan(), tokens: { input: 1234 } });

        await expect(loadReleasePlan(cwd)).rejects.toMatchObject({
          code: "INVALID_PLAN_SCHEMA",
        });
      });
    });
  });

  describe("deleteReleasePlan", () => {
    it("removes the file when present", async () => {
      await saveReleasePlan(cwd, makePlan());
      await deleteReleasePlan(cwd);
      expect(await loadReleasePlan(cwd)).toBeNull();
    });

    it("does not throw when the file is absent (idempotent)", async () => {
      await expect(deleteReleasePlan(cwd)).resolves.toBeUndefined();
      // Calling again is still a no-op.
      await expect(deleteReleasePlan(cwd)).resolves.toBeUndefined();
    });
  });

  describe("ensureGitignored", () => {
    const entry = ".gitwise/release-plan.json";
    let logSpy: jest.SpiedFunction<typeof console.log>;

    beforeEach(() => {
      logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
      logSpy.mockRestore();
    });

    it("appends the entry when no .gitignore exists", async () => {
      await ensureGitignored(cwd, entry);
      const contents = await readFile(join(cwd, ".gitignore"), "utf-8");
      expect(contents).toBe(`${entry}\n`);
      expect(logSpy).toHaveBeenCalledTimes(1);
    });

    it("appends the entry when .gitignore exists but lacks coverage", async () => {
      await writeFile(join(cwd, ".gitignore"), "node_modules\ndist\n", "utf-8");
      await ensureGitignored(cwd, entry);
      const contents = await readFile(join(cwd, ".gitignore"), "utf-8");
      expect(contents).toBe(`node_modules\ndist\n${entry}\n`);
      expect(logSpy).toHaveBeenCalledTimes(1);
    });

    it("is a no-op when the exact entry already exists", async () => {
      const original = `node_modules\n${entry}\ndist\n`;
      await writeFile(join(cwd, ".gitignore"), original, "utf-8");
      await ensureGitignored(cwd, entry);
      const contents = await readFile(join(cwd, ".gitignore"), "utf-8");
      expect(contents).toBe(original);
      expect(logSpy).not.toHaveBeenCalled();
    });

    it("is a no-op when a wildcard '.gitwise/' covers the entry", async () => {
      const original = "node_modules\n.gitwise/\n";
      await writeFile(join(cwd, ".gitignore"), original, "utf-8");
      await ensureGitignored(cwd, entry);
      const contents = await readFile(join(cwd, ".gitignore"), "utf-8");
      expect(contents).toBe(original);
      expect(logSpy).not.toHaveBeenCalled();
    });

    it("is a no-op when a '.gitwise/*' wildcard covers the entry", async () => {
      const original = ".gitwise/*\n";
      await writeFile(join(cwd, ".gitignore"), original, "utf-8");
      await ensureGitignored(cwd, entry);
      const contents = await readFile(join(cwd, ".gitignore"), "utf-8");
      expect(contents).toBe(original);
      expect(logSpy).not.toHaveBeenCalled();
    });

    it("adds a leading newline when the existing file lacks a trailing newline", async () => {
      await writeFile(join(cwd, ".gitignore"), "node_modules", "utf-8");
      await ensureGitignored(cwd, entry);
      const contents = await readFile(join(cwd, ".gitignore"), "utf-8");
      expect(contents).toBe(`node_modules\n${entry}\n`);
    });

    it("ignores commented lines when detecting coverage", async () => {
      const original = `# ${entry}\n`;
      await writeFile(join(cwd, ".gitignore"), original, "utf-8");
      await ensureGitignored(cwd, entry);
      const contents = await readFile(join(cwd, ".gitignore"), "utf-8");
      expect(contents).toBe(`# ${entry}\n${entry}\n`);
    });
  });
});
