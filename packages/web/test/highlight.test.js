// Syntax highlighting of the demo editor (demo/highlight.js): token kinds, lossless split, HTML escaping.
import { describe, it, expect } from 'vitest';
import { tokenize, highlight } from '../demo/highlight.js';

const kinds = (src) => tokenize(src).filter((t) => t.kind).map((t) => [t.kind, t.text]);

describe('demo highlight', () => {
  it('finds keywords, builtins, definitions, strings, numbers and comments', () => {
    expect(kinds('def schritte(n):  # zählt\n    for i in range(n):\n        print("ä", 3.5, f\'{i}\')\nclass Ente: pass')).toEqual([
      ['kw', 'def'], ['def', 'schritte'], ['com', '# zählt'], ['kw', 'for'], ['kw', 'in'], ['bi', 'range'],
      ['bi', 'print'], ['str', '"ä"'], ['num', '3.5'], ['str', "f'{i}'"], ['kw', 'class'], ['def', 'Ente'], ['kw', 'pass'],
    ]);
  });
  it('keeps names with digits or keyword prefixes plain, and # inside strings is no comment', () => {
    expect(kinds('format = x1 + iffy\ns = "a # b"')).toEqual([['str', '"a # b"']]);
  });
  it('triple-quoted strings span lines, also unterminated', () => {
    expect(kinds('world("""\n#@ $\n""")\nx = \'\'\'offen')).toEqual([['str', '"""\n#@ $\n"""'], ['str', "'''offen"]]);
  });
  it('joins back to the source and escapes HTML', () => {
    const src = 'if a < b and c & d:\n\tprint(\'<b>\')  # ok\n@deko\n0x1F 1e-3 2j';
    expect(tokenize(src).map((t) => t.text).join('')).toBe(src);
    const html = highlight(src);
    expect(html).not.toContain('<b>');
    expect(html).toContain('a &lt; b');
    expect(html).toContain('<span class="hl-def">@deko</span>');
    expect(html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&amp;/g, '&')).toBe(src);
  });
});
