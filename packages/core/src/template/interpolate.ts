/**
 * Replace {{var}} placeholders in a template string with values from ctx.
 * Unknown placeholders are left untouched.
 */
export function interpolate(template: string, ctx: Record<string, string>): string {
  return template.replace(
    /\{\{(\w+)\}\}/g,
    (_match, key: string) => ctx[key] ?? _match,
  );
}
