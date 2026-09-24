import { describe, it, expect } from "@jest/globals";
import { formatTokens } from "../../../src/commands/token-format.js";

describe("formatTokens (PROV-07)", () => {
  it("returns 'n in / m out' when tokensAvailable is true", () => {
    expect(formatTokens({ input: 42, output: 15 }, true)).toBe("42 in / 15 out");
  });

  it("returns 'n/a' when tokensAvailable is false, regardless of the numeric values", () => {
    expect(formatTokens({ input: 0, output: 0 }, false)).toBe("n/a");
    expect(formatTokens({ input: 99, output: 99 }, false)).toBe("n/a");
  });
});
