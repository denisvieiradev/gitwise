import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Config } from "jest";

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

const config: Config = {
  projects: discoverWorkspaceProjects(),
  coverageDirectory: "coverage",
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};

export default config;
