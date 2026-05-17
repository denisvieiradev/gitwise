let verboseEnabled = false;

// Support GITWISE_DEBUG=1 env variable to enable debug output
if (process.env["GITWISE_DEBUG"] === "1") {
  verboseEnabled = true;
}

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
    process.stderr.write(`[debug] ${message} ${JSON.stringify(context)}\n`);
  } else {
    process.stderr.write(`[debug] ${message}\n`);
  }
}
