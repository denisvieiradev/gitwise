let verboseEnabled = false;

export function setVerbose(enabled: boolean): void {
  verboseEnabled = enabled;
}

export function isVerbose(): boolean {
  return verboseEnabled;
}

export function info(message: string, context?: Record<string, unknown>): void {
  if (context) {
    console.log(message, context);
  } else {
    console.log(message);
  }
}

export function error(
  message: string,
  context?: Record<string, unknown>,
): void {
  if (context) {
    console.error(message, context);
  } else {
    console.error(message);
  }
}

export function debug(
  message: string,
  context?: Record<string, unknown>,
): void {
  if (!verboseEnabled) return;
  if (context) {
    console.log(`[debug] ${message}`, context);
  } else {
    console.log(`[debug] ${message}`);
  }
}
