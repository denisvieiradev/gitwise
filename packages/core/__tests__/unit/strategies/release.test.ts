import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createReleaseStrategy } from "../../../src/strategies/release.js";
import type { ReleaseStrategy } from "../../../src/strategies/release.js";
import { getMergedConfig } from "../../../src/config/merge.js";

describe("createReleaseStrategy", () => {
  describe("github-flow", () => {
    const strategy: ReleaseStrategy = createReleaseStrategy("github-flow");

    it("exposes the github-flow name", () => {
      expect(strategy.name).toBe("github-flow");
    });

    it("releaseBranchFor returns null", () => {
      expect(strategy.releaseBranchFor("1.2.0")).toBeNull();
    });

    it("mergeTargets returns only the main branch even when develop is provided", () => {
      expect(strategy.mergeTargets("main", "develop")).toEqual(["main"]);
    });

    it("mergeTargets uses whatever main branch name the caller passes", () => {
      expect(strategy.mergeTargets("trunk")).toEqual(["trunk"]);
    });

    it("requiresDevelop is false", () => {
      expect(strategy.requiresDevelop()).toBe(false);
    });
  });

  describe("gitflow", () => {
    const strategy: ReleaseStrategy = createReleaseStrategy("gitflow");

    it("exposes the gitflow name", () => {
      expect(strategy.name).toBe("gitflow");
    });

    it("releaseBranchFor returns release/<version>", () => {
      expect(strategy.releaseBranchFor("1.2.0")).toBe("release/1.2.0");
    });

    it("mergeTargets returns [main, develop] in that order", () => {
      expect(strategy.mergeTargets("main", "develop")).toEqual(["main", "develop"]);
    });

    it("mergeTargets falls back to [main] when no develop branch is supplied", () => {
      expect(strategy.mergeTargets("main")).toEqual(["main"]);
    });

    it("requiresDevelop is true", () => {
      expect(strategy.requiresDevelop()).toBe(true);
    });
  });

  describe("singleton behavior", () => {
    it("returns the same github-flow instance across calls", () => {
      const a = createReleaseStrategy("github-flow");
      const b = createReleaseStrategy("github-flow");
      expect(a).toBe(b);
    });

    it("returns the same gitflow instance across calls", () => {
      const a = createReleaseStrategy("gitflow");
      const b = createReleaseStrategy("gitflow");
      expect(a).toBe(b);
    });

    it("github-flow and gitflow are distinct instances", () => {
      expect(createReleaseStrategy("github-flow")).not.toBe(createReleaseStrategy("gitflow"));
    });
  });
});

describe("createReleaseStrategy + RepoConfig integration", () => {
  let homeDir: string;
  let cwd: string;

  beforeEach(async () => {
    homeDir = await mkdtemp(join(tmpdir(), "gitwise-home-"));
    cwd = await mkdtemp(join(tmpdir(), "gitwise-repo-"));
  });

  afterEach(async () => {
    await rm(homeDir, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
  });

  it("resolves the gitflow singleton from a RepoConfig with releaseStrategy: \"gitflow\"", async () => {
    await writeFile(
      join(cwd, ".gitwise.json"),
      JSON.stringify({ releaseStrategy: "gitflow" }),
      "utf-8",
    );
    const config = await getMergedConfig({ cwd, homeDir });
    expect(config.releaseStrategy).toBe("gitflow");
    const strategy = createReleaseStrategy(config.releaseStrategy!);
    expect(strategy).toBe(createReleaseStrategy("gitflow"));
    expect(strategy.releaseBranchFor("1.2.0")).toBe("release/1.2.0");
    expect(strategy.mergeTargets("main", "develop")).toEqual(["main", "develop"]);
  });

  it("resolves the github-flow singleton from a RepoConfig with releaseStrategy: \"github-flow\"", async () => {
    await writeFile(
      join(cwd, ".gitwise.json"),
      JSON.stringify({ releaseStrategy: "github-flow" }),
      "utf-8",
    );
    const config = await getMergedConfig({ cwd, homeDir });
    expect(config.releaseStrategy).toBe("github-flow");
    const strategy = createReleaseStrategy(config.releaseStrategy!);
    expect(strategy).toBe(createReleaseStrategy("github-flow"));
    expect(strategy.releaseBranchFor("1.2.0")).toBeNull();
    expect(strategy.mergeTargets("main", "develop")).toEqual(["main"]);
  });
});
