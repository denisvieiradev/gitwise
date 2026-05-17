import type { Config } from "jest";
import { createDefaultEsmPreset } from "ts-jest";

const presetConfig = createDefaultEsmPreset();

const config: Config = {
  ...presetConfig,
  displayName: "core",
  testEnvironment: "node",
  rootDir: ".",
  roots: ["<rootDir>/__tests__"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};

export default config;
