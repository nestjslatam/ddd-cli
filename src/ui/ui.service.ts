import { Injectable } from '@nestjs/common';

import {
  ColourDepth,
  PaletteName,
  bold,
  detectDepth,
  paint,
  visibleWidth,
} from './theme';

/** Left margin every line shares, so output has a consistent gutter. */
const GUTTER = '  ';

/**
 * All terminal output goes through here.
 *
 * Centralising it means colour depth is detected once, alignment accounts for
 * escape sequences rather than raw string length, and long prose wraps to the
 * actual terminal width instead of whatever the emitting code guessed.
 */
@Injectable()
export class UiService {
  readonly depth: ColourDepth = detectDepth();

  /** Usable width, clamped so output stays readable on very wide terminals. */
  get width(): number {
    const columns = process.stdout.columns ?? 80;
    return Math.max(40, Math.min(columns - GUTTER.length, 100));
  }

  // --- colour -------------------------------------------------------------

  accent = (text: string) => paint('accent', text, this.depth);
  muted = (text: string) => paint('muted', text, this.depth);
  subtle = (text: string) => paint('subtle', text, this.depth);
  success = (text: string) => paint('success', text, this.depth);
  warning = (text: string) => paint('warning', text, this.depth);
  danger = (text: string) => paint('danger', text, this.depth);
  strong = (text: string) => bold(text, this.depth);

  // --- structure ----------------------------------------------------------

  blank(): void {
    process.stdout.write('\n');
  }

  /** A line in the shared gutter. */
  line(text = ''): void {
    process.stdout.write(text ? `${GUTTER}${text}\n` : '\n');
  }

  /** A section heading, bold and preceded by space. */
  heading(text: string): void {
    this.blank();
    this.line(this.strong(text));
  }

  /** A horizontal rule drawn in the border colour. */
  rule(): void {
    this.line(this.subtle('─'.repeat(this.width)));
  }

  /** A label/value pair with the label in the muted colour. */
  field(label: string, value: string, labelWidth = 14): void {
    this.line(`${this.muted(label.padEnd(labelWidth))}${value}`);
  }

  /**
   * Rows aligned on their first column.
   *
   * Padding is computed from visible width, so colouring a cell does not throw
   * the alignment of every row after it.
   */
  rows(entries: Array<[string, string]>, gap = 2): void {
    const widest = entries.reduce(
      (max, [left]) => Math.max(max, visibleWidth(left)),
      0,
    );

    for (const [left, right] of entries) {
      // No padding when there is nothing to align to: a trailing run of
      // spaces is invisible on screen but shows up in copied text and diffs.
      if (!right) {
        this.line(left);
        continue;
      }
      const padding = ' '.repeat(widest - visibleWidth(left) + gap);
      this.line(`${left}${padding}${right}`);
    }
  }

  /** Wraps prose to the terminal width, preserving blank lines and indents. */
  paragraph(text: string, indent = ''): void {
    for (const source of text.split('\n')) {
      if (!source.trim()) {
        this.blank();
        continue;
      }

      // Lines that are already laid out -- code, lists -- are left alone.
      const preformatted = /^\s{2,}|^[-*\d]/.test(source);
      if (preformatted) {
        this.line(`${indent}${source}`);
        continue;
      }

      for (const wrapped of this.wrap(source, this.width - indent.length)) {
        this.line(`${indent}${wrapped}`);
      }
    }
  }

  private wrap(text: string, width: number): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = '';

    for (const word of words) {
      if (!current) {
        current = word;
      } else if (visibleWidth(current) + 1 + visibleWidth(word) <= width) {
        current += ` ${word}`;
      } else {
        lines.push(current);
        current = word;
      }
    }

    if (current) {
      lines.push(current);
    }

    return lines.length ? lines : [''];
  }

  // --- status -------------------------------------------------------------

  /** A short status line: a coloured marker, then the message. */
  status(kind: PaletteName, marker: string, message: string): void {
    this.line(`${paint(kind, marker, this.depth)} ${message}`);
  }

  ok(message: string): void {
    this.status('success', '✓', message);
  }

  warn(message: string): void {
    this.status('warning', '!', message);
  }

  fail(message: string): void {
    this.status('danger', '✗', message);
  }

  hint(message: string): void {
    this.line(this.muted(message));
  }
}
