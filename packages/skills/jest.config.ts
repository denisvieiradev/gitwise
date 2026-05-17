import type { Config } from "jest";

const config: Config = {
  displayName: "skills",
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
      },
    ],
  },
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
    "^@denisvieiradev/gitwise-core$": "<rootDir>/../core/src/index.ts",
    "^@denisvieiradev/gitwise-core/testing$": "<rootDir>/../core/src/testing/index.ts",
  },
};

export default config;
