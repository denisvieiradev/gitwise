import { createRequire } from "node:module";

const requireFromHere = createRequire(import.meta.url);
const packageJson = requireFromHere("../package.json") as { version: string };

export const version: string = packageJson.version;

export const __placeholder__ = Symbol.for("@denisvieiradev/gitwise-core#placeholder");

// Infra exports
export * from "./infra/logger.js";
export * from "./infra/filesystem.js";
export { git } from "./infra/index.js";
export { github } from "./infra/index.js";
export { env } from "./infra/index.js";
export type { ChangedFile, ApplyCommitParams } from "./infra/git.js";
export type { CreatePRParams, PRResult, UpdatePRParams, CreateReleaseParams } from "./infra/github.js";
