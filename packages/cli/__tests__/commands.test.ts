/**
 * Task 13 — CLI command wrappers tests
 *
 * These tests verify that each command wrapper:
 * 1. Exports a factory function that returns a Commander Command
 * 2. Registers the correct options
 * 3. Has the expected command name and description
 */

import { describe, it, expect } from "@jest/globals";
import { makeCommitCommand } from "../src/commands/commit.js";
import { makeReviewCommand } from "../src/commands/review.js";
import { makePrCommand } from "../src/commands/pr.js";
import { makeReleaseCommand } from "../src/commands/release.js";

// ---------------------------------------------------------------------------
// makeCommitCommand
// ---------------------------------------------------------------------------

describe("makeCommitCommand", () => {
  const cmd = makeCommitCommand();

  it("has name 'commit'", () => {
    expect(cmd.name()).toBe("commit");
  });

  it("has a description", () => {
    expect(cmd.description()).toBeTruthy();
  });

  it("registers --split option", () => {
    const opt = cmd.options.find((o) => o.long === "--split");
    expect(opt).toBeDefined();
  });

  it("registers --push option", () => {
    const opt = cmd.options.find((o) => o.long === "--push");
    expect(opt).toBeDefined();
  });

  it("registers --apply option", () => {
    const opt = cmd.options.find((o) => o.long === "--apply");
    expect(opt).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// makeReviewCommand
// ---------------------------------------------------------------------------

describe("makeReviewCommand", () => {
  const cmd = makeReviewCommand();

  it("has name 'review'", () => {
    expect(cmd.name()).toBe("review");
  });

  it("has a description", () => {
    expect(cmd.description()).toBeTruthy();
  });

  it("registers --base option", () => {
    const opt = cmd.options.find((o) => o.long === "--base");
    expect(opt).toBeDefined();
  });

  it("registers --prompt option", () => {
    const opt = cmd.options.find((o) => o.long === "--prompt");
    expect(opt).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// makePrCommand
// ---------------------------------------------------------------------------

describe("makePrCommand", () => {
  const cmd = makePrCommand();

  it("has name 'pr'", () => {
    expect(cmd.name()).toBe("pr");
  });

  it("has a description", () => {
    expect(cmd.description()).toBeTruthy();
  });

  it("registers --base option", () => {
    const opt = cmd.options.find((o) => o.long === "--base");
    expect(opt).toBeDefined();
  });

  it("registers --apply option", () => {
    const opt = cmd.options.find((o) => o.long === "--apply");
    expect(opt).toBeDefined();
  });

  it("registers --draft option", () => {
    const opt = cmd.options.find((o) => o.long === "--draft");
    expect(opt).toBeDefined();
  });

  it("registers --prompt option", () => {
    const opt = cmd.options.find((o) => o.long === "--prompt");
    expect(opt).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// makeReleaseCommand
// ---------------------------------------------------------------------------

describe("makeReleaseCommand", () => {
  const cmd = makeReleaseCommand();

  it("has name 'release'", () => {
    expect(cmd.name()).toBe("release");
  });

  it("has a description", () => {
    expect(cmd.description()).toBeTruthy();
  });

  it("registers --bump option", () => {
    const opt = cmd.options.find((o) => o.long === "--bump");
    expect(opt).toBeDefined();
  });

  it("registers --apply option", () => {
    const opt = cmd.options.find((o) => o.long === "--apply");
    expect(opt).toBeDefined();
  });

  it("registers --no-gh-release option", () => {
    const opt = cmd.options.find((o) => o.long === "--no-gh-release");
    expect(opt).toBeDefined();
  });
});
