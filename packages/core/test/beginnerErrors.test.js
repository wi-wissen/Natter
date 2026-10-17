// Error messages for beginners: typical mistakes get a message that says what to do (de/en).

import { describe, it, expect } from 'vitest';
import { runToEnd } from '../src/index.js';
import { scriptErrorText } from '../src/index.js';

const errOf = (src) => runToEnd(src).error;
const textOf = (src, lang = 'de') => scriptErrorText(errOf(src), { lang }).text;

describe('beginner error messages', () => {
  it('missing colon and = in a condition', () => {
    expect(errOf('if x > 1\n    pass')).toMatchObject({ code: 'err.script.expected', params: { what: 'colon' }, line: 1 });
    expect(textOf('if x > 1\n    pass')).toBe('Am Ende der Zeile fehlt ein Doppelpunkt „:“ (gefunden: Zeilenende).');
    expect(errOf('x = 1\nif x = 3:\n    pass')).toMatchObject({ code: 'err.script.badAssign', params: { what: 'condition' }, line: 2 });
    expect(errOf('while x = 3:\n    pass')).toMatchObject({ params: { what: 'condition' } });
    expect(textOf('x = 1\nif x = 3:\n    pass', 'en')).toBe('A condition compares with “==”; “=” assigns a value.');
  });

  it('an empty block at the end reports the line with the colon and suggests pass', () => {
    const e = errOf('x = 1\nif x > 0:\n    x = 2\nelse:\n    # nothing yet\n');
    expect(e).toMatchObject({ code: 'err.script.expectedIndent', line: 4 });
    expect(textOf('if True:\n')).toMatch(/„pass“/);
  });

  it('list index with index and length', () => {
    expect(textOf('xs = [1, 2, 3]\nprint(xs[5])')).toBe('Den Index 5 gibt es nicht – die Liste hat 3 Elemente (Index 0 bis 2).');
    expect(textOf('xs = []\nprint(xs[0])')).toBe('Die Liste ist leer – es gibt keinen Index 0.');
    expect(textOf('print("abc"[-4])', 'en')).toBe('The text has no character at position -4 – it is 3 characters long (index 0 to 2).');
  });

  it('a function used like a list, None from a function without return', () => {
    expect(textOf('print(len[0])')).toBe('„len“ ist eine Funktion – erst aufrufen, dann [ ]: len()[0]');
    expect(textOf('def f():\n    x = 1\nprint(f() + 1)')).toMatch(/None kommt oft von einer Funktion ohne return/);
    expect(textOf('def f():\n    pass\nf().step()')).toMatch(/^None hat kein „step“/);
  });

  it('true/false/none and set() get a hint', () => {
    expect(errOf('x = true')).toMatchObject({ code: 'err.script.nameUnbound', params: { suggestion: 'True' } });
    expect(errOf('x = none')).toMatchObject({ params: { suggestion: 'None' } });
    expect(errOf('s = set()')).toMatchObject({ code: 'err.script.notSupported', params: { feature: 'set' } });
  });
});
