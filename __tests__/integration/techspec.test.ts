import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { join } from "node:path";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolveFeatureRef, getFeaturePath } from "../../src/core/pipeline.js";
import { writeConfig } from "../../src/core/config.js";
import { writeState } from "../../src/core/state.js";
import { DEFAULT_CONFIG, type DevflowState, type FeatureState } from "../../src/core/types.js";
import { fileExists } from "../../src/infra/filesystem.js";

function makeFeature(): FeatureState {
  return {
    slug: "auth-oauth",
    number: 1,
    phase: "prd_created",
    tasks: [],
    artifacts: {
      prd: {
        path: ".devflow/features/001-auth-oauth/prd.md",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        hash: "abc123",
      },
    },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("devflow techspec + tasks (integration)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "devflow-techspec-"));
    const state: DevflowState = {
      features: { "001-auth-oauth": makeFeature() },
    };
    await writeConfig(tempDir, DEFAULT_CONFIG);
    await writeState(tempDir, state);
    const featurePath = getFeaturePath(tempDir, "001-auth-oauth");
    await mkdir(featurePath, { recursive: true });
    await writeFile(join(featurePath, "prd.md"), "# PRD\nAuth OAuth feature");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should resolve feature ref by number prefix", async () => {
    const state: DevflowState = {
      features: { "001-auth-oauth": makeFeature() },
    };
    const ref = await resolveFeatureRef(tempDir, state, "001");
    expect(ref).toBe("001-auth-oauth");
  });

  it("should resolve feature ref by slug", async () => {
    const state: DevflowState = {
      features: { "001-auth-oauth": makeFeature() },
    };
    const ref = await resolveFeatureRef(tempDir, state, "auth");
    expect(ref).toBe("001-auth-oauth");
  });

  it("should return null for unknown ref", async () => {
    const state: DevflowState = { features: {} };
    const ref = await resolveFeatureRef(tempDir, state, "999");
    expect(ref).toBeNull();
  });

  it("should have PRD file in feature directory", async () => {
    const featurePath = getFeaturePath(tempDir, "001-auth-oauth");
    const prdExists = await fileExists(join(featurePath, "prd.md"));
    expect(prdExists).toBe(true);
  });
});
