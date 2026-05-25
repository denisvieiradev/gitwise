import { describe, it, expect } from "@jest/globals";
import { Transaction, type Logger, type Step } from "../../../src/infra/transaction.js";
import { GitwiseError } from "../../../src/errors.js";

function createLogger() {
  const calls: Array<{ message: string; context?: Record<string, unknown> }> = [];
  const logger: Logger = {
    warn(message, context) {
      calls.push({ message, context });
    },
  };
  return { logger, calls };
}

describe("Transaction.run", () => {
  it("returns the apply result", async () => {
    const tx = new Transaction();
    const step: Step<string> = {
      name: "step-a",
      apply: async () => "value",
      compensate: async () => {},
    };
    const result = await tx.run(step);
    expect(result).toBe("value");
  });

  it("records each successful step so rollback can fire", async () => {
    const tx = new Transaction();
    const sequence: string[] = [];
    await tx.run({
      name: "a",
      apply: async () => 1,
      compensate: async () => {
        sequence.push("compensate-a");
      },
    });
    await tx.run({
      name: "b",
      apply: async () => 2,
      compensate: async () => {
        sequence.push("compensate-b");
      },
    });
    expect(tx.size).toBe(2);

    const { logger } = createLogger();
    await tx.rollback(
      new GitwiseError({ code: "GIT_FAILED", message: "boom" }),
      logger,
    );
    expect(sequence).toEqual(["compensate-b", "compensate-a"]);
  });

  it("does not record a step whose apply throws", async () => {
    const tx = new Transaction();
    const sequence: string[] = [];
    await tx.run({
      name: "ok",
      apply: async () => "ok",
      compensate: async () => {
        sequence.push("compensate-ok");
      },
    });
    await expect(
      tx.run({
        name: "boom",
        apply: async () => {
          throw new Error("apply failed");
        },
        compensate: async () => {
          sequence.push("compensate-boom");
        },
      }),
    ).rejects.toThrow("apply failed");

    expect(tx.size).toBe(1);

    const { logger } = createLogger();
    await tx.rollback(
      new GitwiseError({ code: "GIT_FAILED", message: "boom" }),
      logger,
    );
    expect(sequence).toEqual(["compensate-ok"]);
  });
});

describe("Transaction.rollback", () => {
  it("runs compensates in LIFO order across three steps", async () => {
    const tx = new Transaction();
    const order: string[] = [];
    for (const name of ["a", "b", "c"]) {
      // eslint-disable-next-line no-await-in-loop
      await tx.run({
        name,
        apply: async () => name,
        compensate: async (result) => {
          order.push(`compensate-${result}`);
        },
      });
    }

    const { logger, calls } = createLogger();
    const result = await tx.rollback(
      new GitwiseError({ code: "GIT_FAILED", message: "stop" }),
      logger,
    );
    expect(order).toEqual(["compensate-c", "compensate-b", "compensate-a"]);
    expect(result.partial).toBe(false);
    expect(result.failures).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("logs compensate-failed for a throwing compensate and continues rollback", async () => {
    const tx = new Transaction();
    const order: string[] = [];
    await tx.run({
      name: "first",
      apply: async () => "first",
      compensate: async () => {
        order.push("compensate-first");
      },
    });
    await tx.run({
      name: "second",
      apply: async () => "second",
      compensate: async () => {
        order.push("compensate-second");
        throw new Error("compensate blew up");
      },
    });

    const { logger, calls } = createLogger();
    const result = await tx.rollback(
      new GitwiseError({ code: "GIT_FAILED", message: "stop" }),
      logger,
    );

    expect(order).toEqual(["compensate-second", "compensate-first"]);
    expect(result.partial).toBe(true);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.step).toBe("second");

    const compensateFailed = calls.find((c) => c.message === "compensate-failed");
    expect(compensateFailed).toBeDefined();
    expect(compensateFailed?.context).toMatchObject({ step: "second" });

    const partialWarning = calls.find(
      (c) => c.context?.["code"] === "ROLLBACK_PARTIAL",
    );
    expect(partialWarning).toBeDefined();
    expect(partialWarning?.context).toMatchObject({
      code: "ROLLBACK_PARTIAL",
      originalCode: "GIT_FAILED",
    });
  });

  it("returns partial=false when every compensate succeeds", async () => {
    const tx = new Transaction();
    await tx.run({
      name: "only",
      apply: async () => 1,
      compensate: async () => {},
    });
    const { logger, calls } = createLogger();
    const result = await tx.rollback(
      new GitwiseError({ code: "GIT_FAILED", message: "stop" }),
      logger,
    );
    expect(result.partial).toBe(false);
    expect(
      calls.find((c) => c.context?.["code"] === "ROLLBACK_PARTIAL"),
    ).toBeUndefined();
  });

  it("rolling back an empty transaction is a no-op", async () => {
    const tx = new Transaction();
    const { logger, calls } = createLogger();
    const result = await tx.rollback(
      new GitwiseError({ code: "GIT_FAILED", message: "stop" }),
      logger,
    );
    expect(result.partial).toBe(false);
    expect(result.failures).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("does not throw when every compensate throws — original cause is the caller's responsibility", async () => {
    const tx = new Transaction();
    await tx.run({
      name: "a",
      apply: async () => "a",
      compensate: async () => {
        throw new Error("a-fail");
      },
    });
    await tx.run({
      name: "b",
      apply: async () => "b",
      compensate: async () => {
        throw new Error("b-fail");
      },
    });
    const { logger } = createLogger();
    await expect(
      tx.rollback(
        new GitwiseError({ code: "GIT_FAILED", message: "root" }),
        logger,
      ),
    ).resolves.toEqual({
      partial: true,
      failures: expect.arrayContaining([
        expect.objectContaining({ step: "a" }),
        expect.objectContaining({ step: "b" }),
      ]),
    });
  });
});
