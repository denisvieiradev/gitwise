import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { EXIT_CODES } from "../../src/errors.js";
import {
  parseExitCodesDoc,
  diffAgainstSource,
  isClean,
  formatDiff,
} from "../_helpers/exit-codes-doc.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DOC_PATH = resolve(__dirname, "../../../../docs/src/content/docs/exit-codes.md");

describe("docs/src/content/docs/exit-codes.md ⇄ EXIT_CODES parity (shipped file)", () => {
  const markdown = readFileSync(DOC_PATH, "utf8");
  const docRows = parseExitCodesDoc(markdown);
  const diff = diffAgainstSource(docRows, EXIT_CODES);

  it("documents every constant exported from EXIT_CODES", () => {
    expect(diff.missingFromDoc).toEqual([]);
  });

  it("does not document any row that is absent from EXIT_CODES", () => {
    expect(diff.extraInDoc).toEqual([]);
  });

  it("uses the same numeric code as EXIT_CODES for every documented constant", () => {
    expect(diff.mismatched).toEqual([]);
  });

  it("has no drift in either direction (combined assertion with diff output on failure)", () => {
    if (!isClean(diff)) {
      throw new Error(
        `docs/src/content/docs/exit-codes.md and EXIT_CODES are out of sync:\n${formatDiff(diff)}`,
      );
    }
    expect(isClean(diff)).toBe(true);
  });

  it("emits one documented row per constant (no duplicates)", () => {
    const seen = new Set<string>();
    for (const row of docRows) {
      expect(seen.has(row.constant)).toBe(false);
      seen.add(row.constant);
    }
    expect(seen.size).toBe(Object.keys(EXIT_CODES).length);
  });

  it("includes the contract preamble and a shell branching example", () => {
    expect(markdown).toMatch(/public contract/i);
    expect(markdown).toMatch(/case \$\? in/);
  });
});
