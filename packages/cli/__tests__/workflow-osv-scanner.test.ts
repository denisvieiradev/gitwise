import { describe, it, expect, beforeAll } from "@jest/globals";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const SHA_RE = /^[0-9a-f]{40}$/;

function findRepoRoot(): string {
  let dir = resolve(process.cwd());
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "packages")) && existsSync(join(dir, ".github"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Could not locate repo root from cwd " + process.cwd());
}

const REPO_ROOT = findRepoRoot();
const WORKFLOW_PATH = join(REPO_ROOT, ".github", "workflows", "osv-scanner.yml");
const TOML_PATH = join(REPO_ROOT, "osv-scanner.toml");

/** Extract every `uses:` value from a YAML string. */
function extractUsesValues(content: string): Array<{ raw: string; line: string }> {
  const results: Array<{ raw: string; line: string }> = [];
  for (const line of content.split("\n")) {
    const match = line.match(/^\s+uses:\s+(\S+)/);
    if (match && match[1]) {
      results.push({ raw: match[1], line: line.trim() });
    }
  }
  return results;
}

function isPinnedToSha(usesValue: string): boolean {
  const atPos = usesValue.lastIndexOf("@");
  if (atPos === -1) return false;
  const ref = usesValue.slice(atPos + 1);
  return SHA_RE.test(ref);
}

/**
 * Parse [[IgnoredVulns]] entries from TOML content using a simple line scanner.
 * Returns the `ignoreUntil` values found (as strings).
 */
function extractIgnoreUntilDates(tomlContent: string): string[] {
  const dates: string[] = [];
  for (const line of tomlContent.split("\n")) {
    const m = line.match(/^\s*ignoreUntil\s*=\s*(\S+)/);
    if (m && m[1]) {
      // Strip optional surrounding quotes
      dates.push(m[1].replace(/^["']|["']$/g, ""));
    }
  }
  return dates;
}

/** Count [[IgnoredVulns]] section headers. */
function countIgnoredVulns(tomlContent: string): number {
  return (tomlContent.match(/^\s*\[\[IgnoredVulns\]\]/gm) ?? []).length;
}

describe("osv-scanner.yml — file existence", () => {
  it("exists at .github/workflows/osv-scanner.yml", () => {
    expect(existsSync(WORKFLOW_PATH)).toBe(true);
  });
});

describe("osv-scanner.yml — YAML structure", () => {
  let content: string;

  beforeAll(async () => {
    content = await readFile(WORKFLOW_PATH, "utf-8");
  });

  it("file is non-empty and readable", () => {
    expect(content.length).toBeGreaterThan(0);
  });

  it("has required top-level YAML keys: name, on, permissions, jobs", () => {
    expect(content).toMatch(/^name:/m);
    expect(content).toMatch(/^on:/m);
    expect(content).toMatch(/^permissions:/m);
    expect(content).toMatch(/^jobs:/m);
  });
});

describe("osv-scanner.yml — triggers", () => {
  let content: string;

  beforeAll(async () => {
    content = await readFile(WORKFLOW_PATH, "utf-8");
  });

  it("triggers on pull_request", () => {
    expect(content).toMatch(/pull_request:/m);
  });

  it("triggers on push to main", () => {
    expect(content).toMatch(/push:/m);
    expect(content).toMatch(/branches:\s*\[main\]/m);
  });

  it("triggers on a daily schedule cron", () => {
    expect(content).toMatch(/schedule:/m);
    expect(content).toMatch(/cron:/m);
  });
});

describe("osv-scanner.yml — OSV-Scanner action reference", () => {
  let content: string;

  beforeAll(async () => {
    content = await readFile(WORKFLOW_PATH, "utf-8");
  });

  it("references google/osv-scanner-action in a uses: line", () => {
    expect(content).toMatch(/google\/osv-scanner-action/);
  });

  it("google/osv-scanner-action reference is pinned to a 40-char SHA", () => {
    const usesEntries = extractUsesValues(content);
    const osvEntries = usesEntries.filter((e) =>
      e.raw.includes("google/osv-scanner-action")
    );
    expect(osvEntries.length).toBeGreaterThan(0);
    for (const entry of osvEntries) {
      expect(isPinnedToSha(entry.raw)).toBe(true);
    }
  });
});

describe("osv-scanner.yml — fail-on-vuln configuration (HIGH/CRITICAL)", () => {
  let content: string;

  beforeAll(async () => {
    content = await readFile(WORKFLOW_PATH, "utf-8");
  });

  it("sets fail-on-vuln: true to fail on vulnerability findings", () => {
    expect(content).toMatch(/fail-on-vuln:\s+true/m);
  });

  it("does not globally suppress failures with continue-on-error: true on the scan jobs", () => {
    // continue-on-error is acceptable inside the reusable workflow itself
    // but the calling job must not suppress the final failure
    const lines = content.split("\n");
    const scanJobStart = lines.findIndex(
      (l) => l.match(/^\s+scan-(scheduled|pr):/)
    );
    const scanJobLines = scanJobStart >= 0 ? lines.slice(scanJobStart, scanJobStart + 20) : [];
    const suppressed = scanJobLines.some((l) =>
      l.match(/continue-on-error:\s+true/)
    );
    expect(suppressed).toBe(false);
  });
});

describe("osv-scanner.yml — expiry-enforcement step", () => {
  let content: string;

  beforeAll(async () => {
    content = await readFile(WORKFLOW_PATH, "utf-8");
  });

  it("has a job or step that checks osv-scanner.toml expiry", () => {
    // Assert that the workflow references ignoreUntil or expiry in a run: step
    expect(content).toMatch(/ignoreUntil|expiry|expire/i);
  });

  it("the expiry-enforcement step reads osv-scanner.toml", () => {
    expect(content).toContain("osv-scanner.toml");
  });

  it("the expiry enforcement exits non-zero on an expired entry (bash exit 1 pattern)", () => {
    expect(content).toMatch(/exit.*\$\{?failed\}?|exit 1/);
  });
});

describe("osv-scanner.yml — SHA pinning", () => {
  let content: string;

  beforeAll(async () => {
    content = await readFile(WORKFLOW_PATH, "utf-8");
  });

  it("every uses: line is pinned to a 40-char hex SHA or is a local path", () => {
    const usesEntries = extractUsesValues(content);
    expect(usesEntries.length).toBeGreaterThan(0);
    const unpinned = usesEntries
      .filter((e) => !isPinnedToSha(e.raw) && !e.raw.startsWith("./") && !e.raw.startsWith("../"))
      .map((e) => e.line);
    expect(unpinned).toEqual([]);
  });

  it("every SHA-pinned uses: line has a trailing version comment", () => {
    const usesEntries = extractUsesValues(content);
    const missingComment = usesEntries
      .filter((e) => isPinnedToSha(e.raw))
      .filter((e) => !/#\s*v\d/.test(e.line))
      .map((e) => e.line);
    expect(missingComment).toEqual([]);
  });
});

describe("osv-scanner.toml — file existence", () => {
  it("exists at repo root", () => {
    expect(existsSync(TOML_PATH)).toBe(true);
  });
});

describe("osv-scanner.toml — basic validity", () => {
  let content: string;

  beforeAll(async () => {
    content = await readFile(TOML_PATH, "utf-8");
  });

  it("file is readable", () => {
    expect(typeof content).toBe("string");
  });

  it("does not contain non-TOML syntax", () => {
    // A basic check: no line starts with { or [ without being a section header
    const invalidLines = content
      .split("\n")
      .filter((l) => l.trim().startsWith("{"));
    expect(invalidLines).toEqual([]);
  });
});

describe("osv-scanner.toml — IgnoredVulns expiry enforcement", () => {
  let content: string;

  beforeAll(async () => {
    content = await readFile(TOML_PATH, "utf-8");
  });

  it("every [[IgnoredVulns]] entry has an ignoreUntil field", () => {
    const sectionCount = countIgnoredVulns(content);
    const dateCount = extractIgnoreUntilDates(content).length;
    // Each section must have exactly one ignoreUntil
    expect(dateCount).toBe(sectionCount);
  });

  it("every ignoreUntil date is in the future", () => {
    const dates = extractIgnoreUntilDates(content);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    for (const raw of dates) {
      // Extract the YYYY-MM-DD prefix (handles both date and datetime formats)
      const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
      expect(match).not.toBeNull();
      const expiry = new Date(match![1] + "T00:00:00Z");
      expect(expiry.getTime()).toBeGreaterThan(today.getTime());
    }
  });
});

describe("osv-scanner.toml — expiry validation (fixture: past expiry)", () => {
  const PAST_EXPIRY_FIXTURE = `
[[IgnoredVulns]]
id = "GHSA-0000-0000-0000"
ignoreUntil = 2020-01-01T00:00:00Z
reason = "Test fixture — expired entry"
`.trim();

  it("correctly detects an expired ignoreUntil date in a fixture", () => {
    const dates = extractIgnoreUntilDates(PAST_EXPIRY_FIXTURE);
    expect(dates.length).toBe(1);

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const expired = dates.filter((raw) => {
      const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
      if (!m) return true; // treat unparseable as expired
      const expiry = new Date(m[1] + "T00:00:00Z");
      return expiry.getTime() <= today.getTime();
    });

    expect(expired.length).toBe(1);
  });

  it("correctly identifies a valid future-dated ignoreUntil in a fixture", () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 2);
    const futureDateStr = futureDate.toISOString().slice(0, 10);

    const VALID_FIXTURE = `
[[IgnoredVulns]]
id = "GHSA-1111-1111-1111"
ignoreUntil = ${futureDateStr}T00:00:00Z
reason = "Test fixture — valid future entry"
`.trim();

    const dates = extractIgnoreUntilDates(VALID_FIXTURE);
    expect(dates.length).toBe(1);

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const valid = dates.filter((raw) => {
      const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
      if (!m) return false;
      const expiry = new Date(m[1] + "T00:00:00Z");
      return expiry.getTime() > today.getTime();
    });

    expect(valid.length).toBe(1);
  });

  it("a missing ignoreUntil is detected (section count != date count)", () => {
    const MISSING_EXPIRY_FIXTURE = `
[[IgnoredVulns]]
id = "GHSA-2222-2222-2222"
reason = "No expiry — invalid entry"
`.trim();

    const sectionCount = countIgnoredVulns(MISSING_EXPIRY_FIXTURE);
    const dateCount = extractIgnoreUntilDates(MISSING_EXPIRY_FIXTURE).length;
    expect(dateCount).toBeLessThan(sectionCount);
  });
});
