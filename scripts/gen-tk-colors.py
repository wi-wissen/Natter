# Regenerates packages/core/src/stdlib/tkcolors.js: the colour names Tk knows, with their values.
# Run: xvfb-run -a python3.12 scripts/gen-tk-colors.py
import tkinter
CSS = '''aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen rebeccapurple'''
r = tkinter.Tk()
out = {}
names = []
for line in open('/usr/share/X11/rgb.txt'):
    if line.startswith('!'): continue
    p = line.split(None, 3)
    if len(p) < 4: continue
    names.append(p[3].strip().lower())
# CSS names: the X server of Xvfb knows them although rgb.txt may not list them
names += CSS.split()
for n in names:
    try: rgb = r.winfo_rgb(n)
    except tkinter.TclError: continue
    out[n] = '%02x%02x%02x' % tuple(c >> 8 for c in rgb)
keep = {}
for k, v in out.items():
    g = k.replace('grey', 'gray')
    if g != k:
        assert out.get(g) == v, (k, g)
        continue
    if ' ' not in k and any(' ' in o and o.replace(' ', '') == k for o in out):
        assert out[[o for o in out if ' ' in o and o.replace(' ', '') == k][0]] == v
        continue
    keep[k] = v
s = ','.join(f'{k}:{v}' for k, v in sorted(keep.items()))
print(len(out), len(keep), len(s))
js = """// Colour names that Tk knows (X11 colour database, as used by tkinter on Linux), name:rrggbb. Names are matched without
// regard to case; "grey" is the same as "gray", and names written with spaces also work without them ("light blue",
// "LightBlue"). Generated with scripts/gen-tk-colors.py (rgb.txt and CSS names, checked with tkinter's winfo_rgb under Xvfb).

const TABLE = '%s';

/** @type {Map<string, string>} lower-case name → '#rrggbb' */
export const TK_COLORS = new Map();
for (const e of TABLE.split(',')) {
  const [k, v] = e.split(':');
  TK_COLORS.set(k, '#' + v);
  if (k.includes(' ')) TK_COLORS.set(k.replace(/ /g, ''), '#' + v);
}

/** '#rrggbb' of a Tk colour name, or null. */
export function tkColor(name) {
  return TK_COLORS.get(name.toLowerCase().replace(/grey/g, 'gray')) ?? null;
}
""" % s
open(__import__('os').path.join(__import__('os').path.dirname(__file__), '..', 'packages/core/src/stdlib/tkcolors.js'), 'w').write(js)
