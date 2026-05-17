import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { fileExists } from "../infra/filesystem.js";
import type { ProjectInfo } from "./types.js";

interface DetectionResult {
  language: string;
  framework: string | null;
  testFramework: string | null;
  hasCI: boolean;
}

export async function scanProject(projectRoot: string): Promise<ProjectInfo> {
  const detection = await detect(projectRoot);
  const name = projectRoot.split("/").pop() ?? "unknown";
  return {
    name,
    ...detection,
  };
}

async function detect(root: string): Promise<DetectionResult> {
  const language = await detectLanguage(root);
  const framework = await detectFramework(root, language);
  const testFramework = await detectTestFramework(root, language);
  const hasCI = await detectCI(root);
  return { language, framework, testFramework, hasCI };
}

async function detectLanguage(root: string): Promise<string> {
  const indicators: [string, string][] = [
    ["package.json", "typescript"],
    ["tsconfig.json", "typescript"],
    ["requirements.txt", "python"],
    ["pyproject.toml", "python"],
    ["go.mod", "go"],
    ["Cargo.toml", "rust"],
    ["build.gradle", "java"],
    ["pom.xml", "java"],
  ];
  for (const [file, lang] of indicators) {
    if (await fileExists(join(root, file))) {
      if (file === "package.json" && lang === "typescript") {
        const hasTsConfig = await fileExists(join(root, "tsconfig.json"));
        return hasTsConfig ? "typescript" : "javascript";
      }
      return lang;
    }
  }
  return "unknown";
}

async function detectFramework(
  root: string,
  language: string,
): Promise<string | null> {
  if (language === "typescript" || language === "javascript") {
    return detectNodeFramework(root);
  }
  if (language === "python") {
    return detectPythonFramework(root);
  }
  return null;
}

async function detectNodeFramework(root: string): Promise<string | null> {
  const pkgPath = join(root, "package.json");
  if (!(await fileExists(pkgPath))) return null;
  try {
    const raw = await readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(raw);
    const deps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };
    if (deps["next"]) return "next";
    if (deps["nuxt"]) return "nuxt";
    if (deps["@angular/core"]) return "angular";
    if (deps["react"]) return "react";
    if (deps["vue"]) return "vue";
    if (deps["express"]) return "express";
    if (deps["fastify"]) return "fastify";
    if (deps["nestjs"] || deps["@nestjs/core"]) return "nestjs";
    return null;
  } catch {
    return null;
  }
}

async function detectPythonFramework(root: string): Promise<string | null> {
  const reqPath = join(root, "requirements.txt");
  if (!(await fileExists(reqPath))) return null;
  try {
    const content = await readFile(reqPath, "utf-8");
    if (content.includes("django")) return "django";
    if (content.includes("flask")) return "flask";
    if (content.includes("fastapi")) return "fastapi";
    return null;
  } catch {
    return null;
  }
}

async function detectTestFramework(
  root: string,
  language: string,
): Promise<string | null> {
  if (language === "typescript" || language === "javascript") {
    if (await fileExists(join(root, "jest.config.ts"))) return "jest";
    if (await fileExists(join(root, "jest.config.js"))) return "jest";
    if (await fileExists(join(root, "vitest.config.ts"))) return "vitest";
    if (await fileExists(join(root, "vitest.config.js"))) return "vitest";
    const pkgPath = join(root, "package.json");
    if (await fileExists(pkgPath)) {
      try {
        const raw = await readFile(pkgPath, "utf-8");
        const pkg = JSON.parse(raw);
        if (pkg.devDependencies?.jest || pkg.dependencies?.jest) return "jest";
        if (pkg.devDependencies?.vitest || pkg.dependencies?.vitest) return "vitest";
      } catch {
        // ignore parse errors
      }
    }
  }
  if (language === "python") {
    if (await fileExists(join(root, "pytest.ini"))) return "pytest";
    if (await fileExists(join(root, "setup.cfg"))) return "pytest";
  }
  if (language === "go") return "go test";
  if (language === "rust") return "cargo test";
  return null;
}

async function detectCI(root: string): Promise<boolean> {
  const ciPaths = [
    ".github/workflows",
    ".gitlab-ci.yml",
    "Jenkinsfile",
    ".circleci",
    ".travis.yml",
  ];
  for (const ciPath of ciPaths) {
    if (await fileExists(join(root, ciPath))) return true;
  }
  return false;
}
