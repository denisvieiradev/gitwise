import { join } from "node:path";
import { open, unlink } from "node:fs/promises";
import { fileExists, readJSON, writeJSON, ensureDir } from "../infra/filesystem.js";
import { debug } from "../infra/logger.js";
import {
  EMPTY_STATE,
  PHASE_ORDER,
  type ArtifactMeta,
  type DevflowState,
  type FeatureState,
  type Phase,
  type TaskState,
} from "./types.js";

const STATE_DIR = ".devflow";
const STATE_FILE = "state.json";
const LOCK_FILE = ".lock";
const LOCK_MAX_RETRIES = 3;
const LOCK_RETRY_DELAY_MS = 100;

function getStatePath(projectRoot: string): string {
  return join(projectRoot, STATE_DIR, STATE_FILE);
}

function getLockPath(projectRoot: string): string {
  return join(projectRoot, STATE_DIR, LOCK_FILE);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireLock(projectRoot: string): Promise<void> {
  const lockPath = getLockPath(projectRoot);
  await ensureDir(join(projectRoot, STATE_DIR));
  for (let attempt = 0; attempt < LOCK_MAX_RETRIES; attempt++) {
    try {
      const fd = await open(lockPath, "wx");
      await fd.writeFile(JSON.stringify({ pid: process.pid, timestamp: new Date().toISOString() }));
      await fd.close();
      return;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EEXIST") {
        if (attempt < LOCK_MAX_RETRIES - 1) {
          await sleep(LOCK_RETRY_DELAY_MS * (attempt + 1));
          continue;
        }
        throw new Error(
          `Lock file exists at ${lockPath}. Another process may be writing state.`,
        );
      }
      throw err;
    }
  }
}

async function releaseLock(projectRoot: string): Promise<void> {
  const lockPath = getLockPath(projectRoot);
  try {
    await unlink(lockPath);
  } catch {
    // lock already removed
  }
}

export async function readState(
  projectRoot: string,
): Promise<DevflowState> {
  const statePath = getStatePath(projectRoot);
  if (!(await fileExists(statePath))) {
    debug("State file not found, returning empty state", { path: statePath });
    return { ...EMPTY_STATE };
  }
  return readJSON<DevflowState>(statePath);
}

export async function writeState(
  projectRoot: string,
  state: DevflowState,
): Promise<void> {
  await acquireLock(projectRoot);
  try {
    const statePath = getStatePath(projectRoot);
    debug("Writing state", { path: statePath });
    await writeJSON(statePath, state);
  } finally {
    await releaseLock(projectRoot);
  }
}

export async function initState(projectRoot: string): Promise<void> {
  const statePath = getStatePath(projectRoot);
  if (await fileExists(statePath)) {
    debug("State already exists", { path: statePath });
    return;
  }
  await writeState(projectRoot, { ...EMPTY_STATE });
}

export function addFeature(
  state: DevflowState,
  featureKey: string,
  feature: FeatureState,
): DevflowState {
  return {
    ...state,
    features: {
      ...state.features,
      [featureKey]: feature,
    },
  };
}

export function updatePhase(
  state: DevflowState,
  featureKey: string,
  newPhase: Phase,
): DevflowState {
  const feature = state.features[featureKey];
  if (!feature) {
    throw new Error(`Feature '${featureKey}' not found in state`);
  }
  const currentIndex = PHASE_ORDER.indexOf(feature.phase);
  const newIndex = PHASE_ORDER.indexOf(newPhase);
  if (newIndex < currentIndex) {
    throw new Error(
      `Cannot transition from '${feature.phase}' to '${newPhase}' (backwards transition)`,
    );
  }
  return {
    ...state,
    features: {
      ...state.features,
      [featureKey]: {
        ...feature,
        phase: newPhase,
        updatedAt: new Date().toISOString(),
      },
    },
  };
}

export function completeTask(
  state: DevflowState,
  featureKey: string,
  taskNumber: number,
): DevflowState {
  const feature = state.features[featureKey];
  if (!feature) {
    throw new Error(`Feature '${featureKey}' not found in state`);
  }
  const tasks = feature.tasks.map((task: TaskState) =>
    task.number === taskNumber ? { ...task, completed: true } : task,
  );
  return {
    ...state,
    features: {
      ...state.features,
      [featureKey]: {
        ...feature,
        tasks,
        updatedAt: new Date().toISOString(),
      },
    },
  };
}

export function setArtifact(
  state: DevflowState,
  featureKey: string,
  artifactName: string,
  artifact: ArtifactMeta,
): DevflowState {
  const feature = state.features[featureKey];
  if (!feature) {
    throw new Error(`Feature '${featureKey}' not found in state`);
  }
  return {
    ...state,
    features: {
      ...state.features,
      [featureKey]: {
        ...feature,
        artifacts: {
          ...feature.artifacts,
          [artifactName]: artifact,
        },
        updatedAt: new Date().toISOString(),
      },
    },
  };
}
