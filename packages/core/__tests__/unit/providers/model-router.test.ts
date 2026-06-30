import { describe, it, expect } from "@jest/globals";
import { resolveModelTier, SUPPORTED_COMMANDS } from "../../../src/providers/model-router.js";

describe("model-router (core)", () => {
  it("exposes exactly the supported command keys", () => {
    expect(SUPPORTED_COMMANDS.sort()).toEqual(["commit", "issue", "pr", "release", "review"].sort());
  });

  it("commit defaults to fast tier", () => {
    expect(resolveModelTier("commit")).toBe("fast");
  });

  it("review defaults to powerful tier", () => {
    expect(resolveModelTier("review")).toBe("powerful");
  });

  it("pr defaults to fast tier", () => {
    expect(resolveModelTier("pr")).toBe("fast");
  });

  it("release defaults to fast tier", () => {
    expect(resolveModelTier("release")).toBe("fast");
  });

  it("issue defaults to fast tier", () => {
    expect(resolveModelTier("issue")).toBe("fast");
  });

  it("unknown command defaults to balanced", () => {
    expect(resolveModelTier("unknown")).toBe("balanced");
  });

  it("pipeline-era commands (init, prd, techspec, tasks) are NOT in the map", () => {
    expect(resolveModelTier("init")).toBe("balanced");
    expect(resolveModelTier("prd")).toBe("balanced");
    expect(resolveModelTier("techspec")).toBe("balanced");
    expect(resolveModelTier("tasks")).toBe("balanced");
  });
});
