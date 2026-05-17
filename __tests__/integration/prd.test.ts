import { describe, it, expect } from "@jest/globals";
import {
  getNextFeatureNumber,
  generateSlug,
  formatFeatureRef,
} from "../../src/core/pipeline.js";
import type { DevflowState } from "../../src/core/types.js";

describe("Pipeline helpers (prd)", () => {
  describe("getNextFeatureNumber", () => {
    it("should return 1 for empty state", () => {
      const state: DevflowState = { features: {} };
      expect(getNextFeatureNumber(state)).toBe(1);
    });

    it("should return next number after existing features", () => {
      const state: DevflowState = {
        features: {
          "001-auth": {
            slug: "auth",
            number: 1,
            phase: "prd_created",
            tasks: [],
            artifacts: {},
            createdAt: "",
            updatedAt: "",
          },
          "002-payment": {
            slug: "payment",
            number: 2,
            phase: "initialized",
            tasks: [],
            artifacts: {},
            createdAt: "",
            updatedAt: "",
          },
        },
      };
      expect(getNextFeatureNumber(state)).toBe(3);
    });
  });

  describe("generateSlug", () => {
    it("should convert description to kebab-case", () => {
      expect(generateSlug("Add OAuth Authentication")).toBe(
        "add-oauth-authentication",
      );
    });

    it("should remove special characters", () => {
      expect(generateSlug("Feature! With @special #chars")).toBe(
        "feature-with-special-chars",
      );
    });

    it("should truncate to 40 chars", () => {
      const long = "a very long description that exceeds the forty character limit by quite a bit";
      const slug = generateSlug(long);
      expect(slug.length).toBeLessThanOrEqual(40);
    });
  });

  describe("formatFeatureRef", () => {
    it("should format with zero-padded number", () => {
      expect(formatFeatureRef(1, "auth-oauth")).toBe("001-auth-oauth");
    });

    it("should handle multi-digit numbers", () => {
      expect(formatFeatureRef(42, "payments")).toBe("042-payments");
    });
  });
});
