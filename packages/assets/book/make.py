"""Book pack: the pond game of the school book (a duck brings five chicks across a pond, boats cross it).

python3 make.py gen [sheet ...]   draw sheets with the image model into WORK
python3 make.py cut               cut the sheets into the pack folder
Sheets are kept in WORK; the pack files are in this folder.
"""
import os, sys, json
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'asset-gen'))
from gen import gen
from keyslice import cut_items, key

WORK = os.environ.get('BOOK_WORK', '/tmp/claude-0/-home-user/82af8643-7fd2-511f-b912-5aee8d74fb4e/scratchpad/assets-work/book')
REF = os.path.join(ROOT, 'scripts', 'asset-gen', 'style-emoji.png')

BASE = ('Draw in the exact same flat emoji style as the reference image: clear flat shapes without outlines, very few colours, '
        'rounded friendly forms, no gradients, no hard shading. Do NOT draw any of the objects from the reference image. '
        'Background: one flat pure magenta (#FF00FF) colour everywhere around the objects. No shadows, no ground, no water '
        'surface, no ripples under objects, no text, no labels, no frames. Every object is completely separate from the others '
        'with wide magenta space between them; nothing touches or overlaps. ')

SHEETS = {
    # duck and chicks: one family, seen from slightly above, swimming to the right
    'birds': (BASE + 'Make a sheet with exactly 4 objects in a 2x2 grid (reading order: top left, top right, bottom left, bottom right), '
              'all seen from the side and slightly above, all facing RIGHT, each shown as floating (no water drawn): '
              '1) a plump friendly WHITE duck with an orange bill and a small dark eye, swimming calmly; '
              '2) the same white duck, cartoon-dizzy after a crash: swirly spiral eyes, three small yellow stars circling above its head, feathers ruffled, bill open; '
              '3) a small round fluffy YELLOW duckling with an orange bill, much smaller than the duck; '
              '4) the same small duckling but light BROWN-grey with a cream belly. '
              'Draw the 2 ducks large and the 2 ducklings about half as large.'),
    'boats': (BASE + 'Make a sheet with exactly 3 small motorboats stacked in 1 column of 3 rows with wide gaps, '
              'each seen from the side and slightly above (so the deck is a little visible), bow pointing RIGHT, long and low '
              '(about 2.4 times as wide as high), simple rounded hull, a small windscreen, no people, no flags, no numbers, '
              'no water and no wave lines under them: '
              '1) red hull with a white deck; 2) yellow hull with a blue deck; 3) green hull with a white deck. '
              'All three exactly the same size and shape, only the colours differ.'),
    'pond': (BASE + 'Make a sheet with exactly 6 pond objects in a 3x2 grid (3 columns, 2 rows; reading order row by row), '
             'each seen from straight ABOVE (top-down view) unless noted: '
             '1) a round green water lily pad with a notch, with one small pink water lily flower on it; '
             '2) a clump of reeds seen from the side: several tall thin green stalks with two brown cattail heads; '
             '3) a single rounded grey stone with a lighter top, seen from above; '
             '4) a cute green frog sitting on a round green lily pad, seen from above and slightly in front, frog looking up; '
             '5) an orange fish seen from straight above, swimming to the RIGHT, with a forked tail; '
             '6) a silver-blue fish seen from straight above, swimming to the RIGHT, slimmer, with a forked tail.'),
    'tiles': ('Draw in the exact same flat emoji style as the reference image (flat colours, no outlines, no gradients). '
              'Do NOT draw any of the objects from the reference image. Make exactly 2 SQUARE game tiles side by side with a wide '
              'flat pure magenta (#FF00FF) gap between them and magenta all around, no text, no shadows: '
              '1) LEFT: a top-down grass tile, the whole square filled with flat green grass (RGB about 110,170,90) with a few '
              'small darker and lighter grass tufts spread evenly, sharp square corners; '
              '2) RIGHT: a top-down water tile, the whole square filled with flat blue water (RGB 74,144,180) with three or four '
              'small light blue wave marks spread evenly, sharp square corners.'),
}

BOATS = ['boot', 'boot_2', 'boot_3']
# names starting with '_' are cut but not kept (the birds sheet came out with two extra chicks)
DUCK = ['ente', 'ente_tot', 'kueken', '_kueken_b', 'kueken_2', '_kueken_2b']
POND = ['seerose', 'schilf', 'stein', 'frosch', 'fisch_1', 'fisch_2']

# name: (tags, German, English) -> pack.json
INFO = {
    'ente': (['animal', 'player', 'pond'], 'Weiße Ente, schwimmt nach rechts (Spielfigur des Teich-Spiels im Buch)', 'White duck swimming to the right (the player of the book\'s pond game)'),
    'ente_links': (['animal', 'player', 'pond'], 'Weiße Ente, schwimmt nach links', 'White duck swimming to the left'),
    'ente_tot': (['animal', 'player', 'pond'], 'Ente nach dem Zusammenstoß: benommen, mit Sternen über dem Kopf', 'Duck after a crash: dizzy, with stars above its head'),
    'kueken': (['animal', 'item', 'pond'], 'Gelbes Küken, schaut nach rechts', 'Yellow duckling facing right'),
    'kueken_2': (['animal', 'item', 'pond'], 'Graubraunes Küken, schaut nach rechts', 'Grey-brown duckling facing right'),
    'boot': (['vehicle', 'enemy', 'pond'], 'Rotes Motorboot, fährt nach rechts, genau 120 Pixel breit', 'Red motorboat driving to the right, exactly 120 px wide'),
    'boot_2': (['vehicle', 'enemy', 'pond'], 'Gelbes Motorboot, fährt nach rechts, 120 Pixel breit', 'Yellow motorboat driving to the right, 120 px wide'),
    'boot_3': (['vehicle', 'enemy', 'pond'], 'Grünes Motorboot, fährt nach rechts, 120 Pixel breit', 'Green motorboat driving to the right, 120 px wide'),
    'seerose': (['plant', 'pond'], 'Seerosenblatt mit rosa Blüte, von oben', 'Water lily pad with a pink flower, seen from above'),
    'schilf': (['plant', 'pond'], 'Schilf mit zwei Rohrkolben, von der Seite', 'Reeds with two cattails, seen from the side'),
    'stein': (['obstacle', 'pond'], 'Grauer Stein im Wasser', 'Grey stone in the water'),
    'frosch': (['animal', 'pond'], 'Grüner Frosch auf einem Seerosenblatt', 'Green frog sitting on a lily pad'),
    'fisch_1': (['animal', 'pond'], 'Orangefarbener Fisch, schwimmt nach rechts (von der Seite)', 'Orange fish swimming to the right (side view)'),
    'fisch_2': (['animal', 'pond'], 'Silberblauer Fisch, schwimmt nach rechts (von der Seite)', 'Silver-blue fish swimming to the right (side view)'),
    'welle': (['effect', 'pond'], 'Kleine helle Welle, 20 Pixel breit', 'Small light wave mark, 20 px wide'),
    'ufer_gras': (['tile', 'pond'], 'Graskachel 64x64, von oben', 'Grass tile 64x64, seen from above'),
    'wasser': (['tile', 'pond'], 'Wasserkachel 64x64, von oben, mit hellen Wellen', 'Water tile 64x64, seen from above, with light wave marks'),
    'teich_hintergrund': (['background', 'pond'], 'Teich von oben, 800x600: Wasser in der Mitte, Grasufer oben und unten (wie im Buch)', 'Pond seen from above, 800x600: water in the middle, grass banks at top and bottom (as in the book)'),
}


def write_pack():
    assets = [{'name': n, 'file': n + '.png', 'tags': t, 'de': de, 'en': en} for n, (t, de, en) in INFO.items()]
    pack = {'pack': 'book', 'title': {'de': 'Teich-Spiel aus dem Buch', 'en': 'Pond game of the book'}, 'format': 'png', 'assets': assets}
    with open(os.path.join(HERE, 'pack.json'), 'w', encoding='utf8') as f:
        json.dump(pack, f, ensure_ascii=False, indent=2)
        f.write('\n')


def sheet(name):
    return os.path.join(WORK, name + '.png')


def run_gen(names):
    os.makedirs(WORK, exist_ok=True)
    def one(n):
        for _ in range(3):
            r = gen(os.path.join(WORK, n), SHEETS[n], REF)
            if r == 'ok':
                return n + ' ok'
        return n + ' ' + r
    with ThreadPoolExecutor(5) as ex:
        for r in ex.map(one, names):
            print(r)


def scale_to(path, width=None, long_side=None, pad=2, factor=None):
    """Rescale a cut file (which has a pad margin) so the drawing has `width` or `long_side` pixels."""
    im = Image.open(path)
    im = im.crop(im.getbbox())
    s = factor or (width / im.width if width else long_side / max(im.size))
    im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    c = Image.new('RGBA', (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
    c.paste(im, (pad, pad), im)
    c.save(path, optimize=True)


def square_tile(rgba, box, size=64):
    """Cut a square tile from the keyed sheet: the inner part of a found square, opaque."""
    y0, y1, x0, x1 = box
    m = max(4, (x1 - x0) // 25)  # skip the anti-aliased rim
    im = Image.fromarray(rgba[y0 + m:y1 - m, x0 + m:x1 - m, :3], 'RGB').resize((size, size), Image.LANCZOS)
    return im.convert('RGBA')


def wave(path):
    """Small light wave mark (drawn, not generated): two soft white crests, 20 px wide."""
    S = 8
    im = Image.new('RGBA', (20 * S, 10 * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    col = (220, 240, 250, 235)
    d.arc((1 * S, 2 * S, 10 * S, 11 * S), 200, 340, fill=col, width=int(2.2 * S))
    d.arc((10 * S, 2 * S, 19 * S, 11 * S), 200, 340, fill=col, width=int(2.2 * S))
    im = im.resize((20, 10), Image.LANCZOS)
    im = im.crop(im.getbbox())
    c = Image.new('RGBA', (im.width + 2, im.height + 2), (0, 0, 0, 0))
    c.paste(im, (1, 1), im)
    c.save(path, optimize=True)


def cut():
    out = HERE
    from scipy import ndimage
    # birds: the duck is about 60 px wide, the chick about 36
    files = cut_items(sheet('birds'), DUCK, 200, WORK + '/cut')
    for f, n in zip(files, DUCK):
        if not n.startswith('_'):
            Image.open(f).save(os.path.join(out, n + '.png'))
    # one factor per group, so that the dizzy duck (with its stars) keeps the size of the duck
    for group, w in ((('ente', 'ente_tot'), 60), (('kueken', 'kueken_2'), 36)):
        ref = Image.open(os.path.join(out, group[0] + '.png'))
        f = w / ref.crop(ref.getbbox()).width
        for n in group:
            scale_to(os.path.join(out, n + '.png'), factor=f)
    Image.open(os.path.join(out, 'ente.png')).transpose(Image.FLIP_LEFT_RIGHT).save(os.path.join(out, 'ente_links.png'), optimize=True)
    # boats: exactly 120 px wide (drawing 116 + 2 px margin each side)
    for f, n in zip(cut_items(sheet('boats'), BOATS, 200, WORK + '/cut'), BOATS):
        Image.open(f).save(os.path.join(out, n + '.png'))
        scale_to(os.path.join(out, n + '.png'), width=116)
    # pond objects
    sizes = {'seerose': 48, 'schilf': 64, 'stein': 40, 'frosch': 52, 'fisch_1': 40, 'fisch_2': 40}
    for f, n in zip(cut_items(sheet('pond'), POND, 200, WORK + '/cut'), POND):
        Image.open(f).save(os.path.join(out, n + '.png'))
        scale_to(os.path.join(out, n + '.png'), long_side=sizes[n])
    # tiles: the two biggest opaque squares, left = grass, right = water
    rgba = key(Image.open(sheet('tiles')))
    lab, k = ndimage.label(rgba[..., 3] > 128)
    boxes = sorted(ndimage.find_objects(lab), key=lambda s: -(s[0].stop - s[0].start) * (s[1].stop - s[1].start))[:2]
    boxes.sort(key=lambda s: s[1].start)
    for n, s in zip(('ufer_gras', 'wasser'), boxes):
        square_tile(rgba, (s[0].start, s[0].stop, s[1].start, s[1].stop)).save(os.path.join(out, n + '.png'), optimize=True)
    wave(os.path.join(out, 'welle.png'))
    # background: opaque 800x600 (the book's window), put together from the pack's own pieces
    background(rgba, boxes[0], os.path.join(out, 'teich_hintergrund.png'))
    write_pack()


def tufts(rgba, box):
    """The grass tufts of the grass tile as separate RGBA pieces."""
    from scipy import ndimage
    y0, y1, x0, x1 = box[0].start + 8, box[0].stop - 8, box[1].start + 8, box[1].stop - 8
    a = rgba[y0:y1, x0:x1, :3].astype(int)
    base = np.median(a.reshape(-1, 3), axis=0)
    m = np.abs(a - base).sum(-1) > 40
    lab, n = ndimage.label(ndimage.binary_dilation(m, iterations=2))
    res = []
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        mm = ndimage.binary_dilation(lab[sl] == i, iterations=1)
        if mm.sum() < 400: continue
        piece = np.dstack([a[sl], np.where(mm & m[sl] | (lab[sl] == i) & m[sl], 255, 0)]).astype(np.uint8)
        res.append(Image.fromarray(piece, 'RGBA'))
    return res


def background(rgba, grass_box, path):
    """Pond from above, 800x600: water (74,144,180) between grass banks 0-70 and 530-600 as in the book's code,
    decorated with grass tufts of the grass tile and the pack's stone, lily pad, reed and wave mark."""
    import math, random
    rnd = random.Random(7)
    S = 2; W, H = 800 * S, 600 * S
    WATER, SHORE, RIM = (74, 144, 180), (110, 170, 90), (128, 186, 212)
    im = Image.new('RGB', (W, H), WATER)
    d = ImageDraw.Draw(im)
    def edge(x, base, ph):
        return S * (base + 4 * math.sin(x / S / 130 + ph) + 2.5 * math.sin(x / S / 47 + 2 * ph))
    xs = list(range(0, W + 1, 4))
    top = [(x, edge(x, 70, 0.3)) for x in xs]
    bot = [(x, edge(x, 530, 1.9)) for x in xs]
    d.line([(x, y + 3 * S) for x, y in top], fill=RIM, width=4 * S)
    d.line([(x, y - 3 * S) for x, y in bot], fill=RIM, width=4 * S)
    d.polygon([(0, 0)] + top + [(W, 0)], fill=SHORE)
    d.polygon([(0, H)] + bot + [(W, H)], fill=SHORE)
    def put(piece, cx, cy, size):
        p = piece.crop(piece.getbbox())
        s = size * S / max(p.size)
        p = p.resize((max(1, round(p.width * s)), max(1, round(p.height * s))), Image.LANCZOS)
        im.paste(p, (round(cx * S - p.width / 2), round(cy * S - p.height / 2)), p)
    # light wave marks on the open water, away from nothing in particular (the game draws over everything)
    for _ in range(18):
        x, y, r = rnd.randint(30, 760) * S, rnd.randint(95, 505) * S, rnd.choice((5, 6, 7)) * S
        for k in (0, 1):
            cx = x + k * 2 * r
            d.arc((cx - r, y - r, cx + r, y + r), 200, 340, fill=RIM, width=2 * S)
    # lily pads near the shores, outside the book's boat lanes (y 140, 280, 420)
    lily = Image.open(os.path.join(HERE, 'seerose.png'))
    for x, y, sz in ((660, 98, 34), (120, 500, 30), (520, 502, 26)):
        put(lily, x, y, sz)
    # banks: tufts, stones, reed; the top bank stays clear where the book draws the saved chicks (x 30-370)
    tf = tufts(key(Image.open(sheet('tiles'))), grass_box)
    stone = Image.open(os.path.join(HERE, 'stein.png'))
    reed = Image.open(os.path.join(HERE, 'schilf.png'))
    for x in range(410, 800, 70):
        put(rnd.choice(tf), x + rnd.randint(-15, 15), rnd.randint(18, 50), 20)
    for x in range(20, 800, 62):
        put(rnd.choice(tf), x + rnd.randint(-15, 15), rnd.randint(552, 588), 20)
    for x, y in ((520, 30), (745, 22)):
        put(stone, x, y, 16)
    for x, y in ((90, 575), (460, 560), (690, 585)):
        put(stone, x, y, 15)
    put(reed, 775, 518, 46)
    put(reed, 22, 520, 40)
    im.resize((800, 600), Image.LANCZOS).quantize(256, dither=Image.Dither.NONE).save(path, optimize=True)

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'cut'
    if cmd == 'gen':
        run_gen(sys.argv[2:] or list(SHEETS))
    else:
        cut()
