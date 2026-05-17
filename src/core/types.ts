export interface DevflowConfig {
  provider: "claude-code-api-key" | "claude-code-cli";
  claudeCliPath?: string;
  models: {
    fast: string;
    balanced: string;
    powerful: string;
  };
  language: Language;
  commitConvention: CommitConvention;
  branchPattern: string;
  templatesPath: string;
  contextMode: ContextMode;
}

export type ContextMode = "light" | "normal";

export type Language = "en" | "pt-br" | "es" | "fr" | "de" | "zh" | "ja" | "ko";

export type CommitConvention = "conventional" | "gitmoji" | "angular" | "kernel" | "custom";

export const DEFAULT_CONFIG: DevflowConfig = {
  provider: "claude-code-api-key",
  models: {
    fast: "claude-haiku-4-5",
    balanced: "claude-sonnet-4-6",
    powerful: "claude-opus-4-6",
  },
  language: "en",
  commitConvention: "conventional",
  branchPattern: "feature/{{slug}}",
  templatesPath: ".devflow/templates",
  contextMode: "normal",
};
