import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { mkdtemp, rm, mkdir, writeFile, readFile, stat, chmod } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getMergedConfig, getApiKey } from "../../../src/config/merge.js";
import { writeUserConfig, writeApiKey, readUserConfig } from "../../../src/config/user.js";
import { DEFAULT_USER_CONFIG } from "../../../src/config/types.js";

describe("config (core)", () => {
  let homeDir: string;
  let cwd: string;

  beforeEach(async () => {
    homeDir = await mkdtemp(join(tmpdir(), "gitwise-home-"));
    cwd = await mkdtemp(join(tmpdir(), "gitwise-repo-"));
  });

  afterEach(async () => {
    await rm(homeDir, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
  });

  describe("DEFAULT_USER_CONFIG.models (MDL-02)", () => {
    it("keeps the pre-feature Claude defaults unchanged for api and claude-code", () => {
      const preFeatureClaude = {
        fast: "claude-haiku-4-5-20251001",
        balanced: "claude-sonnet-4-6",
        powerful: "claude-opus-4-7",
      };
      expect(DEFAULT_USER_CONFIG.models.api).toEqual(preFeatureClaude);
      expect(DEFAULT_USER_CONFIG.models["claude-code"]).toEqual(preFeatureClaude);
    });

    it("defaults codex to the model IDs in the codex CLI model catalog", () => {
      expect(DEFAULT_USER_CONFIG.models.codex).toEqual({
        fast: "gpt-6-luna",
        balanced: "gpt-6-sol",
        powerful: "gpt-6-astra",
      });
    });

    it("defaults copilot to the Claude tiers listed by copilot help config", () => {
      expect(DEFAULT_USER_CONFIG.models.copilot).toEqual({
        fast: "claude-haiku-4.5",
        balanced: "claude-sonnet-4.6",
        powerful: "claude-opus-4.7",
      });
    });

    it("defaults kiro to the model IDs listed by kiro-cli chat --list-models", () => {
      expect(DEFAULT_USER_CONFIG.models.kiro).toEqual({
        fast: "claude-haiku-4.5",
        balanced: "claude-sonnet-4.5",
        powerful: "claude-sonnet-4.5",
      });
    });

    it.each(["api", "claude-code", "codex", "copilot", "kiro"] as const)(
      "%s has a non-empty model ID for every tier",
      (provider) => {
        const block = DEFAULT_USER_CONFIG.models[provider];
        expect(Object.keys(block).sort()).toEqual(["balanced", "fast", "powerful"]);
        for (const tier of ["fast", "balanced", "powerful"] as const) {
          expect(typeof block[tier]).toBe("string");
          expect(block[tier].trim()).not.toBe("");
        }
      },
    );
  });

  describe("getMergedConfig", () => {
    it("returns defaults when neither user nor repo config exists", async () => {
      const config = await getMergedConfig({ cwd, homeDir });
      expect(config.provider).toBe(DEFAULT_USER_CONFIG.provider);
      expect(config.models[config.provider].fast).toBe(DEFAULT_USER_CONFIG.models.api.fast);
      expect(config.language).toBe("en");
      expect(config.commitConvention).toBe("conventional");
    });

    it("user config alone overrides the defaults", async () => {
      await writeUserConfig({ provider: "claude-code", language: "pt-br" }, homeDir);
      const config = await getMergedConfig({ cwd, homeDir });
      expect(config.provider).toBe("claude-code");
      expect(config.language).toBe("pt-br");
    });

    // MDL-01: `models` is now a per-provider map (ModelsByProvider). The
    // `.gitwise.json` `models` override's scoping to the active provider's
    // block only (MDL-06) is fixed and covered by dedicated tests in T11 —
    // this test only re-confirms the default per-provider shape is readable
    // via `config.provider` after the type change.
    it("with no repo override, every provider keeps its own default model block", async () => {
      const config = await getMergedConfig({ cwd, homeDir });
      expect(config.models.api).toEqual(DEFAULT_USER_CONFIG.models.api);
      expect(config.models.codex).toEqual(DEFAULT_USER_CONFIG.models.codex);
      expect(config.models.copilot).toEqual(DEFAULT_USER_CONFIG.models.copilot);
      expect(config.models.kiro).toEqual(DEFAULT_USER_CONFIG.models.kiro);
    });

    it("repo config takes precedence over user config in all fields", async () => {
      await writeUserConfig({ language: "es", commitConvention: "gitmoji" }, homeDir);
      await writeFile(
        join(cwd, ".gitwise.json"),
        JSON.stringify({ language: "de", commitConvention: "angular" }),
        "utf-8",
      );
      const config = await getMergedConfig({ cwd, homeDir });
      expect(config.language).toBe("de");
      expect(config.commitConvention).toBe("angular");
    });

    it("getMergedConfig does NOT include the API key", async () => {
      const config = await getMergedConfig({ cwd, homeDir }) as unknown as Record<string, unknown>;
      expect(config["apiKey"]).toBeUndefined();
      expect(config["ANTHROPIC_API_KEY"]).toBeUndefined();
    });

    it("throws INVALID_REPO_CONFIG for malformed repo config JSON", async () => {
      await writeFile(join(cwd, ".gitwise.json"), "not-json", "utf-8");
      await expect(getMergedConfig({ cwd, homeDir })).rejects.toMatchObject({
        code: "INVALID_REPO_CONFIG",
      });
    });
  });

  describe("writeUserConfig / readUserConfig", () => {
    it("round-trips atomically", async () => {
      await writeUserConfig({ provider: "claude-code", language: "fr" }, homeDir);
      const loaded = await readUserConfig(homeDir);
      expect(loaded.provider).toBe("claude-code");
      expect(loaded.language).toBe("fr");
    });

    it("preserves fields not in the partial update", async () => {
      await writeUserConfig({ language: "es" }, homeDir);
      await writeUserConfig({ commitConvention: "gitmoji" }, homeDir);
      const loaded = await readUserConfig(homeDir);
      expect(loaded.language).toBe("es");
      expect(loaded.commitConvention).toBe("gitmoji");
    });
  });

  describe("writeApiKey / getApiKey", () => {
    it("writes the file with mode 0600", async () => {
      await writeApiKey("test-api-key-123", homeDir);
      const envPath = join(homeDir, ".gitwise", ".env");
      const stats = await stat(envPath);
      // mode & 0o777 gives unix permissions bits
      if (process.platform !== "win32") {
        expect(stats.mode & 0o777).toBe(0o600);
      }
    });

    it("getApiKey prefers process.env over the .env file", async () => {
      await writeApiKey("sk-from-file", homeDir);
      const origKey = process.env["ANTHROPIC_API_KEY"];
      process.env["ANTHROPIC_API_KEY"] = "sk-from-env";
      const key = await getApiKey(homeDir);
      expect(key).toBe("sk-from-env");
      if (origKey !== undefined) {
        process.env["ANTHROPIC_API_KEY"] = origKey;
      } else {
        delete process.env["ANTHROPIC_API_KEY"];
      }
    });

    it("getApiKey falls back to .env file when process.env key absent", async () => {
      const origKey = process.env["ANTHROPIC_API_KEY"];
      delete process.env["ANTHROPIC_API_KEY"];
      await writeApiKey("sk-from-file", homeDir);
      const key = await getApiKey(homeDir);
      expect(key).toBe("sk-from-file");
      if (origKey !== undefined) process.env["ANTHROPIC_API_KEY"] = origKey;
    });
  });

  describe("release strategy fields", () => {
    it("readRepoConfig surfaces releaseStrategy when set in .gitwise.json", async () => {
      await writeFile(
        join(cwd, ".gitwise.json"),
        JSON.stringify({ releaseStrategy: "gitflow" }),
        "utf-8",
      );
      const config = await getMergedConfig({ cwd, homeDir });
      expect(config.releaseStrategy).toBe("gitflow");
      expect(config.developBranch).toBeUndefined();
    });

    it("readRepoConfig surfaces developBranch when set in .gitwise.json", async () => {
      await writeFile(
        join(cwd, ".gitwise.json"),
        JSON.stringify({ developBranch: "trunk" }),
        "utf-8",
      );
      const config = await getMergedConfig({ cwd, homeDir });
      expect(config.developBranch).toBe("trunk");
      expect(config.releaseStrategy).toBeUndefined();
    });

    it("readRepoConfig leaves both fields undefined when neither is set", async () => {
      await writeFile(
        join(cwd, ".gitwise.json"),
        JSON.stringify({ language: "es" }),
        "utf-8",
      );
      const config = await getMergedConfig({ cwd, homeDir });
      expect(config.releaseStrategy).toBeUndefined();
      expect(config.developBranch).toBeUndefined();
      expect(config.language).toBe("es");
    });

    it("getMergedConfig carries both fields when both are set", async () => {
      await writeFile(
        join(cwd, ".gitwise.json"),
        JSON.stringify({ releaseStrategy: "gitflow", developBranch: "trunk" }),
        "utf-8",
      );
      const config = await getMergedConfig({ cwd, homeDir });
      expect(config.releaseStrategy).toBe("gitflow");
      expect(config.developBranch).toBe("trunk");
    });

    it("getMergedConfig preserves repo-level releaseStrategy when user config is unset", async () => {
      await writeUserConfig({ language: "pt-br" }, homeDir);
      await writeFile(
        join(cwd, ".gitwise.json"),
        JSON.stringify({ releaseStrategy: "gitflow" }),
        "utf-8",
      );
      const config = await getMergedConfig({ cwd, homeDir });
      expect(config.releaseStrategy).toBe("gitflow");
      expect(config.language).toBe("pt-br");
    });

    it("getMergedConfig does not invent a default developBranch", async () => {
      await writeUserConfig({ language: "en" }, homeDir);
      await writeFile(
        join(cwd, ".gitwise.json"),
        JSON.stringify({ releaseStrategy: "gitflow" }),
        "utf-8",
      );
      const config = await getMergedConfig({ cwd, homeDir });
      expect(config.developBranch).toBeUndefined();
    });

    it("round-trips both fields through a .gitwise.json file end-to-end", async () => {
      await writeFile(
        join(cwd, ".gitwise.json"),
        JSON.stringify({
          releaseStrategy: "gitflow",
          developBranch: "develop-next",
          language: "de",
        }),
        "utf-8",
      );
      const config = await getMergedConfig({ cwd, homeDir });
      expect(config.releaseStrategy).toBe("gitflow");
      expect(config.developBranch).toBe("develop-next");
      expect(config.language).toBe("de");
    });
  });

  describe("repo-level models override scoping (MDL-06)", () => {
    it("applies a .gitwise.json models override to the active provider's tiers only", async () => {
      await writeUserConfig({ provider: "codex" }, homeDir);
      await writeFile(
        join(cwd, ".gitwise.json"),
        JSON.stringify({ models: { fast: "codex-custom-fast" } }),
        "utf-8",
      );

      const config = await getMergedConfig({ cwd, homeDir });

      expect(config.provider).toBe("codex");
      expect(config.models.codex.fast).toBe("codex-custom-fast");
      // Untouched tiers of the active provider stay at their defaults.
      expect(config.models.codex.balanced).toBe(DEFAULT_USER_CONFIG.models.codex.balanced);
      expect(config.models.codex.powerful).toBe(DEFAULT_USER_CONFIG.models.codex.powerful);
    });

    it("leaves every other provider's model block byte-for-byte unchanged by a repo override", async () => {
      await writeUserConfig({ provider: "codex" }, homeDir);
      await writeFile(
        join(cwd, ".gitwise.json"),
        JSON.stringify({ models: { fast: "codex-custom-fast", balanced: "codex-custom-balanced" } }),
        "utf-8",
      );

      const config = await getMergedConfig({ cwd, homeDir });

      expect(config.models.api).toEqual(DEFAULT_USER_CONFIG.models.api);
      expect(config.models["claude-code"]).toEqual(DEFAULT_USER_CONFIG.models["claude-code"]);
      expect(config.models.copilot).toEqual(DEFAULT_USER_CONFIG.models.copilot);
      expect(config.models.kiro).toEqual(DEFAULT_USER_CONFIG.models.kiro);
    });

    it("with the default provider (api), a models override lands on models.api, not a stray top-level key", async () => {
      await writeFile(
        join(cwd, ".gitwise.json"),
        JSON.stringify({ models: { powerful: "api-custom-powerful" } }),
        "utf-8",
      );

      const config = await getMergedConfig({ cwd, homeDir });

      expect(config.provider).toBe("api");
      expect(config.models.api.powerful).toBe("api-custom-powerful");
      expect(config.models.api.fast).toBe(DEFAULT_USER_CONFIG.models.api.fast);
      // No stray "fast"/"balanced"/"powerful" keys injected at the top level
      // of the ModelsByProvider map (the pre-fix bug this task corrects).
      expect(Object.keys(config.models).sort()).toEqual(
        ["api", "claude-code", "codex", "copilot", "kiro"].sort(),
      );
    });

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
  });

  describe("malformed repo models override", () => {
    it("ignores a non-object models value instead of crashing", async () => {
      await writeFile(join(cwd, ".gitwise.json"), JSON.stringify({ models: "gpt-6-sol" }), "utf-8");

      const config = await getMergedConfig({ cwd, homeDir });

      expect(config.models).toEqual(DEFAULT_USER_CONFIG.models);
    });

    it("ignores a non-object per-provider value instead of spreading it into tier keys", async () => {
      await writeFile(join(cwd, ".gitwise.json"), JSON.stringify({ models: { codex: "gpt-6-sol" } }), "utf-8");

      const config = await getMergedConfig({ cwd, homeDir });

      expect(config.models.codex).toEqual(DEFAULT_USER_CONFIG.models.codex);
    });
  });

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

  describe("integration round-trip", () => {
    it("write user config, write repo config, read merged shape", async () => {
      await writeUserConfig(
        {
          provider: "api",
          language: "en",
          models: { ...DEFAULT_USER_CONFIG.models, api: { fast: "haiku", balanced: "sonnet", powerful: "opus" } },
        },
        homeDir,
      );
      await writeFile(
        join(cwd, ".gitwise.json"),
        JSON.stringify({ language: "de", templatesPath: "/tmp/templates" }),
        "utf-8",
      );
      const config = await getMergedConfig({ cwd, homeDir });
      expect(config.provider).toBe("api");
      expect(config.language).toBe("de");
      expect(config.models.api.fast).toBe("haiku");
      expect(config.templatesPath).toBe("/tmp/templates");
    });
  });

  describe("legacy flat models migration (MDL-05)", () => {
    async function writeLegacyConfig(cfg: Record<string, unknown>): Promise<string> {
      const dir = join(homeDir, ".gitwise");
      await mkdir(dir, { recursive: true });
      const path = join(dir, "config.json");
      await writeFile(path, JSON.stringify(cfg, null, 2), "utf-8");
      return path;
    }

    const posixIt = process.platform === "win32" || process.getuid?.() === 0 ? it.skip : it;

    it("migrates a legacy flat block with no provider key into the default provider's block", async () => {
      await writeLegacyConfig({
        models: { fast: "legacy-fast", balanced: "legacy-balanced", powerful: "legacy-powerful" },
      });

      const loaded = await readUserConfig(homeDir);

      expect(loaded.models[DEFAULT_USER_CONFIG.provider]).toEqual({
        fast: "legacy-fast",
        balanced: "legacy-balanced",
        powerful: "legacy-powerful",
      });
    });

    posixIt("still returns the migrated config when the migration cannot be persisted", async () => {
      const path = await writeLegacyConfig({
        provider: "claude-code",
        models: { fast: "legacy-fast", balanced: "legacy-balanced", powerful: "legacy-powerful" },
      });
      await chmod(path, 0o400);

      const loaded = await readUserConfig(homeDir);

      expect(loaded.models["claude-code"].fast).toBe("legacy-fast");
    });

    it("migrates a pre-feature flat models config into the configured provider's block and persists it", async () => {
      const path = await writeLegacyConfig({
        provider: "claude-code",
        models: { fast: "legacy-fast", balanced: "legacy-balanced", powerful: "legacy-powerful" },
        language: "en",
        commitConvention: "conventional",
      });

      const loaded = await readUserConfig(homeDir);
      expect(loaded.models["claude-code"]).toEqual({
        fast: "legacy-fast",
        balanced: "legacy-balanced",
        powerful: "legacy-powerful",
      });
      // Every other provider key is backfilled from defaults, not left empty.
      expect(loaded.models.api).toEqual(DEFAULT_USER_CONFIG.models.api);
      expect(loaded.models.codex).toEqual(DEFAULT_USER_CONFIG.models.codex);
      expect(loaded.models.copilot).toEqual(DEFAULT_USER_CONFIG.models.copilot);
      expect(loaded.models.kiro).toEqual(DEFAULT_USER_CONFIG.models.kiro);

      // Persisted to disk — a second read must see the already-migrated shape.
      const onDisk = JSON.parse(await readFile(path, "utf-8")) as { models: unknown };
      expect(onDisk.models).toEqual(loaded.models);
    });

    it("backfills every provider key from defaults when the legacy config's provider value is unrecognized", async () => {
      const path = await writeLegacyConfig({
        provider: "bogus-provider",
        models: { fast: "legacy-fast", balanced: "legacy-balanced", powerful: "legacy-powerful" },
        language: "en",
        commitConvention: "conventional",
      });

      const loaded = await readUserConfig(homeDir);
      // The unrecognized provider's flat block is discarded, not guessed at —
      // every key gets its own default, matching spec Edge Cases.
      expect(loaded.models.api).toEqual(DEFAULT_USER_CONFIG.models.api);
      expect(loaded.models["claude-code"]).toEqual(DEFAULT_USER_CONFIG.models["claude-code"]);
      expect(loaded.models.codex).toEqual(DEFAULT_USER_CONFIG.models.codex);
      expect(loaded.models.copilot).toEqual(DEFAULT_USER_CONFIG.models.copilot);
      expect(loaded.models.kiro).toEqual(DEFAULT_USER_CONFIG.models.kiro);
      // Exactly the five ProviderKind keys: no stray models["bogus-provider"]
      // block, neither in the returned config nor in the persisted file.
      const PROVIDER_KEYS = ["api", "claude-code", "codex", "copilot", "kiro"];
      expect(Object.keys(loaded.models).sort()).toEqual(PROVIDER_KEYS);
      const onDisk = JSON.parse(await readFile(path, "utf-8")) as { models: Record<string, unknown> };
      expect(Object.keys(onDisk.models).sort()).toEqual(PROVIDER_KEYS);
    });

    it("does not re-migrate a config already in the per-provider shape (no double migration)", async () => {
      const path = await writeLegacyConfig({
        provider: "codex",
        models: {
          api: DEFAULT_USER_CONFIG.models.api,
          "claude-code": DEFAULT_USER_CONFIG.models["claude-code"],
          codex: { fast: "current-fast", balanced: "current-balanced", powerful: "current-powerful" },
          copilot: DEFAULT_USER_CONFIG.models.copilot,
          kiro: DEFAULT_USER_CONFIG.models.kiro,
        },
        language: "en",
        commitConvention: "conventional",
      });
      const before = await readFile(path, "utf-8");

      const loaded = await readUserConfig(homeDir);
      expect(loaded.models.codex).toEqual({ fast: "current-fast", balanced: "current-balanced", powerful: "current-powerful" });

      // Already-current shape: no migration write should have touched the file.
      const after = await readFile(path, "utf-8");
      expect(after).toBe(before);
    });

    it("a legacy config with no models field at all is not treated as a migration and gets full defaults", async () => {
      await writeLegacyConfig({
        provider: "api",
        language: "en",
        commitConvention: "conventional",
      });

      const loaded = await readUserConfig(homeDir);
      expect(loaded.models).toEqual(DEFAULT_USER_CONFIG.models);
    });
  });
});
