"""Make the `grid_tiles` pack (64x64 floor and wall tiles seen from above for grid games, plus overlays).

python3 make.py gen [sheet ...]   draw sheets with the image model into the work folder
python3 make.py cut               cut the model's objects and draw all tiles into the pack folder
python3 make.py json              write pack.json
python3 make.py sheet             contact sheets (dark and light) and a 6x6 test scene with adventure tiles

Every opaque tile is drawn here in code (flat shapes, drawn at 4x and scaled down, every shape wrapped around the
tile edges), so it repeats without seams. Small natural things (tree, rock, water lily, keys, flowers, clover) come from
the image model on a flat magenta background and are cut with scripts/asset-gen/keyslice.py.
"""
import json, os, sys, math, random
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'asset-gen'))
import keyslice  # noqa: E402
import numpy as np  # noqa: E402
from PIL import Image, ImageDraw, ImageFilter  # noqa: E402
from scipy import ndimage  # noqa: E402

WORK = os.environ.get('ASSET_WORK', os.path.join(HERE, '.work'))
STYLE = os.path.join(ROOT, 'scripts', 'asset-gen', 'style-emoji.png')
ADV = os.path.join(ROOT, 'packages', 'assets', 'adventure')

BG = ('Background: one flat solid pure magenta colour #FF00FF everywhere, no shadows, no ground, no floor, '
      'no text, no letters, no numbers, no grid lines, no frames. ')
STYLE_TXT = ('Same flat emoji style as the reference image: clear flat shapes, no outlines, few colours, rounded friendly forms, '
             'no gradients, no hard shading. Every object is completely separate from the others with wide magenta gaps, '
             'nothing touches or overlaps. Do not use magenta or pink-purple inside the objects except where asked. ')
ORIG = 'Everything is original; it must not resemble any existing video game, film or brand character. '

SHEETS = {
    'top': dict(ref=STYLE, prompt=(
        'Six separate objects for a top-down grid game, ALL seen exactly from straight above (bird\'s-eye top view), '
        'grid of 2 rows and 3 columns with wide magenta gaps, reading order left to right, top row first: '
        '1 a round leafy tree crown seen from straight above: one big round fluffy green crown made of about seven round bumps, '
        'two shades of green, a few lighter leaf highlights, no trunk visible; '
        '2 a rounded grey boulder seen from straight above, two shades of grey, one lighter top facet, a few small cracks; '
        '3 a round green water lily pad seen from straight above with a narrow wedge-shaped notch, '
        'a small light pink lily flower with pointed petals on it; '
        '4 a cartoon key lying flat with a round ring handle with a hole and a short bit with two teeth, pointing right, RED; '
        '5 exactly the same key, same shape and size, BLUE; '
        '6 exactly the same key, same shape and size, GREEN. '
        + ORIG + STYLE_TXT + BG)),
    'small': dict(ref=STYLE, prompt=(
        'Eight separate tiny decorations for a meadow seen exactly from straight above (top view), all about the same size, '
        'grid of 2 rows and 4 columns with wide magenta gaps, reading order left to right, top row first: '
        '1 a white daisy flower with a yellow centre seen from above; 2 a yellow buttercup flower with five round petals seen from above; '
        '3 a small light blue flower with five round petals and a white centre seen from above; '
        '4 a small orange flower with five round petals and a yellow centre seen from above; '
        '5 a green three-leaf clover seen from above, three heart-shaped leaves, each leaf with a faint lighter mark; '
        '6 a round white-pink clover blossom ball seen from above; '
        '7 a small dark green tuft of grass blades seen from above; '
        '8 a small round flat beige pebble seen from above. '
        + STYLE_TXT + BG)),
}
# names in reading order (None = not used)
CUTS = {
    'top': ['tree', 'rock', 'lily', 'key_red', 'key_blue', 'key_green'],
    'small': ['daisy', 'buttercup', 'blueflower', 'orangeflower', 'clover', 'cloverblossom', 'tuft', 'pebble'],
}


def sheet_path(s):
    return os.path.join(WORK, s + '.png')


def do_gen(s):
    from gen import gen
    os.makedirs(WORK, exist_ok=True)
    return s, gen(os.path.join(WORK, s), SHEETS[s]['prompt'], SHEETS[s]['ref'])


# ---- cutting the model's objects ----

def bleed(im):
    """Give semi-transparent edge pixels the colour of the nearest solid pixel (no magenta or pink fringe)."""
    a = np.asarray(im).copy()
    solid = ndimage.binary_erosion(a[..., 3] > 250, iterations=2)
    if solid.any():
        iy, ix = ndimage.distance_transform_edt(~solid, return_distances=False, return_indices=True)
        a[..., :3] = a[iy, ix, :3]
    return Image.fromarray(a, 'RGBA')


def resize(im, size):
    """Resize without dark or magenta halos: premultiply alpha, resize, unpremultiply."""
    a = np.asarray(im.convert('RGBA')).astype(np.float32)
    pm = np.dstack([a[..., :3] * a[..., 3:] / 255, a[..., 3]])
    r = np.dstack([np.asarray(Image.fromarray(pm[..., c], 'F').resize(size, Image.LANCZOS)) for c in range(4)])
    al = np.clip(r[..., 3], 0, 255)
    rgb = np.where(al[..., None] > 0.5, r[..., :3] * 255 / np.maximum(al[..., None], 1e-3), 0)
    return Image.fromarray(np.dstack([np.clip(rgb, 0, 255), al]).astype(np.uint8), 'RGBA')


def scaled(im, long_side):
    k = long_side / max(im.size)
    return resize(im, (max(1, round(im.width * k)), max(1, round(im.height * k))))


def objects():
    """All model objects at full resolution, keyed, cropped and de-fringed: {name: RGBA image}."""
    out = {}
    for s, names in CUTS.items():
        tmp = os.path.join(WORK, 'cut-' + s)
        files = keyslice.cut_items(sheet_path(s), names, 4000, tmp)
        for n, f in zip(names, files):
            im = Image.open(f).convert('RGBA')
            out[n] = bleed(im.crop(im.getbbox()))
    return out


# ---- drawing helpers: everything at 4x, shapes wrapped around the edges ----
S = 256  # drawing size, scaled down to 64
T = 64
OFFS = [(dx, dy) for dx in (-S, 0, S) for dy in (-S, 0, S)]


def new(fill):
    im = Image.new('RGBA', (S, S), fill)
    return im, ImageDraw.Draw(im)


def wrect(d, box, fill, r=0):
    x0, y0, x1, y1 = box
    for dx, dy in OFFS:
        d.rounded_rectangle((x0 + dx, y0 + dy, x1 + dx, y1 + dy), r, fill=fill)


def wellipse(d, box, fill):
    x0, y0, x1, y1 = box
    for dx, dy in OFFS:
        d.ellipse((x0 + dx, y0 + dy, x1 + dx, y1 + dy), fill=fill)


def wpoly(d, pts, fill):
    for dx, dy in OFFS:
        d.polygon([(x + dx, y + dy) for x, y in pts], fill=fill)


def wpaste(im, spr, x, y):
    """Paste a sprite centred at (x, y), wrapped around the edges."""
    for dx, dy in OFFS:
        im.paste(spr, (int(x - spr.width / 2) + dx, int(y - spr.height / 2) + dy), spr)


def done(im):
    """Scale the 4x drawing down to an opaque 64x64 RGBA tile."""
    t = im.resize((T, T), Image.LANCZOS)
    a = np.asarray(t).copy()
    a[..., 3] = 255
    return Image.fromarray(a, 'RGBA')


def spots(n, seed, margin=0, cell=None):
    """n well spread points on the (wrapping) tile: jittered grid."""
    rnd = random.Random(seed)
    k = math.ceil(math.sqrt(n))
    w = S / k
    cells = [(i, j) for i in range(k) for j in range(k)]
    rnd.shuffle(cells)
    pts = []
    for i, j in cells[:n]:
        pts.append((i * w + w * (0.2 + 0.6 * rnd.random()), j * w + w * (0.2 + 0.6 * rnd.random())))
    return pts, rnd


def rot(spr, angle):
    return spr.rotate(angle, resample=Image.BICUBIC, expand=True)


def hexc(c):
    c = c.lstrip('#')
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


GRASS = '#84b54c'  # the main colour of adventure/tile_grass, so meadows sit next to it


# ---- floors ----

def meadow(o, kinds, n, size, seed, extra=()):
    im, d = new(GRASS)
    pts, rnd = spots(n, seed)
    # a few small darker grass marks like adventure/tile_grass
    for x, y in spots(5, seed + 7)[0]:
        for dx, top in ((-9, 22), (0, 30), (9, 22)):
            wpoly(d, [(x + dx - 5, y), (x + dx + 5, y), (x + dx * 1.7, y - top)], '#6f9e3c')
    for k, (x, y) in enumerate(pts):
        name = kinds[k % len(kinds)]
        spr = rot(scaled(o[name], size * (0.85 + 0.3 * rnd.random())), rnd.randrange(360))
        wpaste(im, spr, x, y)
    return done(im)


def soil():
    im, d = new('#94603a')
    pts, rnd = spots(14, 11)
    for x, y in pts:
        r = rnd.randrange(7, 15)
        wellipse(d, (x - r, y - r * 0.7, x + r, y + r * 0.7), rnd.choice(['#7d4f2e', '#83542f', '#a66f44']))
    return done(im)


def soil_tilled():
    im, d = new('#6e4225')  # furrow bottoms
    rnd = random.Random(12)
    h = S // 4
    for r in range(4):
        y = r * h
        wrect(d, (-20, y + 8, S + 20, y + h - 18), '#9a6239', 22)  # ridge
        wrect(d, (-20, y + 12, S + 20, y + 24), '#ab7044', 6)  # lit top of the ridge
        for _ in range(3):
            x = rnd.randrange(S)
            wellipse(d, (x - 8, y + h - 14, x + 8, y + h - 4), '#5c361e')
    return done(im)


def soil_wet():
    im, d = new('#6c4429')
    pts, rnd = spots(10, 13)
    for x, y in pts[:7]:
        r = rnd.randrange(6, 13)
        wellipse(d, (x - r, y - r * 0.7, x + r, y + r * 0.7), rnd.choice(['#5a3820', '#7b4f31']))
    for (x, y), (w, h) in zip([(70, 80), (190, 190), (200, 40)], [(70, 38), (84, 44), (44, 24)]):
        wellipse(d, (x - w, y - h, x + w, y + h), '#5d7f92')
        wellipse(d, (x - w + 10, y - h + 6, x + w - 14, y + h - 10), '#6f93a6')
        wrect(d, (x - w * 0.55, y - h * 0.45, x - w * 0.05, y - h * 0.45 + 9), '#b9d8e4', 5)
    return done(im)


def ice():
    im, d = new('#bfe6f5')
    # big plates in slightly different blues, cracks between them
    for (x, y, w, h, c) in [(0, 0, 150, 120, '#c8ebf8'), (150, 0, 106, 140, '#b5e0f2'), (0, 120, 96, 136, '#b5e0f2'),
                            (96, 140, 160, 116, '#c8ebf8'), (96, 120, 54, 20, '#bfe6f5')]:
        wrect(d, (x + 3, y + 3, x + w - 3, y + h - 3), c, 10)
    for x, y in [(30, 40), (170, 160), (200, 30)]:  # shine streaks
        wpoly(d, [(x, y + 40), (x + 40, y), (x + 54, y), (x + 14, y + 40)], '#eef9fe')
        wpoly(d, [(x + 22, y + 40), (x + 62, y), (x + 68, y), (x + 28, y + 40)], '#eef9fe')
    return done(im)


def cobble():
    im, d = new('#6a6560')
    rnd = random.Random(14)
    rows, per, g = 5, 4, 9
    hs = [52, 51, 51, 51, 51]
    y = 0
    for r in range(rows):
        w = S // per
        off = (w // 2) * (r % 2)
        for c in range(per):
            x = c * w + off
            col = rnd.choice(['#aaa49b', '#b4aea4', '#9f998f', '#a8a198'])
            wrect(d, (x + g / 2, y + g / 2, x + w - g / 2, y + hs[r] - g / 2), col, 14)
            wrect(d, (x + g / 2 + 8, y + g / 2 + 6, x + w - g / 2 - 22, y + g / 2 + 14), '#c3beb5', 4)
        y += hs[r]
    return done(im)


def carpet():
    im, d = new('#c8343a')
    for i in range(4):
        for j in range(4):
            x, y = i * 64 + 32, j * 64 + 32
            wpoly(d, [(x, y - 26), (x + 26, y), (x, y + 26), (x - 26, y)], '#b02a31')
            wpoly(d, [(x, y - 12), (x + 12, y), (x, y + 12), (x - 12, y)], '#d94a4c')
            wellipse(d, (x - 32 - 5, y - 32 - 5, x - 32 + 5, y - 32 + 5), '#e8b84a')
    return done(im)


def checker():
    im, d = new('#eeeae2')
    for i in range(2):
        for j in range(2):
            if (i + j) % 2:
                d.rectangle((i * 128, j * 128, i * 128 + 127, j * 128 + 127), fill='#33363d')
    return done(im)


def metal():
    im, d = new('#6c767e')
    d.rounded_rectangle((5, 5, S - 6, S - 6), 14, fill='#909ba3')
    d.rounded_rectangle((5, 5, S - 6, 22), 8, fill='#a3adb4')
    for i in range(6):  # tread plate marks
        for j in range(6):
            x, y = 38 + i * 36, 50 + j * 32
            ang = 45 if (i + j) % 2 else -45
            dx, dy = 9 * math.cos(math.radians(ang)), 9 * math.sin(math.radians(ang))
            if not (min(x, S - x) < 40 and min(y, S - y) < 40):
                d.line((x - dx, y - dy, x + dx, y + dy), fill='#7f8a92', width=6)
    for x in (24, S - 24):
        for y in (24, S - 24):
            d.ellipse((x - 10, y - 8, x + 12, y + 12), fill='#6c767e')
            d.ellipse((x - 11, y - 11, x + 9, y + 9), fill='#c4ccd2')
    return done(im)


def slab():
    """The neutral floor under the game pieces (start, goal, button, arrows ...): one light stone slab per cell."""
    im, d = new('#9d978d')
    d.rounded_rectangle((6, 6, S - 7, S - 7), 18, fill='#c9c3b8')
    d.rounded_rectangle((26, 22, 82, 34), 6, fill='#d6d1c7')
    return im, d


def conveyor_right():
    im, d = new('#3a3d44')
    for x in range(0, S, 32):
        d.rectangle((x, 30, x + 5, S - 30), fill='#474b53')
    for x in (64, 192):  # chevrons
        pts = [(x - 34, 78), (x - 6, 78), (x + 30, 128), (x - 6, 178), (x - 34, 178), (x + 2, 128)]
        d.polygon(pts, fill='#f2c230')
    for y in (0, S - 28):
        d.rectangle((0, y, S, y + 28), fill='#5d636c')
        d.rectangle((0, y + (4 if y == 0 else 18), S, y + (10 if y == 0 else 24)), fill='#7a818a')
        for x in range(16, S, 64):
            d.ellipse((x - 6, y + 8, x + 6, y + 20), fill='#9aa2ab')
    return im


def arrow_right(im):
    lay = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    d.rounded_rectangle((52, 104, 150, 152), 14, fill='#2f8fd8')
    d.polygon([(132, 62), (210, 128), (132, 194)], fill='#2f8fd8')
    lay = lay.filter(ImageFilter.GaussianBlur(0.8))
    return lay


def on_slab(layer):
    im, _ = slab()
    im.alpha_composite(layer)
    return done(im)


def layer():
    lay = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    return lay, ImageDraw.Draw(lay)


def button(pressed):
    lay, d = layer()
    d.rounded_rectangle((44, 44, 212, 212), 34, fill='#6d7278')
    if pressed:
        d.rounded_rectangle((62, 62, 194, 194), 24, fill='#a3352c')
        d.rounded_rectangle((62, 62, 194, 78), 10, fill='#8a2c25')
    else:
        d.rounded_rectangle((56, 52, 200, 196), 28, fill='#b8392f')
        d.rounded_rectangle((56, 48, 200, 186), 28, fill='#e5493e')
        d.rounded_rectangle((76, 64, 150, 80), 8, fill='#f27e72')
    return on_slab(lay)


def hole():
    lay, d = layer()
    d.ellipse((34, 34, 222, 222), fill='#7f796f')
    d.ellipse((44, 44, 212, 212), fill='#2a2629')
    d.chord((44, 44, 212, 212), 180, 360, fill='#433d40')
    d.ellipse((50, 76, 206, 212), fill='#1a171a')
    return on_slab(lay)


def teleporter(frame):
    lay, d = layer()
    d.ellipse((24, 24, 232, 232), fill='#4b4f73')
    rings = ['#7b5ad6', '#5fc6f2', '#a98af0', '#d6f4ff'] if frame == 1 else ['#5fc6f2', '#a98af0', '#d6f4ff', '#ffffff']
    for k, c in enumerate(rings):
        r = 92 - k * 22
        d.ellipse((128 - r, 128 - r, 128 + r, 128 + r), fill=c)
    sp = [(70, 66), (190, 92), (88, 190)] if frame == 1 else [(186, 64), (60, 120), (174, 188)]
    for x, y in sp:
        z = 16 if frame == 1 else 20
        d.polygon([(x, y - z), (x + 5, y - 5), (x + z, y), (x + 5, y + 5), (x, y + z), (x - 5, y + 5), (x - z, y), (x - 5, y - 5)], fill='#ffffff')
    return on_slab(lay)


def start():
    lay, d = layer()
    d.rounded_rectangle((30, 30, 226, 226), 30, fill='#3f9e4a')
    d.rounded_rectangle((52, 52, 204, 204), 20, fill='#5cc16a')
    d.polygon([(104, 82), (180, 128), (104, 174)], fill='#ffffff')
    return on_slab(lay)


def goal():
    lay, d = layer()
    d.rounded_rectangle((30, 30, 226, 226), 30, fill='#e0a91f')
    d.rounded_rectangle((52, 52, 204, 204), 20, fill='#f6cf4a')
    d.ellipse((76, 182, 132, 204), fill='#c99418')  # foot of the pole
    d.rounded_rectangle((96, 54, 110, 194), 7, fill='#5b5f66')
    d.polygon([(110, 58), (150, 52), (186, 70), (150, 92), (110, 104)], fill='#e5483e')
    d.polygon([(110, 58), (150, 52), (150, 62), (110, 70)], fill='#f0766c')
    return on_slab(lay)


def spikes(out):
    lay, d = layer()
    d.rounded_rectangle((26, 26, 230, 230), 24, fill='#6f757d')
    d.rounded_rectangle((34, 34, 222, 222), 18, fill='#858b93')
    for i in range(3):
        for j in range(3):
            x, y = 70 + i * 58, 82 + j * 58
            d.ellipse((x - 20, y + 10, x + 20, y + 26), fill='#3b3f45')
            if out:
                d.polygon([(x - 20, y + 18), (x, y - 40), (x + 20, y + 18)], fill='#c3cad1')
                d.polygon([(x, y - 40), (x + 20, y + 18), (x, y + 18)], fill='#9aa2ab')
                d.polygon([(x - 4, y - 28), (x, y - 40), (x + 1, y - 26)], fill='#eef1f4')
    return on_slab(lay)


def lever(on):
    lay, d = layer()
    d.rounded_rectangle((58, 150, 198, 206), 20, fill='#5d636c')
    d.rounded_rectangle((70, 166, 186, 180), 7, fill='#3a3d44')
    px, py = 128, 172
    ang = math.radians(-50 if on else -130)
    kx, ky = px + 96 * math.cos(ang), py + 96 * math.sin(ang)
    d.line((px, py, kx, ky), fill='#8f969e', width=16)
    d.ellipse((px - 14, py - 14, px + 14, py + 14), fill='#8f969e')
    col = '#4cbb5a' if on else '#e5483e'
    d.ellipse((kx - 26, ky - 26, kx + 26, ky + 26), fill=col)
    d.ellipse((kx - 15, ky - 18, kx - 3, ky - 6), fill='#ffffff')
    return on_slab(lay)


def door(col, dark, light):
    im, d = new('#5f6a6e')  # stone frame like adventure/tile_wall
    d.rounded_rectangle((8, 8, S - 9, S - 9), 16, fill='#7d888d')
    d.rounded_rectangle((32, 32, S - 33, S - 33), 14, fill=col)
    for x in (88, 128, 168):
        d.rectangle((x - 3, 36, x + 3, S - 36), fill=dark)
    for y in (64, S - 72):
        d.rectangle((32, y, S - 33, y + 16), fill='#4c5057')
        for x in (52, S - 52):
            d.ellipse((x - 5, y + 3, x + 5, y + 13), fill='#9aa2ab')
    d.rounded_rectangle((40, 40, 120, 50), 5, fill=light)
    d.ellipse((104, 100, 152, 148), fill='#f2c230')  # keyhole plate
    d.ellipse((120, 110, 136, 126), fill='#2b2b30')
    d.polygon([(122, 120), (134, 120), (138, 140), (118, 140)], fill='#2b2b30')
    return done(im)


def bricks():
    im, d = new('#d8cbb5')
    rnd = random.Random(21)
    rows, per, g = 8, 4, 7
    h, w = S // rows, S // per
    for r in range(rows):
        off = (w // 2) * (r % 2)
        for c in range(per):
            x, y = c * w + off, r * h
            wrect(d, (x + g / 2, y + g / 2, x + w - g / 2, y + h - g / 2), rnd.choice(['#b5523b', '#c05a40', '#a84a35']), 5)
            wrect(d, (x + g / 2 + 6, y + g / 2 + 3, x + w - g / 2 - 14, y + g / 2 + 7), '#cf7258', 2)
    return done(im)


def stone_blocks():
    im, d = new('#4c5357')
    rnd = random.Random(22)
    g = 10
    for r in range(2):
        off = 64 * (r % 2)
        for c in range(2):
            x, y = c * 128 + off, r * 128
            base = rnd.choice(['#8b949a', '#929ba0', '#868f95'])
            wrect(d, (x + g / 2, y + g / 2, x + 128 - g / 2, y + 128 - g / 2), '#717a80', 14)
            wrect(d, (x + g / 2, y + g / 2, x + 128 - g / 2 - 8, y + 128 - g / 2 - 10), '#a3acb1', 14)
            wrect(d, (x + g / 2 + 8, y + g / 2 + 8, x + 128 - g / 2 - 8, y + 128 - g / 2 - 10), base, 10)
    return done(im)


def crystal():
    im, d = new('#352a52')
    rnd = random.Random(23)
    cols = [('#6fd0ee', '#a6e6f7'), ('#9b7fe8', '#c2adf5'), ('#58b4dc', '#8fd3ef')]
    for r in range(3):
        for c in range(4):
            cx = c * 64 + 32 + (32 if r % 2 else 0) + rnd.randrange(-6, 7)
            cy = r * 85 + 42 + rnd.randrange(-6, 7)
            w, h = rnd.randrange(34, 44), rnd.randrange(66, 80)
            dark, light = rnd.choice(cols)
            pts = [(cx, cy - h / 2), (cx + w / 2, cy - h / 2 + w / 2), (cx + w / 2, cy + h / 2 - w / 3), (cx, cy + h / 2),
                   (cx - w / 2, cy + h / 2 - w / 3), (cx - w / 2, cy - h / 2 + w / 2)]
            wpoly(d, pts, dark)
            wpoly(d, [pts[0], (cx, cy + h / 2), pts[4], pts[5]], light)
    return done(im)


def leafy(base, shades, light, n, rmin, rmax, seed, berries=None):
    im, d = new(base)
    pts, rnd = spots(n, seed)
    for x, y in pts:
        r = rnd.randrange(rmin, rmax)
        wellipse(d, (x - r, y - r, x + r, y + r), rnd.choice(shades))
        wellipse(d, (x - r * 0.6, y - r * 0.75, x - r * 0.05, y - r * 0.35), light)
    if berries:
        for x, y in spots(5, seed + 1)[0]:
            wellipse(d, (x - 7, y - 7, x + 7, y + 7), berries)
    return done(im)


def hedge():
    return leafy('#3f7d32', ['#4f9440', '#58a046', '#4a8c3c'], '#74bb59', 36, 22, 30, 31)


def bush_wall():
    return leafy('#24552a', ['#2f6b31', '#377a37', '#2c6530'], '#4f9a46', 12, 44, 58, 32, berries='#d94a5a')


# ---- overlays with alpha ----

def canvas(size=T):
    return Image.new('RGBA', (size, size), (0, 0, 0, 0))


def centred(spr, size=T):
    c = canvas(size)
    c.alpha_composite(spr, ((size - spr.width) // 2, (size - spr.height) // 2))
    return c


def small_overlay(draw, size=T):
    """Draw at 4x on a transparent layer, scale down premultiplied."""
    lay = Image.new('RGBA', (size * 4, size * 4), (0, 0, 0, 0))
    draw(ImageDraw.Draw(lay), size * 4)
    return resize(lay, (size, size))


def shadow():
    lay = Image.new('RGBA', (192, 192), (0, 0, 0, 0))
    ImageDraw.Draw(lay).ellipse((28, 28, 164, 164), fill=(0, 0, 0, 110))
    lay = lay.filter(ImageFilter.GaussianBlur(14))
    return resize(lay, (48, 48))


def marker_circle(d, s):
    d.ellipse((14, 14, s - 14, s - 14), fill=(255, 216, 74, 255))
    d.ellipse((34, 34, s - 34, s - 34), fill=(0, 0, 0, 0))
    d.ellipse((24, 24, s - 24, s - 24), outline=(255, 244, 196, 255), width=5)


def marker_cross(d, s):
    for (a, b) in (((60, 60), (s - 60, s - 60)), ((s - 60, 60), (60, s - 60))):
        d.line((a, b), fill=(229, 72, 62, 255), width=34)
    for x, y in ((60, 60), (s - 60, s - 60), (s - 60, 60), (60, s - 60)):
        d.ellipse((x - 17, y - 17, x + 17, y + 17), fill=(229, 72, 62, 255))


def path_dot(d, s):
    c = s // 2
    d.ellipse((c - 30, c - 30, c + 30, c + 30), fill=(40, 40, 50, 90))
    d.ellipse((c - 22, c - 22, c + 22, c + 22), fill=(255, 255, 255, 240))


def highlight(rgb):
    def draw(d, s):
        d.rounded_rectangle((0, 0, s - 1, s - 1), 24, fill=rgb + (200,))
        d.rounded_rectangle((12, 12, s - 13, s - 13), 14, fill=rgb + (95,))
    return draw


# ---- all files ----

def build():
    o = objects()
    out = {}
    out['gt_ice'] = ice()
    out['gt_hedge'] = hedge()
    out['gt_soil'] = soil()
    out['gt_soil_tilled'] = soil_tilled()
    out['gt_soil_wet'] = soil_wet()
    out['gt_clover'] = meadow(o, ['clover', 'clover', 'clover', 'cloverblossom'], 9, 60, 41)
    out['gt_flowers'] = meadow(o, ['daisy', 'buttercup', 'blueflower', 'daisy', 'orangeflower'], 7, 44, 42)
    out['gt_cobble'] = cobble()
    out['gt_carpet_red'] = carpet()
    out['gt_tiles_checker'] = checker()
    out['gt_metal'] = metal()
    belt = conveyor_right()
    for name, ang in (('right', 0), ('up', 90), ('left', 180), ('down', 270)):
        out['gt_conveyor_' + name] = done(belt.rotate(ang))
        out['gt_arrow_' + name] = on_slab(arrow_right(None).rotate(ang, resample=Image.BICUBIC))
    out['gt_button'] = button(False)
    out['gt_button_pressed'] = button(True)
    out['gt_hole'] = hole()
    out['gt_teleporter_1'] = teleporter(1)
    out['gt_teleporter_2'] = teleporter(2)
    out['gt_start'] = start()
    out['gt_goal'] = goal()
    out['gt_spikes_out'] = spikes(True)
    out['gt_spikes_in'] = spikes(False)
    for c in ('red', 'blue', 'green'):
        key = o['key_' + c]
        px = np.asarray(key)[..., :3][np.asarray(key)[..., 3] > 250].astype(int)
        mid = np.median(px, 0).astype(int)
        col = '#%02x%02x%02x' % tuple(mid)
        dark = '#%02x%02x%02x' % tuple((mid * 0.8).astype(int))
        light = '#%02x%02x%02x' % tuple(np.minimum(255, mid + (255 - mid) * 0.3).astype(int))
        out['gt_door_' + c] = door(col, dark, light)
        k = scaled(key, 36)
        out['gt_key_' + c] = centred(k, 40)
    out['gt_lever_off'] = lever(False)
    out['gt_lever_on'] = lever(True)
    out['gt_wall_brick'] = bricks()
    out['gt_wall_stone_block'] = stone_blocks()
    out['gt_wall_crystal'] = crystal()
    out['gt_bush_wall'] = bush_wall()
    out['gt_tree_top'] = centred(scaled(o['tree'], 62))
    out['gt_rock_top'] = centred(scaled(o['rock'], 52))
    water = Image.open(os.path.join(ADV, 'tile_water.png')).convert('RGBA')
    water.alpha_composite(centred(scaled(o['lily'], 46)))
    out['gt_water_lily'] = water
    out['gt_shadow'] = shadow()
    out['gt_marker_circle'] = small_overlay(marker_circle)
    out['gt_marker_cross'] = small_overlay(marker_cross)
    out['gt_path_dot'] = small_overlay(path_dot)
    out['gt_highlight_green'] = small_overlay(highlight((76, 200, 90)))
    out['gt_highlight_red'] = small_overlay(highlight((230, 70, 60)))
    out['gt_highlight_blue'] = small_overlay(highlight((60, 140, 235)))
    for n, im in out.items():
        a = np.asarray(im.convert('RGBA')).copy()
        a[a[..., 3] == 0] = 0  # no hidden colour under full transparency (smaller files)
        Image.fromarray(a, 'RGBA').save(os.path.join(HERE, n + '.png'), optimize=True)
    return out


# ---- pack.json ----
DIR = {'up': ('nach oben', 'up'), 'down': ('nach unten', 'down'), 'left': ('nach links', 'left'), 'right': ('nach rechts', 'right')}
COL = {'red': ('rot', 'red'), 'blue': ('blau', 'blue'), 'green': ('grün', 'green')}
DESC = {
    'gt_ice': ('Kachel Eis (glatt)', 'Tile ice (slippery)'),
    'gt_hedge': ('Kachel Hecke, geschnitten (Wand)', 'Tile trimmed hedge (wall)'),
    'gt_soil': ('Kachel Erde', 'Tile plain soil'),
    'gt_soil_tilled': ('Kachel gepflügter Acker mit Furchen', 'Tile ploughed field with furrows'),
    'gt_soil_wet': ('Kachel nasse Erde mit Pfützen', 'Tile wet soil with puddles'),
    'gt_clover': ('Kachel Wiese mit Klee', 'Tile meadow with clover'),
    'gt_flowers': ('Kachel Wiese mit kleinen Blumen', 'Tile meadow with small flowers'),
    'gt_cobble': ('Kachel Kopfsteinpflaster (Straße)', 'Tile cobble street'),
    'gt_carpet_red': ('Kachel roter Teppich', 'Tile red carpet'),
    'gt_tiles_checker': ('Kachel Schachbrettboden schwarz-weiß', 'Tile black and white checker floor'),
    'gt_metal': ('Kachel Metallboden mit Nieten (Raumstation)', 'Tile metal floor with rivets (space station)'),
    'gt_button': ('Kachel Druckplatte', 'Tile pressure plate'),
    'gt_button_pressed': ('Kachel Druckplatte, gedrückt', 'Tile pressure plate, pressed'),
    'gt_hole': ('Kachel Loch (Grube)', 'Tile hole (pit)'),
    'gt_teleporter_1': ('Kachel Teleporter, Bild 1 von 2', 'Tile teleporter, frame 1 of 2'),
    'gt_teleporter_2': ('Kachel Teleporter, Bild 2 von 2', 'Tile teleporter, frame 2 of 2'),
    'gt_start': ('Kachel Startfeld', 'Tile start square'),
    'gt_goal': ('Kachel Zielfeld mit Fahne', 'Tile goal square with a flag'),
    'gt_spikes_out': ('Kachel Stacheln, ausgefahren (gefährlich)', 'Tile spikes, out (dangerous)'),
    'gt_spikes_in': ('Kachel Stacheln, eingefahren (sicher)', 'Tile spikes, retracted (safe)'),
    'gt_lever_off': ('Kachel Hebel, aus (nach links)', 'Tile lever, off (tilted left)'),
    'gt_lever_on': ('Kachel Hebel, an (nach rechts)', 'Tile lever, on (tilted right)'),
    'gt_wall_brick': ('Kachel rote Ziegelmauer', 'Tile red brick wall'),
    'gt_wall_stone_block': ('Kachel Mauer aus großen Steinblöcken', 'Tile wall of big stone blocks'),
    'gt_wall_crystal': ('Kachel Kristallwand', 'Tile crystal wall'),
    'gt_bush_wall': ('Kachel dichtes Gebüsch (Wand)', 'Tile dense bushes (wall)'),
    'gt_tree_top': ('Baum von oben (durchsichtig, 64 x 64)', 'Tree seen from above (transparent, 64 x 64)'),
    'gt_rock_top': ('Felsbrocken von oben (durchsichtig, 64 x 64)', 'Boulder seen from above (transparent, 64 x 64)'),
    'gt_water_lily': ('Kachel Wasser mit Seerose', 'Tile water with a water lily'),
    'gt_shadow': ('Weicher runder Schatten (durchsichtig)', 'Soft round shadow (transparent)'),
    'gt_marker_circle': ('Auswahlring (durchsichtig, 64 x 64)', 'Selection ring (transparent, 64 x 64)'),
    'gt_marker_cross': ('Rotes Kreuz als Markierung (durchsichtig, 64 x 64)', 'Red cross marker (transparent, 64 x 64)'),
    'gt_path_dot': ('Wegpunkt (durchsichtig, 64 x 64)', 'Path dot (transparent, 64 x 64)'),
}
for d, (de, en) in DIR.items():
    DESC['gt_conveyor_' + d] = (f'Kachel Förderband {de}', f'Tile conveyor belt moving {en}')
    DESC['gt_arrow_' + d] = (f'Kachel Boden mit Pfeil {de}', f'Tile floor with an arrow pointing {en}')
for c, (de, en) in COL.items():
    DESC['gt_door_' + c] = (f'Kachel Tür {de}, verschlossen', f'Tile door {en}, locked')
    DESC['gt_key_' + c] = (f'Schlüssel {de} (durchsichtig)', f'Key {en} (transparent)')
    DESC['gt_highlight_' + c] = (f'Halbdurchsichtige Markierung {de} für Felder (64 x 64)',
                                 f'Semi-transparent {en} square highlight (64 x 64)')
ORDER = ['gt_ice', 'gt_hedge', 'gt_soil', 'gt_soil_tilled', 'gt_soil_wet', 'gt_clover', 'gt_flowers', 'gt_cobble',
         'gt_carpet_red', 'gt_tiles_checker', 'gt_metal'] + [f'gt_conveyor_{d}' for d in DIR] + [f'gt_arrow_{d}' for d in DIR] + \
        ['gt_button', 'gt_button_pressed', 'gt_hole', 'gt_teleporter_1', 'gt_teleporter_2', 'gt_start', 'gt_goal',
         'gt_spikes_out', 'gt_spikes_in'] + [f'gt_door_{c}' for c in COL] + [f'gt_key_{c}' for c in COL] + \
        ['gt_lever_off', 'gt_lever_on', 'gt_wall_brick', 'gt_wall_stone_block', 'gt_wall_crystal', 'gt_bush_wall',
         'gt_tree_top', 'gt_rock_top', 'gt_water_lily', 'gt_shadow', 'gt_marker_circle', 'gt_marker_cross', 'gt_path_dot'] + \
        [f'gt_highlight_{c}' for c in ('green', 'red', 'blue')]
OVERLAY = {'gt_shadow', 'gt_marker_circle', 'gt_marker_cross', 'gt_path_dot', 'gt_highlight_green', 'gt_highlight_red', 'gt_highlight_blue'}


def tags(n):
    if n.startswith('gt_key_'):
        return ['item', 'key']
    if n in ('gt_tree_top', 'gt_rock_top'):
        return ['object', 'topdown']
    if n in OVERLAY:
        return ['overlay', 'grid']
    t = ['tile', 'grid']
    if 'wall' in n or n == 'gt_hedge' or n.startswith('gt_door'):
        t.append('wall')
    if n.startswith('gt_teleporter'):
        t.append('animation')
    return t


def write_json():
    assets = [{'name': n, 'file': n + '.png', 'tags': tags(n), 'de': DESC[n][0], 'en': DESC[n][1]} for n in ORDER]
    pack = {'pack': 'grid_tiles', 'title': {'de': 'Rasterkacheln', 'en': 'Grid tiles'}, 'format': 'png', 'assets': assets}
    with open(os.path.join(HERE, 'pack.json'), 'w', encoding='utf-8') as f:
        json.dump(pack, f, ensure_ascii=False, indent=2)
        f.write('\n')


# ---- checking ----

def contact():
    cols, cell = 10, 80
    rows = (len(ORDER) + cols - 1) // cols
    for tag, col in (('dark', (40, 42, 54, 255)), ('light', (245, 245, 240, 255))):
        c = Image.new('RGBA', (cols * cell * 2, rows * cell * 2), col)
        for k, n in enumerate(ORDER):
            im = Image.open(os.path.join(HERE, n + '.png')).convert('RGBA')
            im = im.resize((im.width * 2, im.height * 2), Image.NEAREST)
            c.alpha_composite(im, ((k % cols) * cell * 2 + (cell * 2 - im.width) // 2, (k // cols) * cell * 2 + (cell * 2 - im.height) // 2))
        c.save(os.path.join(WORK, f'contact-{tag}.png'))
    # every opaque tile repeated 3x3: seams show up here
    opaque = [n for n in ORDER if 'tile' in tags(n)]
    c = Image.new('RGBA', (8 * 200, ((len(opaque) + 7) // 8) * 200), (255, 255, 255, 255))
    for k, n in enumerate(opaque):
        im = Image.open(os.path.join(HERE, n + '.png')).convert('RGBA')
        for i in range(3):
            for j in range(3):
                c.alpha_composite(im, ((k % 8) * 200 + i * 64, (k // 8) * 200 + j * 64))
    c.save(os.path.join(WORK, 'repeat.png'))
    scene()


def scene():
    """A 6x6 test map that mixes these tiles with adventure tiles, plus overlays."""
    A = lambda n: Image.open(os.path.join(ADV, n + '.png')).convert('RGBA')
    G = lambda n: Image.open(os.path.join(HERE, n + '.png')).convert('RGBA')
    m = [['A:tile_grass', 'gt_clover', 'gt_flowers', 'A:tile_grass', 'gt_hedge', 'gt_hedge'],
         ['gt_soil_tilled', 'gt_soil_tilled', 'A:tile_path', 'A:tile_path', 'A:tile_water', 'gt_water_lily'],
         ['gt_soil', 'gt_soil_wet', 'gt_cobble', 'gt_cobble', 'gt_cobble', 'gt_door_red'],
         ['gt_wall_brick', 'gt_wall_brick', 'gt_start', 'gt_arrow_right', 'gt_conveyor_right', 'gt_conveyor_right'],
         ['gt_bush_wall', 'gt_ice', 'gt_ice', 'gt_button', 'gt_spikes_out', 'gt_goal'],
         ['gt_wall_stone_block', 'gt_wall_crystal', 'gt_metal', 'gt_teleporter_1', 'gt_hole', 'gt_lever_off']]
    c = Image.new('RGBA', (384, 384))
    for j, row in enumerate(m):
        for i, n in enumerate(row):
            c.alpha_composite(A(n[2:]) if n.startswith('A:') else G(n), (i * 64, j * 64))
    c.alpha_composite(G('gt_tree_top'), (0, 0))
    c.alpha_composite(G('gt_shadow'), (64 * 3 + 8, 8 + 10))
    c.alpha_composite(G('gt_rock_top'), (64 * 3, 0))
    c.alpha_composite(G('gt_key_red'), (64 * 2 + 12, 64 + 12))
    c.alpha_composite(G('gt_highlight_green'), (64 * 4, 64 * 4))
    c.alpha_composite(G('gt_highlight_blue'), (64, 64 * 4))
    c.alpha_composite(G('gt_marker_circle'), (64 * 2, 64 * 4))
    c.alpha_composite(G('gt_marker_cross'), (64 * 1, 64 * 2))
    c.alpha_composite(G('gt_path_dot'), (64 * 3, 64 * 2))
    c.alpha_composite(G('gt_path_dot'), (64 * 4, 64 * 2))
    c.resize((768, 768), Image.NEAREST).save(os.path.join(WORK, 'scene.png'))


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'gen':
        with ThreadPoolExecutor(8) as ex:
            for s, r in ex.map(do_gen, sys.argv[2:] or list(SHEETS)):
                print(s, r)
    elif cmd == 'cut':
        print(len(build()), 'files')
    elif cmd == 'json':
        write_json()
    elif cmd == 'sheet':
        contact()
