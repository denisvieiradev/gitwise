import { jest } from "@jest/globals";
import * as realFs from "node:fs";
import * as realChildProcess from "node:child_process";

export interface FakeFilesystem {
  /** Absolute paths that should pass the X_OK access check. */
  executables: string[];
  /** Result of `which <command>`; null means "not in PATH" (which exits non-zero). */
  which: string | null;
  /** Directory listing of ~/.nvm/versions/node; null means nvm is not installed. */
  nvmVersions: string[] | null;
}

/**
 * Imports `modulePath` in an isolated registry with `node:fs` and
 * `node:child_process` mocked so binary-resolution precedence can be asserted
 * deterministically, regardless of which CLIs are installed on the machine.
 */
export async function importWithFakeFs<T>(modulePath: string, fake: FakeFilesystem): Promise<T> {
  let mod: T | undefined;
  await jest.isolateModulesAsync(async () => {
    const accessSync = (p: realFs.PathLike): void => {
      if (!fake.executables.includes(String(p))) {
        throw Object.assign(new Error(`EACCES: ${String(p)}`), { code: "EACCES" });
      }
    };
    const readdirSync = (): string[] => {
      if (fake.nvmVersions === null) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return fake.nvmVersions;
    };
    const fsMock = { ...realFs, accessSync, readdirSync };
    jest.unstable_mockModule("node:fs", () => ({ ...fsMock, default: fsMock }));
    const execSync = (): Buffer => {
      if (fake.which === null) throw new Error("not found");
      return Buffer.from(`${fake.which}\n`);
    };
    const cpMock = { ...realChildProcess, execSync };
    jest.unstable_mockModule("node:child_process", () => ({ ...cpMock, default: cpMock }));
    mod = (await import(modulePath)) as T;
  });
  return mod as T;
}
