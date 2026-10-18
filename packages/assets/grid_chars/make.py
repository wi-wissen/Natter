"""Make the `grid_chars` pack: top-down characters for grid games (48x48 canvas each).

python3 make.py gen [sheet ...]   draw sheets with the image model into the work folder
python3 make.py cut               key and cut the sheets into the pack folder
python3 make.py json              write pack.json
python3 make.py sheet             contact sheets (dark and light, 1x and 2x) for checking

Method
- Each player character is first drawn once as a model sheet (front, back, side). That sheet is the reference image
  for all its other sheets, so the character looks the same in all 17 images.
- down/up walks: the model draws step (frame 1) and standing (frame 2); frame 3 is frame 1 mirrored, so the feet
  really alternate. left is the mirrored right walk.
- Enemies: bug is drawn straight from above and rotated; the others draw one step and get the second by mirroring
  where the view is symmetric (front/back), side views are drawn twice by the model.
- All frames of one character share one scale and one canvas; the feet (bottom of the standing pose) sit on the same
  line and the body is centred, so swapping frames does not jump.
"""
import json, os, sys
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'asset-gen'))
from gen import gen  # noqa: E402
import keyslice  # noqa: E402
import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

WORK = os.environ.get('ASSET_WORK', os.path.join(HERE, '.work'))
STYLE = os.path.join(ROOT, 'scripts', 'asset-gen', 'style-emoji.png')
CANVAS = 48

BG = ('Background: one flat solid pure magenta colour #FF00FF everywhere, no shadows, no drop shadow under the feet, no ground, no floor, '
      'no text, no letters, no numbers, no grid lines, no frames, no outlines. ')
STYLE_TXT = ('Flat emoji style: clear flat shapes, no outlines, few colours, rounded friendly forms, '
             'no gradients, no hard shading. Every figure is completely separate from the others with wide magenta gaps. ')
ORIG = 'Original design; it must not resemble any existing video game, film or brand character. '
VIEW = ('Chibi proportions for a top-down grid game: a big head and a small short body. Camera slightly from above '
        '(high three-quarter view like the walking sprites of classic top-down adventure games): we look a little down '
        'onto the character and see the top of the head and the shoulders. ')

CHARS = {
    'robo': 'a cute small cube-shaped robot: a blue-grey rounded cube body that is also its head, one short antenna with an orange ball '
            'on top, two big round black eyes with white highlights on a dark screen face, small orange round cheeks, '
            'two short stubby grey arms with orange hands, two short stubby legs with orange feet',
    'fuchs': 'a little orange fox: orange fur, a cream white face front and chest, big pointed ears with dark tips, black dot eyes, '
             'a small black nose, a bushy orange tail with a white tip, short dark brown legs, standing upright on two legs',
    'maus': 'a round little grey mouse: a round light grey body, very big round pink ears, black dot eyes, a small pink nose, '
            'a pink belly, small pink paws and feet, a thin long pink tail, standing upright on two legs',
    'pinguin': 'a chubby little penguin: round black body with a white belly and white face, black dot eyes, a small orange beak, '
               'short black flipper wings, orange flat feet, standing upright',
}


def char_prompt(c, body):
    return (f'Sprite sheet for a top-down grid game. The character is {CHARS[c]}. ' + VIEW + body + STYLE_TXT + ORIG + BG)


def ref_prompt(c, body):
    return ('Use EXACTLY the same character as in the reference image: same colours, same shapes, same proportions, same style. '
            f'It is {CHARS[c]}. ' + VIEW + body + STYLE_TXT + BG)


MODEL = ('Model sheet: exactly 3 figures of the same character in ONE horizontal row, evenly spaced, same size, all standing still '
         'with the feet on the same height: 1 front view facing the viewer, 2 back view seen from behind (no face visible), '
         '3 side view in profile facing to the RIGHT. ')
DOWN = ('Walk animation towards the viewer: exactly 3 figures in ONE horizontal row, evenly spaced, same size, feet on the same height, '
        'ALL THREE in FRONT view facing the viewer: frame 1 mid-step with its LEFT foot (on our right side) clearly lifted and forward and '
        'the body leaning a little, arms swinging; frame 2 standing still, both feet together, symmetric; '
        'frame 3 mid-step with the other foot lifted. ')
UP = ('Walk animation away from the viewer: exactly 3 figures in ONE horizontal row, evenly spaced, same size, feet on the same height, '
      'ALL THREE in BACK view seen from behind (no face visible): frame 1 mid-step with one foot clearly lifted and the body leaning a little; '
      'frame 2 standing still, both feet together, symmetric; frame 3 mid-step with the other foot lifted. ')
SIDE = ('Walk animation to the right: exactly 3 figures in ONE horizontal row, evenly spaced, same size, feet on the same height, '
        'ALL THREE in pure SIDE VIEW (profile) facing and walking to the RIGHT: frame 1 a big step with the front leg forward and the back leg '
        'back; frame 2 standing still with the legs together; frame 3 a big step with the OTHER leg forward (legs swapped compared with frame 1). ')
EXTRA = ('Exactly 4 figures in ONE horizontal row, evenly spaced, same size, ALL in FRONT view facing the viewer, feet on the same height: '
         '1 standing still, relaxed, eyes open; 2 EXACTLY the same as figure 1 but with the eyes closed (blinking) and breathing out '
         '(body a tiny bit lower and wider); 3 very happy, cheering with both arms/paws raised high, big smile; '
         '4 dizzy: spiral eyes, a wobbly mouth, three small yellow stars circling close around the top of its head. ')
EXTRA_PENGUIN = EXTRA.replace('arms/paws', 'flipper wings')
# redraws where the first try was weak (sheet name -> prompt body); used instead of the generic bodies above
WADDLE_DOWN = ('Waddle walk towards the viewer: exactly 3 figures in ONE horizontal row, evenly spaced, same size, ALL THREE in FRONT view facing the viewer: '
               'frame 1 the whole body tilted about 12 degrees to OUR LEFT, the foot on our right side lifted a little, flippers out; '
               'frame 2 standing upright, both feet on the ground, symmetric; '
               'frame 3 the whole body tilted about 12 degrees to OUR RIGHT, the foot on our left side lifted a little. Feet stay small and flat. ')
WADDLE_UP = WADDLE_DOWN.replace('towards the viewer', 'away from the viewer').replace(
    'FRONT view facing the viewer', 'BACK view seen from behind (no face, no belly visible)')
SIDE_TAIL = ('Walk animation to the right: exactly 3 figures in ONE horizontal row, evenly spaced, same size, feet on the same height, '
             'ALL THREE in pure SIDE VIEW (profile) facing and walking to the RIGHT: frame 1 a big step, the front leg far forward, the back leg far '
             'back, the tail swung HIGH up; frame 2 standing still with the legs together, tail level; frame 3 the legs crossed under the body '
             'mid-stride (clearly different from frame 1), the tail hanging LOW down. ')
SIDE_WADDLE = ('Waddle walk to the right: exactly 3 figures in ONE horizontal row, evenly spaced, same size, ALL THREE in pure SIDE VIEW (profile) '
               'facing to the RIGHT: frame 1 the body tilted FORWARD (to the right) about 12 degrees, the back foot lifted behind; '
               'frame 2 standing upright, both feet on the ground; frame 3 the body tilted BACKWARD (to the left) about 12 degrees, '
               'the front foot lifted in front. Flipper wings slightly out. ')
EXTRA_ROW = ('Exactly 4 figures, no more and no less, in ONE single horizontal row, evenly spaced, same size, ALL in FRONT view facing the viewer, '
             'feet on the same height: 1 standing still, relaxed, eyes open; 2 EXACTLY the same as figure 1 but with the eyes closed (blinking); '
             '3 very happy, cheering with both {arms} raised HIGH above the head, big open smile; '
             '4 dizzy, still facing the viewer: spiral eyes, a wobbly mouth, three small yellow stars circling close around the top of its head. ')
REDO = {
    'pinguin_down': WADDLE_DOWN, 'pinguin_up': WADDLE_UP, 'pinguin_side': SIDE_WADDLE, 'fuchs_side': SIDE_TAIL,
    'maus_extra': EXTRA_ROW.format(arms='paws'), 'pinguin_extra': EXTRA_ROW.format(arms='flipper wings'),
    'maus_extra': ('Exactly 4 figures in a grid of 2 rows and 2 columns with very wide magenta gaps, none touching, same size, ALL in FRONT view '
                   'facing the viewer, reading order left to right, top row first: 1 standing still, relaxed, eyes open; 2 EXACTLY the same as '
                   'figure 1 but with the eyes closed (blinking); 3 very happy, cheering with both paws raised HIGH above the head, big open smile; '
                   '4 dizzy, still facing the viewer: spiral eyes, a wobbly mouth, three small yellow stars circling close around the top of its head. '),
}
# robo: happy and dizzy come from a second extra sheet; maus: idle and blink from a first try that missed the happy pose
EXTRA_SHEETS = {'robo_extra2': ('robo', EXTRA_ROW.format(arms='arms')), 'maus_extra_a': ('maus', EXTRA)}

SHEETS = {}
for _c in CHARS:
    SHEETS[f'{_c}_model'] = dict(ref=STYLE, prompt=char_prompt(_c, MODEL))
    for _k, _b in (('down', DOWN), ('up', UP), ('side', SIDE), ('extra', EXTRA_PENGUIN if _c == 'pinguin' else EXTRA)):
        SHEETS[f'{_c}_{_k}'] = dict(ref=f'{_c}_model', prompt=ref_prompt(_c, REDO.get(f'{_c}_{_k}', _b)))
for _s, (_c, _b) in EXTRA_SHEETS.items():
    SHEETS[_s] = dict(ref=f'{_c}_model', prompt=ref_prompt(_c, _b))


def unshadow(img):
    """The model often adds a dark magenta drop shadow under the feet: turn every magenta-hued pixel into pure key colour."""
    a = np.asarray(img.convert('RGB')).astype(np.int32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    lo, hi = np.minimum(r, b), np.maximum(r, b)
    m = (lo > 80) & (g < 0.35 * lo) & (np.abs(r - b) < 0.3 * hi)
    a[m] = (255, 0, 255)
    return Image.fromarray(a.astype(np.uint8), 'RGB')


def key(path):
    return keyslice.key(unshadow(Image.open(path)))


def clean_ref(s):
    """A model sheet without shadows, used as the reference for the other sheets of that character."""
    out = os.path.join(WORK, s + '_clean.png')
    rgba = Image.fromarray(key(sheet_path(s)), 'RGBA')
    bg = Image.new('RGBA', rgba.size, (255, 0, 255, 255))
    bg.alpha_composite(rgba)
    bg.convert('RGB').save(out)
    return out

FOES = {
    'bug': ('Exactly 2 figures in ONE horizontal row with a wide gap, same size: a round shiny beetle for a top-down grid game, seen EXACTLY from '
            'straight above (top view), its HEAD POINTING UP: a round glossy teal-green shell with a thin dark line down the middle and one small '
            'white shine spot, a small dark blue head with two short curved antennae, six thin dark legs, three on each side. '
            'Mid-step, NOT symmetric: 1 all three legs on the LEFT side angled steeply FORWARD (towards the head), all three legs on the RIGHT '
            'side angled steeply BACKWARD (towards the tail); 2 the opposite: right legs forward, left legs backward. '),
    'wisp': ('Exactly 4 figures in ONE horizontal row, evenly spaced, same size: a friendly-spooky little floating flame ghost for a top-down grid game: '
             'a soft light-blue flame-shaped body with a lighter cyan centre, round at the bottom, flickering flame tip on top, two big friendly '
             'dark oval eyes, floating, no legs, no arms. 1 front view facing the viewer, the flame tip curling to OUR LEFT; '
             '2 back view seen from behind (no eyes visible), the flame tip curling to our left; '
             '3 side view moving to the RIGHT, eyes looking right, the flame tip streaming back to the left; '
             '4 the same side view with the flame tip flickering in a different shape (shorter, curled up). '),
    'crab': ('Exactly 4 figures in ONE horizontal row, evenly spaced, same size: a small cute red crab for a top-down grid game, seen slightly from '
             'above: a round red shell, two black eyes on short stalks, two big red claws, four thin legs on each side. '
             '1 front view facing the viewer, the claw on our left raised high and the claw on our right low, the legs on our left lifted; '
             '2 back view seen from behind (eye stalks seen from behind, no face), the claw on our left raised, the legs on our left lifted; '
             '3 scuttling sideways to the RIGHT, still facing the viewer, the body leaning to the right, eyes looking right, legs on the right stretched out; '
             '4 the same sideways scuttle to the right with the legs in the other phase (legs on the right pulled in, legs on the left stretched). '),
    'golem': ('Exactly 4 figures in ONE horizontal row, evenly spaced, same size: a small friendly stone golem for a top-down grid game, chibi: '
              'a big rounded grey boulder body, a smaller round stone head with two glowing yellow eyes, a few green moss patches, '
              'short thick stone arms and stubby stone legs, slow and heavy. '
              '1 front view facing the viewer, mid-step: the leg on our right lifted, the body leaning to our left; '
              '2 back view seen from behind (no eyes visible), mid-step: the leg on our right lifted, the body leaning to our left; '
              '3 side view in profile walking to the RIGHT, a heavy step with the front leg forward; '
              '4 the same side view with the OTHER leg forward and the arms swung the other way. '),
}
for _f, _b in FOES.items():
    SHEETS[_f] = dict(ref=STYLE, prompt='Sprite sheet for a top-down grid game. ' + _b + 'Cute, round, readable at small size. '
                      + STYLE_TXT + ORIG + BG)


def sheet_path(s):
    return os.path.join(WORK, s + '.png')


def ref_path(r):
    return r if os.path.isabs(r) else os.path.join(WORK, r + '_clean.png')


def do_gen(s):
    os.makedirs(WORK, exist_ok=True)
    spec = SHEETS[s]
    return s, gen(os.path.join(WORK, s), spec['prompt'], ref_path(spec['ref']))


# ---- cutting ----
from scipy import ndimage  # noqa: E402

H = 400  # working height of a standing figure


def bleed(rgba):
    """Edge pixels take the colour of the nearest solid pixel (no magenta fringe, clean downscaling)."""
    a = rgba.copy()
    solid = ndimage.binary_erosion(a[..., 3] > 250, iterations=1)
    if solid.any():
        iy, ix = ndimage.distance_transform_edt(~solid, return_distances=False, return_indices=True)
        a[..., :3] = a[iy, ix, :3]
    a[..., :3][a[..., 3] == 0] = 0
    return a


_cache = {}


def split(rgba, n):
    """Figures in reading order. Big parts are figures; small parts (stars, a loose tail tip) join the nearest figure.
    Figures that nearly touch are separated by growing the mask less."""
    alpha = rgba[..., 3] > 128
    for _ in range(n):  # figures that touch: cut the widest blob at its thinnest column
        lab, k = ndimage.label(alpha)
        area = ndimage.sum(alpha, lab, range(1, k + 1))
        sl = [b for i, b in enumerate(ndimage.find_objects(lab)) if area[i] >= 0.2 * area.max()]
        if len(sl) >= n:
            break
        widths = [b[1].stop - b[1].start for b in sl]
        if max(widths) < 1.6 * np.median(widths) and len(sl) > 1:
            break
        b = sl[int(np.argmax(widths))]
        cols = alpha[b].sum(0)
        w = len(cols)
        x = b[1].start + int(w * 0.3) + int(np.argmin(cols[int(w * 0.3): int(w * 0.7)]))
        alpha[:, x - 1: x + 2] = False
        rgba = rgba.copy()
        rgba[:, x - 1: x + 2, 3] = 0
    for grow in (6, 3, 1, 0):
        lab, k = ndimage.label(ndimage.binary_dilation(alpha, iterations=grow) if grow else alpha)
        sl = ndimage.find_objects(lab)
        area = ndimage.sum(np.ones_like(lab), lab, range(1, k + 1))
        big = [i for i in range(k) if area[i] >= 0.2 * area.max()]
        if len(big) >= n:
            break
    owner = np.zeros(k + 1, int)
    cen = [((sl[i][0].start + sl[i][0].stop) / 2, (sl[i][1].start + sl[i][1].stop) / 2) for i in range(k)]
    for i in range(k):
        if i in big:
            owner[i + 1] = i + 1
        else:  # nearest big figure by box distance
            def dist(j):
                y0, y1, x0, x1 = sl[j][0].start, sl[j][0].stop, sl[j][1].start, sl[j][1].stop
                cy, cx = cen[i]
                return max(y0 - cy, 0, cy - y1) + max(x0 - cx, 0, cx - x1)
            owner[i + 1] = min(big, key=dist) + 1
    lab = owner[lab]
    boxes = [(ndimage.find_objects(lab)[j], j + 1) for j in big]
    cy = [(b[0].start + b[0].stop) / 2 for b, _ in boxes]
    h = np.median([b[0].stop - b[0].start for b, _ in boxes])
    order = sorted(range(len(boxes)), key=lambda q: (round(cy[q] / (h * 0.8)), boxes[q][0][1].start))
    out = []
    for q in order:
        b, j = boxes[q]
        crop = rgba[b].copy()
        crop[..., 3] = np.where(lab[b] == j, crop[..., 3], 0)
        out.append(Image.fromarray(crop, 'RGBA'))
    return out


def figs(sheet, n, ref=0):
    """The n figures of a sheet in reading order, cropped, scaled so that figure `ref` (a standing pose) is H high."""
    if sheet in _cache:
        return _cache[sheet]
    fr = split(bleed(key(sheet_path(sheet))), n)
    if len(fr) != n:
        raise ValueError(f'{sheet}: found {len(fr)} figures, expected {n}')
    fr = [f.crop(f.getbbox()) for f in fr]
    k = H / fr[ref].height
    _cache[sheet] = [f.resize((round(f.width * k), round(f.height * k)), Image.LANCZOS) for f in fr]
    return _cache[sheet]


def mirror(im):
    return im.transpose(Image.FLIP_LEFT_RIGHT)


def tilt(im, deg):
    """Rotate around the bottom centre (positive = counter-clockwise), for waddling."""
    w, h = im.size
    c = Image.new('RGBA', (w * 2, h * 2), (0, 0, 0, 0))
    c.paste(im, (w // 2, h), im)  # bottom centre of the figure at the canvas centre
    c = c.rotate(deg, resample=Image.BICUBIC, center=(w, h * 2 - 1))
    return c.crop(c.getbbox())


def feet_y(im):
    """The feet line of a figure: the lowest row that is at least 20 % as wide as the figure
    (a thin tail hanging below the feet does not count)."""
    a = np.asarray(im)[..., 3] > 128
    w = a.sum(1)
    rows = np.where(w >= 0.2 * w.max())[0]
    return rows.max() + 1


def anchor_x(im, ay, ref_h):
    """Horizontal anchor: centre of mass of the head part (the upper part of a standing-high box above the feet)."""
    a = np.asarray(im)[..., 3].astype(np.float32)
    top = max(0, int(ay - ref_h))
    part = a[top: top + int(ref_h * 0.55)]
    if part.sum() == 0:
        part = a
    return (part.sum(0) * np.arange(a.shape[1])).sum() / part.sum()


def place(frames, ref_h, align=None, centre=False, margin=1):
    """All frames of one character on one CANVAS x CANVAS canvas at one scale, head centred.
    align[k] None: the feet of frame k sit on the common feet line; an index j: frame k's top is level with frame j's top
    (step frames: the head stays put while a foot is lifted). centre=True: centred both ways (figures seen from above)."""
    align = align or [None] * len(frames)
    ext = []
    for k, im in enumerate(frames):
        if centre:
            ax, ay = im.width / 2, im.height / 2
        else:
            j = align[k]
            ay = feet_y(im) if j is None else feet_y(frames[j])
            ax = anchor_x(im, ay, ref_h)
        ext.append((ax, im.width - ax, ay, im.height - ay))
    half = CANVAS / 2 - margin
    s = min(half / max(l, r) for l, r, t, b in ext)
    if centre:
        s = min(s, min(half / max(t, b) for l, r, t, b in ext))
        ly = CANVAS / 2
    else:
        up, down = max(t for l, r, t, b in ext), max(b for l, r, t, b in ext)
        s = min(s, (CANVAS - 2 * margin) / (up + down))
        ly = margin + up * s
    out = []
    for im, (l, r, t, b) in zip(frames, ext):
        w, h = max(1, round(im.width * s)), max(1, round(im.height * s))
        im2 = im.resize((w, h), Image.LANCZOS)
        c = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
        c.paste(im2, (round(CANVAS / 2 - l * s), round(ly - t * s)), im2)
        a = np.asarray(c).copy()
        a[..., :3][a[..., 3] == 0] = 0
        out.append(Image.fromarray(a, 'RGBA'))
    return out, s


DIRS = ['down', 'up', 'left', 'right']


def player(c):
    """The 17 images of a player character as {name: image at working scale}."""
    d = figs(f'{c}_down', 3, 1)
    u = figs(f'{c}_up', 3, 1)
    r = figs(f'{c}_side', 3, 1)
    if c == 'robo':
        e = figs('robo_extra', 4)
        e = e[:2] + figs('robo_extra2', 3)[1:]  # cheering with raised arms, dizzy with bright yellow spiral eyes
    elif c == 'maus':
        e = figs('maus_extra_a', 3)[:2] + figs('maus_extra', 4)[2:]
    else:
        e = figs(f'{c}_extra', 4)
    down, up, right = [d[0], d[1], mirror(d[0])], [u[0], u[1], mirror(u[0])], list(r)
    if c == 'pinguin':  # the model draws no waddle: tilt the body around the feet
        down = [tilt(d[1], 9), d[1], tilt(mirror(d[1]), -9)]
        up = [tilt(u[1], 9), u[1], tilt(mirror(u[1]), -9)]  # a lifted foot seen from behind looks odd
        right = [tilt(r[0], -9), r[1], tilt(r[2], 9)]
    left = [mirror(im) for im in right]
    out = {}
    for name, fr in (('down', down), ('up', up), ('left', left), ('right', right)):
        for i, im in enumerate(fr, 1):
            out[f'{c}_{name}_{i}'] = im
    out[f'{c}_idle_1'], out[f'{c}_idle_2'], out[f'{c}_happy'], out[f'{c}_dizzy'] = e
    keys = list(out)
    align = [None] * len(keys)
    if c != 'pinguin':  # step frames keep the head of the standing frame (the penguin's tilted frames stand on their feet)
        for k, n in enumerate(keys):
            if n[-2:] in ('_1', '_3') and '_idle_' not in n:
                align[k] = keys.index(n[:-2] + '_2')
    return out, align


LEG = (82, 98, 140)


def legs_step(im, shift):
    """Bug: move the legs on the left side up and those on the right side down by `shift` px (and the other way round)."""
    a = np.asarray(im).copy()
    h, w = a.shape[:2]
    lum = a[..., :3].astype(np.int32).sum(2)
    body = (a[..., 3] > 128) & (lum > 200)  # shell and head are lighter than the dark legs
    body = ndimage.binary_fill_holes(ndimage.binary_closing(body, iterations=6))
    lab, n = ndimage.label(body)
    if n > 1:  # keep the biggest light part (the shell)
        sizes = ndimage.sum(body, lab, range(1, n + 1))
        body = lab == (1 + int(np.argmax(sizes)))
    xs = np.where(body.any(0))[0]
    x0, x1 = xs.min(), xs.max()
    ys = np.where(body.any(1))[0]
    legs = (a[..., 3] > 0) & ~ndimage.binary_dilation(body, iterations=2)
    legs &= (np.arange(h)[:, None] > ys.min() + (ys.max() - ys.min()) * 0.12)  # not the antennae
    rest = a.copy()
    rest[legs] = 0
    out = np.zeros_like(a)
    for side, dy in ((np.arange(w)[None, :] < (x0 + x1) / 2, -shift), (np.arange(w)[None, :] >= (x0 + x1) / 2, shift)):
        m = legs & side
        part = np.where(m[..., None], a, 0)
        part = np.roll(part, dy, axis=0)
        out = np.where(part[..., 3:4] > 0, part, out)
    out[..., :3][out[..., 3] > 0] = LEG  # the model's near-black legs vanish on dark backgrounds
    res = Image.fromarray(out, 'RGBA')
    res.alpha_composite(Image.fromarray(rest, 'RGBA'))
    return res


def sway(im, deg=5):
    return [tilt(im, deg), tilt(mirror(im), -deg)]


def foe(f):
    if f == 'bug':
        b = figs('bug', 2)[0]
        pad = Image.new('RGBA', (b.width, b.height + 60), (0, 0, 0, 0))
        pad.paste(b, (0, 30), b)
        a, bb = legs_step(pad, 22), legs_step(pad, -22)
        rot = {'up': 0, 'left': 90, 'down': 180, 'right': -90}
        return {f'bug_{d}_{i}': im.rotate(rot[d], expand=True) for d in DIRS for i, im in ((1, a), (2, bb))}
    s = figs(f, 4)
    front, back, r1, r2 = s
    fr = {'down': [front, mirror(front)], 'up': [back, mirror(back)], 'right': [r1, r2], 'left': [mirror(r1), mirror(r2)]}
    if f in SWAY_BACK:
        fr['up'] = sway(back)
    return {f'{f}_{d}_{i}': im for d in DIRS for i, im in enumerate(fr[d], 1)}


SWAY_BACK = {'crab', 'golem'}  # their back views are symmetric: a mirror would not move, so they sway


def names():
    out = []
    for c in CHARS:
        out.append([f'{c}_{d}_{i}' for d in DIRS for i in (1, 2, 3)] + [f'{c}_idle_1', f'{c}_idle_2', f'{c}_happy', f'{c}_dizzy'])
    out.append([f'{f}_{d}_{i}' for f in ('bug', 'wisp') for d in DIRS for i in (1, 2)])
    out.append([f'{f}_{d}_{i}' for f in ('crab', 'golem') for d in DIRS for i in (1, 2)])
    return out


def contact():
    rows = names()
    cols = max(len(r) for r in rows)
    for zoom in (1, 2):
        cell = CANVAS * zoom + 6
        for tag, col, line in (('dark', (40, 42, 54, 255), (60, 62, 76, 255)), ('light', (245, 245, 240, 255), (225, 225, 218, 255))):
            c = Image.new('RGBA', (cols * cell, len(rows) * cell), col)
            from PIL import ImageDraw
            d = ImageDraw.Draw(c)
            for y, r in enumerate(rows):
                for x, n in enumerate(r):
                    d.rectangle((x * cell + 2, y * cell + 2, x * cell + 3 + CANVAS * zoom, y * cell + 3 + CANVAS * zoom), outline=line)
                    im = Image.open(os.path.join(HERE, n + '.png')).convert('RGBA')
                    im = im.resize((im.width * zoom, im.height * zoom), Image.NEAREST)
                    c.alpha_composite(im, (x * cell + 3, y * cell + 3))
            c.save(os.path.join(WORK, f'contact-{tag}-{zoom}x.png'))


def save(im, name):
    im.save(os.path.join(HERE, name + '.png'), optimize=True)


def cut():
    for c in CHARS:
        imgs, align = player(c)
        placed, s = place(list(imgs.values()), H, align)
        for n, im in zip(imgs, placed):
            save(im, n)
        print(c, 'scale', round(s * H, 1), 'px standing height')
    for f in FOES:
        imgs = foe(f)
        if f == 'bug':
            placed, s = place(list(imgs.values()), 0, centre=True, margin=2)
        else:
            placed, s = place(list(imgs.values()), max(i.height for i in imgs.values()))
        for n, im in zip(imgs, placed):
            save(im, n)
        print(f, 'ok')


if __name__ == '__main__':
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == 'gen':
        for s in {SHEETS[s]['ref'] for s in (args or list(SHEETS))}:
            if not os.path.isabs(s):
                clean_ref(s)  # once, before the parallel requests read it
        with ThreadPoolExecutor(8) as ex:
            for s, r in ex.map(do_gen, args or list(SHEETS)):
                print(s, r)
    elif cmd == 'cut':
        cut()
    elif cmd == 'sheet':
        contact()
