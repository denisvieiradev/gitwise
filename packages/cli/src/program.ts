import { Command } from "commander";
import { createRequire } from "node:module";
import { makeConfigCommand } from "./commands/config.js";

const requireFromHere = createRequire(import.meta.url);
const pkg = requireFromHere("../package.json") as { version: string };

export function createProgram(): Command {
  const program = new Command();

  program
    .name("gw")
    .description("AI-powered git toolbelt")
    .version(pkg.version)
    .option("--no-color", "Disable ANSI color output")
    .option("--api-key <key>", "Anthropic API key (bypasses interactive prompt on first run)");

  // Placeholder subcommands (filled in by task_13)
  program
    .command("commit")
    .description("Generate intelligent commit message from staged changes")
    .allowUnknownOption()
    .action(() => {
      console.log("(commit command not yet implemented — coming in task_13)");
    });

  program
    .command("review")
    .description("AI-powered code review")
    .allowUnknownOption()
    .action(() => {
      console.log("(review command not yet implemented — coming in task_13)");
    });

  program
    .command("pr")
    .description("AI-drafted pull request")
    .allowUnknownOption()
    .action(() => {
      console.log("(pr command not yet implemented — coming in task_13)");
    });

  program
    .command("release")
    .description("Versioned release with changelog and notes")
    .allowUnknownOption()
    .action(() => {
      console.log("(release command not yet implemented — coming in task_13)");
    });

  // Config subcommand
  program.addCommand(makeConfigCommand());

  return program;
}
