# Devflow CLI Git Flow Pivot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pivot devflow-cli from an AI-pipeline tool to a git flow-centric workflow CLI supporting GitFlow, GitHub Flow, GitLab Flow, and trunk-based development.

**Architecture:** Strategy Pattern — a `FlowStrategy` interface with 4 implementations (gitflow, github-flow, gitlab-flow, trunk-based). Each command consults the active strategy for branch names, PR targets, merge rules, and release flows. Commands: init, commit, pr, release, merge (new), worktree (new).

**Tech Stack:** TypeScript 5.7 (strict, ESM), Commander.js, @clack/prompts, @anthropic-ai/sdk, Jest, tsup

**Spec:** `docs/superpowers/specs/2026-04-02-gitflow-pivot-design.md`

---

## Group 1: Strategy Foundation

Tasks 1-6 are independent and can be parallelized (except Task 6 which needs 2-5).

### Task 1: Strategy types and interface

**Files:**
- Create: `src/core/strategies/types.ts`

- [ ] **Step 1: Create the strategy types file**

```typescript
// src/core/strategies/types.ts

export type StrategyName = "gitflow" | "github-flow" | "gitlab-flow" | "trunk-based";

export type BranchType = "feature" | "bugfix" | "hotfix" | "release" | "support";

export type MergeMethod = "merge" | "squash" | "rebase";

export interface ReleaseFlow {
  createBranch: boolean;
  from: string;
  mergeTo: string[];
  tag: boolean;
}

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

export interface FlowStrategy {
  name: StrategyName;

  getBranchName(type: BranchType, name: string): string;
  getBaseBranch(type: BranchType): string;
  getAllowedBranchTypes(): BranchType[];

  getPRTarget(sourceBranch: string): string;
  getMergeMethod(): MergeMethod;

  getReleaseFlow(): ReleaseFlow;

  canMergeTo(source: string, target: string): boolean;
  validateBranch(branch: string): ValidationResult;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/strategies/types.ts
git commit -m "feat(strategies): add FlowStrategy interface and types"
```

---

### Task 2: GitFlow strategy implementation

**Files:**
- Create: `src/core/strategies/gitflow.ts`
- Test: `__tests__/unit/core/strategies/gitflow.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/unit/core/strategies/gitflow.test.ts
import { describe, it, expect } from "@jest/globals";
import { GitFlowStrategy } from "../../../src/core/strategies/gitflow.js";

describe("GitFlowStrategy", () => {
  const strategy = new GitFlowStrategy();

  it("should have name 'gitflow'", () => {
    expect(strategy.name).toBe("gitflow");
  });

  describe("getBranchName", () => {
    it("should prefix feature branches", () => {
      expect(strategy.getBranchName("feature", "login")).toBe("feature/login");
    });
    it("should prefix hotfix branches", () => {
      expect(strategy.getBranchName("hotfix", "fix-crash")).toBe("hotfix/fix-crash");
    });
    it("should prefix release branches", () => {
      expect(strategy.getBranchName("release", "1.2.0")).toBe("release/1.2.0");
    });
    it("should prefix bugfix branches", () => {
      expect(strategy.getBranchName("bugfix", "typo")).toBe("bugfix/typo");
    });
    it("should prefix support branches", () => {
      expect(strategy.getBranchName("support", "v1")).toBe("support/v1");
    });
  });

  describe("getBaseBranch", () => {
    it("should base features on develop", () => {
      expect(strategy.getBaseBranch("feature")).toBe("develop");
    });
    it("should base bugfixes on develop", () => {
      expect(strategy.getBaseBranch("bugfix")).toBe("develop");
    });
    it("should base hotfixes on main", () => {
      expect(strategy.getBaseBranch("hotfix")).toBe("main");
    });
    it("should base releases on develop", () => {
      expect(strategy.getBaseBranch("release")).toBe("develop");
    });
    it("should base support on main", () => {
      expect(strategy.getBaseBranch("support")).toBe("main");
    });
  });

  describe("getAllowedBranchTypes", () => {
    it("should allow all branch types", () => {
      expect(strategy.getAllowedBranchTypes()).toEqual(
        ["feature", "bugfix", "hotfix", "release", "support"]
      );
    });
  });

  describe("getPRTarget", () => {
    it("should target develop for feature branches", () => {
      expect(strategy.getPRTarget("feature/login")).toBe("develop");
    });
    it("should target develop for bugfix branches", () => {
      expect(strategy.getPRTarget("bugfix/typo")).toBe("develop");
    });
    it("should target main for hotfix branches", () => {
      expect(strategy.getPRTarget("hotfix/fix-crash")).toBe("main");
    });
    it("should target main for release branches", () => {
      expect(strategy.getPRTarget("release/1.2.0")).toBe("main");
    });
    it("should default to develop for unknown branches", () => {
      expect(strategy.getPRTarget("some-branch")).toBe("develop");
    });
  });

  describe("getMergeMethod", () => {
    it("should use merge (no-ff)", () => {
      expect(strategy.getMergeMethod()).toBe("merge");
    });
  });

  describe("getReleaseFlow", () => {
    it("should create branch and merge to main and develop", () => {
      const flow = strategy.getReleaseFlow();
      expect(flow.createBranch).toBe(true);
      expect(flow.from).toBe("develop");
      expect(flow.mergeTo).toEqual(["main", "develop"]);
      expect(flow.tag).toBe(true);
    });
  });

  describe("canMergeTo", () => {
    it("should allow feature to develop", () => {
      expect(strategy.canMergeTo("feature/login", "develop")).toBe(true);
    });
    it("should block feature to main", () => {
      expect(strategy.canMergeTo("feature/login", "main")).toBe(false);
    });
    it("should allow hotfix to main", () => {
      expect(strategy.canMergeTo("hotfix/fix", "main")).toBe(true);
    });
    it("should allow hotfix to develop", () => {
      expect(strategy.canMergeTo("hotfix/fix", "develop")).toBe(true);
    });
    it("should allow release to main", () => {
      expect(strategy.canMergeTo("release/1.0", "main")).toBe(true);
    });
    it("should allow release to develop", () => {
      expect(strategy.canMergeTo("release/1.0", "develop")).toBe(true);
    });
    it("should allow develop merge into feature (sync)", () => {
      expect(strategy.canMergeTo("develop", "feature/login")).toBe(true);
    });
    it("should allow main merge into hotfix (sync)", () => {
      expect(strategy.canMergeTo("main", "hotfix/fix")).toBe(true);
    });
  });

  describe("validateBranch", () => {
    it("should validate known branch patterns", () => {
      expect(strategy.validateBranch("feature/login").valid).toBe(true);
      expect(strategy.validateBranch("hotfix/fix").valid).toBe(true);
      expect(strategy.validateBranch("release/1.0").valid).toBe(true);
      expect(strategy.validateBranch("develop").valid).toBe(true);
      expect(strategy.validateBranch("main").valid).toBe(true);
    });
    it("should invalidate unknown patterns", () => {
      const result = strategy.validateBranch("random-branch");
      expect(result.valid).toBe(false);
      expect(result.message).toBeDefined();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/unit/core/strategies/gitflow.test.ts --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement GitFlowStrategy**

```typescript
// src/core/strategies/gitflow.ts
import type { FlowStrategy, BranchType, MergeMethod, ReleaseFlow, ValidationResult } from "./types.js";

const BRANCH_PREFIXES: Record<BranchType, string> = {
  feature: "feature/",
  bugfix: "bugfix/",
  hotfix: "hotfix/",
  release: "release/",
  support: "support/",
};

const BASE_BRANCHES: Record<BranchType, string> = {
  feature: "develop",
  bugfix: "develop",
  hotfix: "main",
  release: "develop",
  support: "main",
};

const VALID_PREFIXES = ["feature/", "bugfix/", "hotfix/", "release/", "support/"];
const PROTECTED_BRANCHES = ["main", "develop"];

export class GitFlowStrategy implements FlowStrategy {
  readonly name = "gitflow" as const;

  getBranchName(type: BranchType, name: string): string {
    return `${BRANCH_PREFIXES[type]}${name}`;
  }

  getBaseBranch(type: BranchType): string {
    return BASE_BRANCHES[type];
  }

  getAllowedBranchTypes(): BranchType[] {
    return ["feature", "bugfix", "hotfix", "release", "support"];
  }

  getPRTarget(sourceBranch: string): string {
    if (sourceBranch.startsWith("hotfix/") || sourceBranch.startsWith("release/")) {
      return "main";
    }
    return "develop";
  }

  getMergeMethod(): MergeMethod {
    return "merge";
  }

  getReleaseFlow(): ReleaseFlow {
    return {
      createBranch: true,
      from: "develop",
      mergeTo: ["main", "develop"],
      tag: true,
    };
  }

  canMergeTo(source: string, target: string): boolean {
    // Feature/bugfix can only merge to develop
    if (source.startsWith("feature/") || source.startsWith("bugfix/")) {
      return target === "develop";
    }
    // Hotfix can merge to main or develop
    if (source.startsWith("hotfix/")) {
      return target === "main" || target === "develop";
    }
    // Release can merge to main or develop
    if (source.startsWith("release/")) {
      return target === "main" || target === "develop";
    }
    // develop can be merged into feature/bugfix branches (sync)
    if (source === "develop") {
      return target.startsWith("feature/") || target.startsWith("bugfix/");
    }
    // main can be merged into hotfix/support branches (sync)
    if (source === "main") {
      return target.startsWith("hotfix/") || target.startsWith("support/");
    }
    return false;
  }

  validateBranch(branch: string): ValidationResult {
    if (PROTECTED_BRANCHES.includes(branch)) {
      return { valid: true };
    }
    if (VALID_PREFIXES.some((p) => branch.startsWith(p))) {
      return { valid: true };
    }
    return {
      valid: false,
      message: `Branch '${branch}' does not follow GitFlow conventions. Use: feature/, bugfix/, hotfix/, release/, or support/ prefix.`,
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/unit/core/strategies/gitflow.test.ts --no-coverage`
Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```bash
git add src/core/strategies/gitflow.ts __tests__/unit/core/strategies/gitflow.test.ts
git commit -m "feat(strategies): implement GitFlow strategy"
```

---

### Task 3: GitHub Flow strategy implementation

**Files:**
- Create: `src/core/strategies/github-flow.ts`
- Test: `__tests__/unit/core/strategies/github-flow.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/unit/core/strategies/github-flow.test.ts
import { describe, it, expect } from "@jest/globals";
import { GitHubFlowStrategy } from "../../../src/core/strategies/github-flow.js";

describe("GitHubFlowStrategy", () => {
  const strategy = new GitHubFlowStrategy();

  it("should have name 'github-flow'", () => {
    expect(strategy.name).toBe("github-flow");
  });

  describe("getBranchName", () => {
    it("should use flat names for features", () => {
      expect(strategy.getBranchName("feature", "login")).toBe("login");
    });
    it("should use flat names for bugfixes", () => {
      expect(strategy.getBranchName("bugfix", "typo")).toBe("typo");
    });
  });

  describe("getBaseBranch", () => {
    it("should always base on main", () => {
      expect(strategy.getBaseBranch("feature")).toBe("main");
      expect(strategy.getBaseBranch("bugfix")).toBe("main");
      expect(strategy.getBaseBranch("hotfix")).toBe("main");
    });
  });

  describe("getAllowedBranchTypes", () => {
    it("should allow feature and bugfix only", () => {
      expect(strategy.getAllowedBranchTypes()).toEqual(["feature", "bugfix"]);
    });
  });

  describe("getPRTarget", () => {
    it("should always target main", () => {
      expect(strategy.getPRTarget("login")).toBe("main");
      expect(strategy.getPRTarget("feature/login")).toBe("main");
    });
  });

  describe("getMergeMethod", () => {
    it("should use squash", () => {
      expect(strategy.getMergeMethod()).toBe("squash");
    });
  });

  describe("getReleaseFlow", () => {
    it("should tag on main without branch", () => {
      const flow = strategy.getReleaseFlow();
      expect(flow.createBranch).toBe(false);
      expect(flow.from).toBe("main");
      expect(flow.mergeTo).toEqual([]);
      expect(flow.tag).toBe(true);
    });
  });

  describe("canMergeTo", () => {
    it("should allow any branch to main", () => {
      expect(strategy.canMergeTo("login", "main")).toBe(true);
    });
    it("should allow main to sync into any branch", () => {
      expect(strategy.canMergeTo("main", "login")).toBe(true);
    });
    it("should block non-main-related merges", () => {
      expect(strategy.canMergeTo("login", "other-feature")).toBe(false);
    });
  });

  describe("validateBranch", () => {
    it("should validate main", () => {
      expect(strategy.validateBranch("main").valid).toBe(true);
    });
    it("should validate any branch name (permissive)", () => {
      expect(strategy.validateBranch("my-feature").valid).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/unit/core/strategies/github-flow.test.ts --no-coverage`
Expected: FAIL

- [ ] **Step 3: Implement GitHubFlowStrategy**

```typescript
// src/core/strategies/github-flow.ts
import type { FlowStrategy, BranchType, MergeMethod, ReleaseFlow, ValidationResult } from "./types.js";

export class GitHubFlowStrategy implements FlowStrategy {
  readonly name = "github-flow" as const;

  getBranchName(_type: BranchType, name: string): string {
    return name;
  }

  getBaseBranch(_type: BranchType): string {
    return "main";
  }

  getAllowedBranchTypes(): BranchType[] {
    return ["feature", "bugfix"];
  }

  getPRTarget(_sourceBranch: string): string {
    return "main";
  }

  getMergeMethod(): MergeMethod {
    return "squash";
  }

  getReleaseFlow(): ReleaseFlow {
    return {
      createBranch: false,
      from: "main",
      mergeTo: [],
      tag: true,
    };
  }

  canMergeTo(source: string, target: string): boolean {
    if (target === "main") return true;
    if (source === "main") return true;
    return false;
  }

  validateBranch(_branch: string): ValidationResult {
    return { valid: true };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/unit/core/strategies/github-flow.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/strategies/github-flow.ts __tests__/unit/core/strategies/github-flow.test.ts
git commit -m "feat(strategies): implement GitHub Flow strategy"
```

---

### Task 4: GitLab Flow strategy implementation

**Files:**
- Create: `src/core/strategies/gitlab-flow.ts`
- Test: `__tests__/unit/core/strategies/gitlab-flow.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/unit/core/strategies/gitlab-flow.test.ts
import { describe, it, expect } from "@jest/globals";
import { GitLabFlowStrategy } from "../../../src/core/strategies/gitlab-flow.js";

describe("GitLabFlowStrategy", () => {
  const strategy = new GitLabFlowStrategy();

  it("should have name 'gitlab-flow'", () => {
    expect(strategy.name).toBe("gitlab-flow");
  });

  describe("getBranchName", () => {
    it("should use flat names", () => {
      expect(strategy.getBranchName("feature", "login")).toBe("login");
    });
  });

  describe("getBaseBranch", () => {
    it("should base features on main", () => {
      expect(strategy.getBaseBranch("feature")).toBe("main");
    });
  });

  describe("getAllowedBranchTypes", () => {
    it("should allow feature, bugfix, hotfix", () => {
      expect(strategy.getAllowedBranchTypes()).toEqual(["feature", "bugfix", "hotfix"]);
    });
  });

  describe("getPRTarget", () => {
    it("should target main for feature branches", () => {
      expect(strategy.getPRTarget("login")).toBe("main");
    });
  });

  describe("getMergeMethod", () => {
    it("should use merge", () => {
      expect(strategy.getMergeMethod()).toBe("merge");
    });
  });

  describe("getReleaseFlow", () => {
    it("should promote main to production with tag", () => {
      const flow = strategy.getReleaseFlow();
      expect(flow.createBranch).toBe(false);
      expect(flow.from).toBe("main");
      expect(flow.mergeTo).toEqual(["production"]);
      expect(flow.tag).toBe(true);
    });
  });

  describe("canMergeTo", () => {
    it("should allow any branch to main", () => {
      expect(strategy.canMergeTo("login", "main")).toBe(true);
    });
    it("should allow main to staging", () => {
      expect(strategy.canMergeTo("main", "staging")).toBe(true);
    });
    it("should allow staging to production", () => {
      expect(strategy.canMergeTo("staging", "production")).toBe(true);
    });
    it("should allow main to production", () => {
      expect(strategy.canMergeTo("main", "production")).toBe(true);
    });
    it("should allow main to sync into feature branches", () => {
      expect(strategy.canMergeTo("main", "login")).toBe(true);
    });
    it("should block feature to feature", () => {
      expect(strategy.canMergeTo("login", "other")).toBe(false);
    });
  });

  describe("validateBranch", () => {
    it("should validate main", () => {
      expect(strategy.validateBranch("main").valid).toBe(true);
    });
    it("should validate environment branches", () => {
      expect(strategy.validateBranch("staging").valid).toBe(true);
      expect(strategy.validateBranch("production").valid).toBe(true);
    });
    it("should validate any feature branch name", () => {
      expect(strategy.validateBranch("my-feature").valid).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/unit/core/strategies/gitlab-flow.test.ts --no-coverage`
Expected: FAIL

- [ ] **Step 3: Implement GitLabFlowStrategy**

```typescript
// src/core/strategies/gitlab-flow.ts
import type { FlowStrategy, BranchType, MergeMethod, ReleaseFlow, ValidationResult } from "./types.js";

const ENVIRONMENT_BRANCHES = ["staging", "production", "pre-production"];

export class GitLabFlowStrategy implements FlowStrategy {
  readonly name = "gitlab-flow" as const;

  getBranchName(_type: BranchType, name: string): string {
    return name;
  }

  getBaseBranch(_type: BranchType): string {
    return "main";
  }

  getAllowedBranchTypes(): BranchType[] {
    return ["feature", "bugfix", "hotfix"];
  }

  getPRTarget(_sourceBranch: string): string {
    return "main";
  }

  getMergeMethod(): MergeMethod {
    return "merge";
  }

  getReleaseFlow(): ReleaseFlow {
    return {
      createBranch: false,
      from: "main",
      mergeTo: ["production"],
      tag: true,
    };
  }

  canMergeTo(source: string, target: string): boolean {
    if (target === "main") return true;
    if (source === "main") return true;
    if (source === "staging" && target === "production") return true;
    if (ENVIRONMENT_BRANCHES.includes(target) && (source === "main" || ENVIRONMENT_BRANCHES.includes(source))) {
      return true;
    }
    return false;
  }

  validateBranch(_branch: string): ValidationResult {
    return { valid: true };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/unit/core/strategies/gitlab-flow.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/strategies/gitlab-flow.ts __tests__/unit/core/strategies/gitlab-flow.test.ts
git commit -m "feat(strategies): implement GitLab Flow strategy"
```

---

### Task 5: Trunk-based strategy implementation

**Files:**
- Create: `src/core/strategies/trunk-based.ts`
- Test: `__tests__/unit/core/strategies/trunk-based.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/unit/core/strategies/trunk-based.test.ts
import { describe, it, expect } from "@jest/globals";
import { TrunkBasedStrategy } from "../../../src/core/strategies/trunk-based.js";

describe("TrunkBasedStrategy", () => {
  const strategy = new TrunkBasedStrategy();

  it("should have name 'trunk-based'", () => {
    expect(strategy.name).toBe("trunk-based");
  });

  describe("getBranchName", () => {
    it("should use flat short-lived names", () => {
      expect(strategy.getBranchName("feature", "login")).toBe("login");
    });
  });

  describe("getBaseBranch", () => {
    it("should always base on main", () => {
      expect(strategy.getBaseBranch("feature")).toBe("main");
    });
  });

  describe("getAllowedBranchTypes", () => {
    it("should allow feature and bugfix only", () => {
      expect(strategy.getAllowedBranchTypes()).toEqual(["feature", "bugfix"]);
    });
  });

  describe("getPRTarget", () => {
    it("should always target main", () => {
      expect(strategy.getPRTarget("login")).toBe("main");
    });
  });

  describe("getMergeMethod", () => {
    it("should use squash", () => {
      expect(strategy.getMergeMethod()).toBe("squash");
    });
  });

  describe("getReleaseFlow", () => {
    it("should tag on main without branch", () => {
      const flow = strategy.getReleaseFlow();
      expect(flow.createBranch).toBe(false);
      expect(flow.from).toBe("main");
      expect(flow.mergeTo).toEqual([]);
      expect(flow.tag).toBe(true);
    });
  });

  describe("canMergeTo", () => {
    it("should allow any branch to main", () => {
      expect(strategy.canMergeTo("login", "main")).toBe(true);
    });
    it("should allow main into any branch", () => {
      expect(strategy.canMergeTo("main", "login")).toBe(true);
    });
    it("should block branch-to-branch merges", () => {
      expect(strategy.canMergeTo("login", "other")).toBe(false);
    });
  });

  describe("validateBranch", () => {
    it("should validate main", () => {
      expect(strategy.validateBranch("main").valid).toBe(true);
    });
    it("should validate any short branch name", () => {
      expect(strategy.validateBranch("login").valid).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/unit/core/strategies/trunk-based.test.ts --no-coverage`
Expected: FAIL

- [ ] **Step 3: Implement TrunkBasedStrategy**

```typescript
// src/core/strategies/trunk-based.ts
import type { FlowStrategy, BranchType, MergeMethod, ReleaseFlow, ValidationResult } from "./types.js";

export class TrunkBasedStrategy implements FlowStrategy {
  readonly name = "trunk-based" as const;

  getBranchName(_type: BranchType, name: string): string {
    return name;
  }

  getBaseBranch(_type: BranchType): string {
    return "main";
  }

  getAllowedBranchTypes(): BranchType[] {
    return ["feature", "bugfix"];
  }

  getPRTarget(_sourceBranch: string): string {
    return "main";
  }

  getMergeMethod(): MergeMethod {
    return "squash";
  }

  getReleaseFlow(): ReleaseFlow {
    return {
      createBranch: false,
      from: "main",
      mergeTo: [],
      tag: true,
    };
  }

  canMergeTo(source: string, target: string): boolean {
    if (target === "main") return true;
    if (source === "main") return true;
    return false;
  }

  validateBranch(_branch: string): ValidationResult {
    return { valid: true };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/unit/core/strategies/trunk-based.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/strategies/trunk-based.ts __tests__/unit/core/strategies/trunk-based.test.ts
git commit -m "feat(strategies): implement trunk-based strategy"
```

---

### Task 6: Strategy factory

**Files:**
- Create: `src/core/strategies/factory.ts`
- Create: `src/core/strategies/index.ts`
- Test: `__tests__/unit/core/strategies/factory.test.ts`

Depends on: Tasks 2-5

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/unit/core/strategies/factory.test.ts
import { describe, it, expect } from "@jest/globals";
import { createStrategy } from "../../../src/core/strategies/factory.js";
import { GitFlowStrategy } from "../../../src/core/strategies/gitflow.js";
import { GitHubFlowStrategy } from "../../../src/core/strategies/github-flow.js";
import { GitLabFlowStrategy } from "../../../src/core/strategies/gitlab-flow.js";
import { TrunkBasedStrategy } from "../../../src/core/strategies/trunk-based.js";

describe("createStrategy", () => {
  it("should create GitFlow strategy", () => {
    const strategy = createStrategy("gitflow");
    expect(strategy).toBeInstanceOf(GitFlowStrategy);
  });

  it("should create GitHub Flow strategy", () => {
    const strategy = createStrategy("github-flow");
    expect(strategy).toBeInstanceOf(GitHubFlowStrategy);
  });

  it("should create GitLab Flow strategy", () => {
    const strategy = createStrategy("gitlab-flow");
    expect(strategy).toBeInstanceOf(GitLabFlowStrategy);
  });

  it("should create trunk-based strategy", () => {
    const strategy = createStrategy("trunk-based");
    expect(strategy).toBeInstanceOf(TrunkBasedStrategy);
  });

  it("should throw for unknown strategy", () => {
    expect(() => createStrategy("unknown" as any)).toThrow("Unknown strategy: unknown");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/unit/core/strategies/factory.test.ts --no-coverage`
Expected: FAIL

- [ ] **Step 3: Implement factory and barrel export**

```typescript
// src/core/strategies/factory.ts
import type { FlowStrategy, StrategyName } from "./types.js";
import { GitFlowStrategy } from "./gitflow.js";
import { GitHubFlowStrategy } from "./github-flow.js";
import { GitLabFlowStrategy } from "./gitlab-flow.js";
import { TrunkBasedStrategy } from "./trunk-based.js";

export function createStrategy(name: StrategyName): FlowStrategy {
  switch (name) {
    case "gitflow":
      return new GitFlowStrategy();
    case "github-flow":
      return new GitHubFlowStrategy();
    case "gitlab-flow":
      return new GitLabFlowStrategy();
    case "trunk-based":
      return new TrunkBasedStrategy();
    default:
      throw new Error(`Unknown strategy: ${name}`);
  }
}
```

```typescript
// src/core/strategies/index.ts
export { createStrategy } from "./factory.js";
export type { FlowStrategy, StrategyName, BranchType, MergeMethod, ReleaseFlow, ValidationResult } from "./types.js";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/unit/core/strategies/ --no-coverage`
Expected: PASS — all strategy tests green

- [ ] **Step 5: Commit**

```bash
git add src/core/strategies/factory.ts src/core/strategies/index.ts __tests__/unit/core/strategies/factory.test.ts
git commit -m "feat(strategies): add strategy factory and barrel export"
```

---

## Group 2: Types and Config Schema

Sequential. Depends on Group 1.

### Task 7: Redesign types.ts with new config schema

**Files:**
- Modify: `src/core/types.ts`
- Modify: `__tests__/unit/core/config.test.ts`

- [ ] **Step 1: Replace types.ts content**

Replace the entire `src/core/types.ts` with the new schema. Remove all pipeline-specific types (`DevflowState`, `FeatureState`, `Phase`, `PHASE_CONFIG`, `PHASE_ORDER`, `ArtifactMeta`, `TaskState`, `EMPTY_STATE`). Keep and extend `DevflowConfig`, `ProjectInfo`, `ContextMode`, `Language`, `CommitConvention`.

New `src/core/types.ts`:

```typescript
import type { StrategyName } from "./strategies/types.js";

export interface DevflowConfig {
  strategy: StrategyName;
  branches: BranchConfig;
  taskManager: TaskManagerConfig;
  provider: "claude-code-api-key" | "claude-code-cli";
  claudeCliPath?: string;
  models: {
    fast: string;
    balanced: string;
    powerful: string;
  };
  language: Language;
  commitConvention: CommitConvention;
  platform: Platform;
  templatesPath: string;
  contextMode: ContextMode;
  project: ProjectInfo;
}

export interface BranchConfig {
  main: string;
  develop?: string;
  pattern: string;
}

export interface TaskManagerConfig {
  enabled: boolean;
  type: TaskManagerType;
  pattern: string;
}

export type TaskManagerType = "none" | "jira" | "linear" | "github-issues" | "custom";

export type Platform = "github" | "gitlab" | "bitbucket" | "git-only";

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

export const DEFAULT_CONFIG: DevflowConfig = {
  strategy: "github-flow",
  branches: {
    main: "main",
    pattern: "{{name}}",
  },
  taskManager: {
    enabled: false,
    type: "none",
    pattern: "",
  },
  provider: "claude-code-api-key",
  models: {
    fast: "claude-haiku-4-5",
    balanced: "claude-sonnet-4-6",
    powerful: "claude-opus-4-6",
  },
  language: "en",
  commitConvention: "conventional",
  platform: "github",
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
```

- [ ] **Step 2: Run tests to see what breaks**

Run: `npx jest __tests__/unit/core/config.test.ts --no-coverage`
Expected: Some tests may fail due to changed DEFAULT_CONFIG shape

- [ ] **Step 3: Update config.test.ts for new schema**

Update the existing config tests to use the new `DEFAULT_CONFIG` shape and add tests for new fields:

```typescript
// Add to __tests__/unit/core/config.test.ts

it("should deep merge branches config", () => {
  const result = mergeWithDefaults({ branches: { main: "master", pattern: "feat/{{name}}" } });
  expect(result.branches.main).toBe("master");
  expect(result.branches.pattern).toBe("feat/{{name}}");
});

it("should deep merge taskManager config", () => {
  const result = mergeWithDefaults({
    taskManager: { enabled: true, type: "jira", pattern: "PROJ-\\d+" },
  });
  expect(result.taskManager.enabled).toBe(true);
  expect(result.taskManager.type).toBe("jira");
});

it("should default strategy to github-flow", () => {
  const result = mergeWithDefaults({});
  expect(result.strategy).toBe("github-flow");
});

it("should validate strategy field", () => {
  const config = { ...DEFAULT_CONFIG, strategy: "invalid" as any };
  const errors = validateConfig(config);
  expect(errors.some((e) => e.includes("strategy"))).toBe(true);
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/unit/core/config.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts __tests__/unit/core/config.test.ts
git commit -m "feat(types): redesign config schema for git flow strategies"
```

---

### Task 8: Update config.ts for new schema

**Files:**
- Modify: `src/core/config.ts`

Depends on: Task 7

- [ ] **Step 1: Update mergeWithDefaults and validateConfig**

```typescript
// src/core/config.ts — full replacement
import { join } from "node:path";
import { fileExists, readJSON, writeJSON } from "../infra/filesystem.js";
import { debug } from "../infra/logger.js";
import { DEFAULT_CONFIG, type DevflowConfig } from "./types.js";

const CONFIG_DIR = ".devflow";
const CONFIG_FILE = "config.json";

const VALID_STRATEGIES = ["gitflow", "github-flow", "gitlab-flow", "trunk-based"];
const VALID_PLATFORMS = ["github", "gitlab", "bitbucket", "git-only"];

function getConfigPath(projectRoot: string): string {
  return join(projectRoot, CONFIG_DIR, CONFIG_FILE);
}

export function mergeWithDefaults(
  partial: Partial<DevflowConfig>,
): DevflowConfig {
  return {
    ...DEFAULT_CONFIG,
    ...partial,
    branches: {
      ...DEFAULT_CONFIG.branches,
      ...partial.branches,
    },
    taskManager: {
      ...DEFAULT_CONFIG.taskManager,
      ...partial.taskManager,
    },
    models: {
      ...DEFAULT_CONFIG.models,
      ...partial.models,
    },
    project: {
      ...DEFAULT_CONFIG.project,
      ...partial.project,
    },
  };
}

export function validateConfig(config: DevflowConfig): string[] {
  const errors: string[] = [];
  if (!config.provider) {
    errors.push("provider is required");
  }
  if (!config.models?.fast || !config.models?.balanced || !config.models?.powerful) {
    errors.push("all model tiers (fast, balanced, powerful) are required");
  }
  if (!["light", "normal"].includes(config.contextMode)) {
    errors.push("contextMode must be 'light' or 'normal'");
  }
  if (!VALID_STRATEGIES.includes(config.strategy)) {
    errors.push(`strategy must be one of: ${VALID_STRATEGIES.join(", ")}`);
  }
  if (!VALID_PLATFORMS.includes(config.platform)) {
    errors.push(`platform must be one of: ${VALID_PLATFORMS.join(", ")}`);
  }
  return errors;
}

export async function readConfig(
  projectRoot: string,
): Promise<DevflowConfig | null> {
  const configPath = getConfigPath(projectRoot);
  if (!(await fileExists(configPath))) {
    debug("Config file not found", { path: configPath });
    return null;
  }
  const raw = await readJSON<Partial<DevflowConfig>>(configPath);
  return mergeWithDefaults(raw);
}

export async function writeConfig(
  projectRoot: string,
  config: DevflowConfig,
): Promise<void> {
  const configPath = getConfigPath(projectRoot);
  debug("Writing config", { path: configPath });
  await writeJSON(configPath, config);
}
```

- [ ] **Step 2: Run tests**

Run: `npx jest __tests__/unit/core/config.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/core/config.ts
git commit -m "feat(config): update config for new schema with strategy and platform"
```

---

## Group 3: Infrastructure

All parallel. Depends on Group 1.

### Task 9: Platform detection

**Files:**
- Create: `src/infra/platform.ts`
- Modify: `src/infra/git.ts` (add `getRemoteUrl`)
- Test: `__tests__/unit/infra/platform.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/unit/infra/platform.test.ts
import { describe, it, expect } from "@jest/globals";
import { detectPlatform } from "../../../src/infra/platform.js";

describe("detectPlatform", () => {
  it("should detect GitHub from HTTPS URL", () => {
    expect(detectPlatform("https://github.com/user/repo.git")).toBe("github");
  });

  it("should detect GitHub from SSH URL", () => {
    expect(detectPlatform("git@github.com:user/repo.git")).toBe("github");
  });

  it("should detect GitLab from HTTPS URL", () => {
    expect(detectPlatform("https://gitlab.com/user/repo.git")).toBe("gitlab");
  });

  it("should detect GitLab from SSH URL", () => {
    expect(detectPlatform("git@gitlab.com:user/repo.git")).toBe("gitlab");
  });

  it("should detect self-hosted GitLab", () => {
    expect(detectPlatform("https://gitlab.company.com/team/repo.git")).toBe("gitlab");
  });

  it("should detect Bitbucket from HTTPS URL", () => {
    expect(detectPlatform("https://bitbucket.org/user/repo.git")).toBe("bitbucket");
  });

  it("should detect Bitbucket from SSH URL", () => {
    expect(detectPlatform("git@bitbucket.org:user/repo.git")).toBe("bitbucket");
  });

  it("should return git-only for unknown hosts", () => {
    expect(detectPlatform("https://example.com/repo.git")).toBe("git-only");
  });

  it("should return git-only for empty URL", () => {
    expect(detectPlatform("")).toBe("git-only");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/unit/infra/platform.test.ts --no-coverage`
Expected: FAIL

- [ ] **Step 3: Add getRemoteUrl to git.ts**

Add to `src/infra/git.ts`:

```typescript
export async function getRemoteUrl(cwd: string, remote = "origin"): Promise<string | null> {
  try {
    return await run(["remote", "get-url", remote], cwd);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Implement platform detection**

```typescript
// src/infra/platform.ts
import type { Platform } from "../core/types.js";

export function detectPlatform(remoteUrl: string): Platform {
  if (!remoteUrl) return "git-only";
  const lower = remoteUrl.toLowerCase();
  if (lower.includes("github.com")) return "github";
  if (lower.includes("gitlab")) return "gitlab";
  if (lower.includes("bitbucket.org")) return "bitbucket";
  return "git-only";
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest __tests__/unit/infra/platform.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/infra/platform.ts src/infra/git.ts __tests__/unit/infra/platform.test.ts
git commit -m "feat(infra): add platform detection and getRemoteUrl"
```

---

### Task 10: Expand git.ts with worktree operations

**Files:**
- Modify: `src/infra/git.ts`
- Modify: `__tests__/unit/infra/git.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `__tests__/unit/infra/git.test.ts`:

```typescript
// Add these test blocks inside the main describe("GitClient")

it("should check if branch exists", async () => {
  const exists = await git.branchExists(tempDir, await git.getBranch(tempDir));
  expect(exists).toBe(true);
  const notExists = await git.branchExists(tempDir, "nonexistent-branch");
  expect(notExists).toBe(false);
});

it("should create and list worktrees", async () => {
  const wtPath = join(tempDir, "..", "wt-test");
  await git.worktreeAdd(tempDir, wtPath, "feature/wt-test", await git.getBranch(tempDir));
  const worktrees = await git.worktreeList(tempDir);
  expect(worktrees.length).toBeGreaterThanOrEqual(2); // main + new
  expect(worktrees.some((wt) => wt.branch.includes("feature/wt-test"))).toBe(true);
  // Cleanup
  await git.worktreeRemove(tempDir, wtPath);
});

it("should remove worktree", async () => {
  const wtPath = join(tempDir, "..", "wt-remove-test");
  await git.worktreeAdd(tempDir, wtPath, "feature/remove-test", await git.getBranch(tempDir));
  await git.worktreeRemove(tempDir, wtPath);
  const worktrees = await git.worktreeList(tempDir);
  expect(worktrees.some((wt) => wt.branch.includes("feature/remove-test"))).toBe(false);
});

it("should check if branch is merged", async () => {
  const baseBranch = await git.getBranch(tempDir);
  await git.createBranch(tempDir, "feature/merged-test");
  await writeFile(join(tempDir, "merged.txt"), "content");
  await git.add(tempDir, ["merged.txt"]);
  await git.commit(tempDir, "add merged file");
  await git.checkout(tempDir, baseBranch);
  // Before merge: not merged
  const beforeMerge = await git.isBranchMerged(tempDir, "feature/merged-test", baseBranch);
  expect(beforeMerge).toBe(false);
  // Merge it
  await exec("git", ["merge", "feature/merged-test", "--no-ff", "-m", "merge"], { cwd: tempDir });
  const afterMerge = await git.isBranchMerged(tempDir, "feature/merged-test", baseBranch);
  expect(afterMerge).toBe(true);
});

it("should delete a branch", async () => {
  await exec("git", ["branch", "to-delete"], { cwd: tempDir });
  expect(await git.branchExists(tempDir, "to-delete")).toBe(true);
  await git.deleteBranch(tempDir, "to-delete");
  expect(await git.branchExists(tempDir, "to-delete")).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/unit/infra/git.test.ts --no-coverage`
Expected: FAIL — new functions not defined

- [ ] **Step 3: Implement worktree and branch operations in git.ts**

Add to `src/infra/git.ts`:

```typescript
export interface WorktreeInfo {
  path: string;
  branch: string;
  commit: string;
}

export async function worktreeAdd(
  cwd: string,
  path: string,
  branch: string,
  base: string,
): Promise<void> {
  await run(["worktree", "add", path, "-b", branch, base], cwd);
}

export async function worktreeList(cwd: string): Promise<WorktreeInfo[]> {
  const output = await run(["worktree", "list", "--porcelain"], cwd);
  const worktrees: WorktreeInfo[] = [];
  let current: Partial<WorktreeInfo> = {};
  for (const line of output.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current.path) worktrees.push(current as WorktreeInfo);
      current = { path: line.slice(9) };
    } else if (line.startsWith("HEAD ")) {
      current.commit = line.slice(5);
    } else if (line.startsWith("branch ")) {
      current.branch = line.slice(7);
    }
  }
  if (current.path) worktrees.push(current as WorktreeInfo);
  return worktrees;
}

export async function worktreeRemove(
  cwd: string,
  path: string,
  force = false,
): Promise<void> {
  const args = ["worktree", "remove", path];
  if (force) args.push("--force");
  await run(args, cwd);
}

export async function branchExists(cwd: string, branch: string): Promise<boolean> {
  try {
    await run(["rev-parse", "--verify", `refs/heads/${branch}`], cwd);
    return true;
  } catch {
    return false;
  }
}

export async function deleteBranch(
  cwd: string,
  branch: string,
  force = false,
): Promise<void> {
  const flag = force ? "-D" : "-d";
  await run(["branch", flag, branch], cwd);
}

export async function isBranchMerged(
  cwd: string,
  branch: string,
  into = "HEAD",
): Promise<boolean> {
  try {
    const output = await run(["branch", "--merged", into], cwd);
    return output.split("\n").some((line) => line.trim() === branch);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/unit/infra/git.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/infra/git.ts __tests__/unit/infra/git.test.ts
git commit -m "feat(git): add worktree, branch lifecycle, and merge operations"
```

---

### Task 11: Expand git.ts with merge and conflict operations

**Files:**
- Modify: `src/infra/git.ts`
- Modify: `__tests__/unit/infra/git.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `__tests__/unit/infra/git.test.ts`:

```typescript
it("should merge a branch without conflicts", async () => {
  const baseBranch = await git.getBranch(tempDir);
  await git.createBranch(tempDir, "feature/merge-test");
  await writeFile(join(tempDir, "merge-test.txt"), "feature content");
  await git.add(tempDir, ["merge-test.txt"]);
  await git.commit(tempDir, "add merge test file");
  await git.checkout(tempDir, baseBranch);
  await git.merge(tempDir, "feature/merge-test");
  const log = await git.getLog(tempDir, undefined, 3);
  expect(log).toContain("add merge test file");
});

it("should detect merge conflicts", async () => {
  const baseBranch = await git.getBranch(tempDir);
  // Create conflicting changes
  await writeFile(join(tempDir, "conflict.txt"), "base content");
  await git.add(tempDir, ["conflict.txt"]);
  await git.commit(tempDir, "add conflict file");
  // Branch A changes
  await git.createBranch(tempDir, "feature/conflict-a");
  await writeFile(join(tempDir, "conflict.txt"), "branch A content");
  await git.add(tempDir, ["conflict.txt"]);
  await git.commit(tempDir, "change in branch A");
  // Branch B changes from base
  await git.checkout(tempDir, baseBranch);
  await writeFile(join(tempDir, "conflict.txt"), "branch B content");
  await git.add(tempDir, ["conflict.txt"]);
  await git.commit(tempDir, "change in base");
  // Try to merge — should have conflicts
  const result = await git.merge(tempDir, "feature/conflict-a");
  expect(result.hasConflicts).toBe(true);
  // Check conflicted files
  const conflicted = await git.getConflictedFiles(tempDir);
  expect(conflicted).toContain("conflict.txt");
  // Abort merge
  await git.abortMerge(tempDir);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/unit/infra/git.test.ts --no-coverage`
Expected: FAIL

- [ ] **Step 3: Implement merge and conflict operations**

Add to `src/infra/git.ts`:

```typescript
export interface MergeResult {
  hasConflicts: boolean;
  output: string;
}

export async function merge(cwd: string, branch: string, noFf = true): Promise<MergeResult> {
  try {
    const args = ["merge", branch];
    if (noFf) args.push("--no-ff");
    const output = await run(args, cwd);
    return { hasConflicts: false, output };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("CONFLICT") || message.includes("Automatic merge failed")) {
      return { hasConflicts: true, output: message };
    }
    throw err;
  }
}

export async function getConflictedFiles(cwd: string): Promise<string[]> {
  const output = await run(["diff", "--name-only", "--diff-filter=U"], cwd);
  if (!output) return [];
  return output.split("\n").filter((f) => f.length > 0);
}

export async function abortMerge(cwd: string): Promise<void> {
  await run(["merge", "--abort"], cwd);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/unit/infra/git.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/infra/git.ts __tests__/unit/infra/git.test.ts
git commit -m "feat(git): add merge with conflict detection and abort"
```

---

### Task 12: GitLab CLI integration

**Files:**
- Create: `src/infra/gitlab.ts`
- Test: `__tests__/unit/infra/gitlab.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/unit/infra/gitlab.test.ts
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// Mock child_process before importing the module
jest.unstable_mockModule("node:child_process", () => ({
  execFile: jest.fn(),
}));

const { execFile } = await import("node:child_process");
const { isGlabAvailable, createMR, createGitLabRelease } = await import("../../../src/infra/gitlab.js");

const mockExecFile = execFile as unknown as jest.Mock;

describe("GitLab CLI Integration", () => {
  beforeEach(() => {
    mockExecFile.mockReset();
  });

  describe("isGlabAvailable", () => {
    it("should return true when glab is installed", async () => {
      mockExecFile.mockImplementation((_cmd: string, _args: string[], cb: Function) => {
        cb(null, { stdout: "glab version 1.0" });
      });
      const result = await isGlabAvailable();
      expect(result).toBe(true);
    });

    it("should return false when glab is not installed", async () => {
      mockExecFile.mockImplementation((_cmd: string, _args: string[], cb: Function) => {
        cb(new Error("not found"));
      });
      const result = await isGlabAvailable();
      expect(result).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/unit/infra/gitlab.test.ts --no-coverage`
Expected: FAIL

- [ ] **Step 3: Implement GitLab CLI integration**

```typescript
// src/infra/gitlab.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { debug } from "./logger.js";

const exec = promisify(execFile);

export interface CreateMRParams {
  title: string;
  body: string;
  base?: string;
  cwd: string;
  draft?: boolean;
}

export interface MRResult {
  url: string;
}

export async function isGlabAvailable(): Promise<boolean> {
  try {
    await exec("glab", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

export async function createMR(params: CreateMRParams): Promise<MRResult> {
  debug("Creating MR via glab", { title: params.title });
  const args = ["mr", "create", "--title", params.title, "--description", params.body];
  if (params.base) {
    args.push("--target-branch", params.base);
  }
  if (params.draft) {
    args.push("--draft");
  }
  const result = await exec("glab", args, { cwd: params.cwd });
  const url = result.stdout?.trim();
  if (!url) {
    throw new Error("glab mr create returned empty output — check glab auth status");
  }
  return { url };
}

export interface CreateGitLabReleaseParams {
  tag: string;
  title: string;
  body: string;
  cwd: string;
}

export async function createGitLabRelease(
  params: CreateGitLabReleaseParams,
): Promise<MRResult> {
  debug("Creating GitLab release via glab", { tag: params.tag });
  const args = [
    "release",
    "create",
    params.tag,
    "--title",
    params.title,
    "--notes",
    params.body,
  ];
  const result = await exec("glab", args, { cwd: params.cwd });
  const url = result.stdout?.trim();
  if (!url) {
    throw new Error("glab release create returned empty output — check glab auth status");
  }
  return { url };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/unit/infra/gitlab.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/infra/gitlab.ts __tests__/unit/infra/gitlab.test.ts
git commit -m "feat(infra): add GitLab CLI (glab) integration"
```

---

### Task 13: Update model-router.ts

**Files:**
- Modify: `src/providers/model-router.ts`
- Modify: `__tests__/unit/providers/model-router.test.ts`

- [ ] **Step 1: Update the model-router**

Replace `src/providers/model-router.ts`:

```typescript
import type { ModelTier } from "./types.js";

const COMMAND_TIER_MAP: Record<string, ModelTier> = {
  init: "fast",
  commit: "fast",
  pr: "balanced",
  release: "balanced",
  merge: "powerful",
  worktree: "fast",
};

export function resolveModelTier(command: string): ModelTier {
  return COMMAND_TIER_MAP[command] ?? "balanced";
}
```

- [ ] **Step 2: Update tests**

Update `__tests__/unit/providers/model-router.test.ts` to test the new command map:

```typescript
import { describe, it, expect } from "@jest/globals";
import { resolveModelTier } from "../../../src/providers/model-router.js";

describe("resolveModelTier", () => {
  it("should return fast for init", () => {
    expect(resolveModelTier("init")).toBe("fast");
  });
  it("should return fast for commit", () => {
    expect(resolveModelTier("commit")).toBe("fast");
  });
  it("should return balanced for pr", () => {
    expect(resolveModelTier("pr")).toBe("balanced");
  });
  it("should return balanced for release", () => {
    expect(resolveModelTier("release")).toBe("balanced");
  });
  it("should return powerful for merge", () => {
    expect(resolveModelTier("merge")).toBe("powerful");
  });
  it("should return fast for worktree", () => {
    expect(resolveModelTier("worktree")).toBe("fast");
  });
  it("should default to balanced for unknown commands", () => {
    expect(resolveModelTier("unknown")).toBe("balanced");
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx jest __tests__/unit/providers/model-router.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/providers/model-router.ts __tests__/unit/providers/model-router.test.ts
git commit -m "feat(router): update model routing for new command set"
```

---

## Group 4: Commands

All parallel. Depends on Groups 2 and 3.

### Task 14: Redesign init command

**Files:**
- Modify: `src/cli/commands/init.ts`

- [ ] **Step 1: Rewrite init command**

Replace `src/cli/commands/init.ts` with the new flow: strategy selection, branch pattern, task manager, platform detection. Remove dependencies on `state.ts` and `pipeline.ts`.

```typescript
// src/cli/commands/init.ts
import { Command } from "commander";
import * as p from "@clack/prompts";
import { execFile, execSync } from "node:child_process";
import { promisify } from "node:util";
import { readConfig, writeConfig } from "../../core/config.js";
import { scanProject } from "../../core/scanner.js";
import { fileExists } from "../../infra/filesystem.js";
import { DEFAULT_CONFIG, type ContextMode, type Language, type CommitConvention, type DevflowConfig, type TaskManagerType } from "../../core/types.js";
import type { StrategyName } from "../../core/strategies/types.js";
import { writeEnvVar } from "../../infra/env.js";
import { resolveClaudeBinary } from "../../providers/claude-code.js";
import * as git from "../../infra/git.js";
import { detectPlatform } from "../../infra/platform.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const exec = promisify(execFile);

async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    await exec("git", ["rev-parse", "--is-inside-work-tree"], { cwd });
    return true;
  } catch {
    return false;
  }
}

async function isInGitignore(projectRoot: string, entry: string): Promise<boolean> {
  const gitignorePath = join(projectRoot, ".gitignore");
  if (!(await fileExists(gitignorePath))) return false;
  const content = await readFile(gitignorePath, "utf-8");
  return content.split("\n").some((line) => line.trim() === entry);
}

export function makeInitCommand(): Command {
  return new Command("init")
    .description("Initialize devflow in current project")
    .option("--force", "Overwrite existing config")
    .action(async (options: { force?: boolean }) => {
      const cwd = process.cwd();
      p.intro("devflow init");

      if (!(await isGitRepo(cwd))) {
        p.cancel("Not a git repository. Run `git init` first.");
        process.exit(1);
      }

      const existingConfig = await readConfig(cwd);
      if (existingConfig && !options.force) {
        p.cancel("Config already exists. Use --force to overwrite.");
        process.exit(1);
      }

      // 1. Auto-detect project
      const scan = await scanProject(cwd);
      p.log.info(
        `Detected: ${scan.language}${scan.framework ? ` (${scan.framework})` : ""}, ${scan.testFramework ?? "no tests"}, ${scan.hasCI ? "CI found" : "no CI"}`,
      );

      // 2. Select git flow strategy
      const strategy = await p.select({
        message: "Git flow strategy",
        options: [
          { value: "github-flow" as const, label: "GitHub Flow", hint: "simple: main + feature branches, PRs to main" },
          { value: "gitflow" as const, label: "GitFlow", hint: "main/develop/feature/release/hotfix branches" },
          { value: "gitlab-flow" as const, label: "GitLab Flow", hint: "main + environment branches (staging, production)" },
          { value: "trunk-based" as const, label: "Trunk-Based", hint: "short-lived branches, direct to main" },
        ],
      });
      if (p.isCancel(strategy)) {
        p.cancel("Init cancelled.");
        process.exit(0);
      }

      // 3. Branch naming pattern
      const branchPattern = await p.select({
        message: "Branch naming pattern",
        options: [
          { value: "{{name}}", label: "{{name}}", hint: "e.g., user-auth" },
          { value: "{{task_id}}-{{name}}", label: "{{task_id}}-{{name}}", hint: "e.g., JIRA-123-user-auth" },
          { value: "feature/{{name}}", label: "feature/{{name}}", hint: "e.g., feature/user-auth" },
          { value: "feature/{{task_id}}-{{name}}", label: "feature/{{task_id}}-{{name}}", hint: "e.g., feature/JIRA-123-user-auth" },
        ],
      });
      if (p.isCancel(branchPattern)) {
        p.cancel("Init cancelled.");
        process.exit(0);
      }

      // 4. Task manager (optional)
      const taskManagerType = await p.select({
        message: "Task manager integration (optional)",
        options: [
          { value: "none" as const, label: "None" },
          { value: "jira" as const, label: "Jira", hint: "PROJ-123" },
          { value: "linear" as const, label: "Linear", hint: "ENG-123" },
          { value: "github-issues" as const, label: "GitHub Issues", hint: "#123" },
          { value: "custom" as const, label: "Custom pattern" },
        ],
      });
      if (p.isCancel(taskManagerType)) {
        p.cancel("Init cancelled.");
        process.exit(0);
      }

      let taskManagerPattern = "";
      if (taskManagerType === "jira") taskManagerPattern = "[A-Z]+-\\d+";
      else if (taskManagerType === "linear") taskManagerPattern = "[A-Z]+-\\d+";
      else if (taskManagerType === "github-issues") taskManagerPattern = "#\\d+";
      else if (taskManagerType === "custom") {
        const pattern = await p.text({
          message: "Enter task ID regex pattern",
          placeholder: "[A-Z]+-\\d+",
        });
        if (p.isCancel(pattern)) {
          p.cancel("Init cancelled.");
          process.exit(0);
        }
        taskManagerPattern = pattern || "";
      }

      // 5. AI Provider
      const provider = await p.select({
        message: "LLM Provider",
        options: [
          { value: "claude-code-api-key" as const, label: "Claude (API Key)", hint: "requires Anthropic API key" },
          { value: "claude-code-cli" as const, label: "Claude Code (CLI)", hint: "uses your Claude Code subscription" },
        ],
      });
      if (p.isCancel(provider)) {
        p.cancel("Init cancelled.");
        process.exit(0);
      }

      // 6. Commit convention
      const commitConvention = await p.select({
        message: "Commit convention",
        options: [
          { value: "conventional" as const, label: "Conventional Commits", hint: "feat:, fix:, chore:" },
          { value: "gitmoji" as const, label: "Gitmoji", hint: "emoji-based" },
          { value: "angular" as const, label: "Angular", hint: "feat, fix, docs, style" },
          { value: "kernel" as const, label: "Kernel", hint: "subsystem: description" },
          { value: "custom" as const, label: "Custom", hint: "no enforced format" },
        ],
      });
      if (p.isCancel(commitConvention)) {
        p.cancel("Init cancelled.");
        process.exit(0);
      }

      // 7. Auto-detect platform
      const remoteUrl = await git.getRemoteUrl(cwd);
      const platform = remoteUrl ? detectPlatform(remoteUrl) : "git-only";
      if (platform !== "git-only") {
        p.log.info(`Platform detected: ${platform}`);
      }

      // Handle API key / CLI path
      let apiKey: string | undefined;
      let claudeCliPath: string | undefined;
      if (provider === "claude-code-cli") {
        const resolved = resolveClaudeBinary();
        if (resolved) {
          p.log.success(`Claude Code CLI detected at ${resolved}`);
          claudeCliPath = resolved;
        } else {
          p.log.warn("Claude Code CLI not found in PATH or common locations.");
          const customPath = await p.text({
            message: "Enter the full path to the claude binary",
            placeholder: "/path/to/claude",
          });
          if (p.isCancel(customPath) || !customPath) {
            p.cancel("Claude Code CLI is required.");
            process.exit(1);
          }
          try {
            execSync(`"${customPath}" --version`, { stdio: "pipe" });
            claudeCliPath = customPath;
          } catch {
            p.cancel(`Could not run claude at "${customPath}".`);
            process.exit(1);
          }
        }
      } else {
        const existingKey = process.env.ANTHROPIC_API_KEY;
        if (existingKey) {
          const masked = existingKey.length > 8
            ? `${existingKey.slice(0, 7)}...${existingKey.slice(-4)}`
            : "****";
          const keepKey = await p.confirm({
            message: `ANTHROPIC_API_KEY already set (${masked}). Keep it?`,
          });
          if (p.isCancel(keepKey)) { p.cancel("Init cancelled."); process.exit(0); }
          if (!keepKey) {
            const newKey = await p.password({ message: "Anthropic API Key" });
            if (p.isCancel(newKey)) { p.cancel("Init cancelled."); process.exit(0); }
            apiKey = newKey;
          }
        } else {
          const wantsKey = await p.confirm({ message: "Configure Anthropic API Key now?", initialValue: true });
          if (p.isCancel(wantsKey)) { p.cancel("Init cancelled."); process.exit(0); }
          if (wantsKey) {
            const newKey = await p.password({ message: "Anthropic API Key" });
            if (p.isCancel(newKey)) { p.cancel("Init cancelled."); process.exit(0); }
            apiKey = newKey;
          }
        }
      }

      // Build config
      const config: DevflowConfig = {
        ...DEFAULT_CONFIG,
        strategy: strategy as StrategyName,
        branches: {
          main: "main",
          ...(strategy === "gitflow" ? { develop: "develop" } : {}),
          pattern: branchPattern as string,
        },
        taskManager: {
          enabled: taskManagerType !== "none",
          type: taskManagerType as TaskManagerType,
          pattern: taskManagerPattern,
        },
        provider: provider as DevflowConfig["provider"],
        ...(claudeCliPath ? { claudeCliPath } : {}),
        language: "en" as Language,
        commitConvention: commitConvention as CommitConvention,
        platform,
        project: scan,
      };

      await writeConfig(cwd, config);

      if (apiKey) {
        await writeEnvVar(cwd, "ANTHROPIC_API_KEY", apiKey);
        process.env.ANTHROPIC_API_KEY = apiKey;
        p.log.success("API key saved to .devflow/.env");
      }

      // GitFlow: ensure develop branch exists
      if (strategy === "gitflow") {
        const developExists = await git.branchExists(cwd, "develop");
        if (!developExists) {
          await exec("git", ["branch", "develop"], { cwd });
          p.log.success("Created 'develop' branch");
        }
      }

      if (!(await isInGitignore(cwd, ".devflow/.env"))) {
        p.log.warn("Add .devflow/.env to .gitignore to avoid committing secrets.");
      }

      p.outro("Config saved to .devflow/config.json");
    });
}
```

- [ ] **Step 2: Run build to check for type errors**

Run: `npx tsc --noEmit`
Expected: No type errors for init.ts (other files may have errors due to pending changes)

- [ ] **Step 3: Commit**

```bash
git add src/cli/commands/init.ts
git commit -m "feat(init): redesign init command with strategy and platform selection"
```

---

### Task 15: New worktree command

**Files:**
- Create: `src/cli/commands/worktree.ts`

- [ ] **Step 1: Implement worktree command**

```typescript
// src/cli/commands/worktree.ts
import { Command } from "commander";
import * as p from "@clack/prompts";
import chalk from "chalk";
import ora from "ora";
import { readConfig } from "../../core/config.js";
import { createStrategy } from "../../core/strategies/factory.js";
import type { BranchType } from "../../core/strategies/types.js";
import { handleLLMError } from "../../providers/claude.js";
import { createProvider, validateProvider } from "../../providers/factory.js";
import { resolveModelTier } from "../../providers/model-router.js";
import * as git from "../../infra/git.js";
import { basename, join, resolve } from "node:path";

const BRANCH_NAME_SYSTEM_PROMPT = `You suggest git branch names. Given a description of work, suggest 3 short, kebab-case branch names. Return JSON array of 3 strings. No extra text.

Example: ["jwt-auth-refresh", "implement-jwt-tokens", "auth-token-rotation"]`;

function buildBranchName(pattern: string, name: string, taskId?: string): string {
  let result = pattern.replace("{{name}}", name);
  if (taskId) {
    result = result.replace("{{task_id}}", taskId);
  } else {
    result = result.replace("{{task_id}}-", "").replace("{{task_id}}", "");
  }
  return result;
}

function worktreePath(cwd: string, branchName: string): string {
  const repoName = basename(cwd);
  const safeBranch = branchName.replace(/\//g, "-");
  return resolve(cwd, "..", `${repoName}--${safeBranch}`);
}

export function makeWorktreeCommand(): Command {
  const cmd = new Command("worktree").description("Manage git worktrees for parallel development");

  cmd
    .command("create [name]")
    .description("Create a new worktree with a strategy-aware branch")
    .option("--task <id>", "Task ID to include in branch name")
    .option("--type <type>", "Branch type: feature, bugfix, hotfix", "feature")
    .action(async (name: string | undefined, options: { task?: string; type?: string }) => {
      const cwd = process.cwd();
      p.intro("devflow worktree create");

      const config = await readConfig(cwd);
      if (!config) {
        p.cancel("No config found. Run `devflow init` first.");
        process.exit(1);
      }

      const strategy = createStrategy(config.strategy);
      const branchType = (options.type || "feature") as BranchType;

      if (!strategy.getAllowedBranchTypes().includes(branchType)) {
        p.cancel(`Branch type '${branchType}' is not allowed in ${config.strategy} strategy. Allowed: ${strategy.getAllowedBranchTypes().join(", ")}`);
        process.exit(1);
      }

      let branchSlug: string;

      if (!name) {
        // AI-assisted naming
        const description = await p.text({
          message: "Describe what you'll work on:",
          placeholder: "implement user authentication with JWT",
        });
        if (p.isCancel(description) || !description) {
          p.cancel("Cancelled.");
          process.exit(0);
        }

        validateProvider(config);
        const provider = createProvider(config);
        const tier = resolveModelTier("worktree");
        const spinner = ora();

        let suggestions: string[];
        try {
          spinner.start("Generating branch name suggestions...");
          const response = await provider.chat({
            systemPrompt: BRANCH_NAME_SYSTEM_PROMPT,
            messages: [{ role: "user", content: description }],
            model: tier,
          });
          spinner.stop();
          const cleaned = response.content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
          suggestions = JSON.parse(cleaned);
        } catch (err) {
          spinner.stop();
          handleLLMError(err);
          return;
        }

        const selected = await p.select({
          message: "Choose a branch name:",
          options: suggestions.map((s) => ({
            value: s,
            label: buildBranchName(config.branches.pattern, s, options.task),
          })),
        });
        if (p.isCancel(selected)) {
          p.cancel("Cancelled.");
          process.exit(0);
        }
        branchSlug = selected as string;
      } else {
        branchSlug = name;
      }

      const fullBranchName = strategy.getBranchName(branchType, buildBranchName(config.branches.pattern, branchSlug, options.task));
      const baseBranch = strategy.getBaseBranch(branchType);
      const wtPath = worktreePath(cwd, fullBranchName);

      const spinner = ora();
      try {
        spinner.start("Creating worktree...");
        await git.worktreeAdd(cwd, wtPath, fullBranchName, baseBranch);
        spinner.stop();
      } catch (err) {
        spinner.stop();
        p.cancel(`Failed to create worktree: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }

      p.log.success(`Worktree created at ${chalk.cyan(wtPath)}`);
      p.log.success(`Branch: ${chalk.green(fullBranchName)} (based on ${chalk.dim(baseBranch)})`);
      p.log.message(`\n  cd ${wtPath}\n`);
      p.log.message(chalk.dim(`Tip: Use compozy for AI-assisted development in this worktree:`));
      p.log.message(chalk.dim(`  cd ${wtPath} && compozy start`));
      p.log.message(chalk.dim(`  https://github.com/compozy/compozy`));

      p.outro("Done.");
    });

  cmd
    .command("list")
    .description("List active worktrees")
    .action(async () => {
      const cwd = process.cwd();
      p.intro("devflow worktree list");

      const worktrees = await git.worktreeList(cwd);
      if (worktrees.length <= 1) {
        p.log.info("No additional worktrees found.");
        p.outro("Done.");
        return;
      }

      p.log.message(chalk.bold("Active worktrees:\n"));
      for (const wt of worktrees) {
        const shortBranch = wt.branch.replace("refs/heads/", "");
        const shortCommit = wt.commit?.slice(0, 7) ?? "???????";
        p.log.message(`  ${chalk.green(shortBranch)} ${chalk.dim(shortCommit)} ${chalk.cyan(wt.path)}`);
      }

      p.outro("Done.");
    });

  cmd
    .command("remove <name>")
    .description("Remove a worktree")
    .option("--force", "Force remove even if dirty")
    .action(async (name: string, options: { force?: boolean }) => {
      const cwd = process.cwd();
      p.intro("devflow worktree remove");

      const worktrees = await git.worktreeList(cwd);
      const match = worktrees.find((wt) => {
        const shortBranch = wt.branch.replace("refs/heads/", "");
        return shortBranch.includes(name) || wt.path.includes(name);
      });

      if (!match) {
        p.cancel(`Worktree '${name}' not found.`);
        process.exit(1);
      }

      const shortBranch = match.branch.replace("refs/heads/", "");

      try {
        await git.worktreeRemove(cwd, match.path, options.force);
        p.log.success(`Worktree removed: ${match.path}`);
      } catch (err) {
        p.cancel(`Failed to remove worktree: ${err instanceof Error ? err.message : String(err)}. Try --force.`);
        process.exit(1);
      }

      // Offer to delete branch
      const isMerged = await git.isBranchMerged(cwd, shortBranch);
      const deleteBranch = await p.confirm({
        message: `Delete branch '${shortBranch}'?${isMerged ? " (already merged)" : " (NOT merged)"}`,
        initialValue: isMerged,
      });
      if (!p.isCancel(deleteBranch) && deleteBranch) {
        await git.deleteBranch(cwd, shortBranch, !isMerged);
        p.log.success(`Branch '${shortBranch}' deleted.`);
      }

      p.outro("Done.");
    });

  return cmd;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/cli/commands/worktree.ts
git commit -m "feat(worktree): add worktree create/list/remove command"
```

---

### Task 16: New merge command

**Files:**
- Create: `src/cli/commands/merge.ts`

- [ ] **Step 1: Implement merge command**

```typescript
// src/cli/commands/merge.ts
import { Command } from "commander";
import * as p from "@clack/prompts";
import chalk from "chalk";
import ora from "ora";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readConfig } from "../../core/config.js";
import { createStrategy } from "../../core/strategies/factory.js";
import { handleLLMError } from "../../providers/claude.js";
import { createProvider, validateProvider } from "../../providers/factory.js";
import { resolveModelTier } from "../../providers/model-router.js";
import * as git from "../../infra/git.js";

const CONFLICT_SYSTEM_PROMPT = `You are a developer resolving git merge conflicts. For each conflicted file, analyze both sides and suggest the correct resolution. Return the complete resolved file content with no conflict markers. Explain your reasoning briefly.

Format:
REASONING: <brief explanation>
---
<resolved file content>`;

export function makeMergeCommand(): Command {
  return new Command("merge")
    .description("Merge branches with strategy validation and AI conflict resolution")
    .argument("[branch]", "Branch to merge into current branch")
    .option("--from <source>", "Source branch for explicit merge")
    .option("--to <target>", "Target branch for explicit merge")
    .action(async (branch: string | undefined, options: { from?: string; to?: string }) => {
      const cwd = process.cwd();
      p.intro("devflow merge");

      const config = await readConfig(cwd);
      if (!config) {
        p.cancel("No config found. Run `devflow init` first.");
        process.exit(1);
      }

      const strategy = createStrategy(config.strategy);
      const currentBranch = await git.getBranch(cwd);

      let source: string;
      let target: string;

      if (options.from && options.to) {
        source = options.from;
        target = options.to;
        // Need to checkout target first
        if (currentBranch !== target) {
          await git.checkout(cwd, target);
        }
      } else if (branch) {
        source = branch;
        target = currentBranch;
      } else {
        p.cancel("Specify a branch to merge: devflow merge <branch> or devflow merge --from <src> --to <dst>");
        process.exit(1);
      }

      // Validate merge is allowed by strategy
      if (!strategy.canMergeTo(source, target)) {
        p.cancel(
          `${config.strategy} does not allow merging '${source}' into '${target}'.\n` +
          `Hint: check your strategy's merge rules.`
        );
        if (currentBranch !== target && options.to) {
          await git.checkout(cwd, currentBranch);
        }
        process.exit(1);
      }

      p.log.info(`Merging ${chalk.green(source)} into ${chalk.cyan(target)}`);

      const spinner = ora();
      spinner.start("Merging...");
      const result = await git.merge(cwd, source);
      spinner.stop();

      if (!result.hasConflicts) {
        p.log.success("Merge completed successfully.");
        p.outro("Done.");
        return;
      }

      // Handle conflicts
      const conflictedFiles = await git.getConflictedFiles(cwd);
      p.log.warn(`Merge conflict in ${conflictedFiles.length} file(s):`);
      for (const file of conflictedFiles) {
        p.log.message(`  ${chalk.red(file)}`);
      }

      const action = await p.select({
        message: "How do you want to resolve conflicts?",
        options: [
          { value: "ai", label: "AI-assisted resolution", hint: "AI analyzes and suggests resolutions" },
          { value: "manual", label: "Manual resolution", hint: "resolve yourself, then run git add + git commit" },
          { value: "abort", label: "Abort merge" },
        ],
      });

      if (p.isCancel(action) || action === "abort") {
        await git.abortMerge(cwd);
        p.cancel("Merge aborted.");
        process.exit(0);
      }

      if (action === "manual") {
        p.log.info("Resolve conflicts manually, then run:");
        p.log.message(`  git add . && git commit`);
        p.outro("Merge paused — resolve conflicts and commit.");
        return;
      }

      // AI-assisted conflict resolution
      validateProvider(config);
      const provider = createProvider(config);
      const tier = resolveModelTier("merge");

      for (const file of conflictedFiles) {
        const filePath = join(cwd, file);
        const content = await readFile(filePath, "utf-8");

        spinner.start(`AI resolving ${file}...`);
        let response;
        try {
          response = await provider.chat({
            systemPrompt: CONFLICT_SYSTEM_PROMPT,
            messages: [
              {
                role: "user",
                content: `File: ${file}\n\nConflicted content:\n${content}`,
              },
            ],
            model: tier,
          });
          spinner.stop();
        } catch (err) {
          spinner.stop();
          handleLLMError(err);
          return;
        }

        const responseContent = response.content;
        const separatorIdx = responseContent.indexOf("---");
        let reasoning = "";
        let resolved = responseContent;
        if (separatorIdx >= 0) {
          reasoning = responseContent.slice(0, separatorIdx).replace("REASONING:", "").trim();
          resolved = responseContent.slice(separatorIdx + 3).trim();
        }

        p.log.info(`${chalk.bold(file)}:`);
        if (reasoning) {
          p.log.message(chalk.dim(`  AI: ${reasoning}`));
        }

        const accept = await p.confirm({
          message: `Apply AI resolution for ${file}?`,
        });
        if (p.isCancel(accept) || !accept) {
          p.log.info(`Skipping ${file} — resolve manually.`);
          continue;
        }

        await writeFile(filePath, resolved, "utf-8");
        await git.add(cwd, [file]);
        p.log.success(`Resolved: ${file}`);
      }

      // Check if all conflicts resolved
      const remaining = await git.getConflictedFiles(cwd);
      if (remaining.length > 0) {
        p.log.warn(`${remaining.length} conflict(s) still unresolved. Resolve manually and commit.`);
        p.outro("Merge partially resolved.");
        return;
      }

      await git.commit(cwd, `Merge branch '${source}' into ${target}`);
      p.log.success("All conflicts resolved and committed.");
      p.outro("Done.");
    });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/cli/commands/merge.ts
git commit -m "feat(merge): add merge command with AI conflict resolution"
```

---

### Task 17: Evolve commit command (visual commit plan)

**Files:**
- Modify: `src/cli/commands/commit.ts`

- [ ] **Step 1: Update commit command**

Update `src/cli/commands/commit.ts` to:
1. Add strategy branch validation warning
2. Improve commit plan display with box-drawing visual format
3. Remove any pipeline dependencies (commit.ts currently has none)

The main changes are in `handleCommitPlan`:

Replace the `handleCommitPlan` function with an improved visual version:

```typescript
async function handleCommitPlan(
  cwd: string,
  plan: CommitPlan,
  options: { push?: boolean },
): Promise<void> {
  p.log.info(chalk.bold("📋 Commit Plan:\n"));

  // Option A: Split commits
  p.log.message(chalk.bold("  Option A: Split into separate commits (Recommended)"));
  p.log.message(chalk.dim("  ┌─────────────────────────────────────────────────┐"));
  for (const [i, c] of plan.commits.entries()) {
    p.log.message(`  │ ${chalk.cyan(`${i + 1}.`)} ${chalk.green(c.message)}`);
    if (c.description) {
      p.log.message(`  │    ${chalk.dim(c.description)}`);
    }
    for (const file of c.files) {
      p.log.message(`  │    ${chalk.dim(file)}`);
    }
    if (i < plan.commits.length - 1) {
      p.log.message(`  │`);
    }
  }
  p.log.message(chalk.dim("  └─────────────────────────────────────────────────┘\n"));

  // Option B: Single commit
  const combined = plan.commits.map((c) => c.message).join("; ");
  p.log.message(chalk.bold("  Option B: Single commit"));
  p.log.message(chalk.dim("  ┌─────────────────────────────────────────────────┐"));
  p.log.message(`  │ ${chalk.green(combined)}`);
  for (const c of plan.commits) {
    if (c.description) {
      p.log.message(`  │ - ${chalk.dim(c.description)}`);
    }
  }
  p.log.message(chalk.dim("  └─────────────────────────────────────────────────┘\n"));

  const action = await p.select({
    message: "Choose commit plan:",
    options: [
      { value: "split", label: "Option A — Split (recommended)" },
      { value: "single", label: "Option B — Single commit" },
      { value: "cancel", label: "Cancel" },
    ],
  });

  if (p.isCancel(action) || action === "cancel") {
    p.cancel("Commit cancelled.");
    process.exit(0);
  }

  if (action === "single") {
    const fullMessage = plan.commits
      .map((c) => c.description ? `${c.message}\n\n${c.description}` : c.message)
      .join("\n\n");
    await git.commit(cwd, fullMessage);
    p.log.success("Committed all changes as a single commit.");
  } else {
    await git.resetStaged(cwd);
    for (const group of plan.commits) {
      await git.add(cwd, group.files);
      const msg = group.description
        ? `${group.message}\n\n${group.description}`
        : group.message;
      await git.commit(cwd, msg);
      p.log.success(`Committed: ${chalk.green(group.message)}`);
    }
  }

  await pushIfRequested(cwd, options);
}
```

Also add a strategy validation check at the start of the command action, after reading config:

```typescript
// After reading config, add:
const strategy = createStrategy(config.strategy);
const currentBranch = await git.getBranch(cwd);
const branchValidation = strategy.validateBranch(currentBranch);
if (!branchValidation.valid) {
  p.log.warn(`Branch warning: ${branchValidation.message}`);
}
```

Add these imports at the top:
```typescript
import { createStrategy } from "../../core/strategies/factory.js";
```

- [ ] **Step 2: Run build to check for type errors**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/cli/commands/commit.ts
git commit -m "feat(commit): add visual commit plan and strategy branch validation"
```

---

### Task 18: Evolve PR command (strategy-aware)

**Files:**
- Modify: `src/cli/commands/pr.ts`

- [ ] **Step 1: Rewrite PR command**

Replace `src/cli/commands/pr.ts` — remove pipeline/state deps, add strategy-aware target, platform detection, draft mode:

```typescript
// src/cli/commands/pr.ts
import { Command } from "commander";
import * as p from "@clack/prompts";
import chalk from "chalk";
import ora from "ora";
import { readConfig } from "../../core/config.js";
import { createStrategy } from "../../core/strategies/factory.js";
import { handleLLMError } from "../../providers/claude.js";
import { createProvider, validateProvider } from "../../providers/factory.js";
import { resolveModelTier } from "../../providers/model-router.js";
import * as git from "../../infra/git.js";
import { isGhAvailable, createPR } from "../../infra/github.js";
import { isGlabAvailable, createMR } from "../../infra/gitlab.js";
import { debug } from "../../infra/logger.js";

export function makePrCommand(): Command {
  return new Command("pr")
    .description("Create a pull request with AI-generated description")
    .option("--base <branch>", "Override target branch")
    .option("--draft", "Create as draft PR/MR")
    .action(async (options: { base?: string; draft?: boolean }) => {
      const cwd = process.cwd();
      p.intro("devflow pr");

      const config = await readConfig(cwd);
      if (!config) {
        p.cancel("No config found. Run `devflow init` first.");
        process.exit(1);
      }

      const strategy = createStrategy(config.strategy);
      const currentBranch = await git.getBranch(cwd);

      // Determine target branch
      const targetBranch = options.base || strategy.getPRTarget(currentBranch);
      p.log.info(`Target: ${chalk.cyan(targetBranch)} (${config.strategy})`);

      const commits = await git.getLog(cwd, `${targetBranch}..HEAD`);
      if (!commits) {
        p.cancel(`No commits found on '${currentBranch}' relative to '${targetBranch}'.`);
        process.exit(1);
      }

      // Generate PR description with AI
      validateProvider(config);
      const provider = createProvider(config);
      const tier = resolveModelTier("pr");
      const spinner = ora();

      let response;
      try {
        spinner.start("Generating PR title and description...");
        response = await provider.chat({
          systemPrompt: `You are a developer creating a pull request. Based on the commit log and branch info, generate a PR title and description.

Output format (nothing else):
TITLE: <concise title, max 70 chars>
---
## Summary
<1-3 bullet points>

## Changes
<changelog based on commits>

## Test Plan
<testing checklist>`,
          messages: [{ role: "user", content: `Branch: ${currentBranch}\nTarget: ${targetBranch}\n\nCommits:\n${commits}` }],
          model: tier,
        });
        spinner.stop();
      } catch (err) {
        spinner.stop();
        handleLLMError(err);
        return;
      }

      const content = response.content;
      const titleMatch = content.match(/^TITLE:\s*(.+)$/m);
      const title = titleMatch ? titleMatch[1]!.trim() : currentBranch;
      const bodyStart = content.indexOf("---");
      const body = bodyStart >= 0 ? content.slice(bodyStart + 3).trim() : content;

      p.log.info(`Title: ${chalk.bold(title)}`);
      p.log.message(body);

      const confirm = await p.confirm({ message: "Create this PR?" });
      if (p.isCancel(confirm) || !confirm) {
        p.cancel("PR creation cancelled.");
        process.exit(0);
      }

      // Push branch
      spinner.start("Pushing branch...");
      try {
        await git.push(cwd, "origin", currentBranch);
      } catch (err: unknown) {
        debug("git push failed (branch may already be pushed)", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      spinner.stop();

      // Create PR/MR based on platform
      spinner.start("Creating PR...");
      try {
        if (config.platform === "gitlab") {
          if (!(await isGlabAvailable())) {
            spinner.stop();
            p.cancel("GitLab CLI (glab) is not installed. Install it from https://gitlab.com/gitlab-org/cli");
            process.exit(1);
          }
          const mr = await createMR({ title, body, base: targetBranch, cwd, draft: options.draft });
          spinner.stop();
          p.log.success(`MR created: ${chalk.cyan(mr.url)}`);
        } else {
          if (!(await isGhAvailable())) {
            spinner.stop();
            p.cancel("GitHub CLI (gh) is not installed. Install it from https://cli.github.com");
            process.exit(1);
          }
          const pr = await createPR({ title, body, base: targetBranch, cwd });
          spinner.stop();
          p.log.success(`PR created: ${chalk.cyan(pr.url)}`);
        }
      } catch (err) {
        spinner.stop();
        p.cancel(`Failed to create PR: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }

      p.outro("Done.");
    });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/cli/commands/pr.ts
git commit -m "feat(pr): strategy-aware PR with platform detection and draft mode"
```

---

### Task 19: Redesign release command (strategy-aware)

**Files:**
- Modify: `src/cli/commands/release.ts`

- [ ] **Step 1: Rewrite release command**

Replace `src/cli/commands/release.ts` — remove pipeline/state deps, add strategy-specific flows, add `finish` subcommand for GitFlow.

```typescript
// src/cli/commands/release.ts
import { Command } from "commander";
import * as p from "@clack/prompts";
import chalk from "chalk";
import ora from "ora";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readConfig } from "../../core/config.js";
import { createStrategy } from "../../core/strategies/factory.js";
import { TemplateEngine } from "../../core/template.js";
import { handleLLMError } from "../../providers/claude.js";
import { createProvider, validateProvider } from "../../providers/factory.js";
import { resolveModelTier } from "../../providers/model-router.js";
import * as git from "../../infra/git.js";
import { isGhAvailable, createGitHubRelease } from "../../infra/github.js";
import { isGlabAvailable, createGitLabRelease } from "../../infra/gitlab.js";
import { fileExists, readJSON, writeJSON, ensureDir } from "../../infra/filesystem.js";

type BumpType = "major" | "minor" | "patch";

interface VersionSuggestion {
  suggestion: BumpType;
  reasoning: string;
}

function bumpVersion(current: string, type: BumpType): string {
  const parts = current.replace(/^v/, "").split(".").map(Number);
  const major = parts[0] ?? 0;
  const minor = parts[1] ?? 0;
  const patch = parts[2] ?? 0;
  switch (type) {
    case "major": return `${major + 1}.0.0`;
    case "minor": return `${major}.${minor + 1}.0`;
    case "patch": return `${major}.${minor}.${patch + 1}`;
  }
}

function parseVersionSuggestion(raw: string): VersionSuggestion | null {
  try {
    const cleaned = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (parsed.suggestion && parsed.reasoning) return parsed;
  } catch { /* fallback */ }
  return null;
}

const CHANGELOG_HEADER = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com),
and this project adheres to [Semantic Versioning](https://semver.org/).

`;

async function generateReleaseContent(
  config: ReturnType<typeof readConfig> extends Promise<infer T> ? NonNullable<T> : never,
  cwd: string,
  commits: string,
  newVersion: string,
  spinner: ReturnType<typeof ora>,
): Promise<{ changelog: string; releaseNotes: string } | null> {
  const provider = createProvider(config);
  const tier = resolveModelTier("release");
  const templateEngine = new TemplateEngine(join(cwd, config.templatesPath));

  // Changelog
  const changelogTemplate = await templateEngine.load("release-changelog");
  const changelogPrompt = templateEngine.interpolate(changelogTemplate, {
    projectName: config.project.name || "this project",
  });

  let changelog: string;
  try {
    spinner.start("Generating changelog...");
    const response = await provider.chat({
      systemPrompt: changelogPrompt,
      messages: [{ role: "user", content: `Commits:\n${commits}` }],
      model: tier,
    });
    spinner.stop();
    changelog = response.content.replace(/```markdown?\n?/g, "").replace(/```/g, "").trim();
  } catch (err) {
    spinner.stop();
    handleLLMError(err);
    return null;
  }

  // Release notes
  const notesTemplate = await templateEngine.load("release-notes");
  const notesPrompt = templateEngine.interpolate(notesTemplate, {
    version: newVersion,
    projectName: config.project.name || "this project",
    language: "English",
  });

  let releaseNotes: string;
  try {
    spinner.start("Generating release notes...");
    const response = await provider.chat({
      systemPrompt: notesPrompt,
      messages: [{ role: "user", content: `Commits:\n${commits}\n\nChangelog:\n${changelog}` }],
      model: tier,
    });
    spinner.stop();
    releaseNotes = response.content.replace(/```markdown?\n?/g, "").replace(/```/g, "").trim();
  } catch (err) {
    spinner.stop();
    handleLLMError(err);
    return null;
  }

  return { changelog, releaseNotes };
}

async function applyVersionChanges(
  cwd: string,
  newVersion: string,
  changelog: string,
  releaseNotes: string,
): Promise<void> {
  // Bump package.json
  const pkgPath = join(cwd, "package.json");
  if (await fileExists(pkgPath)) {
    const pkg = await readJSON<{ version: string }>(pkgPath);
    pkg.version = newVersion;
    await writeJSON(pkgPath, pkg);
  }

  // Update CHANGELOG.md
  const changelogPath = join(cwd, "CHANGELOG.md");
  const today = new Date().toISOString().split("T")[0];
  const newEntry = `## [${newVersion}] - ${today}\n\n${changelog}\n\n`;
  if (await fileExists(changelogPath)) {
    const existing = await readFile(changelogPath, "utf-8");
    const headerEnd = existing.indexOf("\n## ");
    if (headerEnd !== -1) {
      const header = existing.slice(0, headerEnd + 1);
      const rest = existing.slice(headerEnd + 1);
      await writeFile(changelogPath, header + newEntry + rest, "utf-8");
    } else {
      await writeFile(changelogPath, existing + "\n" + newEntry, "utf-8");
    }
  } else {
    await writeFile(changelogPath, CHANGELOG_HEADER + newEntry, "utf-8");
  }

  // Save release notes
  const releasesDir = join(cwd, ".devflow", "releases");
  await ensureDir(releasesDir);
  await writeFile(
    join(releasesDir, `v${newVersion}-release-notes.md`),
    releaseNotes,
    "utf-8",
  );
}

async function createPlatformRelease(
  config: { platform: string },
  cwd: string,
  newVersion: string,
  releaseNotes: string,
  spinner: ReturnType<typeof ora>,
): Promise<void> {
  if (config.platform === "gitlab") {
    if (await isGlabAvailable()) {
      try {
        spinner.start("Creating GitLab release...");
        const result = await createGitLabRelease({
          tag: `v${newVersion}`, title: `v${newVersion}`, body: releaseNotes, cwd,
        });
        spinner.stop();
        p.log.success(`GitLab release created: ${chalk.cyan(result.url)}`);
      } catch (err) {
        spinner.stop();
        p.log.warn(`GitLab release failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } else if (config.platform === "github") {
    if (await isGhAvailable()) {
      try {
        spinner.start("Creating GitHub release...");
        const result = await createGitHubRelease({
          tag: `v${newVersion}`, title: `v${newVersion}`, body: releaseNotes, cwd,
        });
        spinner.stop();
        p.log.success(`GitHub release created: ${chalk.cyan(result.url)}`);
      } catch (err) {
        spinner.stop();
        p.log.warn(`GitHub release failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
}

export function makeReleaseCommand(): Command {
  const cmd = new Command("release")
    .description("Create a new release with strategy-aware workflow");

  // Main release command: devflow release [version]
  cmd
    .argument("[version]", "Version to release (e.g., 1.2.0)")
    .action(async (version: string | undefined) => {
      const cwd = process.cwd();
      p.intro("devflow release");

      const config = await readConfig(cwd);
      if (!config) {
        p.cancel("No config found. Run `devflow init` first.");
        process.exit(1);
      }

      const strategy = createStrategy(config.strategy);
      const releaseFlow = strategy.getReleaseFlow();

      // Pre-flight
      const dirty = await git.status(cwd);
      if (dirty) {
        p.cancel("Uncommitted changes. Commit or stash first.");
        process.exit(1);
      }

      validateProvider(config);

      const lastTag = await git.getLatestTag(cwd);
      if (lastTag) p.log.info(`Last tag: ${chalk.cyan(lastTag)}`);

      const logRange = lastTag ? `${lastTag}..HEAD` : undefined;
      const commits = await git.getLog(cwd, logRange);
      if (!commits) {
        p.cancel("No new commits since last release.");
        process.exit(1);
      }

      // Determine version
      let newVersion: string;
      if (version) {
        newVersion = version.replace(/^v/, "");
      } else {
        const pkgPath = join(cwd, "package.json");
        const currentVersion = (await fileExists(pkgPath))
          ? (await readJSON<{ version: string }>(pkgPath)).version
          : "0.0.0";
        p.log.info(`Current version: ${chalk.cyan(currentVersion)}`);

        // AI suggest bump
        const provider = createProvider(config);
        const tier = resolveModelTier("release");
        const templateEngine = new TemplateEngine(join(cwd, config.templatesPath));
        const versionTemplate = await templateEngine.load("release-version");
        const versionPrompt = templateEngine.interpolate(versionTemplate, { currentVersion });

        const spinner = ora();
        let suggestion: VersionSuggestion | null = null;
        try {
          spinner.start("Analyzing commits...");
          const response = await provider.chat({
            systemPrompt: versionPrompt,
            messages: [{ role: "user", content: `Commits:\n${commits}` }],
            model: tier,
          });
          spinner.stop();
          suggestion = parseVersionSuggestion(response.content);
        } catch (err) {
          spinner.stop();
          handleLLMError(err);
          return;
        }

        if (suggestion) {
          p.log.info(`AI suggests ${chalk.bold(suggestion.suggestion.toUpperCase())}: ${suggestion.reasoning}`);
        }

        const defaultBump = suggestion?.suggestion ?? "patch";
        const bumpChoices: BumpType[] = ["patch", "minor", "major"];
        const bumpResult = await p.select({
          message: "Select version bump:",
          options: bumpChoices.map((b) => ({
            value: b,
            label: `${b} (${bumpVersion(currentVersion, b)})${b === defaultBump ? chalk.yellow(" ← suggested") : ""}`,
          })),
          initialValue: defaultBump,
        });
        if (p.isCancel(bumpResult)) {
          p.cancel("Release cancelled.");
          process.exit(0);
        }
        newVersion = bumpVersion(currentVersion, bumpResult as BumpType);
      }

      const confirmVersion = await p.confirm({
        message: `Release ${chalk.green(`v${newVersion}`)}?`,
      });
      if (p.isCancel(confirmVersion) || !confirmVersion) {
        p.cancel("Release cancelled.");
        process.exit(0);
      }

      const spinner = ora();
      const content = await generateReleaseContent(config, cwd, commits, newVersion, spinner);
      if (!content) return;

      p.log.message(chalk.dim("--- Changelog Preview ---"));
      p.log.message(content.changelog);
      p.log.message(chalk.dim("--- End Preview ---"));

      const confirmChangelog = await p.confirm({ message: "Accept changelog?" });
      if (p.isCancel(confirmChangelog) || !confirmChangelog) {
        p.cancel("Release cancelled.");
        process.exit(0);
      }

      // Strategy-specific release flow
      if (releaseFlow.createBranch) {
        // GitFlow: create release branch from develop
        const releaseBranch = `release/${newVersion}`;
        spinner.start(`Creating release branch '${releaseBranch}'...`);
        await git.createBranch(cwd, releaseBranch, releaseFlow.from);
        spinner.stop();
        p.log.success(`Branch: ${chalk.green(releaseBranch)} (from ${releaseFlow.from})`);
      }

      // Apply version changes
      spinner.start("Applying version changes...");
      await applyVersionChanges(cwd, newVersion, content.changelog, content.releaseNotes);
      spinner.stop();
      p.log.success(`Version bumped to ${chalk.green(newVersion)}`);
      p.log.success("CHANGELOG.md updated");

      // Commit
      await git.add(cwd, ["package.json", "CHANGELOG.md", `.devflow/releases/v${newVersion}-release-notes.md`]);
      await git.commit(cwd, `chore(release): v${newVersion}`);
      p.log.success(`Committed: ${chalk.green(`chore(release): v${newVersion}`)}`);

      if (!releaseFlow.createBranch) {
        // Non-GitFlow: tag and push immediately
        await git.createTag(cwd, `v${newVersion}`, `Release v${newVersion}`);
        p.log.success(`Tagged: ${chalk.green(`v${newVersion}`)}`);

        const shouldPush = await p.confirm({ message: "Push and create platform release?" });
        if (!p.isCancel(shouldPush) && shouldPush) {
          const branch = await git.getBranch(cwd);
          try {
            spinner.start("Pushing...");
            await git.pushWithTags(cwd, "origin", branch);
            spinner.stop();
            p.log.success(`Pushed to ${chalk.cyan(`origin/${branch}`)}`);
          } catch (err) {
            spinner.stop();
            p.log.warn(`Push failed: ${err instanceof Error ? err.message : String(err)}`);
          }
          await createPlatformRelease(config, cwd, newVersion, content.releaseNotes, spinner);
        }
      } else {
        p.log.info("Release branch created. Run `devflow release finish` after testing.");
      }

      p.outro(`Released v${newVersion}`);
    });

  // GitFlow finish: devflow release finish
  cmd
    .command("finish")
    .description("Finish a GitFlow release (merge to main + develop, tag, push)")
    .action(async () => {
      const cwd = process.cwd();
      p.intro("devflow release finish");

      const config = await readConfig(cwd);
      if (!config) {
        p.cancel("No config found. Run `devflow init` first.");
        process.exit(1);
      }

      if (config.strategy !== "gitflow") {
        p.cancel("'release finish' is only available for GitFlow strategy.");
        process.exit(1);
      }

      const currentBranch = await git.getBranch(cwd);
      if (!currentBranch.startsWith("release/")) {
        p.cancel(`Not on a release branch. Current: ${currentBranch}`);
        process.exit(1);
      }

      const version = currentBranch.replace("release/", "");
      p.log.info(`Finishing release: ${chalk.green(`v${version}`)}`);

      const dirty = await git.status(cwd);
      if (dirty) {
        p.cancel("Uncommitted changes. Commit or stash first.");
        process.exit(1);
      }

      const spinner = ora();

      // Merge to main
      spinner.start("Merging to main...");
      await git.checkout(cwd, "main");
      const mainMerge = await git.merge(cwd, currentBranch);
      spinner.stop();
      if (mainMerge.hasConflicts) {
        p.cancel("Conflicts merging to main. Resolve manually.");
        process.exit(1);
      }
      p.log.success(`Merged ${currentBranch} → main`);

      // Tag
      await git.createTag(cwd, `v${version}`, `Release v${version}`);
      p.log.success(`Tagged: v${version}`);

      // Merge to develop
      spinner.start("Merging to develop...");
      await git.checkout(cwd, "develop");
      const devMerge = await git.merge(cwd, currentBranch);
      spinner.stop();
      if (devMerge.hasConflicts) {
        p.cancel("Conflicts merging to develop. Resolve manually.");
        process.exit(1);
      }
      p.log.success(`Merged ${currentBranch} → develop`);

      // Push
      const shouldPush = await p.confirm({ message: "Push main, develop, and tags?" });
      if (!p.isCancel(shouldPush) && shouldPush) {
        spinner.start("Pushing...");
        await git.pushWithTags(cwd, "origin", "main");
        await git.push(cwd, "origin", "develop");
        spinner.stop();
        p.log.success("Pushed main and develop (with tags)");

        // Platform release
        const notesPath = join(cwd, ".devflow", "releases", `v${version}-release-notes.md`);
        let releaseNotes = `Release v${version}`;
        if (await fileExists(notesPath)) {
          releaseNotes = await readFile(notesPath, "utf-8");
        }
        await createPlatformRelease(config, cwd, version, releaseNotes, spinner);
      }

      // Delete release branch
      const deleteBranch = await p.confirm({
        message: `Delete release branch '${currentBranch}'?`,
        initialValue: true,
      });
      if (!p.isCancel(deleteBranch) && deleteBranch) {
        await git.deleteBranch(cwd, currentBranch);
        p.log.success(`Branch '${currentBranch}' deleted`);
      }

      p.outro(`Release v${version} finished`);
    });

  return cmd;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/cli/commands/release.ts
git commit -m "feat(release): strategy-aware release with GitFlow finish subcommand"
```

---

## Group 5: Cleanup and Wiring

Sequential. Depends on Group 4.

### Task 20: Remove old commands and update program.ts

**Files:**
- Delete: `src/cli/commands/prd.ts`, `src/cli/commands/techspec.ts`, `src/cli/commands/tasks.ts`, `src/cli/commands/run-tasks.ts`, `src/cli/commands/test.ts`, `src/cli/commands/review.ts`, `src/cli/commands/done.ts`, `src/cli/commands/status.ts`
- Delete: `src/cli/context.ts`, `src/core/state.ts`, `src/core/pipeline.ts`, `src/core/context.ts`, `src/core/drift.ts`
- Delete: `templates/prd.md`, `templates/techspec.md`, `templates/tasks.md`
- Delete: `__tests__/unit/core/context.test.ts`, `__tests__/unit/core/drift.test.ts`, `__tests__/unit/core/pipeline.test.ts`, `__tests__/unit/core/state.test.ts`, `__tests__/unit/cli/review.test.ts`, `__tests__/unit/cli/run-tasks.test.ts`
- Delete: `__tests__/integration/prd.test.ts`, `__tests__/integration/techspec.test.ts`
- Modify: `src/cli/program.ts`

- [ ] **Step 1: Delete old files**

```bash
rm -f src/cli/commands/prd.ts src/cli/commands/techspec.ts src/cli/commands/tasks.ts src/cli/commands/run-tasks.ts src/cli/commands/test.ts src/cli/commands/review.ts src/cli/commands/done.ts src/cli/commands/status.ts
rm -f src/cli/context.ts src/core/state.ts src/core/pipeline.ts src/core/context.ts src/core/drift.ts
rm -f templates/prd.md templates/techspec.md templates/tasks.md
rm -f __tests__/unit/core/context.test.ts __tests__/unit/core/drift.test.ts __tests__/unit/core/pipeline.test.ts __tests__/unit/core/state.test.ts
rm -f __tests__/unit/cli/review.test.ts __tests__/unit/cli/run-tasks.test.ts
rm -f __tests__/integration/prd.test.ts __tests__/integration/techspec.test.ts
```

- [ ] **Step 2: Update program.ts**

```typescript
// src/cli/program.ts
import { Command } from "commander";
import { createRequire } from "node:module";
import { makeInitCommand } from "./commands/init.js";
import { makeCommitCommand } from "./commands/commit.js";
import { makePrCommand } from "./commands/pr.js";
import { makeReleaseCommand } from "./commands/release.js";
import { makeMergeCommand } from "./commands/merge.js";
import { makeWorktreeCommand } from "./commands/worktree.js";
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
      "AI-powered git workflow CLI — strategy-aware commits, PRs, releases, merges, and worktrees",
    )
    .version(loadVersion());
  program.hook("preAction", async () => {
    await loadEnv(process.cwd());
  });
  program.addCommand(makeInitCommand());
  program.addCommand(makeCommitCommand());
  program.addCommand(makePrCommand());
  program.addCommand(makeReleaseCommand());
  program.addCommand(makeMergeCommand());
  program.addCommand(makeWorktreeCommand());
  return program;
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors (or only errors in test files that reference deleted modules)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove old pipeline commands and update program registry"
```

---

### Task 21: Final build, test, and fix

**Files:**
- Various test files may need updating

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: Fix any remaining import errors or broken tests

- [ ] **Step 3: Fix any remaining issues**

Common issues to check:
- Old test files referencing deleted modules (remove or update them)
- Coverage threshold — may need to adjust if many old tests were removed
- Import paths in any remaining test files

- [ ] **Step 4: Run tests with coverage**

Run: `npm run test:coverage`
Expected: PASS with coverage above threshold

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: fix tests and ensure clean build after pivot"
```

---

## Verification Plan

After all tasks are complete:

1. **Build:** `npm run build` — should succeed
2. **Tests:** `npm test` — all pass, 80%+ coverage
3. **Lint:** `npm run lint` — no type errors
4. **Manual testing:**
   - `devflow init` → select each strategy, verify config.json
   - `devflow worktree create test-feature` → verify branch + worktree created
   - `devflow commit` → stage files, verify commit plan display
   - `devflow pr` → verify target branch matches strategy
   - `devflow release 0.1.0` → verify strategy-specific flow
   - `devflow merge main` → verify validation and merge
