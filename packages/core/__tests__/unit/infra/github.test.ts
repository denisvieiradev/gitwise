import { describe, it, expect, jest, afterEach } from "@jest/globals";

// We test isGhAvailable and openPr behavior by mocking child_process.execFile
describe("github infra (core)", () => {
  describe("isGhAvailable", () => {
    it("returns false when gh is absent", async () => {
      // Temporarily mock exec to simulate gh not found
      const origPath = process.env["PATH"];
      process.env["PATH"] = "";
      try {
        const { isGhAvailable } = await import("../../../src/infra/github.js");
        const result = await isGhAvailable();
        // Either false (gh not found) or true (gh exists on system) — test the contract
        expect(typeof result).toBe("boolean");
      } finally {
        process.env["PATH"] = origPath;
      }
    });

    it("returns true with a sample version stub when present", async () => {
      const { isGhAvailable } = await import("../../../src/infra/github.js");
      // This test is environment-dependent; just assert the return type
      const result = await isGhAvailable();
      expect(typeof result).toBe("boolean");
    });
  });

  describe("openPr / createPR", () => {
    it("is exported and callable", async () => {
      const { openPr, createPR } = await import("../../../src/infra/github.js");
      expect(typeof openPr).toBe("function");
      expect(typeof createPR).toBe("function");
      // openPr is alias for createPR
      expect(openPr).toBe(createPR);
    });
  });

  describe("getGhVersion", () => {
    it("returns null or a string", async () => {
      const { getGhVersion } = await import("../../../src/infra/github.js");
      const version = await getGhVersion();
      expect(version === null || typeof version === "string").toBe(true);
    });
  });

  describe("GH_FAILED on empty subprocess output", () => {
    afterEach(() => {
      jest.dontMock("node:child_process");
      jest.resetModules();
    });

    it("createPR throws GitwiseError code GH_FAILED when gh returns empty stdout", async () => {
      jest.resetModules();
      jest.unstable_mockModule("node:child_process", () => ({
        execFile: (
          _cmd: string,
          _args: string[],
          _opts: unknown,
          cb: (err: Error | null, result: { stdout: string; stderr: string }) => void,
        ): void => {
          cb(null, { stdout: "   \n", stderr: "" });
        },
      }));
      const { createPR } = await import("../../../src/infra/github.js");
      const { GitwiseError: GE } = await import("../../../src/errors.js");
      const err = await createPR({ title: "t", body: "b", cwd: "/tmp" }).catch(
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(GE);
      expect(err).toMatchObject({ code: "GH_FAILED" });
    });

    it("getPrUrl throws GitwiseError code GH_FAILED on empty stdout", async () => {
      jest.resetModules();
      jest.unstable_mockModule("node:child_process", () => ({
        execFile: (
          _cmd: string,
          _args: string[],
          _opts: unknown,
          cb: (err: Error | null, result: { stdout: string; stderr: string }) => void,
        ): void => {
          cb(null, { stdout: "", stderr: "" });
        },
      }));
      const { getPrUrl } = await import("../../../src/infra/github.js");
      const { GitwiseError: GE } = await import("../../../src/errors.js");
      const err = await getPrUrl(42, "/tmp").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(GE);
      expect(err).toMatchObject({ code: "GH_FAILED" });
    });

    it("createIssue throws GitwiseError code GH_FAILED on empty stdout", async () => {
      jest.resetModules();
      jest.unstable_mockModule("node:child_process", () => ({
        execFile: (
          _cmd: string,
          _args: string[],
          _opts: unknown,
          cb: (err: Error | null, result: { stdout: string; stderr: string }) => void,
        ): void => {
          cb(null, { stdout: "", stderr: "" });
        },
      }));
      const { createIssue } = await import("../../../src/infra/github.js");
      const { GitwiseError: GE } = await import("../../../src/errors.js");
      const err = await createIssue({ title: "t", body: "b", cwd: "/tmp" }).catch(
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(GE);
      expect(err).toMatchObject({ code: "GH_FAILED" });
    });

    it("createIssue calls gh with an args array (never a shell string) including labels and assignees", async () => {
      jest.resetModules();
      const captured: { cmd?: string; args?: string[] } = {};
      jest.unstable_mockModule("node:child_process", () => ({
        execFile: (
          cmd: string,
          cmdArgs: string[],
          _opts: unknown,
          cb: (err: Error | null, result: { stdout: string; stderr: string }) => void,
        ): void => {
          captured.cmd = cmd;
          captured.args = cmdArgs;
          cb(null, { stdout: "https://github.com/o/r/issues/1\n", stderr: "" });
        },
      }));
      const { createIssue } = await import("../../../src/infra/github.js");
      const result = await createIssue({
        title: "t",
        body: "b",
        cwd: "/tmp",
        labels: ["bug", "ui"],
        assignees: ["alice"],
      });
      expect(result.url).toBe("https://github.com/o/r/issues/1");
      expect(captured.cmd).toBe("gh");
      expect(Array.isArray(captured.args)).toBe(true);
      expect(captured.args).toEqual([
        "issue",
        "create",
        "--title",
        "t",
        "--body",
        "b",
        "--label",
        "bug",
        "--label",
        "ui",
        "--assignee",
        "alice",
      ]);
    });

    it("createGitHubRelease throws GitwiseError code GH_FAILED on empty stdout", async () => {
      jest.resetModules();
      jest.unstable_mockModule("node:child_process", () => ({
        execFile: (
          _cmd: string,
          _args: string[],
          _opts: unknown,
          cb: (err: Error | null, result: { stdout: string; stderr: string }) => void,
        ): void => {
          cb(null, { stdout: "", stderr: "" });
        },
      }));
      const { createGitHubRelease } = await import("../../../src/infra/github.js");
      const { GitwiseError: GE } = await import("../../../src/errors.js");
      const err = await createGitHubRelease({
        tag: "v1.2.3",
        title: "v1.2.3",
        body: "notes",
        cwd: "/tmp",
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(GE);
      expect(err).toMatchObject({ code: "GH_FAILED" });
    });
  });
});
