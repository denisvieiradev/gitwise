import type { Config } from "jest";

const config: Config = {
  displayName: "core",
  testEnvironment: "node",
  rootDir: ".",
  roots: ["<rootDir>/__tests__"],
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: "<rootDir>/tsconfig.test.json",
        diagnostics: { ignoreCodes: [1343] },
      },
    ],
  },
  testPathIgnorePatterns: ["/node_modules/", "/__tests__/_helpers/"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};

export default config;
