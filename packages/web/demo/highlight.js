// Python syntax highlighting for the demo editor (demo only, not part of the library): a small regex tokenizer and
// an overlay that puts the coloured text in a <pre> behind a transparent <textarea> (caret, selection, undo stay native).

const KEYWORDS = new Set(('False None True and as assert async await break class continue def del elif else except finally for '
  + 'from global if import in is lambda nonlocal not or pass raise return try while with yield match case').split(' '));
const BUILTINS = new Set(('print input range len int float str bool list dict set tuple abs min max sum round sorted reversed '
  + 'enumerate zip map filter open type isinstance any all chr ord repr iter next super self').split(' '));

// one alternative per token kind, tried left to right; anything else is plain text
const TOKEN = new RegExp([
  /(#[^\n]*)/.source,                                                   // 1 comment
  /((?:[rRbBuUfF]{1,2})?(?:'''[\s\S]*?(?:'''|$)|"""[\s\S]*?(?:"""|$)|'(?:\\.|[^'\\\n])*'?|"(?:\\.|[^"\\\n])*"?))/.source, // 2 string
  /(\b(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?j?)\b)/.source, // 3 number
  /(@[A-Za-z_]\w*)/.source,                                             // 4 decorator
  /([A-Za-z_\u00C0-\uFFFF][\w\u00C0-\uFFFF]*)/.source,         // 5 name
].join('|'), 'g');

/**
 * Split Python source into tokens; joined, the texts give back the source exactly.
 * @param {string} src
 * @returns {{ text: string, kind: ''|'kw'|'str'|'com'|'num'|'bi'|'def' }[]}
 */
export function tokenize(src) {
  const out = [];
  let last = 0, afterDef = false;
  const plain = (to) => { if (to > last) out.push({ text: src.slice(last, to), kind: '' }); };
  for (const m of src.matchAll(TOKEN)) {
    plain(m.index);
    const [text, com, str, num, deco, name] = m;
    let kind = '';
    if (com) kind = 'com';
    else if (str) kind = 'str';
    else if (num) kind = 'num';
    else if (deco) kind = 'def';
    else if (name) kind = afterDef ? 'def' : KEYWORDS.has(name) ? 'kw' : BUILTINS.has(name) ? 'bi' : '';
    afterDef = name === 'def' || name === 'class';
    out.push({ text, kind });
    last = m.index + text.length;
  }
  plain(src.length);
  return out;
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** Highlighted HTML for a <pre>: one <span class="hl-…"> per coloured token. */
export function highlight(src) {
  return tokenize(src).map((t) => (t.kind ? `<span class="hl-${t.kind}">${esc(t.text)}</span>` : esc(t.text))).join('');
}

/**
 * Keep the <pre> behind the textarea in step: text, scroll position; Tab inserts four spaces (undoable).
 * @param {HTMLTextAreaElement} code
 * @param {HTMLElement} pre
 */
export function attachHighlight(code, pre) {
  let frame = 0;
  const sync = () => { pre.scrollTop = code.scrollTop; pre.scrollLeft = code.scrollLeft; };
  // a trailing newline needs a line in the <pre> too, or the last line of the textarea has no partner
  const render = () => { frame = 0; pre.innerHTML = highlight(code.value) + '\n '; sync(); };
  const update = () => { if (!frame) frame = requestAnimationFrame(render); };
  code.addEventListener('input', update);
  code.addEventListener('scroll', sync);
  code.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
    e.preventDefault();
    // execCommand keeps the browser's undo history; setRangeText is the fallback
    if (!document.execCommand?.('insertText', false, '    ')) {
      code.setRangeText('    ', code.selectionStart, code.selectionEnd, 'end');
      update();
    }
  });
  render();
  return { refresh: render };
}
