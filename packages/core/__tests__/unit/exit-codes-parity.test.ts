import { describe, it, expect } from "@jest/globals";
import { EXIT_CODES } from "../../src/errors.js";
import {
  parseExitCodesDoc,
  diffAgainstSource,
  isClean,
  formatDiff,
} from "../_helpers/exit-codes-doc.js";

const FIXTURE_HEADER = [
  "---",
  "title: Exit Codes",
  "---",
  "",
  "Prose preamble.",
  "",
  "| Code | Constant | Category | Meaning | When raised |",
  "|------|----------|----------|---------|-------------|",
];

function buildFixture(rows: Array<[number, string]>): string {
  const body = rows.map(([code, name]) => `| ${code} | \`${name}\` | Cat | Meaning | When |`);
  return [...FIXTURE_HEADER, ...body, ""].join("\n");
}

function allRows(): Array<[number, string]> {
  return Object.entries(EXIT_CODES).map(([name, code]) => [code, name]);
}

describe("parseExitCodesDoc", () => {
  it("parses the documented Code/Constant pairs", () => {
    const md = buildFixture([
      [0, "OK"],
      [10, "NOTHING_STAGED"],
      [20, "GIT_FAILED"],
    ]);
    const rows = parseExitCodesDoc(md);
    expect(rows).toEqual([
      { code: 0, constant: "OK", lineNumber: expect.any(Number) },
      { code: 10, constant: "NOTHING_STAGED", lineNumber: expect.any(Number) },
      { code: 20, constant: "GIT_FAILED", lineNumber: expect.any(Number) },
    ]);
  });

  it("throws a clear error when the table is missing", () => {
    expect(() => parseExitCodesDoc("# No table here\nJust prose.\n")).toThrow(
      /could not find a markdown table/i,
    );
  });

  it("throws when a Code cell is non-numeric", () => {
    const md = [...FIXTURE_HEADER, "| foo | `OK` | Cat | M | W |", ""].join("\n");
    expect(() => parseExitCodesDoc(md)).toThrow(/non-numeric Code/i);
  });

  it("throws when a Constant cell is not wrapped in backticks", () => {
    const md = [...FIXTURE_HEADER, "| 0 | OK | Cat | M | W |", ""].join("\n");
    expect(() => parseExitCodesDoc(md)).toThrow(/backticks/i);
  });
});

describe("diffAgainstSource", () => {
  it("returns a clean diff when the doc covers every EXIT_CODES entry with matching numbers", () => {
    const md = buildFixture(allRows());
    const diff = diffAgainstSource(parseExitCodesDoc(md), EXIT_CODES);
    expect(isClean(diff)).toBe(true);
    expect(diff.missingFromDoc).toEqual([]);
    expect(diff.extraInDoc).toEqual([]);
    expect(diff.mismatched).toEqual([]);
  });

  it("flags a code documented in EXIT_CODES but missing from the doc", () => {
    const rows = allRows().filter(([, name]) => name !== "GIT_FAILED");
    const md = buildFixture(rows);
    const diff = diffAgainstSource(parseExitCodesDoc(md), EXIT_CODES);
    expect(isClean(diff)).toBe(false);
    expect(diff.missingFromDoc).toEqual([{ constant: "GIT_FAILED", code: 20 }]);
    expect(diff.extraInDoc).toEqual([]);
    expect(formatDiff(diff)).toContain("GIT_FAILED");
  });

  it("flags an extra row in the doc that is absent from EXIT_CODES", () => {
    const rows = [...allRows(), [99, "MADE_UP_EXTRA"] as [number, string]];
    const md = buildFixture(rows);
    const diff = diffAgainstSource(parseExitCodesDoc(md), EXIT_CODES);
    expect(isClean(diff)).toBe(false);
    expect(diff.extraInDoc).toHaveLength(1);
    expect(diff.extraInDoc[0]?.constant).toBe("MADE_UP_EXTRA");
    expect(diff.missingFromDoc).toEqual([]);
    expect(formatDiff(diff)).toContain("MADE_UP_EXTRA");
  });

  it("flags a numeric mismatch when the doc shows a different exit code than EXIT_CODES", () => {
    const rows = allRows().map(
      ([code, name]) => (name === "GIT_FAILED" ? [999, name] : [code, name]) as [number, string],
    );
    const md = buildFixture(rows);
    const diff = diffAgainstSource(parseExitCodesDoc(md), EXIT_CODES);
    expect(isClean(diff)).toBe(false);
    expect(diff.mismatched).toEqual([
      expect.objectContaining({ constant: "GIT_FAILED", docCode: 999, sourceCode: 20 }),
    ]);
    expect(formatDiff(diff)).toContain("999");
    expect(formatDiff(diff)).toContain("20");
  });

  it("reports drift in both directions in a single pass (missing and extra together)", () => {
    const rows = allRows().filter(([, name]) => name !== "GIT_FAILED");
    rows.push([42, "FAKE_CODE"]);
    const md = buildFixture(rows);
    const diff = diffAgainstSource(parseExitCodesDoc(md), EXIT_CODES);
    expect(diff.missingFromDoc.map((m) => m.constant)).toEqual(["GIT_FAILED"]);
    expect(diff.extraInDoc.map((m) => m.constant)).toEqual(["FAKE_CODE"]);
  });
});

describe("parity assertion contract", () => {
  it("synthesizes a doc directly from EXIT_CODES and confirms zero drift (sanity baseline)", () => {
    const md = buildFixture(allRows());
    const diff = diffAgainstSource(parseExitCodesDoc(md), EXIT_CODES);
    expect(isClean(diff)).toBe(true);
  });
});
