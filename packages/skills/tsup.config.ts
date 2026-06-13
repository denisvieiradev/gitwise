import { defineGitwiseTsup } from "../../tsup.config.js";

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
});
