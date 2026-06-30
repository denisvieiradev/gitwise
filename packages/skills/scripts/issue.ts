#!/usr/bin/env node
/**
 * gitwise-skills: issue runner
 * Usage: node scripts/issue.js "<description>" [--label a,b] [--assignee user] [--prompt "<text>"] [--apply]
 */

import {
  getMergedConfig,
  getApiKey,
  createProvider,
  issue,
  applyIssue,
} from "@denisvieiradev/gitwise-core";

const args = process.argv.slice(2);

// Parse flags
const applyIdx = args.indexOf("--apply");
const apply = applyIdx !== -1;
if (apply) args.splice(applyIdx, 1);

const labelIdx = args.indexOf("--label");
let labels: string[] | undefined;
if (labelIdx !== -1) {
  labels = (args[labelIdx + 1] ?? "")
    .split(",")
    .map((l) => l.trim())
    .filter(Boolean);
  args.splice(labelIdx, 2);
}

// --assignee may be repeated; collect every occurrence.
const assignees: string[] = [];
let assigneeIdx = args.indexOf("--assignee");
while (assigneeIdx !== -1) {
  const value = args[assigneeIdx + 1];
  if (value) {
    for (const a of value.split(",").map((x) => x.trim()).filter(Boolean)) {
      assignees.push(a);
    }
  }
  args.splice(assigneeIdx, 2);
  assigneeIdx = args.indexOf("--assignee");
}

const promptIdx = args.indexOf("--prompt");
let extraPrompt: string | undefined;
if (promptIdx !== -1) {
  extraPrompt = args[promptIdx + 1];
  args.splice(promptIdx, 2);
}

// Remaining positional arg is the issue description.
const description = args.join(" ").trim();

async function main(): Promise<void> {
  const cwd = process.cwd();
  const config = await getMergedConfig({ cwd });
  const apiKey = await getApiKey();
  const provider = createProvider({ kind: config.provider, models: config.models, apiKey, claudeCliPath: config.claudeCliPath });

  const draft = await issue({
    description,
    prompt: extraPrompt,
    labels,
    assignees: assignees.length ? assignees : undefined,
    provider,
    cwd,
  });

  // Emit draft
  process.stdout.write(`## Issue Draft\n\n`);
  process.stdout.write(`**Title:** ${draft.title}\n\n`);
  if (draft.labels?.length) {
    process.stdout.write(`**Labels:** ${draft.labels.join(", ")}\n\n`);
  }
  if (draft.assignees?.length) {
    process.stdout.write(`**Assignees:** ${draft.assignees.join(", ")}\n\n`);
  }
  process.stdout.write(`**Body:**\n\n${draft.body}\n\n`);
  process.stdout.write(
    `**Tokens used:** ${draft.tokens.input} in / ${draft.tokens.output} out\n\n`
  );

  if (!apply) {
    process.stdout.write("_Run with `--apply` to create the GitHub issue._\n");
    return;
  }

  const result = await applyIssue(draft, { cwd });
  process.stdout.write(`**Issue:** ${result.url}\n`);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(1);
});
