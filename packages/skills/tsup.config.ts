import { cpSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { defineGitwiseTsup } from "../../tsup.config.js";

const here = dirname(fileURLToPath(import.meta.url));

export default defineGitwiseTsup({
  entry: {
    index: "src/index.ts",
    "scripts/commit": "scripts/commit.ts",
    "scripts/review": "scripts/review.ts",
    "scripts/pr": "scripts/pr.ts",
    "scripts/release": "scripts/release.ts",
  },
  // Claude Code installs this plugin by git-cloning the source — no `npm install`
  // runs, so there is no node_modules. Bundle the workspace dependency and the
  // Anthropic SDK directly into each runner so the scripts execute standalone.
  noExternal: [/^@denisvieiradev\/gitwise-core/, /^@anthropic-ai\/sdk/],
  // gitwise-core reads prompt templates from disk at runtime (they are not
  // bundled into the JS). Copy them next to the built scripts so the loader's
  // `<dist>/templates` probe (from dist/scripts/*.js) resolves in production.
  onSuccess: async () => {
    cpSync(join(here, "..", "core", "templates"), join(here, "dist", "templates"), {
      recursive: true,
    });
  },
});
