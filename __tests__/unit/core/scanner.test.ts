import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { join } from "node:path";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { scanProject } from "../../../src/core/scanner.js";

describe("ProjectScanner", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "devflow-scanner-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should detect TypeScript project", async () => {
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ devDependencies: { jest: "^29" } }));
    await writeFile(join(tempDir, "tsconfig.json"), "{}");
    const result = await scanProject(tempDir);
    expect(result.language).toBe("typescript");
  });

  it("should detect JavaScript project without tsconfig", async () => {
    await writeFile(join(tempDir, "package.json"), JSON.stringify({}));
    const result = await scanProject(tempDir);
    expect(result.language).toBe("javascript");
  });

  it("should detect Python project", async () => {
    await writeFile(join(tempDir, "requirements.txt"), "flask\n");
    const result = await scanProject(tempDir);
    expect(result.language).toBe("python");
    expect(result.framework).toBe("flask");
  });

  it("should detect Go project", async () => {
    await writeFile(join(tempDir, "go.mod"), "module example.com/myapp");
    const result = await scanProject(tempDir);
    expect(result.language).toBe("go");
    expect(result.testFramework).toBe("go test");
  });

  it("should detect Rust project", async () => {
    await writeFile(join(tempDir, "Cargo.toml"), "[package]\nname = \"myapp\"");
    const result = await scanProject(tempDir);
    expect(result.language).toBe("rust");
    expect(result.testFramework).toBe("cargo test");
  });

  it("should detect React framework", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({ dependencies: { react: "^18" } }),
    );
    await writeFile(join(tempDir, "tsconfig.json"), "{}");
    const result = await scanProject(tempDir);
    expect(result.framework).toBe("react");
  });

  it("should detect Jest test framework", async () => {
    await writeFile(join(tempDir, "package.json"), JSON.stringify({}));
    await writeFile(join(tempDir, "tsconfig.json"), "{}");
    await writeFile(join(tempDir, "jest.config.ts"), "export default {}");
    const result = await scanProject(tempDir);
    expect(result.testFramework).toBe("jest");
  });

  it("should detect CI via GitHub Actions", async () => {
    await writeFile(join(tempDir, "package.json"), JSON.stringify({}));
    await mkdir(join(tempDir, ".github", "workflows"), { recursive: true });
    const result = await scanProject(tempDir);
    expect(result.hasCI).toBe(true);
  });

  it("should return unknown for empty project", async () => {
    const result = await scanProject(tempDir);
    expect(result.language).toBe("unknown");
    expect(result.framework).toBeNull();
    expect(result.testFramework).toBeNull();
    expect(result.hasCI).toBe(false);
  });

  it("should detect Java project with build.gradle", async () => {
    await writeFile(join(tempDir, "build.gradle"), "apply plugin: 'java'");
    const result = await scanProject(tempDir);
    expect(result.language).toBe("java");
  });

  it("should detect Java project with pom.xml", async () => {
    await writeFile(join(tempDir, "pom.xml"), "<project></project>");
    const result = await scanProject(tempDir);
    expect(result.language).toBe("java");
  });

  it("should detect Python with pyproject.toml", async () => {
    await writeFile(join(tempDir, "pyproject.toml"), "[tool.poetry]");
    const result = await scanProject(tempDir);
    expect(result.language).toBe("python");
  });

  it("should detect Next.js framework", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({ dependencies: { next: "^14" } }),
    );
    await writeFile(join(tempDir, "tsconfig.json"), "{}");
    const result = await scanProject(tempDir);
    expect(result.framework).toBe("next");
  });

  it("should detect Nuxt framework", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({ dependencies: { nuxt: "^3" } }),
    );
    await writeFile(join(tempDir, "tsconfig.json"), "{}");
    const result = await scanProject(tempDir);
    expect(result.framework).toBe("nuxt");
  });

  it("should detect Angular framework", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({ dependencies: { "@angular/core": "^17" } }),
    );
    await writeFile(join(tempDir, "tsconfig.json"), "{}");
    const result = await scanProject(tempDir);
    expect(result.framework).toBe("angular");
  });

  it("should detect Vue framework", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({ dependencies: { vue: "^3" } }),
    );
    await writeFile(join(tempDir, "tsconfig.json"), "{}");
    const result = await scanProject(tempDir);
    expect(result.framework).toBe("vue");
  });

  it("should detect Express framework", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({ dependencies: { express: "^4" } }),
    );
    await writeFile(join(tempDir, "tsconfig.json"), "{}");
    const result = await scanProject(tempDir);
    expect(result.framework).toBe("express");
  });

  it("should detect Fastify framework", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({ dependencies: { fastify: "^4" } }),
    );
    await writeFile(join(tempDir, "tsconfig.json"), "{}");
    const result = await scanProject(tempDir);
    expect(result.framework).toBe("fastify");
  });

  it("should detect NestJS framework", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({ dependencies: { "@nestjs/core": "^10" } }),
    );
    await writeFile(join(tempDir, "tsconfig.json"), "{}");
    const result = await scanProject(tempDir);
    expect(result.framework).toBe("nestjs");
  });

  it("should detect Django framework", async () => {
    await writeFile(join(tempDir, "requirements.txt"), "django==4.2\n");
    const result = await scanProject(tempDir);
    expect(result.framework).toBe("django");
  });

  it("should detect FastAPI framework", async () => {
    await writeFile(join(tempDir, "requirements.txt"), "fastapi\n");
    const result = await scanProject(tempDir);
    expect(result.framework).toBe("fastapi");
  });

  it("should detect Vitest test framework from config", async () => {
    await writeFile(join(tempDir, "package.json"), JSON.stringify({}));
    await writeFile(join(tempDir, "tsconfig.json"), "{}");
    await writeFile(join(tempDir, "vitest.config.ts"), "export default {}");
    const result = await scanProject(tempDir);
    expect(result.testFramework).toBe("vitest");
  });

  it("should detect Jest from package.json devDependencies", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({ devDependencies: { jest: "^29" } }),
    );
    await writeFile(join(tempDir, "tsconfig.json"), "{}");
    const result = await scanProject(tempDir);
    expect(result.testFramework).toBe("jest");
  });

  it("should detect Vitest from package.json devDependencies", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({ devDependencies: { vitest: "^1" } }),
    );
    await writeFile(join(tempDir, "tsconfig.json"), "{}");
    const result = await scanProject(tempDir);
    expect(result.testFramework).toBe("vitest");
  });

  it("should detect pytest from pytest.ini", async () => {
    await writeFile(join(tempDir, "requirements.txt"), "some-lib\n");
    await writeFile(join(tempDir, "pytest.ini"), "[pytest]");
    const result = await scanProject(tempDir);
    expect(result.testFramework).toBe("pytest");
  });

  it("should detect GitLab CI", async () => {
    await writeFile(join(tempDir, ".gitlab-ci.yml"), "stages: [build]");
    const result = await scanProject(tempDir);
    expect(result.hasCI).toBe(true);
  });

  it("should detect Jenkinsfile CI", async () => {
    await writeFile(join(tempDir, "Jenkinsfile"), "pipeline {}");
    const result = await scanProject(tempDir);
    expect(result.hasCI).toBe(true);
  });

  it("should return null framework for unknown Python deps", async () => {
    await writeFile(join(tempDir, "requirements.txt"), "requests\n");
    const result = await scanProject(tempDir);
    expect(result.language).toBe("python");
    expect(result.framework).toBeNull();
  });

  it("should return null framework for Node project without known deps", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({ dependencies: { lodash: "^4" } }),
    );
    await writeFile(join(tempDir, "tsconfig.json"), "{}");
    const result = await scanProject(tempDir);
    expect(result.framework).toBeNull();
  });

  it("should detect project name from directory", async () => {
    const result = await scanProject(tempDir);
    expect(result.name).toBeTruthy();
    expect(typeof result.name).toBe("string");
  });
});
