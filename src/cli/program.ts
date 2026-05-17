import { Command } from "commander";
import { createRequire } from "node:module";
import { makeInitCommand } from "./commands/init.js";
import { makePrdCommand } from "./commands/prd.js";
import { makeTechspecCommand } from "./commands/techspec.js";
import { makeTasksCommand } from "./commands/tasks.js";
import { makeCommitCommand } from "./commands/commit.js";
import { makeRunTasksCommand } from "./commands/run-tasks.js";
import { makeTestCommand } from "./commands/test.js";
import { makeReviewCommand } from "./commands/review.js";
import { makePrCommand } from "./commands/pr.js";
import { makeDoneCommand } from "./commands/done.js";
import { makeStatusCommand } from "./commands/status.js";
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
    .name("devflow")
    .description(
      "CLI pipeline for structured software development — from PRD to merge",
    )
    .version(loadVersion());
  program.hook("preAction", async () => {
    await loadEnv(process.cwd());
  });
  program.addCommand(makeInitCommand());
  program.addCommand(makePrdCommand());
  program.addCommand(makeTechspecCommand());
  program.addCommand(makeTasksCommand());
  program.addCommand(makeCommitCommand());
  program.addCommand(makeRunTasksCommand());
  program.addCommand(makeTestCommand());
  program.addCommand(makeReviewCommand());
  program.addCommand(makePrCommand());
  program.addCommand(makeDoneCommand());
  program.addCommand(makeStatusCommand());
  program.addCommand(makeReleaseCommand());
  return program;
}
