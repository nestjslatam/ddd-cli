/** Naming helpers shared by every renderer. */

export function toKebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

export function toCamelCase(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

export function toPascalCase(value: string): string {
  return value
    .replace(/[-_\s]+(.)?/g, (_, chr: string | undefined) =>
      chr ? chr.toUpperCase() : '',
    )
    .replace(/^(.)/, (chr) => chr.toUpperCase());
}

/** `OrderConfirmed` -> `order-confirmed`, used for file names. */
export function fileStem(name: string): string {
  return toKebabCase(name);
}

/**
 * Renders a TypeScript single-quoted string literal.
 *
 * JSON.stringify would be safe but emits double quotes, and these projects
 * format with `singleQuote: true` -- generated files should survive a
 * `npm run format` with no diff.
 */
export function singleQuoted(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
  return `'${escaped}'`;
}
