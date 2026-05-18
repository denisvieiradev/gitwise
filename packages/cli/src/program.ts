import { Command } from "commander";
import { createRequire } from "node:module";
import chalk from "chalk";
import { makeConfigCommand } from "./commands/config.js";
import { makeCommitCommand } from "./commands/commit.js";
import { makeReviewCommand } from "./commands/review.js";
import { makePrCommand } from "./commands/pr.js";
import { makeReleaseCommand } from "./commands/release.js";

const requireFromHere = createRequire(import.meta.url);
const pkg = requireFromHere("../package.json") as { version: string };

export function applyNoColor(): void {
  process.env.NO_COLOR = "1";
  chalk.level = 0;
}

export function createProgram(): Command {
  const program = new Command();

  program
    .name("gw")
    .description("AI-powered git toolbelt")
    .version(pkg.version)
    .option("--no-color", "Disable ANSI color output")
    .option("--api-key <key>", "Anthropic API key (bypasses interactive prompt on first run)");

  program.hook("preAction", (thisCommand) => {
    if (thisCommand.opts().color === false) {
      applyNoColor();
    }
  });

  program.addCommand(makeCommitCommand());
  program.addCommand(makeReviewCommand());
  program.addCommand(makePrCommand());
  program.addCommand(makeReleaseCommand());
  program.addCommand(makeConfigCommand());

  return program;
}
