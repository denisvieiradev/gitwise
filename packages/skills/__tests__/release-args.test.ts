import { describe, it, expect } from "@jest/globals";

import {
  parseReleaseArgs,
  UnknownPhaseError,
} from "../scripts/release-args.js";

describe("parseReleaseArgs — phase dispatch", () => {
  it("returns phase undefined when no positional is given (legacy one-shot)", () => {
    expect(parseReleaseArgs([])).toEqual({ phase: undefined });
  });

  it("recognises `prepare` as the first positional", () => {
    expect(parseReleaseArgs(["prepare", "--bump", "minor"])).toEqual({
      phase: "prepare",
      bump: "minor",
    });
  });

  it("recognises `finish` as the first positional and accepts --no-delete-branch", () => {
    expect(parseReleaseArgs(["finish", "--no-delete-branch"])).toEqual({
      phase: "finish",
      deleteReleaseBranch: false,
    });
  });

  it("recognises `abort` as the first positional and accepts --delete-branch", () => {
    expect(parseReleaseArgs(["abort", "--delete-branch"])).toEqual({
      phase: "abort",
      deleteBranch: true,
    });
  });

  it("rejects an unrecognized phase with a clear typed error", () => {
    expect(() => parseReleaseArgs(["bogus"])).toThrow(UnknownPhaseError);
    try {
      parseReleaseArgs(["bogus"]);
    } catch (err) {
      expect(err).toBeInstanceOf(UnknownPhaseError);
      expect((err as UnknownPhaseError).message).toMatch(/bogus/);
      expect((err as UnknownPhaseError).message).toMatch(/prepare/);
      expect((err as UnknownPhaseError).message).toMatch(/finish/);
      expect((err as UnknownPhaseError).message).toMatch(/abort/);
      expect((err as UnknownPhaseError).code).toBe("UNKNOWN_PHASE");
    }
  });
});

describe("parseReleaseArgs — legacy flag parity", () => {
  it("keeps producing the same shape as the previous inline parser", () => {
    // Today's script parses these three args independently and produces
    // { forceBump: "patch", apply: true }. The new parser keeps the same flag
    // semantics, just under the new `phase`-aware shape.
    expect(parseReleaseArgs(["--bump", "patch", "--apply"])).toEqual({
      phase: undefined,
      bump: "patch",
      apply: true,
    });
  });

  it("supports --no-gh-release on the legacy invocation", () => {
    expect(parseReleaseArgs(["--apply", "--no-gh-release"])).toEqual({
      phase: undefined,
      apply: true,
      noGhRelease: true,
    });
  });

  it("ignores invalid --bump values (matches today's silent drop)", () => {
    expect(parseReleaseArgs(["--bump", "garbage", "--apply"])).toEqual({
      phase: undefined,
      apply: true,
    });
  });
});

describe("parseReleaseArgs — flag scoping across phases", () => {
  it("prepare accepts --bump", () => {
    expect(parseReleaseArgs(["prepare", "--bump", "major"])).toEqual({
      phase: "prepare",
      bump: "major",
    });
  });

  it("finish accepts --no-gh-release and --no-workspace-propagation alongside --no-delete-branch", () => {
    expect(
      parseReleaseArgs([
        "finish",
        "--no-gh-release",
        "--no-workspace-propagation",
        "--no-delete-branch",
      ]),
    ).toEqual({
      phase: "finish",
      noGhRelease: true,
      noWorkspacePropagation: true,
      deleteReleaseBranch: false,
    });
  });

  it("finish defaults to keeping --no-delete-branch unset when the flag is absent", () => {
    expect(parseReleaseArgs(["finish"])).toEqual({ phase: "finish" });
  });

  it("abort defaults to not deleting the branch when --delete-branch is absent", () => {
    expect(parseReleaseArgs(["abort"])).toEqual({ phase: "abort" });
  });
});
