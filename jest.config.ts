import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Config } from "jest";
import { createDefaultEsmPreset } from "ts-jest";

const presetConfig = createDefaultEsmPreset();
const ROOT_DIR = process.cwd();

function discoverWorkspaceProjects(): string[] {
  const packagesDir = resolve(ROOT_DIR, "packages");
  if (!existsSync(packagesDir)) return [];
  return readdirSync(packagesDir)
    .map((name) => resolve(packagesDir, name))
    .filter((path) => {
      try {
        return statSync(path).isDirectory();
      } catch {
        return false;
      }
    })
    .filter(
      (path) =>
        existsSync(join(path, "jest.config.ts")) ||
        existsSync(join(path, "jest.config.js")) ||
        existsSync(join(path, "jest.config.mjs")),
    );
}

const legacyProject: Config = {
  ...presetConfig,
  displayName: "legacy",
  testEnvironment: "node",
  rootDir: ROOT_DIR,
  roots: ["<rootDir>/__tests__"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
    "^ora$": "<rootDir>/__mocks__/ora.ts",
  },
};

const config: Config = {
  projects: [legacyProject, ...discoverWorkspaceProjects()],
  coverageDirectory: "coverage",
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  collectCoverageFrom: [
    "src/**/*.ts",
    "tsup.config.ts",
    "!src/cli/index.ts",
    "!src/**/index.ts",
  ],
};

export default config;
