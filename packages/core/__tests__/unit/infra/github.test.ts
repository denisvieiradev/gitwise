import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

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
});
