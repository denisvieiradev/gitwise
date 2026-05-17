import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { join } from "node:path";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { checkDrift, hashFile } from "../../../src/core/drift.js";
import type { DevflowState, FeatureState } from "../../../src/core/types.js";

describe("DriftDetector", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "devflow-drift-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("hashFile", () => {
    it("should return SHA-256 hash of file content", async () => {
      const filePath = join(tempDir, "test.md");
      await writeFile(filePath, "hello world");
      const hash = await hashFile(filePath);
      const expected = createHash("sha256").update("hello world").digest("hex");
      expect(hash).toBe(expected);
    });
  });

  describe("checkDrift", () => {
    function makeFeatureWithArtifacts(prdHash: string): FeatureState {
      return {
        slug: "auth",
        number: 1,
        phase: "techspec_created",
        tasks: [],
        artifacts: {
          prd: {
            path: ".devflow/features/001-auth/prd.md",
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
            hash: prdHash,
          },
          techspec: {
            path: ".devflow/features/001-auth/techspec.md",
            createdAt: "2026-01-02T00:00:00Z",
            updatedAt: "2026-01-02T00:00:00Z",
            hash: "techspec-hash",
          },
        },
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-02T00:00:00Z",
      };
    }

    it("should return no warnings when hashes match", async () => {
      const prdContent = "# PRD Content";
      const prdHash = createHash("sha256").update(prdContent).digest("hex");
      const featurePath = join(tempDir, ".devflow", "features", "001-auth");
      await mkdir(featurePath, { recursive: true });
      await writeFile(join(featurePath, "prd.md"), prdContent);
      await writeFile(join(featurePath, "techspec.md"), "# Techspec");
      const state: DevflowState = {
        features: { "001-auth": makeFeatureWithArtifacts(prdHash) },
      };
      const warnings = await checkDrift(tempDir, "001-auth", state);
      expect(warnings).toHaveLength(0);
    });

    it("should return warning when PRD was modified after techspec", async () => {
      const originalHash = createHash("sha256").update("original content").digest("hex");
      const featurePath = join(tempDir, ".devflow", "features", "001-auth");
      await mkdir(featurePath, { recursive: true });
      await writeFile(join(featurePath, "prd.md"), "modified content");
      await writeFile(join(featurePath, "techspec.md"), "# Techspec");
      const state: DevflowState = {
        features: { "001-auth": makeFeatureWithArtifacts(originalHash) },
      };
      const warnings = await checkDrift(tempDir, "001-auth", state);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]!.artifact).toBe("prd");
      expect(warnings[0]!.downstream).toContain("techspec");
    });

    it("should return no warnings for unknown feature", async () => {
      const state: DevflowState = { features: {} };
      const warnings = await checkDrift(tempDir, "unknown", state);
      expect(warnings).toHaveLength(0);
    });

    it("should return no warnings when no downstream artifacts exist", async () => {
      const state: DevflowState = {
        features: {
          "001-auth": {
            slug: "auth",
            number: 1,
            phase: "prd_created",
            tasks: [],
            artifacts: {
              prd: {
                path: ".devflow/features/001-auth/prd.md",
                createdAt: "2026-01-01T00:00:00Z",
                updatedAt: "2026-01-01T00:00:00Z",
                hash: "some-hash",
              },
            },
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
          },
        },
      };
      const warnings = await checkDrift(tempDir, "001-auth", state);
      expect(warnings).toHaveLength(0);
    });
  });
});
