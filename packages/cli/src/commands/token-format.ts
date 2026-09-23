// PROV-07: shared by every command's token-count print site (commit, review,
// pr, release) — shows the real counts when the active provider reports
// usage, "n/a" when it doesn't (AD-002). Never a misleading "0 in / 0 out".
export function formatTokens(tokens: { input: number; output: number }, tokensAvailable: boolean): string {
  return tokensAvailable ? `${tokens.input} in / ${tokens.output} out` : "n/a";
}
