/**
 * Verifies the repo-root Claude Code marketplace manifest:
 *  - lives at <repo-root>/.claude-plugin/marketplace.json
 *  - lists the gitwise plugin
 *  - points the plugin source at the packages/skills plugin root
 *  - that source actually contains a .claude-plugin/plugin.json
 */

import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..", "..", "..");

describe(".claude-plugin/marketplace.json", () => {
  const raw = readFileSync(join(repoRoot, ".claude-plugin", "marketplace.json"), "utf8");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const market = JSON.parse(raw) as Record<string, any>;

  it("has a name and an owner", () => {
    expect(typeof market.name).toBe("string");
    expect(market.owner).toBeDefined();
    expect(typeof market.owner.name).toBe("string");
  });

  it("lists the gitwise plugin", () => {
    expect(Array.isArray(market.plugins)).toBe(true);
    const names = market.plugins.map((p: { name: string }) => p.name);
    expect(names).toContain("gitwise");
  });

  it("points the gitwise plugin source at ./packages/skills", () => {
    const gitwise = market.plugins.find((p: { name: string }) => p.name === "gitwise");
    expect(gitwise.source).toBe("./packages/skills");
  });

  it("resolves to a real plugin manifest on disk", () => {
    const gitwise = market.plugins.find((p: { name: string }) => p.name === "gitwise");
    const manifestPath = join(repoRoot, gitwise.source, ".claude-plugin", "plugin.json");
    expect(existsSync(manifestPath)).toBe(true);
  });
});
