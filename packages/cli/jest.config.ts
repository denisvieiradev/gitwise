import type { Config } from "jest";
import { createDefaultEsmPreset } from "ts-jest";

const presetConfig = createDefaultEsmPreset({
  tsconfig: "tsconfig.test.json",
});

const config: Config = {
  ...presetConfig,
  displayName: "cli",
  testEnvironment: "node",
  rootDir: ".",
  roots: ["<rootDir>/__tests__"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
    // Resolve workspace packages to their source (core not built yet in tests)
    "^@denisvieiradev/gitwise-core$": "<rootDir>/../core/src/index.ts",
    "^@denisvieiradev/gitwise-core/testing$": "<rootDir>/../core/src/testing/index.ts",
  },
};

export default config;
