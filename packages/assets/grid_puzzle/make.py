"""Make the `grid_puzzle` pack (pieces for grid based puzzle and board games).

python3 make.py gen [sheet ...]   draw sheets with the image model into the work folder
python3 make.py build             key and cut the sheets, draw the tiles in code, write the PNGs
python3 make.py json              write pack.json
python3 make.py contact           contact sheets (dark and light) in the work folder

Only the objects come from the image model (chess pieces, crate, mine, flag, crown, cheese, treasure hunt items).
All tiles (minesweeper, pipes, number tiles, boards, floors, walls) are drawn here in code so that every set has
exactly the same 64x64 size and edge style and the pipes meet at the same positions on every edge.
Digits are the glyphs of packages/assets/ui (ui_0 .. ui_9), recoloured flat.
"""
import json, os, sys
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'asset-gen'))
from keyslice import key  # noqa: E402

STYLE = os.path.join(ROOT, 'scripts', 'asset-gen', 'style-emoji.png')
UI = os.path.join(ROOT, 'packages', 'assets', 'ui')
WORK = os.environ.get('GRID_PUZZLE_WORK',
                      '/tmp/claude-0/-home-user/82af8643-7fd2-511f-b912-5aee8d74fb4e/scratchpad/assets-work/grid_puzzle')

HEAD = ('Draw game sprites in exactly the same flat emoji style as the reference image: clear flat shapes, no outlines, '
        'very few colours per object, rounded friendly forms, at most a hint of shading. ')
TAIL = (' Every object is ONE connected shape, separate from the others, with wide empty space between objects; '
        'no object touches another or the image border. '
        'Background: one flat solid pure magenta colour #FF00FF everywhere. No shadows, no ground, no text, no letters, '
        'no numbers, no grid lines, no frames around the objects, no magenta or pink inside the objects. '
        'Original designs only, no logos, no brands.')

SHEETS = {
    # the white set only; the dark wood set is recoloured from it in code, so both sets have identical silhouettes
    'chess': HEAD + (
        'A sheet of 6 chess pieces, seen from the front (side view), all standing upright on the same base line, '
        'in ONE horizontal row, left to right: pawn, rook, knight, bishop, queen, king. '
        'All six are made of smooth IVORY WHITE material with light grey-blue shading, chunky and toy-like, each on a round flat foot. '
        'Make the silhouettes very different and easy to tell apart even when tiny: '
        'pawn: the smallest, a round ball head on a short cone body; '
        'rook: a wide castle tower with three square battlement teeth on top; '
        'knight: a horse head with ears and a short mane, looking to the LEFT; '
        'bishop: a tall slim drop-shaped head with a deep diagonal slit and a small ball on top; '
        'queen: tall, with a crown of five small balls on points around the top; '
        'king: the tallest, with a small plain cross on top of the crown. '
        'Heights from pawn to king rise gently.'),
    'objects': HEAD + (
        'A sheet of 8 objects for puzzle games, in a grid of 2 rows and 4 columns, reading order left to right, top to bottom: '
        '1) a square wooden crate seen from DIRECTLY ABOVE (top-down), a perfect square: light brown planks with a darker brown '
        'frame around the edge and one diagonal brace from corner to corner; '
        '2) a round black cartoon sea-mine-like bomb seen from above: a dark grey-black ball with eight short stubby spikes evenly around it '
        'and a small white highlight, no fuse; '
        '3) a small red triangular flag on a short dark grey pole that stands on a small dark grey foot, the flag waves to the right; '
        '4) a small golden crown with three rounded points and three little red gems, front view; '
        '5) a wedge of yellow cheese with round holes, seen slightly from above; '
        '6) a mouse hole: a short piece of brown wooden wall seen from the front with a dark brown-black arched hole at the bottom middle; '
        '7) a simple wooden mousetrap seen from above: a light wooden board with a silver metal bow and spring, a small cheese bait; '
        '8) a red painted cross mark X with brush-stroke ends, as painted on the ground on a treasure map.'),
    'hunt': HEAD + (
        'A sheet of 7 objects for a treasure hunt game, in a grid of 2 rows, 4 objects in the top row and 3 in the bottom row, '
        'reading order left to right, top to bottom: '
        '1) a closed wooden treasure chest with golden metal bands and a golden lock, front view seen slightly from above; '
        '2) a shovel with a wooden handle and a grey metal blade, lying diagonally (handle top right, blade bottom left); '
        '3) a freshly dug round hole in the ground seen from above: a dark brown hole with a ring of loose light brown earth around it; '
        '4) a rolled-open old treasure map: a parchment sheet with slightly curled ends, a dotted red path, a little blue lake, '
        'small green trees and a red cross at the end of the path (no letters); '
        '5) a round golden compass seen from above: a white face with a red and grey needle and four small tick marks (no letters); '
        '6) a pair of shoe footprints seen from above, dark brown, both pointing UP: the left print higher (one step ahead) and the right print lower, '
        'side by side with a small gap; '
        '7) a small brown leather bag of gold coins tied with a string, a few coins peeking out.'),
}


def sheet_path(s):
    return os.path.join(WORK, s + '.png')


def do_gen(s):
    from gen import gen
    os.makedirs(WORK, exist_ok=True)
    return s, gen(os.path.join(WORK, s), SHEETS[s] + TAIL, STYLE)


# ---------------------------------------------------------------- helpers

def defringe(rgba):
    """Semi-transparent edge pixels take the colour of the nearest solid pixel (no magenta rim on dark objects)."""
    c = rgba[..., :3].astype(int)
    near = ndimage.binary_dilation(rgba[..., 3] < 250, iterations=4)
    tinted = near & (c[..., 0] - c[..., 1] > 25) & (c[..., 2] - c[..., 1] > 25)
    solid = (rgba[..., 3] >= 250) & ~tinted
    _, (iy, ix) = ndimage.distance_transform_edt(~solid, return_indices=True)
    edge = ~solid & (rgba[..., 3] > 0)
    rgba[edge, :3] = rgba[iy[edge], ix[edge], :3]
    return rgba


def comps(path, count, grow=8, min_area=1500):
    rgba = defringe(key(Image.open(path)))
    lab, _ = ndimage.label(ndimage.binary_dilation(rgba[..., 3] > 128, iterations=grow))
    cs = [(sl, i) for i, sl in enumerate(ndimage.find_objects(lab), 1) if (lab[sl] == i).sum() >= min_area]
    if len(cs) != count:
        raise ValueError(f'{path}: found {len(cs)} objects, expected {count}')
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


def resize(im, size):
    """Resize with premultiplied alpha (no dark or coloured halos)."""
    a = np.asarray(im.convert('RGBA')).astype(np.float32)
    pm = np.dstack([a[..., :3] * a[..., 3:] / 255, a[..., 3]])
    r = np.dstack([np.asarray(Image.fromarray(pm[..., c], 'F').resize(size, Image.LANCZOS)) for c in range(4)])
    al = np.clip(r[..., 3], 0, 255)
    rgb = np.where(al[..., None] > 0.5, r[..., :3] * 255 / np.maximum(al[..., None], 1e-3), 0)
    return Image.fromarray(np.dstack([np.clip(rgb, 0, 255), al]).astype(np.uint8), 'RGBA')


def fit(im, w, h=None):
    h = h or w
    f = min(w / im.width, h / im.height)
    return resize(im, (max(1, round(im.width * f)), max(1, round(im.height * f))))


def on(base, im, x=None, y=None):
    """Paste im on a copy of base, centred unless x/y (top-left) are given."""
    c = base.copy()
    x = (c.width - im.width) // 2 if x is None else x
    y = (c.height - im.height) // 2 if y is None else y
    c.alpha_composite(im, (x, y))
    return c


def blank(w=64, h=64):
    return Image.new('RGBA', (w, h), (0, 0, 0, 0))


def padded(im, pad=2):
    return on(blank(im.width + 2 * pad, im.height + 2 * pad), im)


def clean(im):
    a = np.asarray(im).copy()
    a[a[..., 3] < 3] = 0
    return Image.fromarray(a, 'RGBA')


OUT = {}


def put(name, im):
    OUT[name] = im
    clean(im).save(os.path.join(HERE, name + '.png'), optimize=True)


# ---------------------------------------------------------------- drawing in code (4x supersampled)

SS = 4
T = 64  # tile size


class Pen:
    """Draw in tile pixels on a supersampled canvas; .done() scales down to the tile."""

    def __init__(self, w=T, h=T, bg=(0, 0, 0, 0)):
        self.w, self.h = w, h
        self.im = Image.new('RGBA', (w * SS, h * SS), bg)
        self.d = ImageDraw.Draw(self.im)

    def s(self, v):
        return [round(x * SS) for x in v]

    def rect(self, box, fill, r=0):
        x0, y0, x1, y1 = box
        b = self.s((x0, y0, x1, y1))
        b[2] -= 1; b[3] -= 1
        if r:
            self.d.rounded_rectangle(b, round(r * SS), fill=fill)
        else:
            self.d.rectangle(b, fill=fill)

    def ellipse(self, box, fill):
        b = self.s(box)
        b[2] -= 1; b[3] -= 1
        self.d.ellipse(b, fill=fill)

    def poly(self, pts, fill):
        self.d.polygon([(x * SS, y * SS) for x, y in pts], fill=fill)

    def line(self, pts, fill, width):
        self.d.line([(x * SS, y * SS) for x, y in pts], fill=fill, width=round(width * SS), joint='curve')
        r = width * SS / 2
        for x, y in (pts[0], pts[-1]):
            self.d.ellipse([x * SS - r, y * SS - r, x * SS + r, y * SS + r], fill=fill)

    def paste(self, im, x, y):
        big = im.resize((im.width * SS, im.height * SS), Image.LANCZOS)
        self.im.alpha_composite(big, (round(x * SS), round(y * SS)))

    def done(self):
        return resize(self.im, (self.w, self.h))


def lighter(c, k):
    return tuple(min(255, round(v + (255 - v) * k)) for v in c[:3]) + (255,)


def darker(c, k):
    return tuple(round(v * (1 - k)) for v in c[:3]) + (255,)


# The one edge style of every tile set: 64x64, a rounded square (radius 8) with a 1 px transparent margin.
# Raised tiles (hidden, number, slide tiles) have a 5 px darker lip at the bottom and a light band at the top;
# flat tiles (opened cells, pipe ground, life cells) have the same outline without the lip.
R = 8
LIP = 5


def tile(face, raised=False, rim=None):
    p = Pen()
    if raised:
        p.rect((1, 1, 63, 63), darker(face, 0.22), R)
        p.rect((1, 1, 63, 63 - LIP), face, R)
        p.rect((7, 5, 57, 9), lighter(face, 0.3), 2)
    else:
        p.rect((1, 1, 63, 63), rim or darker(face, 0.08), R)
        p.rect((3, 3, 61, 61), face, R - 2)
    return p


def raised_centre():
    return 32 - LIP / 2  # vertical middle of the face of a raised tile


# ---------------------------------------------------------------- digits (glyphs of the ui pack)

def glyph(n):
    """Alpha mask (float 0..1, tightly cropped) of the ui digit n."""
    a = np.asarray(Image.open(os.path.join(UI, f'ui_{n}.png')).convert('RGBA'))[..., 3]
    ys, xs = np.nonzero(a > 6)
    return a[ys.min():ys.max() + 1, xs.min():xs.max() + 1].astype(np.float32) / 255


def number(text, colour, height, max_w):
    """The number as a flat coloured RGBA image, digits of the ui pack, scaled to `height` (smaller if wider than max_w)."""
    gs = [glyph(int(ch)) for ch in text]
    big = max(g.shape[0] for g in gs)
    gap = round(big * 0.04)
    w = sum(g.shape[1] for g in gs) + gap * (len(gs) - 1)
    a = np.zeros((big, w), np.float32)
    x = 0
    for g in gs:
        a[big - g.shape[0]:, x:x + g.shape[1]] = np.maximum(a[big - g.shape[0]:, x:x + g.shape[1]], g)
        x += g.shape[1] + gap
    im = Image.fromarray(np.dstack([np.full(a.shape, c, np.float32) for c in colour[:3]] + [a * 255]).astype(np.uint8), 'RGBA')
    f = min(height / big, max_w / w)
    return resize(im, (max(1, round(w * f)), max(1, round(big * f))))


# ---------------------------------------------------------------- minesweeper

MS_HIDDEN = (122, 160, 214, 255)
MS_OPEN = (232, 228, 218, 255)
MS_OPEN_RIM = (206, 200, 188, 255)
MS_HIT = (232, 74, 64, 255)
# classic order: 1 blue, 2 green, 3 red, 4 dark blue, 5 dark red, 6 teal, 7 black, 8 grey
MS_COL = {1: (38, 98, 220), 2: (40, 146, 60), 3: (222, 52, 44), 4: (36, 44, 150), 5: (150, 36, 36),
          6: (24, 146, 150), 7: (40, 40, 44), 8: (128, 128, 136)}


def ms_open(face=MS_OPEN, rim=MS_OPEN_RIM):
    return tile(face, rim=rim).done()


def minesweeper(obj):
    put('ms_hidden', tile(MS_HIDDEN, raised=True).done())
    put('ms_empty', ms_open())
    for n, c in MS_COL.items():
        g = number(str(n), c, 40, 44)
        put(f'ms_{n}', on(ms_open(), g, y=(64 - g.height) // 2))
    flag = fit(obj['flag'], 40, 42)
    put('ms_flag', on(tile(MS_HIDDEN, raised=True).done(), flag, y=round(raised_centre() - flag.height / 2)))
    mine = fit(obj['mine'], 46)
    put('ms_mine', on(ms_open(), mine))
    put('ms_mine_hit', on(ms_open(MS_HIT, darker(MS_HIT, 0.12)), mine))
    cross = Pen()
    cross.line([(15, 15), (49, 49)], (226, 40, 36, 255), 7)
    cross.line([(49, 15), (15, 49)], (226, 40, 36, 255), 7)
    put('ms_wrong_flag', on(on(ms_open(), mine), cross.done()))


# ---------------------------------------------------------------- pipes

PIPE_GROUND = (86, 98, 120, 255)
PIPE_WALL = (196, 204, 214, 255)
PIPE_WALL_D = (150, 160, 174, 255)
PIPE_DRY = (66, 74, 92, 255)
WATER = (64, 168, 240, 255)
WATER_L = (150, 214, 255, 255)
PW = 26   # outer pipe width (centred on 32): x 19..45 on every edge
PI = 12   # inner channel width: x 26..38
FL = 34   # flange width at the tile edge
FL_D = 4  # flange depth


def pipe_base():
    return tile(PIPE_GROUND)


ARMS = {'n': ((32, 32), (32, -1)), 's': ((32, 32), (32, 65)), 'e': ((32, 32), (65, 32)), 'w': ((32, 32), (-1, 32))}


def pipe(arms, wet, end=None):
    """A pipe piece with arms to the given edges ('n', 'e', 's', 'w'), joined in the middle of the tile.
    Every arm reaches the tile edge with the same width at the same position, with a flange at the edge."""
    p = pipe_base()
    inner = WATER if wet else PIPE_DRY
    # flanges at the edges (drawn first, the pipe body covers their inner half)
    for a in arms:
        h = (FL, FL_D) if a in 'ns' else (FL_D, FL)
        cx = {'n': 32, 's': 32, 'e': 64 - FL_D / 2, 'w': FL_D / 2}[a]
        cy = {'n': FL_D / 2, 's': 64 - FL_D / 2, 'e': 32, 'w': 32}[a]
        p.rect((cx - h[0] / 2, cy - h[1] / 2, cx + h[0] / 2, cy + h[1] / 2), PIPE_WALL_D, 1.5)
    for a in arms:
        p.line(list(ARMS[a]), PIPE_WALL, PW)
    if len(arms) == 1 and end:
        end(p, arms, inner)
        return p.done()
    for a in arms:
        p.line(list(ARMS[a]), inner, PI)
    if wet:  # a light glint along the water
        for a in arms:
            (x0, y0), (x1, y1) = ARMS[a]
            if a in 'ns':
                p.line([(x0 - 2, y0), (x1 - 2, y1)], WATER_L, 3)
            else:
                p.line([(x0, y0 - 2), (x1, y1 - 2)], WATER_L, 3)
    # flange rims again on top so the coupling reads as one ring
    for a in arms:
        h = (FL, FL_D) if a in 'ns' else (FL_D, FL)
        cx = {'n': 32, 's': 32, 'e': 64 - FL_D / 2, 'w': FL_D / 2}[a]
        cy = {'n': FL_D / 2, 's': 64 - FL_D / 2, 'e': 32, 'w': 32}[a]
        p.rect((cx - h[0] / 2, cy - h[1] / 2, cx + h[0] / 2, cy + h[1] / 2), PIPE_WALL_D, 1.5)
    return p.done()


def end_cap(p, arms, inner):
    p.line([(32, 30), (32, -1)], inner, PI)
    p.ellipse((32 - 16, 32 - 12, 32 + 16, 32 + 12), PIPE_WALL_D)
    p.ellipse((32 - 12, 32 - 9, 32 + 12, 32 + 7), PIPE_WALL)
    if inner == WATER:
        p.line([(30, 8), (30, 20)], WATER_L, 3)


def flange_top(p):
    p.rect((32 - FL / 2, 0, 32 + FL / 2, FL_D), PIPE_WALL_D, 1.5)


def source(p, arms, inner):
    """A round water tank in the middle, its pipe leaves to the north."""
    p.line([(32, 30), (32, -1)], WATER, PI)
    p.line([(30, 4), (30, 18)], WATER_L, 3)
    flange_top(p)
    p.ellipse((10, 18, 54, 62), (52, 120, 196, 255))
    p.ellipse((12, 20, 52, 58), (74, 156, 232, 255))
    p.ellipse((18, 26, 46, 52), WATER)
    p.ellipse((22, 29, 32, 37), WATER_L)


def drain(p, arms, inner):
    """A round drain grate in the middle, its pipe comes in from the north."""
    p.line([(32, 30), (32, -1)], PIPE_DRY, PI)
    flange_top(p)
    p.ellipse((12, 20, 52, 60), PIPE_WALL_D)
    p.ellipse((15, 23, 49, 57), (44, 50, 64, 255))
    for x in (22, 28, 34, 40):
        p.rect((x, 28, x + 3, 52), PIPE_WALL, 1.5)


PIPES = {'straight_h': 'we', 'corner_ne': 'ne', 't_n': 'wne', 'cross': 'nesw', 'end_n': 'n'}


def pipes():
    for n, arms in PIPES.items():
        for wet in (False, True):
            put(f'pipe_{n}' + ('_wet' if wet else ''), pipe(arms, wet, end_cap if n == 'end_n' else None))
    put('pipe_empty', pipe_base().done())
    put('pipe_source', pipe('n', True, source))
    put('pipe_drain', pipe('n', False, drain))


# ---------------------------------------------------------------- number tiles (2048 style)

NUM = {  # face, digit colour: cream to orange to red, then gold
    2: ((246, 236, 216), (110, 92, 76)), 4: ((244, 224, 182), (110, 92, 76)), 8: ((246, 186, 114), (255, 255, 255)),
    16: ((244, 150, 92), (255, 255, 255)), 32: ((240, 118, 88), (255, 255, 255)), 64: ((230, 82, 62), (255, 255, 255)),
    128: ((244, 210, 110), (255, 255, 255)), 256: ((240, 196, 80), (255, 255, 255)), 512: ((236, 180, 52), (255, 255, 255)),
    1024: ((226, 160, 32), (255, 255, 255)), 2048: ((214, 140, 18), (255, 255, 255)),
}


def num_tiles():
    for n, (face, col) in NUM.items():
        t = tile(face + (255,), raised=True).done()
        k = len(str(n))
        g = number(str(n), col, {1: 36, 2: 32, 3: 24, 4: 19}[k], 52)
        put(f'num_tile_{n}', on(t, g, y=round(raised_centre() - g.height / 2) + 1))
    put('slide_tile_blank', tile((250, 240, 214, 255), raised=True).done())
    hole = Pen()
    hole.rect((1, 1, 63, 63), (92, 82, 72, 255), R)
    hole.rect((3, 8, 61, 61), (130, 118, 104, 255), R - 2)
    put('slide_tile_hole', hole.done())


# ---------------------------------------------------------------- boards and floors (seamless, full 64x64)

def full(col):
    return Pen(bg=col)


def boards(obj):
    put('chess_square_light', full((230, 200, 154, 255)).done())
    put('chess_square_dark', full((168, 112, 74, 255)).done())
    put('check_square_light', full((246, 232, 206, 255)).done())
    put('check_square_dark', full((84, 128, 92, 255)).done())
    crown = fit(obj['crown'], 26, 20)
    for c, face, rim in (('red', (226, 64, 58), (176, 40, 38)), ('black', (64, 66, 76), (36, 38, 44))):
        p = Pen()
        p.ellipse((5, 9, 59, 59), rim + (255,))
        p.ellipse((5, 5, 59, 55), face + (255,))
        p.ellipse((13, 13, 51, 47), lighter(face, 0.14))
        p.ellipse((17, 17, 47, 43), face + (255,))
        im = p.done()
        put(f'check_{c}', im)
        put(f'check_{c}_king', on(im, crown, y=30 - crown.height // 2))
    alive = tile((92, 196, 96, 255), rim=(70, 168, 76, 255))
    alive.rect((10, 9, 30, 15), (150, 226, 148, 255), 3)
    put('life_alive', alive.done())
    put('life_dead', tile((228, 232, 228, 255), rim=(210, 216, 210, 255)).done())


def stone_wall(top, mortar, shades, seed):
    """Seamless block of bricks seen from above (two rows of bricks per half, offset)."""
    p = full(mortar)
    rng = np.random.default_rng(seed)
    for row in range(4):
        y = row * 16
        off = 0 if row % 2 == 0 else -16
        for x in range(off, 64, 32):
            sh = shades[rng.integers(len(shades))]
            p.rect((x + 1, y + 1, x + 31, y + 15), sh, 3)
            p.rect((x + 3, y + 2, x + 29, y + 5), lighter(sh, 0.18), 2)
        if off:
            sh = shades[rng.integers(len(shades))]
            p.rect((49, y + 1, 79, y + 15), sh, 3)
    return p.done()


def planks(base, line, seed):
    p = full(base)
    rng = np.random.default_rng(seed)
    for k in range(4):
        y = k * 16
        p.rect((0, y, 64, y + 1), line)
        x = int(rng.integers(8, 56))
        p.rect((x, y, x + 1, y + 16), line)
        p.ellipse((x + 6, y + 6, x + 9, y + 9), darker(base, 0.08))
    return p.done()


def sokoban(obj):
    floor = full((222, 210, 184, 255))
    for x, y in ((12, 14), (44, 40), (30, 52), (50, 10)):
        floor.ellipse((x, y, x + 3, y + 3), (208, 194, 166, 255))
    floor = floor.done()
    put('gp_floor', floor)
    put('gp_wall', stone_wall(None, (96, 88, 96, 255), [(150, 140, 150, 255), (140, 130, 142, 255), (160, 150, 158, 255)], 3))
    mark = Pen()
    mark.ellipse((10, 10, 54, 54), (236, 92, 70, 255))
    mark.ellipse((15, 15, 49, 49), (222, 210, 184, 255))
    mark.line([(24, 24), (40, 40)], (236, 92, 70, 255), 6)
    mark.line([(40, 24), (24, 40)], (236, 92, 70, 255), 6)
    target = on(floor, mark.done())
    put('gp_target', target)
    crate = resize(obj['crate'], (60, 60))
    put('gp_crate', on(blank(), crate))
    put('gp_crate_on_target', on(target, green_crate(crate)))


def green_crate(crate):
    """The crate in green-tinted wood with a light rim: 'done' state of a sokoban crate."""
    a = np.asarray(crate).astype(np.float32)
    lum = (a[..., :3] @ np.array([0.3, 0.55, 0.15])) / 255
    lo, hi = np.array([40, 110, 60]), np.array([150, 222, 120])
    rgb = lo + (hi - lo) * np.clip((lum[..., None] - 0.15) / 0.7, 0, 1)
    im = Image.fromarray(np.dstack([rgb, a[..., 3]]).astype(np.uint8), 'RGBA')
    return resize(im, (54, 54))


def maze(obj):
    put('maze2_floor', planks((214, 170, 120, 255), (186, 140, 96, 255), 5))
    put('maze2_wall_top', stone_wall(None, (128, 66, 52, 255), [(196, 104, 80, 255), (184, 96, 74, 255), (206, 116, 88, 255)], 8))
    put('maze2_cheese', padded(fit(obj['cheese'], 44)))
    put('maze2_mousehole', padded(fit(obj['mousehole'], 52)))
    put('maze2_trap', padded(fit(obj['trap'], 52)))


# ---------------------------------------------------------------- chess

def dark_wood(im):
    """Recolour an ivory piece to dark wood: the luminance maps onto a brown ramp (same shape, same shading)."""
    a = np.asarray(im).astype(np.float32)
    lum = (a[..., :3] @ np.array([0.3, 0.55, 0.15])) / 255
    t = np.clip((lum - 0.45) / 0.5, 0, 1)[..., None]
    lo, hi = np.array([42, 25, 18]), np.array([108, 66, 40])
    rgb = lo + (hi - lo) * t
    return Image.fromarray(np.dstack([rgb, a[..., 3]]).astype(np.uint8), 'RGBA')


CHESS = ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king']


CHESS_H = {'pawn': 42, 'rook': 48, 'knight': 52, 'bishop': 54, 'queen': 58, 'king': 60}  # heights on the 64x64 canvas


def chess(pieces):
    for n, p in zip(CHESS, pieces):
        im = fit(p, 58, CHESS_H[n])
        w = on(blank(), im, y=62 - im.height)
        put(f'chess_{n}_w', w)
        put(f'chess_{n}_b', dark_wood(w))


# ---------------------------------------------------------------- build

OBJECTS = ['crate', 'mine', 'flag', 'crown', 'cheese', 'mousehole', 'trap', 'x_mark']
HUNT = ['chest', 'shovel', 'hole', 'map', 'compass', 'footprints', 'gold']


def build():
    os.makedirs(HERE, exist_ok=True)
    obj = dict(zip(OBJECTS, comps(sheet_path('objects'), 8)))
    chess(comps(sheet_path('chess'), 6))
    minesweeper(obj)
    pipes()
    num_tiles()
    boards(obj)
    sokoban(obj)
    maze(obj)
    hunt = dict(zip(HUNT, comps(sheet_path('hunt'), 8, grow=20)))  # the model drew two gold bags; the first is used
    put('hunt_chest', padded(fit(hunt['chest'], 56)))
    put('hunt_shovel', padded(fit(hunt['shovel'], 56)))
    put('hunt_hole', padded(fit(hunt['hole'], 56)))
    put('hunt_map', padded(fit(hunt['map'], 60)))
    put('hunt_compass', padded(fit(hunt['compass'], 44)))
    put('hunt_x_mark', padded(fit(obj['x_mark'], 44)))
    fp = padded(fit(hunt['footprints'], 44))
    put('hunt_footprints_1', fp)
    put('hunt_footprints_2', fp.transpose(Image.FLIP_LEFT_RIGHT))
    put('hunt_gold', padded(fit(hunt['gold'], 40)))
    print(len(OUT), 'images')


# ---------------------------------------------------------------- pack.json

PIECE = {'pawn': ('Bauer', 'pawn'), 'rook': ('Turm', 'rook'), 'knight': ('Springer', 'knight'),
         'bishop': ('Läufer', 'bishop'), 'queen': ('Dame', 'queen'), 'king': ('König', 'king')}
PIPE_DE = {'straight_h': ('Gerades Rohr waagrecht (offen nach Westen und Osten)', 'Straight pipe, horizontal (open to west and east)'),
           'corner_ne': ('Rohr-Ecke, offen nach Norden und Osten', 'Pipe corner, open to north and east'),
           't_n': ('T-Stück, offen nach Westen, Norden und Osten (Süden zu)', 'T piece, open to west, north and east (south closed)'),
           'cross': ('Kreuzung, offen nach allen vier Seiten', 'Cross, open to all four sides'),
           'end_n': ('Rohrende mit Kappe, offen nur nach Norden', 'Pipe end with a cap, open to the north only')}


def entries():
    E = []

    def add(name, tags, de, en):
        E.append(dict(name=name, file=name + '.png', tags=['puzzle'] + tags, de=de, en=en))

    add('gp_floor', ['sokoban', 'tile'], 'Sokoban: Boden (Kachel 64x64, nahtlos)', 'Sokoban: floor (tile 64x64, seamless)')
    add('gp_wall', ['sokoban', 'tile', 'wall'], 'Sokoban: Mauerblock (Kachel 64x64, nahtlos)', 'Sokoban: wall block (tile 64x64, seamless)')
    add('gp_target', ['sokoban', 'tile'], 'Sokoban: Zielfeld mit rotem X auf dem Boden (64x64)', 'Sokoban: target, floor with a red X marker (64x64)')
    add('gp_crate', ['sokoban'], 'Sokoban: Holzkiste von oben (64x64, Rand durchsichtig)', 'Sokoban: wooden crate from above (64x64, transparent margin)')
    add('gp_crate_on_target', ['sokoban', 'tile'], 'Sokoban: grüne Kiste auf dem Zielfeld (fertig)', 'Sokoban: green crate on the target (done)')
    add('ms_hidden', ['minesweeper', 'tile'], 'Minensuche: verdecktes, erhabenes Feld (64x64)', 'Minesweeper: hidden raised tile (64x64)')
    add('ms_empty', ['minesweeper', 'tile'], 'Minensuche: aufgedecktes leeres Feld (64x64)', 'Minesweeper: opened empty tile (64x64)')
    colours = {1: ('blau', 'blue'), 2: ('grün', 'green'), 3: ('rot', 'red'), 4: ('dunkelblau', 'dark blue'),
               5: ('dunkelrot', 'dark red'), 6: ('türkis', 'teal'), 7: ('schwarz', 'black'), 8: ('grau', 'grey')}
    for n, (de, en) in colours.items():
        add(f'ms_{n}', ['minesweeper', 'tile', 'number'], f'Minensuche: aufgedecktes Feld mit {n} ({de}): {n} Minen daneben',
            f'Minesweeper: opened tile with {n} ({en}): {n} mines around')
    add('ms_flag', ['minesweeper', 'tile'], 'Minensuche: verdecktes Feld mit roter Fahne', 'Minesweeper: hidden tile with a red flag')
    add('ms_mine', ['minesweeper', 'tile'], 'Minensuche: aufgedecktes Feld mit Mine', 'Minesweeper: opened tile with a mine')
    add('ms_mine_hit', ['minesweeper', 'tile'], 'Minensuche: getroffene Mine auf rotem Feld', 'Minesweeper: the mine that was hit, red tile')
    add('ms_wrong_flag', ['minesweeper', 'tile'], 'Minensuche: falsch markiert, Mine rot durchgestrichen', 'Minesweeper: wrong flag, mine crossed out in red')
    for n, (de, en) in PIPE_DE.items():
        add(f'pipe_{n}', ['pipes', 'tile'], f'Rohr-Puzzle: {de}, leer; mit angle drehen', f'Pipe puzzle: {en}, empty; rotate with angle')
        add(f'pipe_{n}_wet', ['pipes', 'tile'], f'Rohr-Puzzle: {de}, mit Wasser gefüllt', f'Pipe puzzle: {en}, filled with water')
    add('pipe_empty', ['pipes', 'tile'], 'Rohr-Puzzle: leeres Feld ohne Rohr', 'Pipe puzzle: empty tile without a pipe')
    add('pipe_source', ['pipes', 'tile'], 'Rohr-Puzzle: Wasserquelle (Tank), Rohr nach Norden', 'Pipe puzzle: water source (tank), pipe to the north')
    add('pipe_drain', ['pipes', 'tile'], 'Rohr-Puzzle: Abfluss (Gitter), Rohr von Norden', 'Pipe puzzle: drain (grate), pipe from the north')
    for k, (de, en) in PIECE.items():
        add(f'chess_{k}_w', ['chess', 'piece'], f'Schach: weißer {de}' if k not in ('queen',) else 'Schach: weiße Dame', f'Chess: white {en}')
        add(f'chess_{k}_b', ['chess', 'piece'], f'Schach: schwarzer {de} (dunkles Holz)' if k != 'queen' else 'Schach: schwarze Dame (dunkles Holz)',
            f'Chess: black {en} (dark wood)')
    add('chess_square_light', ['chess', 'tile', 'board'], 'Schach: helles Brettfeld (64x64)', 'Chess: light board square (64x64)')
    add('chess_square_dark', ['chess', 'tile', 'board'], 'Schach: dunkles Brettfeld (64x64)', 'Chess: dark board square (64x64)')
    add('check_red', ['checkers', 'piece'], 'Dame-Spiel: roter Stein', 'Checkers: red piece')
    add('check_black', ['checkers', 'piece'], 'Dame-Spiel: schwarzer Stein', 'Checkers: black piece')
    add('check_red_king', ['checkers', 'piece'], 'Dame-Spiel: roter Stein mit Krone (Dame)', 'Checkers: red king with a crown')
    add('check_black_king', ['checkers', 'piece'], 'Dame-Spiel: schwarzer Stein mit Krone (Dame)', 'Checkers: black king with a crown')
    add('check_square_light', ['checkers', 'tile', 'board'], 'Dame-Spiel: helles Brettfeld (64x64)', 'Checkers: light board square (64x64)')
    add('check_square_dark', ['checkers', 'tile', 'board'], 'Dame-Spiel: dunkelgrünes Brettfeld (64x64)', 'Checkers: dark green board square (64x64)')
    add('life_alive', ['life', 'tile'], 'Spiel des Lebens: lebende grüne Zelle (64x64)', 'Game of life: living green cell (64x64)')
    add('life_dead', ['life', 'tile'], 'Spiel des Lebens: tote, leere Zelle (64x64)', 'Game of life: dead empty cell (64x64)')
    add('slide_tile_blank', ['sliding', 'tile'], 'Schiebepuzzle: helles Plättchen ohne Zahl (64x64)', 'Sliding puzzle: pale tile without a number (64x64)')
    add('slide_tile_hole', ['sliding', 'tile'], 'Schiebepuzzle: das leere Loch (64x64)', 'Sliding puzzle: the empty hole (64x64)')
    for n in NUM:
        add(f'num_tile_{n}', ['numbers', 'tile', 'number'], f'Zahlenplättchen {n} (2048-Spiel, 64x64)', f'Number tile {n} (2048 game, 64x64)')
    add('maze2_floor', ['maze', 'tile'], 'Mäuse-Labyrinth: Holzboden (Kachel 64x64, nahtlos)', 'Mouse maze: wooden floor (tile 64x64, seamless)')
    add('maze2_wall_top', ['maze', 'tile', 'wall'], 'Mäuse-Labyrinth: Mauerblock von oben (64x64)', 'Mouse maze: wall block from above (64x64)')
    add('maze2_cheese', ['maze', 'item'], 'Mäuse-Labyrinth: Stück Käse', 'Mouse maze: piece of cheese')
    add('maze2_mousehole', ['maze'], 'Mäuse-Labyrinth: Mauseloch in der Holzwand', 'Mouse maze: mouse hole in a wooden wall')
    add('maze2_trap', ['maze', 'obstacle'], 'Mäuse-Labyrinth: Mausefalle von oben', 'Mouse maze: mousetrap from above')
    add('hunt_chest', ['treasure', 'item'], 'Schatzsuche: Schatztruhe', 'Treasure hunt: treasure chest')
    add('hunt_x_mark', ['treasure'], 'Schatzsuche: rotes X auf dem Boden', 'Treasure hunt: red X on the ground')
    add('hunt_shovel', ['treasure', 'item'], 'Schatzsuche: Schaufel', 'Treasure hunt: shovel')
    add('hunt_hole', ['treasure'], 'Schatzsuche: gegrabenes Loch von oben', 'Treasure hunt: dug hole from above')
    add('hunt_map', ['treasure', 'item'], 'Schatzsuche: Schatzkarte', 'Treasure hunt: treasure map')
    add('hunt_compass', ['treasure', 'item'], 'Schatzsuche: Kompass', 'Treasure hunt: compass')
    add('hunt_footprints_1', ['treasure'], 'Schatzsuche: Fußspuren nach oben, linker Fuß vorn (Bild 1 von 2)',
        'Treasure hunt: footprints going up, left foot ahead (frame 1 of 2)')
    add('hunt_footprints_2', ['treasure'], 'Schatzsuche: Fußspuren nach oben, rechter Fuß vorn (Bild 2 von 2)',
        'Treasure hunt: footprints going up, right foot ahead (frame 2 of 2)')
    add('hunt_gold', ['treasure', 'item'], 'Schatzsuche: Beutel mit Goldmünzen', 'Treasure hunt: bag of gold coins')
    return E


def write_json():
    E = entries()
    names = sorted(f[:-4] for f in os.listdir(HERE) if f.endswith('.png'))
    missing = {e['name'] for e in E} - set(names)
    extra = set(names) - {e['name'] for e in E}
    if missing or extra:
        raise ValueError(f'missing {sorted(missing)} extra {sorted(extra)}')
    pack = dict(pack='grid_puzzle', title=dict(de='Raster-Rätsel und Brettspiele', en='Grid puzzles and board games'),
                format='png', assets=E)
    with open(os.path.join(HERE, 'pack.json'), 'w', encoding='utf-8') as fh:
        json.dump(pack, fh, ensure_ascii=False, indent=2)
        fh.write('\n')
    print(len(E), 'entries')


def contact(scale=2):
    names = [e['name'] for e in entries() if os.path.exists(os.path.join(HERE, e['name'] + '.png'))]
    ims = [Image.open(os.path.join(HERE, n + '.png')).convert('RGBA') for n in names]
    cell, cols = 72 * scale, 12
    rows = (len(ims) + cols - 1) // cols
    for bg, tag in (((40, 40, 48), 'dark'), ((245, 245, 240), 'light')):
        sheet = Image.new('RGBA', (cols * cell, rows * cell), bg + (255,))
        for k, im in enumerate(ims):
            im = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
            x, y = (k % cols) * cell, (k // cols) * cell
            sheet.alpha_composite(im, (x + (cell - im.width) // 2, y + (cell - im.height) // 2))
        sheet.save(os.path.join(WORK, f'contact_{tag}.png'))


if __name__ == '__main__':
    cmd, args = (sys.argv[1] if len(sys.argv) > 1 else ''), sys.argv[2:]
    if cmd == 'gen':
        with ThreadPoolExecutor(4) as ex:
            for s, r in ex.map(do_gen, args or list(SHEETS)):
                print(s, r, flush=True)
    elif cmd == 'build':
        build()
    elif cmd == 'json':
        write_json()
    elif cmd == 'contact':
        contact()
    else:
        print(__doc__)
