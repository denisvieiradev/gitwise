import { needsFirstRun, runFirstRun } from "./first-run.js";
import { createProgram } from "./program.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Extract --api-key if provided
  const apiKeyIdx = args.indexOf("--api-key");
  const apiKey = apiKeyIdx >= 0 ? args[apiKeyIdx + 1] : undefined;

  // Check if first run is needed (skip for --version, --help, config)
  const isHelp = args.includes("--help") || args.includes("-h");
  const isVersion = args.includes("--version") || args.includes("-V");
  const isConfig = args[0] === "config";

  if (!isHelp && !isVersion && !isConfig) {
    if (await needsFirstRun()) {
      await runFirstRun({ apiKey });
    }
  }

  const program = createProgram();
  await program.parseAsync(process.argv);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
