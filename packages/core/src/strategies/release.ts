/**
 * Release-lifecycle strategy abstraction. Narrow on purpose (per ADR-002):
 * it covers branch creation, merge targets, and the develop-branch requirement
 * — nothing else from the broader FlowStrategy design lives here yet.
 */

export type ReleaseStrategyName = "github-flow" | "gitflow";

export interface ReleaseStrategy {
  readonly name: ReleaseStrategyName;
  /** Optional release branch to create during prepare; null = no branch. */
  releaseBranchFor(version: string): string | null;
  /** Branches to merge the release into during finish, in order. */
  mergeTargets(mainBranch: string, developBranch?: string): string[];
  /** True if a develop branch must exist for this strategy to run. */
  requiresDevelop(): boolean;
}

const githubFlow: ReleaseStrategy = Object.freeze({
  name: "github-flow",
  releaseBranchFor(_version: string): string | null {
    return null;
  },
  mergeTargets(mainBranch: string, _developBranch?: string): string[] {
    return [mainBranch];
  },
  requiresDevelop(): boolean {
    return false;
  },
});

const gitflow: ReleaseStrategy = Object.freeze({
  name: "gitflow",
  releaseBranchFor(version: string): string {
    return `release/${version}`;
  },
  mergeTargets(mainBranch: string, developBranch?: string): string[] {
    return developBranch ? [mainBranch, developBranch] : [mainBranch];
  },
  requiresDevelop(): boolean {
    return true;
  },
});

const STRATEGIES: Readonly<Record<ReleaseStrategyName, ReleaseStrategy>> = Object.freeze({
  "github-flow": githubFlow,
  gitflow,
});

export function createReleaseStrategy(name: ReleaseStrategyName): ReleaseStrategy {
  return STRATEGIES[name];
}
