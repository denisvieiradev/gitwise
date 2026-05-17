import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileExists } from "../infra/filesystem.js";
import type { DevflowState } from "./types.js";

const FEATURES_DIR = ".devflow/features";
const MAX_SLUG_LENGTH = 40;

export function getNextFeatureNumber(state: DevflowState): number {
  const numbers = Object.values(state.features).map((f) => f.number);
  if (numbers.length === 0) return 1;
  return Math.max(...numbers) + 1;
}

export function generateSlug(description: string): string {
  const slug = description
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-$/, "");
  return slug || "feature";
}

export function formatFeatureRef(number: number, slug: string): string {
  const padded = String(number).padStart(3, "0");
  return `${padded}-${slug}`;
}

export function getFeaturesDir(projectRoot: string): string {
  return join(projectRoot, FEATURES_DIR);
}

export function getFeaturePath(projectRoot: string, featureRef: string): string {
  return join(projectRoot, FEATURES_DIR, featureRef);
}

function normalizeRef(ref: string): string {
  if (/^\d+$/.test(ref)) {
    return ref.padStart(3, "0");
  }
  return ref;
}

function matchesRef(key: string, ref: string): boolean {
  if (key === ref) return true;
  const normalized = normalizeRef(ref);
  // Match by number prefix: "1" or "001" → "001-auth"
  if (/^\d+$/.test(ref)) {
    return key.startsWith(`${normalized}-`);
  }
  // Match by slug prefix: "auth-oauth" → "001-auth-oauth"
  // Strip leading number prefix from key, then check startsWith
  const keySlug = key.replace(/^\d+-/, "");
  return keySlug.startsWith(ref);
}

export async function resolveFeatureRef(
  projectRoot: string,
  state: DevflowState,
  ref: string,
): Promise<string | null> {
  if (state.features[ref]) return ref;
  const match = Object.keys(state.features).find((key) => matchesRef(key, ref));
  if (match) return match;
  const featuresDir = getFeaturesDir(projectRoot);
  if (await fileExists(featuresDir)) {
    const entries = await readdir(featuresDir);
    const dirMatch = entries.find((entry) => matchesRef(entry, ref));
    if (dirMatch) return dirMatch;
  }
  return null;
}
