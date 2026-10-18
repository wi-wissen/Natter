"""Redraw the `ui` pack.

python3 make.py gen [sheet ...]   ask the image model for the sheets (scratch dir)
python3 make.py cut               key and cut the sheets, draw the geometric pieces, write the PNGs
python3 make.py json              write pack.json

Sheets come from scripts/asset-gen (gen.py, keyslice.py) with style-emoji.png as reference.
Buttons, panels and bars are drawn here in code (flat shapes, exact sizes so that bar fills fit the frame).
"""
import os, sys, json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
GEN = os.path.join(REPO, 'scripts', 'asset-gen')
sys.path.insert(0, GEN)
STYLE = os.path.join(GEN, 'style-emoji.png')
WORK = os.environ.get('UI_WORK', '/tmp/claude-0/-home-user/82af8643-7fd2-511f-b912-5aee8d74fb4e/scratchpad/assets-work/ui')

BASE = ('in the exact same flat emoji style as the reference image (clear flat shapes, no outlines, very few colours, '
        'rounded friendly forms, at most a hint of a lighter highlight). These are user interface pieces for a children\'s video game. '
        'Background: one flat solid pure magenta colour #FF00FF everywhere, no shadows, no ground, no grid lines, no frames around the cells, '
        'no captions, no labels, no extra objects. Every object is ONE connected shape, the objects are well separated with wide magenta gaps '
        'and do not touch each other. Do not use magenta or pink-purple inside the objects.')

SHEETS = {
    'digits': ('Draw the ten digits 0 1 2 3 4 5 6 7 8 9 as chunky, rounded, bold cartoon number glyphs for a game score display, '
               'all ten in exactly the same design: warm golden yellow fill with a slightly darker orange-yellow lower part, '
               'thick and friendly like bubble numbers, all the same height, upright, no outline, no 3D extrusion. '
               'Layout: 2 rows of 5, first row 0 1 2 3 4, second row 5 6 7 8 9, evenly spaced. ' + BASE),
    'symbols': ('Draw 4 chunky rounded bold cartoon symbols for a game score display, in exactly the design of golden yellow bubble numbers '
                '(warm golden yellow fill, slightly darker orange-yellow lower part, no outline): '
                'a big round dot (full stop), a minus sign, a plus sign, a multiplication sign x. '
                'Layout: one row of 4, in this order: dot, minus, plus, times, evenly spaced, the minus/plus/times about as wide as a digit. ' + BASE),
    'icons_a': ('Draw 12 game icons, each roughly square and the same size. '
                'Row 1: a red heart; a heart that is left half red and right half light grey; a light grey empty heart; a golden yellow five-pointed star. '
                'Row 2: a light grey empty five-pointed star; a round gold coin with a simple embossed ring (no symbol, no letters); '
                'a blue cut gemstone (diamond shape seen from the front); a golden key lying diagonally. '
                'Row 3: a yellow lightning bolt; a round alarm-free wall clock with white face and two hands; a golden trophy cup with two handles on a small base; '
                'a gold medal (round gold disc hanging from a short blue-red ribbon). '
                'Layout: 3 rows of 4, in exactly this reading order. ' + BASE),
    'icons_b': ('Draw 12 game icons, each roughly square and the same size. '
                'Row 1: a silver medal (round silver-grey disc hanging from a short blue-red ribbon); a bronze medal (round bronze-brown disc on the same ribbon); '
                'a red pennant flag on a short pole; a cute round friendly white ghost with two dots for eyes and a small smile (not scary). '
                'Row 2: a bold green tick mark; a bold red X cross; a round blue badge with a white question mark inside; a round orange badge with a white exclamation mark inside. '
                'Row 3: a round blue badge with a white lower-case i inside; a closed grey padlock with a golden body; an open padlock (shackle lifted and swung open) with a golden body; '
                'a grey gear cog wheel. '
                'Layout: 3 rows of 4, in exactly this reading order. ' + BASE),
    'icons_c': ('Draw 12 round game buttons (circular badges), all the same size and the same design: a teal-blue circle with a slightly darker bottom rim, '
                'with a white flat symbol in the middle. Symbols: '
                'Row 1: a music note pair (two eighth notes joined by a beam); the same music notes crossed out by a red diagonal slash; '
                'a loudspeaker with two curved sound waves; a loudspeaker crossed out by a red diagonal slash. '
                'Row 2: a play triangle pointing right; a pause sign (two vertical bars); a stop square; a circular restart arrow. '
                'Row 3: a little house; a plus sign; a minus sign; a white arrow pointing right. '
                'Layout: 3 rows of 4, in exactly this reading order. ' + BASE),
    'controls': ('Draw 8 game controller pieces. '
                 'Row 1: a dark grey cross-shaped direction pad (D-pad) seen from the top with a small light triangle on each of its four arms; '
                 'a round thumb joystick seen from the top (a dark grey round base with a lighter grey round stick knob in the middle); '
                 'a round green action button with a white bold letter A; a round red action button with a white bold letter B. '
                 'Row 2: a white pointing-hand cursor (glove hand pointing up with the index finger); a white mouse arrow pointer with a dark grey border; '
                 'a red aiming crosshair (a ring with four short ticks, all connected, one piece); a round white slider knob with a light grey ring. '
                 'Layout: 2 rows of 4, in exactly this reading order. ' + BASE),
    'bubbles': ('Draw 3 user interface frames. Row 1, left: a white comic speech bubble, a wide rounded rectangle with a small pointed tail at the bottom left, '
                'empty inside; right: a white comic thought bubble, a fluffy cloud shape, with two small circles below it at the bottom left that touch the cloud '
                '(all one connected shape), empty inside. '
                'Row 2 (spanning the width): a red banner ribbon, long and flat with folded swallow-tail ends on both sides, front face plain, no text. '
                'All three are about the same width. ' + BASE),
    'sparkle': ('Draw a short twinkle animation of a golden-yellow four-pointed sparkle star, 3 frames in ONE horizontal row, evenly spaced, '
                'each centred in its cell: frame 1 small and thin, frame 2 medium, frame 3 large with a white centre glint. ' + BASE),
    'confetti': ('Draw one confetti burst: about 20 small colourful flat confetti pieces (little rectangles, circles, squiggly ribbons) in red, blue, yellow, green and orange, '
                 'scattered loosely in a roughly round cloud in the centre of the image. ' + BASE.replace('Every object is ONE connected shape, the objects are well separated with wide magenta gaps and do not touch each other. ', '')),
}

# names per sheet in reading order (None = cut but not used)
NAMES = {
    'digits': [f'ui_{i}' for i in range(10)],
    'symbols': ['ui_dot', 'ui_minus', 'ui_plus', 'ui_x'],
    'icons_a': ['ui_heart_full', 'ui_heart_half', 'ui_heart_empty', 'ui_star_full', 'ui_star_empty', 'ui_coin', 'ui_gem', 'ui_key',
                'ui_lightning', 'ui_clock', 'ui_trophy', 'ui_medal_gold'],
    'icons_b': ['ui_medal_silver', 'ui_medal_bronze', 'ui_flag', 'ui_skull_friendly', 'ui_check', 'ui_cross', 'ui_question', 'ui_exclamation',
                'ui_info', 'ui_lock', 'ui_unlock', 'ui_settings'],
    'icons_c': ['ui_music_on', 'ui_music_off', 'ui_sound_on', 'ui_sound_off', 'ui_play', 'ui_pause', 'ui_stop', 'ui_restart',
                'ui_home', 'ui_plus_button', 'ui_minus_button', 'ui_arrow_right'],
    'controls': ['ui_dpad', 'ui_joystick', 'ui_gamepad_button_a', 'ui_gamepad_button_b', 'ui_cursor_hand', 'ui_cursor_arrow', 'ui_crosshair', 'ui_slider_knob'],
    'bubbles': ['ui_speech_bubble', 'ui_thought_bubble', 'ui_ribbon'],
}


def sheet(name):
    return os.path.join(WORK, name + '.png')


def do_gen(which):
    from gen import gen
    os.makedirs(WORK, exist_ok=True)
    for s in which:
        print(s, gen(os.path.join(WORK, s), SHEETS[s], STYLE), flush=True)


# ---------------------------------------------------------------- cutting

def keyed(name):
    """Key the magenta out, then give every semi-transparent edge pixel the colour of the nearest opaque pixel
    (the despill of keyslice leaves a purple rim on dark objects)."""
    from keyslice import key
    from scipy import ndimage
    rgba = key(Image.open(sheet(name)))
    c = rgba[..., :3].astype(int)
    near = ndimage.binary_dilation(rgba[..., 3] < 250, iterations=4)
    tinted = near & (c[..., 0] - c[..., 1] > 25) & (c[..., 2] - c[..., 1] > 25)
    solid = (rgba[..., 3] >= 250) & ~tinted
    _, (iy, ix) = ndimage.distance_transform_edt(~solid, return_indices=True)
    edge = ~solid & (rgba[..., 3] > 0)
    rgba[edge, :3] = rgba[iy[edge], ix[edge], :3]
    return rgba


def comps(rgba, dil=8, min_area=400):
    """Connected objects of a keyed sheet in reading order: list of RGBA crops."""
    from scipy import ndimage
    alpha = rgba[..., 3] > 128
    lab, n = ndimage.label(ndimage.binary_dilation(alpha, iterations=dil))
    cs = []
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        if (lab[sl] == i).sum() >= min_area:
            cs.append((sl, i))
    cy = [(s[0].start + s[0].stop) / 2 for s, _ in cs]
    h = np.median([s[0].stop - s[0].start for s, _ in cs])
    order = sorted(range(len(cs)), key=lambda k: (round(cy[k] / (h * 0.9)), cs[k][0][1].start))
    out = []
    for k in order:
        sl, i = cs[k]
        crop = rgba[sl].copy()
        crop[..., 3] = np.where(ndimage.binary_dilation(lab[sl] == i, iterations=2), crop[..., 3], 0)
        out.append(tight(Image.fromarray(crop, 'RGBA')))
    return out


def tight(im):
    a = np.asarray(im)[..., 3]
    ys, xs = np.nonzero(a > 6)
    return im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def scaled(im, f):
    return im.resize((max(1, round(im.width * f)), max(1, round(im.height * f))), Image.LANCZOS)


def fit(im, w, h=None):
    h = h or w
    return scaled(im, min(w / im.width, h / im.height))


def padded(im, pad=2):
    c = Image.new('RGBA', (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
    c.paste(im, (pad, pad), im)
    return c


def on_canvas(im, w, h, x=None, y=None):
    """Paste im on a w x h canvas, centred unless x/y (top-left) are given."""
    c = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    x = (w - im.width) // 2 if x is None else x
    y = (h - im.height) // 2 if y is None else y
    c.paste(im, (x, y), im)
    return c


def clean(im):
    """Zero the colour of fully transparent pixels (smaller files, no hidden fringe)."""
    a = np.asarray(im).copy()
    a[a[..., 3] < 3] = 0
    return Image.fromarray(a, 'RGBA')


OUT = {}


def put(name, im):
    OUT[name] = im
    clean(im).save(os.path.join(HERE, name + '.png'), optimize=True)


def expect(name, items, n):
    if len(items) != n:
        raise ValueError(f'{name}: found {len(items)} objects, expected {n}')
    return items

# ---------------------------------------------------------------- drawn pieces

SS = 4  # supersampling


def rrect(d, box, r, fill):
    x0, y0, x1, y1 = box
    d.rounded_rectangle((x0 * SS, y0 * SS, x1 * SS - 1, y1 * SS - 1), r * SS, fill=fill)


def drawn(w, h, steps):
    im = Image.new('RGBA', (w * SS, h * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for box, r, fill in steps:
        rrect(d, box, r, fill)
    return im.resize((w, h), Image.LANCZOS)


def lighter(c, k):
    return tuple(min(255, round(v + (255 - v) * k)) for v in c[:3]) + tuple(c[3:])


BUTTONS = {  # face, lip
    'blue': ((74, 144, 217), (47, 104, 170)),
    'green': ((91, 184, 92), (60, 135, 64)),
    'red': ((226, 72, 62), (172, 45, 40)),
    'grey': ((172, 178, 186), (124, 131, 140)),
}


def button(face, lip, pressed=False):
    w, h, r = 160, 56, 18
    top = 5 if pressed else 0
    lip_h = 2 if pressed else 7
    return drawn(w, h, [
        ((0, top, w, h), r, lip),
        ((0, top, w, h - lip_h), r, face),
        ((10, top + 5, w - 10, top + 14), 5, lighter(face, 0.22)),
    ])


def panel(face, rim, inner):
    w, h = 256, 192
    return drawn(w, h, [
        ((0, 0, w, h), 22, rim),
        ((0, 0, w, h - 7), 22, face),
        ((10, 10, w - 10, h - 17), 14, inner),
    ])


BAR_FILLS = {'green': (91, 190, 92), 'red': (229, 72, 62), 'blue': (74, 150, 222)}


def bar_frame():
    return drawn(192, 24, [((0, 0, 192, 24), 12, (61, 66, 79)), ((4, 4, 188, 20), 8, (35, 38, 47))])


def bar_fill(c):
    return drawn(184, 16, [((0, 0, 184, 16), 8, c), ((5, 3, 179, 7), 2, lighter(c, 0.35))])

# ---------------------------------------------------------------- build

def build():
    # digits: one scale for all ten, each on the same 48x64 canvas, bottoms on one line
    ds = expect('digits', comps(keyed('digits'), dil=2, min_area=3000), 10)
    f = min(60 / max(d.height for d in ds), 44 / max(d.width for d in ds))
    for n, d in zip(NAMES['digits'], ds):
        d = scaled(d, f)
        put(n, on_canvas(d, 48, 64, y=62 - d.height))
    digit_h = round(max(d.height for d in ds) * f)
    mid = 62 - digit_h // 2  # vertical middle of the digits
    dot, minus, plus, times = expect('symbols', comps(keyed('symbols'), dil=3, min_area=2000), 4)
    g = 36 / plus.height
    for n, s in (('ui_minus', minus), ('ui_plus', plus), ('ui_x', times)):
        s = scaled(s, g)
        put(n, on_canvas(s, 48, 64, y=mid - s.height // 2))
    dot = fit(dot, 15)
    put('ui_dot', on_canvas(dot, 24, 64, y=62 - dot.height))
    colon = on_canvas(dot, 24, 64, y=mid + 5)
    colon.paste(dot, ((24 - dot.width) // 2, mid - 5 - dot.height), dot)
    put('ui_colon', colon)

    # icons ~48 px, each fitted on its own
    for s in ('icons_a', 'icons_b', 'icons_c'):
        for n, im in zip(NAMES[s], expect(s, comps(keyed(s)), 12)):
            put(n, padded(fit(im, 48)))
    arrows()

    sizes = {'ui_dpad': 156, 'ui_joystick': 96, 'ui_gamepad_button_a': 64, 'ui_gamepad_button_b': 64,
             'ui_cursor_hand': 40, 'ui_cursor_arrow': 32, 'ui_crosshair': 48, 'ui_slider_knob': 32}
    for n, im in zip(NAMES['controls'], expect('controls', comps(keyed('controls')), 8)):
        put(n, padded(fit(im, sizes[n])))

    sp, th, rb = expect('bubbles', comps(keyed('bubbles'), dil=16), 3)
    put('ui_speech_bubble', padded(fit(sp, 188, 124)))
    put('ui_thought_bubble', padded(fit(th, 188, 124)))
    put('ui_ribbon', padded(fit(rb, 252, 60)))

    fr = expect('sparkle', comps(keyed('sparkle'), dil=4, min_area=300), 3)
    f = 48 / max(max(i.size) for i in fr)
    for k, im in enumerate(fr, 1):
        put(f'ui_sparkle_{k}', on_canvas(scaled(im, f), 52, 52))

    put('ui_confetti', padded(fit(tight(Image.fromarray(keyed('confetti'), 'RGBA')), 124)))

    for c, (face, lip) in BUTTONS.items():
        put(f'ui_button_{c}', button(face, lip))
    for c in ('blue', 'green'):
        put(f'ui_button_{c}_pressed', button(*BUTTONS[c], pressed=True))
    put('ui_panel', panel((255, 248, 234), (222, 204, 172), (255, 252, 244)))
    put('ui_panel_dark', panel((58, 66, 86), (36, 41, 56), (47, 54, 72)))
    put('ui_bar_frame', bar_frame())
    for c, col in BAR_FILLS.items():
        put(f'ui_bar_{c}', bar_fill(col))
    print(len(OUT), 'images')


def arrows():
    """ui_arrow_up/down/left: the white arrow of ui_arrow_right turned on the same badge."""
    src = np.asarray(OUT['ui_arrow_right']).astype(np.float32)
    rgb, a = src[..., :3], src[..., 3]
    from scipy import ndimage
    inner = ndimage.binary_erosion(a > 250, iterations=2)
    mn = rgb.min(-1)
    white = inner & (mn > 120)
    face = np.median(rgb[inner & ~ndimage.binary_dilation(white, iterations=3) & (mn < 120)], axis=0)
    arrow_a = np.clip((mn - face.min()) / (255 - face.min()), 0, 1) * inner
    region = ndimage.binary_dilation(arrow_a > 0.02, iterations=1) & inner
    base = src.copy()
    base[region, :3] = face
    ys, xs = np.nonzero(arrow_a > 0.5)
    cx, cy = (xs.min() + xs.max() + 1) / 2, (ys.min() + ys.max() + 1) / 2
    layer = Image.fromarray(np.dstack([np.full_like(mn, 255)] * 3 + [arrow_a * 255]).astype(np.uint8), 'RGBA')
    for n, ang in (('ui_arrow_up', 90), ('ui_arrow_left', 180), ('ui_arrow_down', 270)):
        rot = layer.rotate(ang, resample=Image.BICUBIC, center=(cx, cy))
        im = Image.fromarray(base.astype(np.uint8), 'RGBA')
        im.alpha_composite(rot)
        im.putalpha(Image.fromarray(a.astype(np.uint8)))
        put(n, im)

# ---------------------------------------------------------------- pack.json

DESC = {}


def write_json():
    pass


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'gen':
        do_gen(sys.argv[2:] or list(SHEETS))
    elif cmd == 'cut':
        build()
    elif cmd == 'json':
        write_json()
    else:
        print(__doc__)
