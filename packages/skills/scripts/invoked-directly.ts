import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

// An absent or unresolvable argv[1] (REPL, `node -e`) means "imported", not a throw.
export function isInvokedDirectly(importMetaUrl: string): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(importMetaUrl));
  } catch {
    return false;
  }
}
