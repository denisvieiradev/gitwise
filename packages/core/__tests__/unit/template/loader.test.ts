import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadTemplate, loadAndInterpolate } from "../../../src/template/loader.js";
import { interpolate } from "../../../src/template/interpolate.js";

describe("interpolate", () => {
  it("replaces {{var}} placeholders with context values", () => {
    expect(interpolate("Hello {{name}}!", { name: "world" })).toBe("Hello world!");
  });

  it("replaces multiple occurrences", () => {
    const result = interpolate("{{a}} + {{b}} = {{a}}", { a: "1", b: "2" });
    expect(result).toBe("1 + 2 = 1");
  });

  it("leaves unknown placeholders untouched", () => {
    const result = interpolate("Hello {{unknown}}", {});
    expect(result).toBe("Hello {{unknown}}");
  });

  it("handles empty context", () => {
    const result = interpolate("No vars here", {});
    expect(result).toBe("No vars here");
  });
});

describe("loadTemplate (bundled)", () => {
  it("returns bundled commit.md content when no overrides exist", async () => {
    const content = await loadTemplate("commit", { repoRoot: "/nonexistent/path" });
    expect(content).toContain("{{type}}");
  });

  it("returns bundled review.md with Critical, Suggestions, Nitpicks sections", async () => {
    const content = await loadTemplate("review", { repoRoot: "/nonexistent/path" });
    expect(content).toContain("Critical");
    expect(content).toContain("Suggestions");
    expect(content).toContain("Nitpicks");
  });

  it("throws TEMPLATE_NOT_FOUND for unknown template", async () => {
    await expect(loadTemplate("does-not-exist-xyz", { repoRoot: "/nonexistent/path" }))
      .rejects.toMatchObject({ code: "TEMPLATE_NOT_FOUND" });
  });

  it("throws TEMPLATE_INVALID_NAME for invalid template names", async () => {
    await expect(loadTemplate("../etc/passwd", { repoRoot: "/nonexistent/path" }))
      .rejects.toMatchObject({ code: "TEMPLATE_INVALID_NAME" });
  });
});

describe("loadTemplate (3-level precedence)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gitwise-tpl-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns bundled template when no overrides exist", async () => {
    const content = await loadTemplate("commit", { repoRoot: tempDir });
    expect(content).toContain("{{type}}");
  });

  it("returns user-global override when ~/.gitwise equivalent exists", async () => {
    const userDir = join(tempDir, "user-templates");
    await mkdir(userDir, { recursive: true });
    await writeFile(join(userDir, "commit.md"), "user-override: {{type}}");

    const content = await loadTemplate("commit", {
      repoRoot: join(tempDir, "some-repo"),
      templatesPath: userDir,
    });
    expect(content).toBe("user-override: {{type}}");
  });

  it("returns repo-level override when .gitwise/templates exists, taking precedence over user-global", async () => {
    // Set up user-global
    const userDir = join(tempDir, "user-templates");
    await mkdir(userDir, { recursive: true });
    await writeFile(join(userDir, "commit.md"), "user-override");

    // Set up repo-level
    const repoDir = join(tempDir, "repo");
    await mkdir(join(repoDir, ".gitwise", "templates"), { recursive: true });
    await writeFile(join(repoDir, ".gitwise", "templates", "commit.md"), "repo-override");

    const content = await loadTemplate("commit", {
      repoRoot: repoDir,
      templatesPath: userDir,
    });
    expect(content).toBe("repo-override");
  });

  it("uses configured templatesPath instead of user-global default", async () => {
    const configuredDir = join(tempDir, "configured-templates");
    await mkdir(configuredDir, { recursive: true });
    await writeFile(join(configuredDir, "commit.md"), "configured-templates-override");

    const content = await loadTemplate("commit", {
      repoRoot: join(tempDir, "some-repo"),
      templatesPath: configuredDir,
    });
    expect(content).toBe("configured-templates-override");
  });

  it("integration: all three levels, resolves to repo-level file", async () => {
    const userDir = join(tempDir, "user-templates");
    await mkdir(userDir, { recursive: true });
    await writeFile(join(userDir, "commit.md"), "level-2");

    const repoDir = join(tempDir, "repo");
    await mkdir(join(repoDir, ".gitwise", "templates"), { recursive: true });
    await writeFile(join(repoDir, ".gitwise", "templates", "commit.md"), "level-1");

    const content = await loadTemplate("commit", {
      repoRoot: repoDir,
      templatesPath: userDir,
    });
    expect(content).toBe("level-1");
  });
});

describe("loadAndInterpolate", () => {
  it("loads and interpolates a template in one call", async () => {
    const result = await loadAndInterpolate(
      "commit",
      { type: "feat", scope: "auth", description: "add login" },
      { repoRoot: "/nonexistent/path" },
    );
    expect(result).toContain("feat");
    expect(result).toContain("auth");
    expect(result).toContain("add login");
  });
});
