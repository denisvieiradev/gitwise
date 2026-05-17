import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileExists } from "../infra/filesystem.js";
import type { DevflowState } from "./types.js";

export interface DriftWarning {
  artifact: string;
  message: string;
  downstream: string[];
}

const DOWNSTREAM_MAP: Record<string, string[]> = {
  prd: ["techspec", "tasks"],
  techspec: ["tasks"],
};

export async function hashFile(filePath: string): Promise<string> {
  const content = await readFile(filePath, "utf-8");
  return createHash("sha256").update(content).digest("hex");
}

export async function checkDrift(
  projectRoot: string,
  featureRef: string,
  state: DevflowState,
): Promise<DriftWarning[]> {
  const feature = state.features[featureRef];
  if (!feature) return [];
  const warnings: DriftWarning[] = [];
  for (const [artifactName, downstream] of Object.entries(DOWNSTREAM_MAP)) {
    const artifact = feature.artifacts[artifactName];
    if (!artifact) continue;
    const hasDownstream = downstream.some((d) => feature.artifacts[d]);
    if (!hasDownstream) continue;
    const fullPath = join(projectRoot, artifact.path);
    if (!(await fileExists(fullPath))) continue;
    const currentHash = await hashFile(fullPath);
    if (currentHash !== artifact.hash) {
      warnings.push({
        artifact: artifactName,
        message: `${artifactName.toUpperCase()} was modified after downstream artifacts were generated. Consider regenerating.`,
        downstream: downstream.filter((d) => feature.artifacts[d]),
      });
    }
  }
  return warnings;
}
