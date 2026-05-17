import { defineGitwiseTsup } from "../../tsup.config.js";

export default defineGitwiseTsup({
  entry: {
    index: "src/index.ts",
    "testing/index": "src/testing/index.ts",
  },
});
