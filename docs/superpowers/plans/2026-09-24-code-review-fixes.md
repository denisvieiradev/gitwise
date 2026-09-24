# Code-Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the six findings from the `/code-review` of `main...HEAD` on branch `denisvieiradev/feature-support-codex-kiro-copilot`.

**Architecture:** Four small, independent code changes in `packages/core` (subprocess signal handling and timeout message, user-config robustness, repo-config provider scoping), followed by one rebuild-and-commit of the tracked plugin bundle `packages/skills/dist`, which must come last because it embeds the core changes.

**Tech Stack:** TypeScript (ESM, Node >= 22.12), Jest with `--experimental-vm-modules`, tsup, npm workspaces.

**Spec:** The review findings in this conversation (no spec doc). Related in-code requirement IDs: MDL-01..MDL-06 (`packages/core/src/config/*.ts` comments), AD-001 (`cli-subprocess.ts`).

## Global Constraints

- Test command (from repo root): `npm test -- <path-or-pattern>`; core-only: `npm test -w @denisvieiradev/gitwise-core -- <pattern>`. Jest runs as `node --experimental-vm-modules`.
- Typecheck/lint: `npm run typecheck` and `npm run lint` (both `tsc --noEmit` per workspace).
- Code comments: default to none; at most one short line, only for a non-obvious WHY.
- Commit style: Conventional Commits, scope `core` or `skills` (see `git log`). Commits end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Existing tests in `packages/core/__tests__/unit/config/config.test.ts` (MDL-05, MDL-06) and `packages/core/__tests__/unit/providers/cli-subprocess.test.ts` must keep passing unchanged, except where a task says a message assertion changes.
- CI step "Verify committed plugin dist is up to date" requires `git diff --exit-code -- packages/skills/dist` to be clean after `npm run build`.
- Never use bare `git stash`; never `git add -A` (untracked `.agents/`, `.claude/`, `.cursor/` must stay out of commits).

## Review Focus

- A flat repo `models` override written for one provider must not leak onto another provider's CLI call: the per-provider form must be honored and the flat form must keep working for the active provider (Task 4).
- A read-only or unwritable `~/.gitwise/config.json` must not make every command fail: reading a legacy config must still return the migrated value (Task 3).
- A partial per-provider block (`models: { codex: { fast: "x" } }`) must never yield an `undefined` tier: missing tiers come from defaults (Task 2).
- A legacy flat `models` block with no `provider` key belongs to the default provider (`api`), not to nobody (Task 3).
- A SIGTERM/SIGINT to the gw process must not leave the detached agent group running, and the exit code must still reflect a signal death (Task 1).

---

### Task 1: Reap the CLI process group on SIGINT/SIGTERM (finding 1) and name the timeout (finding 6)

**Files:**
- Modify: `packages/core/src/providers/cli-subprocess.ts:98-165`
- Test: `packages/core/__tests__/unit/providers/cli-subprocess.test.ts` (append; update the assertion at line 215)

**Interfaces:**
- Consumes: existing `CliSubprocessProvider.spawnCli` internals (`killTree`, `timedOut`, `cleanup`).
- Produces: no signature changes. Behavior: (a) while a child is running, SIGINT/SIGTERM on the parent kill the child's group with SIGKILL, then the parent re-raises the signal to itself if no other listener is present; (b) a timeout rejection reads `<toolName> timed out after <N>s`, where N = `timeoutMs/1000` rounded.

Design notes for the implementer:
- Do not call `process.exit` from the handler (clack and the CLI's own handlers may want to clean up). Reap the group, remove our listeners, then re-emit the default behavior only if we were the last listener: `if (process.listenerCount(sig) === 0) process.kill(process.pid, sig)`. Because clack installs its own listener that does not exit, gw would still not exit in the CLI; in that case we additionally reject the pending promise so the command fails fast instead of waiting for the timeout. The rejection message is `<toolName> was interrupted by <sig>`.
- Windows: `ownGroup` is false; `killTree` falls back to `child.kill`. Same handlers apply.

- [ ] **Step 1: Write the failing tests**

Append to `cli-subprocess.test.ts`, inside a new `describe("CliSubprocessProvider parent signals", ...)` after the process-tree describe:

```ts
describe("CliSubprocessProvider parent signals", () => {
  posixIt("kills the CLI's process group and rejects when the parent receives SIGINT", async () => {
    const f = script(`
const fs = require("node:fs");
fs.writeFileSync(__dirname + "/cli.pid", String(process.pid));
setInterval(() => {}, 1000);`);
    const provider = new CliSubprocessProvider(makeSpec({ timeoutMs: 30_000 }), MODELS, f.path);
    // A listener stands in for clack's spinner handler, so the test process itself is not signalled.
    const noop = (): void => undefined;
    process.on("SIGINT", noop);
    try {
      const pending = provider.chat(req("x")).catch((e: unknown) => e);
      await sleep(300);
      process.emit("SIGINT");
      const err = (await pending) as Error;
      expect(err.message).toBe("Fake CLI was interrupted by SIGINT");
    } finally {
      process.off("SIGINT", noop);
    }

    const pid = Number(readFileSync(join(f.dir, "cli.pid"), "utf8"));
    let alive = true;
    for (let i = 0; i < 20 && alive; i++) {
      try {
        process.kill(pid, 0);
        await sleep(50);
      } catch {
        alive = false;
      }
    }
    if (alive) process.kill(pid, "SIGKILL");
    expect(alive).toBe(false);
  });

  posixIt("removes its signal listeners once the CLI has finished", async () => {
    const f = script(`process.stdin.resume(); process.stdin.on("end", () => process.stdout.write("ok"));`);
    const provider = new CliSubprocessProvider(makeSpec(), MODELS, f.path);
    const before = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];

    await provider.chat(req("x"));

    expect([process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")]).toEqual(before);
  });
});

describe("CliSubprocessProvider timeout message", () => {
  posixIt("says the CLI timed out and how long the limit was, instead of naming a bare signal", async () => {
    const f = script(`setInterval(() => {}, 1000);`);
    const provider = new CliSubprocessProvider(makeSpec({ timeoutMs: 1_000 }), MODELS, f.path);

    const err = (await provider.chat(req("x")).catch((e: unknown) => e)) as Error;

    expect(err.message).toBe("Fake CLI timed out after 1s");
  });
});
```

Also change line 215 (`expect(err.message).toBe("Fake CLI was terminated by signal SIGTERM");` inside "timeout process tree") to `expect(err.message).toBe("Fake CLI timed out after 1s");`. Leave line 106 (external SIGTERM, no timeout) unchanged.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @denisvieiradev/gitwise-core -- cli-subprocess`
Expected: FAIL. The SIGINT test hangs until its Jest timeout or fails with a different message; the timeout-message tests fail with "terminated by signal SIGTERM".

- [ ] **Step 3: Implement**

In `spawnCli` in `cli-subprocess.ts`, replace the block from `// A detached group no longer receives ...` through the `cleanup` definition, and the `close` handler's signal branch, with:

```ts
      const timeoutMs = this.spec.timeoutMs ?? DEFAULT_TIMEOUT_MS;

      // A detached group no longer receives the terminal's Ctrl-C, so reap it on exit and on SIGINT/SIGTERM.
      const reapOnExit = (): void => killTree("SIGKILL");
      let interruptedBy: NodeJS.Signals | undefined;
      const onSignal = (sig: NodeJS.Signals): void => {
        interruptedBy = sig;
        killTree("SIGKILL");
        reject(new Error(`${this.spec.toolName} was interrupted by ${sig}`));
        cleanup();
        if (process.listenerCount(sig) === 0) process.kill(process.pid, sig);
      };
      const onSigint = (): void => onSignal("SIGINT");
      const onSigterm = (): void => onSignal("SIGTERM");
      process.once("exit", reapOnExit);
      process.on("SIGINT", onSigint);
      process.on("SIGTERM", onSigterm);
      function cleanup(): void {
        clearTimeout(timer);
        clearTimeout(escalation);
        process.off("exit", reapOnExit);
        process.off("SIGINT", onSigint);
        process.off("SIGTERM", onSigterm);
      }
```

Declare `const timeoutMs = ...` (first line of the snippet) *above* the existing `const timer = setTimeout(...)` and change that call's last argument from `this.spec.timeoutMs ?? DEFAULT_TIMEOUT_MS` to `timeoutMs`; the signal handlers then follow the timer. Declare `cleanup` with `function cleanup(): void {...}` (hoisted) so `onSignal` may reference it regardless of order.

In the `close` handler, change the signal branch to:

```ts
        if (interruptedBy) return;
        if (code === null && signal) {
          const reason = timedOut
            ? `${this.spec.toolName} timed out after ${Math.round(timeoutMs / 1000)}s`
            : `${this.spec.toolName} was terminated by signal ${signal}`;
          reject(new Error(reason));
          return;
        }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @denisvieiradev/gitwise-core -- cli-subprocess`
Expected: PASS, including the pre-existing process-tree, timeout-option and external-SIGTERM tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck -w @denisvieiradev/gitwise-core
git add packages/core/src/providers/cli-subprocess.ts packages/core/__tests__/unit/providers/cli-subprocess.test.ts
git commit -m "fix(core): reap the CLI process group on SIGINT/SIGTERM and name timeouts"
```

---

### Task 2: Merge `models` per provider, tier by tier (finding 5)

**Files:**
- Modify: `packages/core/src/config/user.ts:52-60` (`mergeWithDefaults`)
- Test: `packages/core/__tests__/unit/config/config.test.ts` (new describe inside `config (core)`)

**Interfaces:**
- Consumes: `DEFAULT_USER_CONFIG.models`, `PROVIDER_KINDS`, `ModelsByProvider` (all exist).
- Produces: `mergeWithDefaults(partial: Partial<UserConfig>): UserConfig` keeps its signature. `models[p]` is now `{ ...DEFAULT_USER_CONFIG.models[p], ...(partial.models?.[p] ?? {}) }` for every `p` in `PROVIDER_KINDS`. Unknown keys under `models` are dropped.

- [ ] **Step 1: Write the failing tests**

```ts
  describe("per-provider models merge", () => {
    it("fills the tiers a partial provider block omits from that provider's defaults", async () => {
      await mkdir(join(homeDir, ".gitwise"), { recursive: true });
      await writeFile(
        join(homeDir, ".gitwise", "config.json"),
        JSON.stringify({ provider: "codex", models: { codex: { fast: "my-fast" } } }),
        "utf-8",
      );

      const loaded = await readUserConfig(homeDir);

      expect(loaded.models.codex).toEqual({
        fast: "my-fast",
        balanced: DEFAULT_USER_CONFIG.models.codex.balanced,
        powerful: DEFAULT_USER_CONFIG.models.codex.powerful,
      });
      expect(loaded.models.kiro).toEqual(DEFAULT_USER_CONFIG.models.kiro);
    });

    it("never produces an undefined tier for any provider", async () => {
      await mkdir(join(homeDir, ".gitwise"), { recursive: true });
      await writeFile(
        join(homeDir, ".gitwise", "config.json"),
        JSON.stringify({ models: { api: {}, copilot: { balanced: "b" } } }),
        "utf-8",
      );

      const loaded = await readUserConfig(homeDir);

      for (const provider of ["api", "claude-code", "codex", "copilot", "kiro"] as const) {
        for (const tier of ["fast", "balanced", "powerful"] as const) {
          expect(typeof loaded.models[provider][tier]).toBe("string");
        }
      }
    });
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -w @denisvieiradev/gitwise-core -- config.test`
Expected: FAIL (`balanced`/`powerful` are `undefined` on `models.codex`).

- [ ] **Step 3: Implement**

Replace `mergeWithDefaults` in `user.ts`:

```ts
export function mergeWithDefaults(partial: Partial<UserConfig>): UserConfig {
  const models = {} as ModelsByProvider;
  for (const kind of PROVIDER_KINDS) {
    models[kind] = { ...DEFAULT_USER_CONFIG.models[kind], ...(partial.models?.[kind] ?? {}) };
  }
  return { ...DEFAULT_USER_CONFIG, ...partial, models };
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -w @denisvieiradev/gitwise-core -- config.test`
Expected: PASS (all existing MDL-05/MDL-06 tests too).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/config/user.ts packages/core/__tests__/unit/config/config.test.ts
git commit -m "fix(core): merge user models tier by tier per provider"
```

---

### Task 3: Make legacy-config migration best-effort and default-provider aware (finding 4)

**Files:**
- Modify: `packages/core/src/config/user.ts:34-40` (`migrateFlatModels`) and `:62-80` (`readUserConfig`)
- Test: `packages/core/__tests__/unit/config/config.test.ts` (extend the "legacy flat models migration (MDL-05)" describe)

**Interfaces:**
- Consumes: `mergeWithDefaults` from Task 2 (unchanged signature); `writeJSON`, `debug`.
- Produces: `readUserConfig` never throws because of a failed migration write; a legacy flat block with `provider` **absent** (`undefined`) migrates into `DEFAULT_USER_CONFIG.provider` (`api`); a present-but-unrecognized `provider` keeps the existing behavior (all defaults, no guessing).

Note: this task depends on Task 2 only for test ordering; the code is independent.

- [ ] **Step 1: Write the failing tests**

Add inside the "legacy flat models migration (MDL-05)" describe (reuse its existing `path`/home setup; view lines 261-270 of the test file for the exact fixture helper and follow it):

```ts
    it("migrates a legacy flat block with no provider key into the default provider's block", async () => {
      await mkdir(join(homeDir, ".gitwise"), { recursive: true });
      const path = join(homeDir, ".gitwise", "config.json");
      await writeFile(
        path,
        JSON.stringify({ models: { fast: "legacy-fast", balanced: "legacy-balanced", powerful: "legacy-powerful" } }),
        "utf-8",
      );

      const loaded = await readUserConfig(homeDir);

      expect(loaded.models[DEFAULT_USER_CONFIG.provider]).toEqual({
        fast: "legacy-fast",
        balanced: "legacy-balanced",
        powerful: "legacy-powerful",
      });
    });

    it("still returns the migrated config when the migration cannot be persisted", async () => {
      await mkdir(join(homeDir, ".gitwise"), { recursive: true });
      const path = join(homeDir, ".gitwise", "config.json");
      await writeFile(
        path,
        JSON.stringify({
          provider: "claude-code",
          models: { fast: "legacy-fast", balanced: "legacy-balanced", powerful: "legacy-powerful" },
        }),
        "utf-8",
      );
      await chmod(join(homeDir, ".gitwise"), 0o500);
      try {
        const loaded = await readUserConfig(homeDir);
        expect(loaded.models["claude-code"].fast).toBe("legacy-fast");
      } finally {
        await chmod(join(homeDir, ".gitwise"), 0o700);
      }
    });
```

Add `chmod` to the `node:fs/promises` import at the top of the test file. The second test relies on POSIX directory permissions and running as a non-root user; guard it with `const posixIt = process.platform === "win32" || process.getuid?.() === 0 ? it.skip : it;` and use `posixIt` for that test only. (Directory `0o500` blocks the atomic temp-file write that `writeJSON` performs; if `writeJSON` in `infra/filesystem.ts` writes in place instead, `chmod` the file itself to `0o400`, and verify the test fails before the fix.)

- [ ] **Step 2: Run to verify failure**

Run: `npm test -w @denisvieiradev/gitwise-core -- config.test`
Expected: FAIL. The first test gets api defaults; the second rejects with EACCES.

- [ ] **Step 3: Implement**

In `migrateFlatModels`, treat an absent provider as the default:

```ts
function migrateFlatModels(flat: ModelConfig, provider: unknown): ModelsByProvider {
  const target = provider === undefined ? DEFAULT_USER_CONFIG.provider : provider;
  const migrated: ModelsByProvider = { ...DEFAULT_USER_CONFIG.models };
  if (typeof target === "string" && PROVIDER_KINDS.includes(target as ProviderKind)) {
    migrated[target as ProviderKind] = { ...flat };
  }
  return migrated;
}
```

Update the doc comment above it: replace the last sentence with "An absent `provider` means the default provider; a present but unrecognized one backfills everything from defaults instead of guessing."

In `readUserConfig`, wrap the persist step:

```ts
    try {
      await writeJSON(configPath, merged);
    } catch (err) {
      debug("Could not persist migrated config; using it in memory", { path: configPath, error: String(err) });
    }
    return merged;
```

- [ ] **Step 4: Run tests**

Run: `npm test -w @denisvieiradev/gitwise-core -- config.test`
Expected: PASS, including the existing "migrates ... and persists it" and "unrecognized provider" tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/config/user.ts packages/core/__tests__/unit/config/config.test.ts
git commit -m "fix(core): make legacy models migration best-effort and default-provider aware"
```

---

### Task 4: Allow per-provider repo `models` overrides (finding 3)

**Design decision (flag for review):** Keep the existing flat form (`{ "models": { "fast": "x" } }`, applied to the active provider only, MDL-06) for backward compatibility, and add a per-provider form (`{ "models": { "codex": { "fast": "x" } } }`) that is applied to the named provider regardless of who is active. Teams sharing a `.gitwise.json` across providers should use the per-provider form; the README and docs say so. Only the flat form remains provider-agnostic, and it is documented as such.

**Files:**
- Modify: `packages/core/src/config/types.ts:34-36` (`RepoConfig.models`)
- Modify: `packages/core/src/config/merge.ts:6-32` (`deepMerge`)
- Modify: `README.md:163-170`, `docs/src/content/docs/configuration.md` (repo config `models` section, around line 65-90)
- Test: `packages/core/__tests__/unit/config/config.test.ts` (extend "repo-level models override scoping (MDL-06)")

**Interfaces:**
- Consumes: `PROVIDER_KINDS`, `ProviderKind` from `../providers/types.js`; `ModelConfig`; `ModelsByProvider`.
- Produces:
  - `RepoConfig.models?: Partial<ModelConfig> | Partial<Record<ProviderKind, Partial<ModelConfig>>>`
  - `deepMerge(base: UserConfig, override: RepoConfig): MergedConfig` (unchanged signature). Shape rule: if the override object has any key in `PROVIDER_KINDS`, treat it as per-provider (non-provider keys ignored); otherwise as flat (active provider only).

- [ ] **Step 1: Write the failing tests**

Add to the "repo-level models override scoping (MDL-06)" describe:

```ts
    it("applies a per-provider repo models block to the named provider even when another provider is active", async () => {
      await writeUserConfig({ provider: "codex" }, homeDir);
      await writeFile(
        join(cwd, ".gitwise.json"),
        JSON.stringify({ models: { "claude-code": { fast: "team-haiku" }, codex: { balanced: "team-sol" } } }),
        "utf-8",
      );

      const config = await getMergedConfig({ cwd, homeDir });

      expect(config.models.codex.balanced).toBe("team-sol");
      expect(config.models.codex.fast).toBe(DEFAULT_USER_CONFIG.models.codex.fast);
      expect(config.models["claude-code"].fast).toBe("team-haiku");
      expect(config.models["claude-code"].balanced).toBe(DEFAULT_USER_CONFIG.models["claude-code"].balanced);
      expect(config.models.kiro).toEqual(DEFAULT_USER_CONFIG.models.kiro);
    });

    it("does not send a per-provider override written for one provider to another", async () => {
      await writeUserConfig({ provider: "kiro" }, homeDir);
      await writeFile(
        join(cwd, ".gitwise.json"),
        JSON.stringify({ models: { api: { fast: "claude-haiku-4-5-20251001-custom" } } }),
        "utf-8",
      );

      const config = await getMergedConfig({ cwd, homeDir });

      expect(config.models.kiro).toEqual(DEFAULT_USER_CONFIG.models.kiro);
    });

    it("ignores unknown keys in a per-provider block and never adds stray top-level keys", async () => {
      await writeFile(
        join(cwd, ".gitwise.json"),
        JSON.stringify({ models: { codex: { fast: "x" }, bogus: { fast: "y" } } }),
        "utf-8",
      );

      const config = await getMergedConfig({ cwd, homeDir });

      expect(Object.keys(config.models).sort()).toEqual(["api", "claude-code", "codex", "copilot", "kiro"]);
    });
```

The existing three flat-form tests in that describe must still pass unchanged.

- [ ] **Step 2: Run to verify failure**

Run: `npm test -w @denisvieiradev/gitwise-core -- config.test`
Expected: FAIL (first test: codex.balanced not applied; third: stray `bogus`-free but `codex` merged into the active `api` block as a fake tier).

- [ ] **Step 3: Implement**

`types.ts`:

```ts
export interface RepoConfig {
  /** Flat tier overrides apply to the active provider; a per-provider map targets each named provider. */
  models?: Partial<ModelConfig> | Partial<Record<ProviderKind, Partial<ModelConfig>>>;
  ...
```

`merge.ts` — add imports `import { PROVIDER_KINDS } from "../providers/types.js";` and `type ModelConfig, type ModelsByProvider`, then a helper above `deepMerge` and use it:

```ts
function mergeRepoModels(base: UserConfig, override: RepoConfig["models"]): ModelsByProvider {
  if (!override) return base.models;
  const isPerProvider = PROVIDER_KINDS.some((kind) => kind in override);
  const perProvider: Partial<Record<ProviderKind, Partial<ModelConfig>>> = isPerProvider
    ? (override as Partial<Record<ProviderKind, Partial<ModelConfig>>>)
    : { [base.provider]: override as Partial<ModelConfig> };
  const merged = { ...base.models };
  for (const kind of PROVIDER_KINDS) {
    if (perProvider[kind]) merged[kind] = { ...base.models[kind], ...perProvider[kind] };
  }
  return merged;
}
```

In `deepMerge`, replace the `models: {...}` property with `models: mergeRepoModels(base, override.models),` and shorten the MDL-06 comment above it to one line: `// MDL-06: flat overrides target the active provider; per-provider maps target each named provider.` Import `ProviderKind` type as needed.

Docs: in `README.md` under `<repo>/.gitwise.json` change the `models` line to show both forms:

```jsonc
  "models": { "codex": { "balanced": "gpt-6-sol" } },   // per-provider; safe to share across a team
  // or: "models": { "balanced": "my-model" },          // flat; applies to whichever provider is active
```

and add the same explanation (two sentences: per-provider form is recommended for shared repos, flat form is applied to the active provider only) to the repo-override section of `docs/src/content/docs/configuration.md`. Check `packages/cli/__tests__/readme-doc-snippets.test.ts` and `docs-presence.test.ts` still pass; they may parse README snippets.

- [ ] **Step 4: Run tests**

Run: `npm test -w @denisvieiradev/gitwise-core -- config.test && npm test -w @denisvieiradev/gitwise -- readme docs-presence`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add packages/core/src/config/types.ts packages/core/src/config/merge.ts packages/core/__tests__/unit/config/config.test.ts README.md docs/src/content/docs/configuration.md
git commit -m "fix(core): let .gitwise.json scope model overrides per provider"
```

---

### Task 5: Rebuild and commit the plugin bundle (finding 2)

**Files:**
- Modify/Create: `packages/skills/dist/**` (generated; commit whatever `npm run build` changes, including `dist/adapters/**`, which `.gitignore` already un-ignores)

**Interfaces:**
- Consumes: Tasks 1-4 (the bundle inlines `@denisvieiradev/gitwise-core`, so it must be built after them).
- Produces: a `packages/skills/dist` that matches a fresh build, so CI's `git diff --exit-code -- packages/skills/dist` is clean.

- [ ] **Step 1: Confirm the bundle is stale**

Run: `npm run build && git status --short packages/skills/dist && grep -c buildProviderConfig packages/skills/dist/scripts/commit.js`
Expected: `git status` lists modified and/or untracked files under `packages/skills/dist` (including `adapters/`); grep count is >= 1 after the build. If nothing changed and the count was already >= 1 before the build, the review finding was a false positive for the bundle: record that in the commit-less summary and skip to Step 4.

- [ ] **Step 2: Review the generated diff**

Run: `git diff --stat -- packages/skills/dist && git status --short packages/skills/dist`
Expected: only build output; no `*.map` files (they are gitignored); no absolute local paths (`grep -rn "/Users/" packages/skills/dist` prints nothing).

- [ ] **Step 3: Commit**

```bash
git add packages/skills/dist
git commit -m "build(skills): rebuild the committed plugin bundle for per-provider models"
```

- [ ] **Step 4: Full verification (mirrors CI)**

Run, in order: `npm run build && npm run lint && git diff --exit-code -- packages/skills/dist && npm test`
Expected: every command exits 0; `git diff --exit-code` prints nothing. Fix any failure at its root cause before finishing; do not skip hooks or edit CI.

---

## Self-Review

**Spec coverage** (review findings to tasks, numbered in the review's order): 1 SIGINT/SIGTERM leak → Task 1; 2 stale dist → Task 5; 3 flat repo override across providers → Task 4; 4 migration write failure and missing provider → Task 3; 5 shallow models merge → Task 2; 6 vague timeout message → Task 1.

**Placeholders:** none; the two spots that say "view the test file for the fixture helper" (Task 3) and "if `writeJSON` writes in place" point at facts the implementer must confirm in the file, with the fallback stated.

**Type consistency:** `mergeWithDefaults` signature is unchanged from Task 2 onward; `RepoConfig.models` union (Task 4) is consumed only by `mergeRepoModels`; `timeoutMs` local in Task 1 replaces the inline expression at the `setTimeout` call.

**Review Focus coverage:** every line maps to a test: cross-provider leak (Task 4, second test), unwritable config (Task 3, second test), partial provider block (Task 2), missing `provider` (Task 3, first test), signal reaping (Task 1, first and second tests).
