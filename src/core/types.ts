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
  project: ProjectInfo;
}

export interface ProjectInfo {
  name: string;
  language: string;
  framework: string | null;
  testFramework: string | null;
  hasCI: boolean;
}

export type ContextMode = "light" | "normal";

export type Language = "en" | "pt-br" | "es" | "fr" | "de" | "zh" | "ja" | "ko";

export type CommitConvention = "conventional" | "gitmoji" | "angular" | "kernel" | "custom";

export interface DevflowState {
  features: Record<string, FeatureState>;
}

export interface FeatureState {
  slug: string;
  number: number;
  phase: Phase;
  tasks: TaskState[];
  artifacts: Record<string, ArtifactMeta>;
  createdAt: string;
  updatedAt: string;
}

export type Phase =
  | "initialized"
  | "prd_created"
  | "techspec_created"
  | "tasks_created"
  | "in_progress"
  | "testing"
  | "reviewing"
  | "pr_created"
  | "releasing"
  | "done";

export interface PhaseInfo {
  label: string;
  nextStep: string;
}

export const PHASE_CONFIG: Record<Phase, PhaseInfo> = {
  initialized: { label: "Initialized", nextStep: "devflow prd <desc>" },
  prd_created: { label: "PRD Created", nextStep: "devflow techspec <ref>" },
  techspec_created: { label: "Tech Spec Created", nextStep: "devflow tasks <ref>" },
  tasks_created: { label: "Tasks Created", nextStep: "devflow run-tasks <ref>" },
  in_progress: { label: "In Progress", nextStep: "devflow test <ref>" },
  testing: { label: "Testing", nextStep: "devflow review <ref>" },
  reviewing: { label: "Reviewing", nextStep: "devflow pr <ref>" },
  pr_created: { label: "PR Created", nextStep: "devflow release <ref>" },
  releasing: { label: "Releasing", nextStep: "devflow done <ref>" },
  done: { label: "Done", nextStep: "Complete" },
};

export const PHASE_ORDER: Phase[] = Object.keys(PHASE_CONFIG) as Phase[];

export interface ArtifactMeta {
  path: string;
  createdAt: string;
  updatedAt: string;
  hash: string;
}

export interface TaskState {
  number: number;
  title: string;
  completed: boolean;
}

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
  project: {
    name: "",
    language: "unknown",
    framework: null,
    testFramework: null,
    hasCI: false,
  },
};

export const EMPTY_STATE: DevflowState = {
  features: {},
};
