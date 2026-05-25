import { GitwiseError } from "../errors.js";

export interface Step<T> {
  name: string;
  apply: () => Promise<T>;
  compensate: (result: T) => Promise<void>;
}

export interface Logger {
  warn(message: string, context?: Record<string, unknown>): void;
}

export interface RollbackFailure {
  step: string;
  error: unknown;
}

export interface RollbackResult {
  partial: boolean;
  failures: RollbackFailure[];
}

interface AppliedStep {
  step: Step<unknown>;
  result: unknown;
}

export class Transaction {
  private readonly applied: AppliedStep[] = [];

  async run<T>(step: Step<T>): Promise<T> {
    const result = await step.apply();
    this.applied.push({ step: step as Step<unknown>, result });
    return result;
  }

  get size(): number {
    return this.applied.length;
  }

  async rollback(reason: GitwiseError, logger: Logger): Promise<RollbackResult> {
    const failures: RollbackFailure[] = [];
    for (const { step, result } of [...this.applied].reverse()) {
      try {
        await step.compensate(result);
      } catch (err) {
        failures.push({ step: step.name, error: err });
        logger.warn("compensate-failed", {
          step: step.name,
          reason: serializeError(err),
        });
      }
    }
    if (failures.length > 0) {
      logger.warn("rollback partial: one or more compensate actions failed", {
        code: "ROLLBACK_PARTIAL",
        originalCode: reason.code,
        failures: failures.map((f) => ({
          step: f.step,
          error: serializeError(f.error),
        })),
      });
    }
    return { partial: failures.length > 0, failures };
  }
}

function serializeError(err: unknown): unknown {
  if (err instanceof Error) {
    return { name: err.name, message: err.message };
  }
  return err;
}
