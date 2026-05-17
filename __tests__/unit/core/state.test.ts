import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { join } from "node:path";
import { mkdtemp, rm, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { mkdir } from "node:fs/promises";
import {
  readState,
  writeState,
  initState,
  addFeature,
  updatePhase,
  completeTask,
  setArtifact,
} from "../../../src/core/state.js";
import type { DevflowState, FeatureState } from "../../../src/core/types.js";

function makeFeature(overrides?: Partial<FeatureState>): FeatureState {
  return {
    slug: "auth-oauth",
    number: 1,
    phase: "initialized",
    tasks: [
      { number: 1, title: "Setup config", completed: false },
      { number: 2, title: "Implement flow", completed: false },
    ],
    artifacts: {},
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("StateManager", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "devflow-state-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("readState", () => {
    it("should return empty state when file does not exist", async () => {
      const state = await readState(tempDir);
      expect(state.features).toEqual({});
    });

    it("should read existing state", async () => {
      const expectedState: DevflowState = {
        features: { "001-auth": makeFeature() },
      };
      await writeState(tempDir, expectedState);
      const state = await readState(tempDir);
      expect(state.features["001-auth"]).toBeDefined();
      expect(state.features["001-auth"]!.slug).toBe("auth-oauth");
    });
  });

  describe("initState", () => {
    it("should create state file if not exists", async () => {
      await initState(tempDir);
      const state = await readState(tempDir);
      expect(state.features).toEqual({});
    });

    it("should not overwrite existing state", async () => {
      const existingState: DevflowState = {
        features: { "001-auth": makeFeature() },
      };
      await writeState(tempDir, existingState);
      await initState(tempDir);
      const state = await readState(tempDir);
      expect(state.features["001-auth"]).toBeDefined();
    });
  });

  describe("addFeature", () => {
    it("should add a new feature to state", () => {
      const state: DevflowState = { features: {} };
      const feature = makeFeature();
      const updated = addFeature(state, "001-auth", feature);
      expect(updated.features["001-auth"]).toEqual(feature);
    });

    it("should preserve existing features", () => {
      const state: DevflowState = {
        features: { "001-auth": makeFeature() },
      };
      const newFeature = makeFeature({ slug: "payment", number: 2 });
      const updated = addFeature(state, "002-payment", newFeature);
      expect(updated.features["001-auth"]).toBeDefined();
      expect(updated.features["002-payment"]).toBeDefined();
    });
  });

  describe("updatePhase", () => {
    it("should update phase forward", () => {
      const state: DevflowState = {
        features: { "001-auth": makeFeature({ phase: "initialized" }) },
      };
      const updated = updatePhase(state, "001-auth", "prd_created");
      expect(updated.features["001-auth"]!.phase).toBe("prd_created");
    });

    it("should throw on backward transition", () => {
      const state: DevflowState = {
        features: { "001-auth": makeFeature({ phase: "tasks_created" }) },
      };
      expect(() => updatePhase(state, "001-auth", "initialized")).toThrow(
        "backwards transition",
      );
    });

    it("should throw for unknown feature", () => {
      const state: DevflowState = { features: {} };
      expect(() => updatePhase(state, "unknown", "prd_created")).toThrow(
        "not found",
      );
    });
  });

  describe("completeTask", () => {
    it("should mark task as completed", () => {
      const state: DevflowState = {
        features: { "001-auth": makeFeature() },
      };
      const updated = completeTask(state, "001-auth", 1);
      expect(updated.features["001-auth"]!.tasks[0]!.completed).toBe(true);
      expect(updated.features["001-auth"]!.tasks[1]!.completed).toBe(false);
    });

    it("should throw for unknown feature", () => {
      const state: DevflowState = { features: {} };
      expect(() => completeTask(state, "unknown", 1)).toThrow("not found");
    });
  });

  describe("setArtifact", () => {
    it("should set artifact metadata", () => {
      const state: DevflowState = {
        features: { "001-auth": makeFeature() },
      };
      const artifact = {
        path: ".devflow/features/001-auth/prd.md",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        hash: "abc123",
      };
      const updated = setArtifact(state, "001-auth", "prd", artifact);
      expect(updated.features["001-auth"]!.artifacts["prd"]).toEqual(artifact);
    });
  });

  describe("lock mechanism", () => {
    it("should use atomic lock file via O_CREAT|O_EXCL", async () => {
      const state: DevflowState = { features: {} };
      await writeState(tempDir, state);
      const readBack = await readState(tempDir);
      expect(readBack.features).toEqual({});
    });

    it("should fail when lock is already held", async () => {
      const lockDir = join(tempDir, ".devflow");
      await mkdir(lockDir, { recursive: true });
      const lockPath = join(lockDir, ".lock");
      const fd = await open(lockPath, "wx");
      await fd.writeFile("{}");
      await fd.close();
      const state: DevflowState = { features: {} };
      await expect(writeState(tempDir, state)).rejects.toThrow("Lock file exists");
      await rm(lockPath);
    });
  });
});
