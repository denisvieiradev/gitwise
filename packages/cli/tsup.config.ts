import { defineGitwiseTsup } from "../../tsup.config.js";

export default defineGitwiseTsup({
  entry: {
    index: "src/index.ts",
  },
  external: [
    "@denisvieiradev/gitwise-core",
    "@clack/prompts",
    "chalk",
    "commander",
  ],
  banner: {
    js: "#!/usr/bin/env node",
  },
});
