import { defineGitwiseTsup } from "../../tsup.config.js";

export default defineGitwiseTsup({
  entry: {
    index: "src/index.ts",
    "scripts/commit": "scripts/commit.ts",
    "scripts/review": "scripts/review.ts",
    "scripts/pr": "scripts/pr.ts",
    "scripts/release": "scripts/release.ts",
  },
  external: [
    "@denisvieiradev/gitwise-core",
  ],
});
