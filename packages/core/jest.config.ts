import type { Config } from "jest";
import { createDefaultEsmPreset } from "ts-jest";

const presetConfig = createDefaultEsmPreset({ tsconfig: "tsconfig.test.json" });

const config: Config = {
  ...presetConfig,
  displayName: "core",
  testEnvironment: "node",
  rootDir: ".",
  roots: ["<rootDir>/__tests__"],
  testPathIgnorePatterns: ["/node_modules/", "/__tests__/_helpers/"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};

export default config;
