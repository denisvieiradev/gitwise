// Docs lint helper. Pure functions over markdown text + simple filesystem
// lookups for relative-link resolution. Designed to be importable from tests
// and from a future `npm run lint:docs` script without dragging Jest in.

import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

export const REQUIRED_README_SECTIONS = [
  "Install",
  "Commands",
  "Privacy",
  "Configuration",
];

export const REMOVED_PIPELINE_COMMANDS = [
  "init",
  "prd",
  "techspec",
  "tasks",
  "run-tasks",
  "test",
  "done",
  "status",
];

export function extractHeadings(markdown) {
  const lines = markdown.split("\n");
  const headings = [];
  let inFence = false;
  for (const raw of lines) {
    if (/^\s{0,3}```/.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^#{1,6}\s+(.+?)\s*$/.exec(raw);
    if (!match) continue;
    const text = match[1].replace(/^[*_~`]+|[*_~`]+$/g, "").trim();
    if (text) headings.push(text);
  }
  return headings;
}

export function findMissingSections(markdown, required = REQUIRED_README_SECTIONS) {
  const headings = extractHeadings(markdown).map((h) => h.toLowerCase());
  const have = new Set(headings);
  return required.filter((section) => !have.has(section.toLowerCase()));
}

export function extractRelativeLinks(markdown) {
  const lines = markdown.split("\n");
  const links = [];
  let inFence = false;
  const linkRe = /\[(?:[^\]]+)\]\(\s*<?([^)>\s]+)>?(?:\s+"[^"]*")?\s*\)/g;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s{0,3}```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    let m;
    while ((m = linkRe.exec(line)) !== null) {
      let target = m[1].trim();
      if (!target) continue;
      if (target.startsWith("#")) continue;
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
      target = target.split("#")[0].split("?")[0];
      if (!target) continue;
      links.push({ target, line: i + 1 });
    }
  }
  return links;
}

export function resolveLinkTarget(link, baseDir, repoRoot) {
  if (isAbsolute(link.target)) {
    return resolve(repoRoot, `.${link.target}`);
  }
  return resolve(baseDir, link.target);
}

export function findBrokenLinks(filePath, repoRoot) {
  const markdown = readFileSync(filePath, "utf8");
  const baseDir = dirname(filePath);
  const broken = [];
  for (const link of extractRelativeLinks(markdown)) {
    const resolved = resolveLinkTarget(link, baseDir, repoRoot);
    if (!existsSync(resolved)) {
      broken.push({ ...link, resolved });
    }
  }
  return broken;
}

export function lintMarkdownFile(filePath, repoRoot, opts = {}) {
  const markdown = readFileSync(filePath, "utf8");
  const requiredSections = opts.requiredSections;
  return {
    file: filePath,
    missingSections: requiredSections
      ? findMissingSections(markdown, requiredSections)
      : [],
    brokenLinks: findBrokenLinks(filePath, repoRoot),
  };
}
