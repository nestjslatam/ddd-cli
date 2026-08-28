/**
 * The CLI's colour system, taken from nestjslatam.dev.
 *
 * The site is GeneratePress and declares its identity as CSS custom
 * properties; these are those values, read from the live stylesheet rather
 * than eyeballed:
 *
 *   --accent      #1e73be   links and emphasis
 *   --contrast    #222222   primary text
 *   --contrast-2  #575760   secondary text
 *   --contrast-3  #b2b2be   borders and dividers
 *
 * Primary text deliberately has no colour of its own. A terminal already has a
 * foreground that suits its background, and painting text #222222 would be
 * unreadable on a dark theme -- so `--contrast` maps to "leave it alone".
 *
 * Success and warning come from the WordPress preset palette the theme ships
 * (vivid-green-cyan and luminous-vivid-amber); the brand itself defines no
 * green or amber. Danger is the NestJS red carried by the site's logo.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const fromHex = (value: string): Rgb => ({
  r: parseInt(value.slice(1, 3), 16),
  g: parseInt(value.slice(3, 5), 16),
  b: parseInt(value.slice(5, 7), 16),
});

export const PALETTE = {
  accent: fromHex('#1e73be'),
  muted: fromHex('#575760'),
  subtle: fromHex('#b2b2be'),
  success: fromHex('#00d084'),
  warning: fromHex('#fcb900'),
  danger: fromHex('#e0234e'),
} as const;

export type PaletteName = keyof typeof PALETTE;

/** Nearest xterm-256 index, for terminals without 24-bit colour. */
const ANSI_256: Record<PaletteName, number> = {
  accent: 32,
  muted: 242,
  subtle: 249,
  success: 42,
  warning: 220,
  danger: 197,
};

/** Last resort: the eight colours every terminal has. */
const ANSI_16: Record<PaletteName, number> = {
  accent: 34,
  muted: 90,
  subtle: 37,
  success: 32,
  warning: 33,
  danger: 31,
};

export type ColourDepth = 'none' | 'basic' | 'ansi256' | 'truecolor';

/**
 * What the terminal can actually render.
 *
 * NO_COLOR is honoured unconditionally (no-color.org), and output that is not
 * a TTY stays plain so piping into a file or another program is clean.
 */
export function detectDepth(
  env: NodeJS.ProcessEnv = process.env,
  isTty: boolean = Boolean(process.stdout.isTTY),
): ColourDepth {
  if (env.NO_COLOR !== undefined || env.TERM === 'dumb') {
    return 'none';
  }
  if (env.FORCE_COLOR === '0') {
    return 'none';
  }
  if (!isTty && !env.FORCE_COLOR) {
    return 'none';
  }
  if (/truecolor|24bit/i.test(env.COLORTERM ?? '')) {
    return 'truecolor';
  }
  if (/256|kitty|alacritty|wezterm/i.test(env.TERM ?? '')) {
    return 'ansi256';
  }
  return 'basic';
}

const RESET = '\x1b[0m';

/** A palette entry rendered at the best depth the terminal supports. */
export function paint(
  name: PaletteName,
  text: string,
  depth: ColourDepth,
): string {
  if (depth === 'none' || !text) {
    return text;
  }

  const colour = PALETTE[name];
  const open =
    depth === 'truecolor'
      ? `\x1b[38;2;${colour.r};${colour.g};${colour.b}m`
      : depth === 'ansi256'
        ? `\x1b[38;5;${ANSI_256[name]}m`
        : `\x1b[${ANSI_16[name]}m`;

  return `${open}${text}${RESET}`;
}

export function bold(text: string, depth: ColourDepth): string {
  return depth === 'none' || !text ? text : `\x1b[1m${text}${RESET}`;
}

/** Visible width, ignoring escape sequences, so columns align. */
export function visibleWidth(text: string): number {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '').length;
}
