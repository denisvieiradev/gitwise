import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Transaction, type Logger } from "../../src/infra/transaction.js";
import { GitwiseError } from "../../src/errors.js";

describe("Transaction (integration with the filesystem)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "gitwise-tx-int-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("rolls back a 3-step flow in LIFO order when the 3rd step throws", async () => {
    const fileA = join(dir, "a.txt");
    const fileB = join(dir, "b.txt");
    await writeFile(fileA, "initial-a", "utf-8");
    await writeFile(fileB, "initial-b", "utf-8");

    const tx = new Transaction();
    const seq: string[] = [];

    const logger: Logger = { warn: () => {} };

    let thrown: GitwiseError | null = null;
    try {
      const aOriginal = await tx.run({
        name: "snapshot-a",
        apply: async () => {
          const prior = await readFile(fileA, "utf-8");
          await writeFile(fileA, "applied-a", "utf-8");
          seq.push("apply-a");
          return prior;
        },
        compensate: async (prior) => {
          seq.push("compensate-a");
          await writeFile(fileA, prior, "utf-8");
        },
      });
      expect(aOriginal).toBe("initial-a");

      const bOriginal = await tx.run({
        name: "snapshot-b",
        apply: async () => {
          const prior = await readFile(fileB, "utf-8");
          await writeFile(fileB, "applied-b", "utf-8");
          seq.push("apply-b");
          return prior;
        },
        compensate: async (prior) => {
          seq.push("compensate-b");
          await writeFile(fileB, prior, "utf-8");
        },
      });
      expect(bOriginal).toBe("initial-b");

      await tx.run({
        name: "failing-step",
        apply: async () => {
          seq.push("apply-c-fail");
          throw new GitwiseError({
            code: "GIT_FAILED",
            message: "third step failed",
          });
        },
        compensate: async () => {
          seq.push("compensate-c-should-not-run");
        },
      });
    } catch (err) {
      thrown = err as GitwiseError;
      await tx.rollback(thrown, logger);
    }

    expect(thrown).toBeInstanceOf(GitwiseError);
    expect(thrown?.code).toBe("GIT_FAILED");

    expect(seq).toEqual([
      "apply-a",
      "apply-b",
      "apply-c-fail",
      "compensate-b",
      "compensate-a",
    ]);

    expect(await readFile(fileA, "utf-8")).toBe("initial-a");
    expect(await readFile(fileB, "utf-8")).toBe("initial-b");
  });

  it("surfaces ROLLBACK_PARTIAL when a compensate fails, without masking the original error", async () => {
    const tx = new Transaction();
    const warnCalls: Array<{ message: string; context?: Record<string, unknown> }> = [];
    const logger: Logger = {
      warn(message, context) {
        warnCalls.push({ message, context });
      },
    };

    await tx.run({
      name: "ok",
      apply: async () => "ok-result",
      compensate: async () => {},
    });
    await tx.run({
      name: "broken-compensate",
      apply: async () => "x",
      compensate: async () => {
        throw new Error("compensate cannot run");
      },
    });

    const originalErr = new GitwiseError({
      code: "GIT_FAILED",
      message: "flow exploded",
    });
    const rollback = await tx.rollback(originalErr, logger);

    expect(rollback.partial).toBe(true);
    expect(rollback.failures).toHaveLength(1);
    expect(rollback.failures[0]?.step).toBe("broken-compensate");

    const partial = warnCalls.find(
      (c) => c.context?.["code"] === "ROLLBACK_PARTIAL",
    );
    expect(partial).toBeDefined();
    expect(partial?.context).toMatchObject({
      code: "ROLLBACK_PARTIAL",
      originalCode: "GIT_FAILED",
    });
    // Original error remains the caller's to surface
    expect(originalErr.code).toBe("GIT_FAILED");
    expect(originalErr.message).toBe("flow exploded");
  });
});
