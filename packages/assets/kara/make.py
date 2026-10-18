"""Redraw the `kara` pack (Kara the ladybug on her meadow, plus the turtle in the same style).

python3 make.py gen [sheet ...]   ask the image model for the sheets (into WORK)
python3 make.py cut               cut the sheets into the PNGs of this folder

Kara is drawn once facing right; up/left/down are exact rotations of that image, so all four match.
`kara_berry` and `kara_mushroom_berry` are composed from the single images (thing over a berry).
"""
import os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'asset-gen'))
WORK = os.environ.get('KARA_WORK', '/tmp/kara-work')
REF = os.path.join(ROOT, 'scripts', 'asset-gen', 'style-emoji.png')
CELL = 64

BASE = ('Use the exact same flat emoji style as the reference image (flat shapes, no outlines, very few colours, rounded friendly forms; '
        'the red ladybug and the blueberries in the reference show the look). '
        'Background: one flat solid pure magenta colour #FF00FF everywhere, no shadows, no ground, no text, no grid lines, no frames. '
        'Every object is separate with a lot of empty magenta space around it; objects never touch or overlap. ')

SHEETS = {
    # name: (prompt, names in reading order, long side)
    'kara': (BASE + 'Draw exactly 2 objects side by side in one row, both seen exactly from straight above (top view), same size: '
             '1) a cute round red ladybug with black dots, a black head and two short black antennae, its HEAD POINTING TO THE RIGHT, '
             'six short black legs sticking out symmetrically, two small white eyes on the black head; '
             '2) the same ladybug, head pointing to the right, dazed after bumping its head: eyes are little dizzy spirals, '
             'with three small yellow stars circling above its head. Nothing else.',
             ['kara', 'kara_bump'], 60),
    'things': (BASE + 'Draw exactly 6 different objects in a grid of 3 columns and 2 rows, reading order left to right, top row first, '
               'all seen from above at a slight angle like game tiles of a meadow, all about the same size: '
               '1) a cluster of three blueberries (dark blue with a small star-shaped crown, one small green leaf); '
               '2) a round leafy tree seen from above: a big round fluffy green crown made of a few round bumps, a tiny bit of brown trunk visible; '
               '3) a toadstool mushroom with a smooth brown-orange cap with a few light beige spots, short beige stem; '
               '4) a small decorative meadow flower: five white petals and a yellow centre with two green leaves; '
               '5) a rounded grey boulder rock with one lighter facet; '
               '6) a small tuft of light green grass blades. ',
               # the model drew 8 (two mushrooms, two tufts): the plain cap is used, the spotted one is too close to the classic toadstool
               ['kara_blueberry', 'kara_tree', 'spotted', 'kara_mushroom', 'kara_flower', 'kara_rock', 'tuft', 'tuft2'], 60),
    'turtle': (BASE + 'Draw a friendly green turtle (rounded dark green shell with lighter green hexagon plates, light green head and legs, '
               'small black dot eyes, a little tail) in exactly 4 images in ONE horizontal row, evenly spaced, same size: '
               '1) seen exactly from straight above (top view), head pointing to the RIGHT, legs standing still; '
               '2) the same top view, head to the right, walking: front right leg and back left leg forward; '
               '3) the same top view, head to the right, walking: front left leg and back right leg forward; '
               '4) the same turtle seen from the side, walking to the right, all four feet on one line. ',
               ['turtle_top', 'turtle_top_2', 'turtle_top_3', 'turtle_profile'], 0),
}


def gen_sheets(which):
    from gen import gen
    os.makedirs(WORK, exist_ok=True)
    for s in which:
        print(s, gen(os.path.join(WORK, s), SHEETS[s][0], REF))


def fit(im, w, h, pad=2):
    """Scale `im` to fit into w x h minus pad and centre it on a transparent canvas."""
    s = min((w - 2 * pad) / im.width, (h - 2 * pad) / im.height)
    im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    c = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    c.paste(im, ((w - im.width) // 2, (h - im.height) // 2), im)
    return c


def crops(sheet, names):
    """Cut a sheet at full resolution (cut_items with a huge long side keeps the size, then we trim)."""
    from keyslice import cut_items
    tmp = os.path.join(WORK, 'cut-' + sheet)
    files = cut_items(os.path.join(WORK, sheet + '.png'), names, 4000, tmp)
    out = {}
    for n, f in zip(names, files):
        im = Image.open(f).convert('RGBA')
        out[n] = im.crop(im.getbbox())
    return out


def grass():
    """The meadow cell: plain light green with a few tiny tufts (drawn here so that it tiles exactly)."""
    from PIL import ImageDraw
    im = Image.new('RGBA', (CELL, CELL), (151, 211, 104, 255))
    d = ImageDraw.Draw(im)
    for x, y in [(12, 16), (44, 10), (30, 38), (52, 48), (8, 52)]:
        for dx, top in [(-3, 6), (0, 8), (3, 6)]:
            d.polygon([(x + dx - 1.5, y), (x + dx + 1.5, y), (x + dx * 1.6, y - top)], fill=(118, 186, 82, 255))
    return im


def cut():
    k = crops('kara', SHEETS['kara'][1])
    t = crops('things', SHEETS['things'][1])
    tu = crops('turtle', SHEETS['turtle'][1])
    out = {}
    # Kara: one scale for both so the dazed one is the same size; the stars may stick out a bit
    kara = fit(k['kara'], CELL, CELL, 4)
    out['kara'] = kara
    out['kara_up'] = kara.rotate(90, resample=Image.NEAREST)
    out['kara_left'] = kara.rotate(180, resample=Image.NEAREST)
    out['kara_down'] = kara.rotate(270, resample=Image.NEAREST)
    # dazed Kara at the same scale as Kara, lined up at the tail (lower left), so swapping images does not jump
    sk = min((CELL - 8) / k['kara'].width, (CELL - 8) / k['kara'].height)
    b = k['kara_bump'].resize((round(k['kara_bump'].width * sk), round(k['kara_bump'].height * sk)), Image.LANCZOS)
    kw, kh = round(k['kara'].width * sk), round(k['kara'].height * sk)
    x0, y1 = (CELL - kw) // 2, (CELL - kh) // 2 + kh
    c = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
    c.paste(b, (x0, y1 - b.height), b)
    out['kara_bump'] = c
    berry = fit(t['kara_blueberry'], CELL, CELL, 10)
    out['kara_blueberry'] = berry
    out['kara_tree'] = fit(t['kara_tree'], CELL, CELL, 2)
    out['kara_mushroom'] = fit(t['kara_mushroom'], CELL, CELL, 8)
    out['kara_flower'] = fit(t['kara_flower'], CELL, CELL, 14)
    out['kara_rock'] = fit(t['kara_rock'], CELL, CELL, 10)
    out['kara_grass'] = grass()
    # thing standing on a berry: berry peeks out at the lower left
    def over_berry(thing, scale):
        c = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
        b = fit(t['kara_blueberry'], 40, 40, 0)
        c.paste(b, (2, CELL - 42), b)
        th = fit(thing, round(CELL * scale), round(CELL * scale), 0)
        c.paste(th, (CELL - th.width - 2, 2), th)
        return c
    out['kara_berry'] = over_berry(k['kara'], 0.78)
    out['kara_mushroom_berry'] = over_berry(t['kara_mushroom'], 0.72)
    # turtle: one scale for the three top frames, centred on the shell (frames must not jump)
    tops = [tu[n] for n in ['turtle_top', 'turtle_top_2', 'turtle_top_3']]
    s = (CELL - 4) / max(max(i.width, i.height) for i in tops)
    for n, im in zip(['turtle_top', 'turtle_top_2', 'turtle_top_3'], tops):
        im = im.rotate(-90, expand=True)  # the model draws the head up
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
        a = np.asarray(im)[..., 3].astype(np.float32)
        cx = (a.sum(0) * np.arange(a.shape[1])).sum() / a.sum()
        cy = (a.sum(1) * np.arange(a.shape[0])).sum() / a.sum()
        c = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
        c.paste(im, (round(CELL / 2 - cx), round(CELL / 2 - cy)), im)
        out[n] = c
    side = tu['turtle_profile']
    sc = fit(side, 64, 48, 2)
    out['turtle_profile'] = sc
    for n, im in out.items():
        im.save(os.path.join(HERE, n + '.png'), optimize=True)
    print(len(out), 'files')


if __name__ == '__main__':
    if sys.argv[1] == 'gen':
        gen_sheets(sys.argv[2:] or list(SHEETS))
    else:
        cut()
