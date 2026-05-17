import { describe, it, expect } from "@jest/globals";
import { resolveModelTier } from "../../../src/providers/model-router.js";

describe("ModelRouter", () => {
  it("should return fast tier for init command", () => {
    expect(resolveModelTier("init")).toBe("fast");
  });

  it("should return powerful tier for prd command", () => {
    expect(resolveModelTier("prd")).toBe("powerful");
  });

  it("should return powerful tier for techspec command", () => {
    expect(resolveModelTier("techspec")).toBe("powerful");
  });

  it("should return balanced tier for tasks command", () => {
    expect(resolveModelTier("tasks")).toBe("balanced");
  });

  it("should return balanced tier for run-tasks command", () => {
    expect(resolveModelTier("run-tasks")).toBe("balanced");
  });

  it("should return powerful tier for review command", () => {
    expect(resolveModelTier("review")).toBe("powerful");
  });

  it("should return fast tier for commit command", () => {
    expect(resolveModelTier("commit")).toBe("fast");
  });

  it("should return fast tier for pr command", () => {
    expect(resolveModelTier("pr")).toBe("fast");
  });

  it("should return balanced as default for unknown command", () => {
    expect(resolveModelTier("unknown")).toBe("balanced");
  });
});
