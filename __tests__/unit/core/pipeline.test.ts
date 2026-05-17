import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { join } from "node:path";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  getNextFeatureNumber,
  generateSlug,
  formatFeatureRef,
  resolveFeatureRef,
} from "../../../src/core/pipeline.js";
import type { DevflowState } from "../../../src/core/types.js";

describe("pipeline", () => {
  describe("getNextFeatureNumber", () => {
    it("should return 1 for empty state", () => {
      const state: DevflowState = { features: {} };
      expect(getNextFeatureNumber(state)).toBe(1);
    });

    it("should return max + 1 for existing features", () => {
      const state: DevflowState = {
        features: {
          "001-auth": { slug: "auth", number: 1, phase: "done", tasks: [], artifacts: {}, createdAt: "", updatedAt: "" },
          "003-pay": { slug: "pay", number: 3, phase: "done", tasks: [], artifacts: {}, createdAt: "", updatedAt: "" },
        },
      };
      expect(getNextFeatureNumber(state)).toBe(4);
    });
  });

  describe("generateSlug", () => {
    it("should convert to kebab-case", () => {
      expect(generateSlug("Add OAuth Login")).toBe("add-oauth-login");
    });

    it("should remove special characters", () => {
      expect(generateSlug("feat: add auth!@#$")).toBe("feat-add-auth");
    });

    it("should truncate long slugs", () => {
      const long = "a".repeat(50);
      expect(generateSlug(long).length).toBeLessThanOrEqual(40);
    });

    it("should return 'feature' for empty string", () => {
      expect(generateSlug("")).toBe("feature");
    });

    it("should return 'feature' for special chars only", () => {
      expect(generateSlug("!@#$%")).toBe("feature");
    });

    it("should collapse multiple hyphens", () => {
      expect(generateSlug("add   multiple   spaces")).toBe("add-multiple-spaces");
    });
  });

  describe("formatFeatureRef", () => {
    it("should pad number to 3 digits", () => {
      expect(formatFeatureRef(1, "auth")).toBe("001-auth");
    });

    it("should handle numbers with 3+ digits", () => {
      expect(formatFeatureRef(100, "auth")).toBe("100-auth");
    });
  });

  describe("resolveFeatureRef", () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), "devflow-pipeline-"));
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it("should match exact key", async () => {
      const state: DevflowState = {
        features: {
          "001-auth-oauth": { slug: "auth-oauth", number: 1, phase: "done", tasks: [], artifacts: {}, createdAt: "", updatedAt: "" },
        },
      };
      const result = await resolveFeatureRef(tempDir, state, "001-auth-oauth");
      expect(result).toBe("001-auth-oauth");
    });

    it("should match by number prefix", async () => {
      const state: DevflowState = {
        features: {
          "001-auth-oauth": { slug: "auth-oauth", number: 1, phase: "done", tasks: [], artifacts: {}, createdAt: "", updatedAt: "" },
        },
      };
      const result = await resolveFeatureRef(tempDir, state, "1");
      expect(result).toBe("001-auth-oauth");
    });

    it("should match by slug prefix", async () => {
      const state: DevflowState = {
        features: {
          "001-auth-oauth": { slug: "auth-oauth", number: 1, phase: "done", tasks: [], artifacts: {}, createdAt: "", updatedAt: "" },
        },
      };
      const result = await resolveFeatureRef(tempDir, state, "auth-oauth");
      expect(result).toBe("001-auth-oauth");
    });

    it("should return null when not found", async () => {
      const state: DevflowState = { features: {} };
      const result = await resolveFeatureRef(tempDir, state, "999");
      expect(result).toBeNull();
    });

    it("should fallback to directory scan when not in state", async () => {
      const state: DevflowState = { features: {} };
      const featuresDir = join(tempDir, ".devflow", "features", "002-payment");
      await mkdir(featuresDir, { recursive: true });
      const result = await resolveFeatureRef(tempDir, state, "2");
      expect(result).toBe("002-payment");
    });

    it("should fallback to directory scan with slug match", async () => {
      const state: DevflowState = { features: {} };
      const featuresDir = join(tempDir, ".devflow", "features", "003-stripe-integration");
      await mkdir(featuresDir, { recursive: true });
      const result = await resolveFeatureRef(tempDir, state, "stripe-integration");
      expect(result).toBe("003-stripe-integration");
    });
  });
});
