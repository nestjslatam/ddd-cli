import { PALETTE, bold, detectDepth, paint, visibleWidth } from './theme';

describe('theme', () => {
  describe('the brand palette', () => {
    it('uses the accent colour declared by nestjslatam.dev', () => {
      // --accent in the site's stylesheet; links render as rgb(30,115,190).
      expect(PALETTE.accent).toEqual({ r: 0x1e, g: 0x73, b: 0xbe });
    });

    it('uses the site’s secondary and border contrasts', () => {
      expect(PALETTE.muted).toEqual({ r: 0x57, g: 0x57, b: 0x60 });
      expect(PALETTE.subtle).toEqual({ r: 0xb2, g: 0xb2, b: 0xbe });
    });

    it('uses the NestJS red for danger', () => {
      expect(PALETTE.danger).toEqual({ r: 0xe0, g: 0x23, b: 0x4e });
    });
  });

  describe('depth detection', () => {
    it('honours NO_COLOR even on a capable terminal', () => {
      expect(detectDepth({ NO_COLOR: '1', COLORTERM: 'truecolor' }, true)).toBe(
        'none',
      );
    });

    it('stays plain when output is piped', () => {
      expect(detectDepth({ COLORTERM: 'truecolor' }, false)).toBe('none');
    });

    it('honours a dumb terminal', () => {
      expect(detectDepth({ TERM: 'dumb' }, true)).toBe('none');
    });

    it('uses 24-bit colour when the terminal advertises it', () => {
      expect(detectDepth({ COLORTERM: 'truecolor' }, true)).toBe('truecolor');
    });

    it('falls back to 256 colours', () => {
      expect(detectDepth({ TERM: 'xterm-256color' }, true)).toBe('ansi256');
    });

    it('falls back to the basic 8 colours', () => {
      expect(detectDepth({ TERM: 'xterm' }, true)).toBe('basic');
    });
  });

  describe('painting', () => {
    it('emits a 24-bit sequence carrying the exact brand colour', () => {
      expect(paint('accent', 'x', 'truecolor')).toBe(
        '\x1b[38;2;30;115;190mx\x1b[0m',
      );
    });

    it('degrades to an indexed colour', () => {
      expect(paint('accent', 'x', 'ansi256')).toContain('38;5;');
      expect(paint('accent', 'x', 'basic')).not.toContain('38;5;');
    });

    it('returns the text untouched when colour is off', () => {
      expect(paint('accent', 'x', 'none')).toBe('x');
      expect(bold('x', 'none')).toBe('x');
    });
  });

  describe('visibleWidth', () => {
    it('ignores escape sequences so columns line up', () => {
      // Padding computed from raw length would break every row after a
      // coloured cell.
      expect(visibleWidth(paint('accent', 'abcde', 'truecolor'))).toBe(5);
      expect(visibleWidth(bold('abcde', 'truecolor'))).toBe(5);
    });
  });
});
