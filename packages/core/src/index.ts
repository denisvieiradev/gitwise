import { createRequire } from "node:module";

const requireFromHere = createRequire(import.meta.url);
const packageJson = requireFromHere("../package.json") as { version: string };

export const version: string = packageJson.version;

export const __placeholder__ = Symbol.for("@denisvieiradev/gitwise-core#placeholder");
