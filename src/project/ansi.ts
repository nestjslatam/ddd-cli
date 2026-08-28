/**
 * Minimal ANSI helpers.
 *
 * chalk and ora are ESM-only from v5 and v6 respectively; requiring either from
 * this CommonJS NestJS build fails with ERR_REQUIRE_ESM on Node below 20.19 and
 * under Jest. A dozen escape codes are not worth that risk.
 */
const enabled = process.stdout.isTTY && process.env.NO_COLOR === undefined;

const wrap = (code: number) => (text: string) =>
  enabled ? `\x1b[${code}m${text}\x1b[0m` : text;

export const bold = wrap(1);
export const dim = wrap(2);
export const red = wrap(31);
export const green = wrap(32);
export const yellow = wrap(33);
export const cyan = wrap(36);
