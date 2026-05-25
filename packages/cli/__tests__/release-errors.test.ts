import { describe, it, expect } from "@jest/globals";
import { formatReleaseError } from "../src/commands/release-errors.js";

function makeError(message: string, code?: string): Error {
  const err = new Error(message);
  if (code) Object.assign(err, { code });
  return err;
}

describe("formatReleaseError", () => {
  const cases: Array<{ code: string; hintIncludes: string }> = [
    { code: "STRATEGY_DEVELOP_MISSING", hintIncludes: "develop branch" },
    { code: "STRATEGY_RELEASE_BRANCH_EXISTS", hintIncludes: "Delete the existing release branch" },
    { code: "RELEASE_BRANCH_CONFLICT", hintIncludes: "Delete the existing release branch" },
    { code: "STALE_PLAN_TAG_EXISTS", hintIncludes: "gw release abort" },
    { code: "STALE_PLAN_BRANCH_MISMATCH", hintIncludes: "Check out the branch the plan targets" },
    { code: "NO_RELEASE_PLAN", hintIncludes: "gw release prepare" },
    { code: "RELEASE_PLAN_EXISTS", hintIncludes: "gw release finish" },
    { code: "INVALID_PLAN_SCHEMA", hintIncludes: "incompatible gitwise version" },
    { code: "INVALID_PLAN_JSON", hintIncludes: "plan file is corrupt" },
    { code: "WORKING_TREE_DIRTY", hintIncludes: "Commit or stash" },
    { code: "TAG_EXISTS", hintIncludes: "delete the existing tag" },
    { code: "NO_COMMITS", hintIncludes: "Add at least one commit" },
    { code: "INVALID_VERSION", hintIncludes: "valid semver" },
    { code: "NO_PACKAGE_JSON", hintIncludes: "package.json" },
    { code: "RELEASE_BRANCH_UNMERGED", hintIncludes: "Merge the release branch" },
    { code: "COMMIT_HOOK_FAILURE", hintIncludes: "pre-commit hook rejected the release commit" },
    { code: "FINISH_MERGE_CONFLICT", hintIncludes: "git merge --continue" },
    { code: "NOTES_READ_FAILED", hintIncludes: "Recreate `.gitwise/release-<version>.md`" },
  ];

  for (const { code, hintIncludes } of cases) {
    it(`returns a message + actionable hint for ${code}`, () => {
      const err = makeError(`boom for ${code}`, code);
      const formatted = formatReleaseError(err);
      expect(formatted.message).toBe(`boom for ${code}`);
      expect(formatted.hint).toContain(hintIncludes);
      expect(formatted.hint.length).toBeGreaterThan(20);
    });
  }

  it("preserves the underlying Error message verbatim", () => {
    const err = makeError("Working tree must be clean — commit or stash first.", "WORKING_TREE_DIRTY");
    expect(formatReleaseError(err).message).toBe(
      "Working tree must be clean — commit or stash first.",
    );
  });

  it("falls back to a generic hint for an unknown code", () => {
    const err = makeError("mystery failure", "SOMETHING_NEW");
    const formatted = formatReleaseError(err);
    expect(formatted.message).toBe("mystery failure");
    expect(formatted.hint).toMatch(/Check the error message above/);
  });

  it("formats plain Error objects with no code", () => {
    const formatted = formatReleaseError(new Error("plain"));
    expect(formatted.message).toBe("plain");
    expect(formatted.hint).toMatch(/Check the error message above/);
  });

  it("handles non-Error throwables via String() fallback", () => {
    expect(formatReleaseError("naked").message).toBe("naked");
    expect(formatReleaseError(null).message).toBe("null");
    expect(formatReleaseError(42).message).toBe("42");
  });

  it("does not match on error message substring (regression guard)", () => {
    // An error whose text happens to mention NO_RELEASE_PLAN but whose code is
    // something else must NOT get the targeted hint — we key on `code`, not text.
    const err = makeError(
      "mentions NO_RELEASE_PLAN in the body but is actually a different failure",
      "INVALID_VERSION",
    );
    const formatted = formatReleaseError(err);
    expect(formatted.hint).toMatch(/valid semver/);
    expect(formatted.hint).not.toMatch(/gw release prepare first/);
  });
});
