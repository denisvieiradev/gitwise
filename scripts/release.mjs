#!/usr/bin/env node
// Phase 0 release helper for the gitwise monorepo (see ADRs/adr-005.md).
// Propagates a single locked version across the root and every packages/*
// manifest, then commits and tags. Pushing the tag is left to the operator;
// CI (.github/workflows/release.yml) publishes on tag push.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const BUMP_KINDS = new Set(["patch", "minor", "major"]);

export function isExplicitVersion(value) {
  return typeof value === "string" && SEMVER_RE.test(value);
}

export function parseArgs(argv) {
  const args = { cwd: undefined, bump: undefined, explicitVersion: undefined };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--cwd") {
      args.cwd = argv[++i];
      if (!args.cwd) throw new Error("--cwd requires a path argument");
      continue;
    }
    if (token?.startsWith("--cwd=")) {
      args.cwd = token.slice("--cwd=".length);
      if (!args.cwd) throw new Error("--cwd requires a path argument");
      continue;
    }
    positional.push(token);
  }
  if (positional.length !== 1) {
    throw new Error(
      "Usage: release.mjs <patch|minor|major|X.Y.Z> [--cwd <path>]",
    );
  }
  const value = positional[0];
  if (BUMP_KINDS.has(value)) {
    args.bump = value;
  } else if (isExplicitVersion(value)) {
    args.explicitVersion = value;
  } else {
    throw new Error(
      `Invalid argument "${value}". Expected one of patch|minor|major or an explicit semver (X.Y.Z).`,
    );
  }
  return args;
}

export function bumpVersion(current, kind) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(current);
  if (!match) throw new Error(`Cannot bump non-semver version "${current}"`);
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (kind === "major") return `${major + 1}.0.0`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  if (kind === "patch") return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Unknown bump kind "${kind}"`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  // Match `npm version` formatting: 2-space indent, trailing newline.
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function listWorkspaceManifests(rootDir) {
  const packagesDir = resolve(rootDir, "packages");
  let entries;
  try {
    entries = readdirSync(packagesDir);
  } catch {
    return [];
  }
  const results = [];
  for (const name of entries) {
    const pkgDir = join(packagesDir, name);
    let isDir = false;
    try {
      isDir = statSync(pkgDir).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;
    const manifest = join(pkgDir, "package.json");
    try {
      if (statSync(manifest).isFile()) results.push(manifest);
    } catch {
      // Skip workspace directories without a manifest.
    }
  }
  return results.sort();
}

export function propagateVersion(rootDir, newVersion) {
  const rootManifest = resolve(rootDir, "package.json");
  const updated = [];
  const rootPkg = readJson(rootManifest);
  if (rootPkg.version !== newVersion) {
    rootPkg.version = newVersion;
    writeJson(rootManifest, rootPkg);
  }
  updated.push(rootManifest);
  for (const manifest of listWorkspaceManifests(rootDir)) {
    const pkg = readJson(manifest);
    if (pkg.version !== newVersion) {
      pkg.version = newVersion;
      writeJson(manifest, pkg);
    }
    updated.push(manifest);
  }
  return updated;
}

export function resolveNewVersion({ currentVersion, bump, explicitVersion }) {
  if (explicitVersion) return explicitVersion;
  if (bump) return bumpVersion(currentVersion, bump);
  throw new Error("Either bump or explicitVersion must be provided");
}

function defaultGit(rootDir) {
  return {
    add(paths) {
      execFileSync("git", ["add", "--", ...paths], {
        cwd: rootDir,
        stdio: "inherit",
      });
    },
    commit(message) {
      execFileSync("git", ["commit", "-m", message], {
        cwd: rootDir,
        stdio: "inherit",
      });
    },
    tag(name) {
      execFileSync("git", ["tag", name], {
        cwd: rootDir,
        stdio: "inherit",
      });
    },
  };
}

export async function runRelease(options = {}) {
  const argv = options.argv ?? process.argv.slice(2);
  const parsed = parseArgs(argv);
  const rootDir = resolve(parsed.cwd ?? options.cwd ?? process.cwd());
  const rootManifest = resolve(rootDir, "package.json");
  const currentVersion = readJson(rootManifest).version;
  const newVersion = resolveNewVersion({
    currentVersion,
    bump: parsed.bump,
    explicitVersion: parsed.explicitVersion,
  });
  const tag = `v${newVersion}`;
  const updated = propagateVersion(rootDir, newVersion);
  const git = options.git ?? defaultGit(rootDir);
  git.add(updated);
  git.commit(`chore(release): ${tag}`);
  git.tag(tag);
  const log = options.log ?? console.log;
  log(`Released ${tag} (${updated.length} manifest${updated.length === 1 ? "" : "s"} updated).`);
  log("Next steps:");
  log(`  git push origin HEAD`);
  log(`  git push origin ${tag}`);
  log("Pushing the tag triggers .github/workflows/release.yml to publish.");
  return { newVersion, tag, updated };
}

const invokedDirectly =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  runRelease().catch((err) => {
    process.stderr.write(`release.mjs: ${err.message}\n`);
    process.exit(1);
  });
}
