import { Command } from "commander";
import * as p from "@clack/prompts";
import os from "node:os";
import { writeUserConfig, getApiKey, writeApiKey } from "@denisvieiradev/gitwise-core";
import { detectAvailableProviders } from "../detect-providers.js";
import { cliProviderConfigUpdate } from "../first-run.js";

// CFG-01/CFG-02: interactive provider picker. Lists every detected CLI plus
// the API key option and persists the choice exactly like the first-run
// wizard does. `models` is never touched, so each provider keeps its own
// saved model block across switches (MDL-04).
export function makeProviderCommand(): Command {
  return new Command("provider")
    .description("Choose which AI provider gw uses (detects installed CLIs)")
    .action(async () => {
      const available = detectAvailableProviders().filter((d) => d.detected);

      p.intro("gitwise provider");

      const choice = await p.select({
        message: "Which AI provider do you want to use?",
        options: available.map((d) => ({
          value: d.kind,
          label: d.label,
          hint: d.binaryPath ?? undefined,
        })),
      });

      if (p.isCancel(choice)) {
        p.cancel("Provider unchanged.");
        return;
      }

      const chosen = available.find((d) => d.kind === choice);
      if (!chosen) {
        p.cancel("Provider unchanged.");
        return;
      }

      const home = os.homedir();

      // Like the first-run wizard: switching to the API provider with no key
      // stored anywhere would save a config that fails on every later command.
      if (chosen.kind === "api" && !(await getApiKey(home))) {
        const key = await p.password({
          message: "Enter your Anthropic API key (starts with sk-ant-...):",
          validate: (v) => (!v || v.trim().length < 10 ? "Please enter a valid API key" : undefined),
        });
        if (p.isCancel(key)) {
          p.cancel("Provider unchanged.");
          return;
        }
        await writeApiKey(key as string, home);
      }

      await writeUserConfig(cliProviderConfigUpdate(chosen), home);

      p.outro(`Provider set to ${chosen.label}.`);
    });
}
