import { Command } from "commander";
import { createRequire } from "node:module";
import { makeCommitCommand } from "./commands/commit.js";
import { makeReviewCommand } from "./commands/review.js";
import { makePrCommand } from "./commands/pr.js";
import { makeReleaseCommand } from "./commands/release.js";
import { loadEnv } from "../infra/env.js";

export function loadVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("../package.json") as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export function createProgram(): Command {
  const program = new Command();
  program
    .name("gw")
    .description(
      "AI git assistant — commit, review, pr, release",
    )
    .version(loadVersion());
  program.hook("preAction", async () => {
    await loadEnv(process.cwd());
  });
  program.addCommand(makeCommitCommand());
  program.addCommand(makeReviewCommand());
  program.addCommand(makePrCommand());
  program.addCommand(makeReleaseCommand());
  return program;
}
