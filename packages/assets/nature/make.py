"""Redraw the `nature` pack (plants and weather).

WORK=<scratch dir> python3 packages/assets/nature/make.py gen [sheet ...]   # draw sheets into WORK
WORK=<scratch dir> python3 packages/assets/nature/make.py cut [sheet ...]   # key, cut and scale into this folder
python3 packages/assets/nature/make.py json                                # write pack.json

The model asks for N objects in a grid but tends to fill the 16:9 sheet with extra objects. So every sheet records the
prompted names and the grid it actually came out in (`cells`, reading order, None = an extra object that is dropped).
After a redraw, look at the sheet and fix `cells` before cutting. Cutting goes by grid cell: all opaque parts in one
cell form one object (rain streaks, sun rays stay together).
"""
import os, sys, json, tempfile
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'asset-gen'))
from gen import gen  # noqa: E402
from keyslice import key  # noqa: E402

REF = os.path.join(ROOT, 'scripts', 'asset-gen', 'style-emoji.png')
WORK = os.environ.get('WORK', os.path.join(tempfile.gettempdir(), 'assets-work', 'nature'))

STYLE = ('Draw in exactly the same flat emoji style as the reference image: clear flat shapes without outlines, '
         'very few colours per object, rounded friendly forms, no hard shading, no gradients. '
         'Do not draw the characters of the reference. ')
BG = ('Every object stands alone, fully separated from the others by wide empty space, none touching or overlapping. '
      'Background: one flat solid pure magenta colour #FF00FF everywhere, no shadows, no ground, no grass under objects, '
      'no text, no labels, no numbers, no grid lines, no frames.')

P = ['nature', 'plant']
FRUIT = ['nature', 'fruit', 'item']
# name -> (long side px, de, en, tags, object prompt)
ITEMS = {
    'nat_oak': (128, 'Eiche mit runder, grüner Krone', 'Oak tree with a round green crown', P + ['tree'],
                'a broad oak tree with a big round cloud-like green crown and a brown trunk'),
    'nat_pine': (128, 'Nadelbaum (Tanne)', 'Pine tree (fir)', P + ['tree'],
                 'a tall dark green pine tree made of three stacked triangle layers on a short brown trunk'),
    'nat_palm': (128, 'Palme mit Fächerblättern', 'Palm tree with fan leaves', P + ['tree'],
                 'a palm tree with a slightly curved ringed trunk and a crown of long green leaves (no coconuts falling)'),
    'nat_apple_tree': (128, 'Apfelbaum mit roten Äpfeln', 'Apple tree with red apples', P + ['tree'],
                       'an apple tree with a round green crown dotted with small red apples and a brown trunk'),
    'nat_birch': (128, 'Birke mit weißem Stamm', 'Birch tree with a white trunk', P + ['tree'],
                  'a slim birch tree with a white trunk with black stripes and a light yellow-green oval crown'),
    'nat_dead_tree': (128, 'Kahler, abgestorbener Baum', 'Bare dead tree', P + ['tree'],
                      'a bare dead tree without leaves, grey-brown trunk with a few crooked branches, all branches connected'),
    'nat_bush': (72, 'Runder grüner Busch', 'Round green bush', P,
                 'a round green bush made of three overlapping bumps'),
    'nat_stump': (56, 'Baumstumpf', 'Tree stump', P + ['wood'],
                  'a short brown tree stump with a light cut top showing rings and small roots'),
    'nat_fern': (64, 'Farn mit gefiederten Wedeln', 'Fern with feathery fronds', P,
                 'a green fern plant with several feathery fronds growing from one point'),
    'nat_cactus': (72, 'Kaktus mit zwei Armen', 'Cactus with two arms', P,
                   'a green saguaro-style cactus with two arms and a few tiny spines, no pot'),
    'nat_sunflower': (80, 'Sonnenblume', 'Sunflower', P + ['flower'],
                      'a tall sunflower with yellow petals, brown centre, green stem and two leaves'),
    'nat_tulip': (48, 'Rote Tulpe', 'Red tulip', P + ['flower'],
                  'a single red tulip with a green stem and two long leaves'),
    'nat_daisy': (48, 'Gänseblümchen', 'Daisy', P + ['flower'],
                  'a single white daisy with a yellow centre on a short green stem with one leaf'),
    'nat_rose': (48, 'Rote Rose', 'Red rose', P + ['flower'],
                 'a single red rose blossom on a green stem with two leaves'),
    'nat_grass_tuft': (40, 'Kleines Grasbüschel', 'Small tuft of grass', P,
                       'a small low tuft of green grass blades, wider than tall'),
    'nat_tall_grass': (64, 'Hohes Gras', 'Tall grass', P,
                       'a clump of tall thin green grass blades, taller than wide, all blades joined at the bottom'),
    'nat_vine': (80, 'Hängende Ranke mit Blättern', 'Hanging vine with leaves', P,
                 'a single hanging green vine, one continuous wavy stem from top to bottom with small leaves attached to it'),
    'nat_mushroom_brown': (40, 'Brauner Pilz', 'Brown mushroom', P + ['mushroom'],
                           'a small brown mushroom with a smooth round light brown cap and a cream stem, no spots'),
    'nat_mushroom_blue': (40, 'Blauer Zierpilz', 'Blue decorative mushroom', P + ['mushroom'],
                          'a small cute toadstool with a teal-blue cone-shaped cap with a few small pale dots and a white stem'),
    'nat_log': (72, 'Liegender Baumstamm', 'Lying log', P + ['wood'],
                'a lying brown tree log seen from the side, the cut end showing light rings facing the viewer on the right'),
    'nat_rock_1': (48, 'Runder grauer Stein', 'Round grey rock', ['nature', 'rock'], 'a round smooth grey boulder'),
    'nat_rock_2': (56, 'Flacher grauer Felsbrocken', 'Flat grey rock', ['nature', 'rock'],
                   'a wide flat grey rock with a slightly lighter top'),
    'nat_rock_3': (56, 'Felsgruppe aus drei Steinen', 'Group of three rocks', ['nature', 'rock'],
                   'a group of three grey rocks of different sizes pressed together into one shape'),
    'nat_leaf': (32, 'Grünes Blatt', 'Green leaf', P, 'a single green leaf with a short stem and a lighter centre vein'),
    'nat_carrot': (48, 'Karotte mit grünem Kraut', 'Carrot with green leaves', P + ['garden', 'vegetable'],
                   'an orange carrot with green leafy top, pointing down'),
    'nat_tomato': (40, 'Rote Tomate', 'Red tomato', P + ['garden', 'vegetable'],
                   'a round red tomato with a small green star-shaped stem on top'),
    'nat_pumpkin': (56, 'Orangefarbener Kürbis', 'Orange pumpkin', P + ['garden', 'vegetable'],
                    'a round orange pumpkin with ribs and a short green stem, no face'),
    'nat_corn': (56, 'Maiskolben', 'Corn cob', P + ['garden', 'vegetable'],
                 'an upright yellow corn cob with green husk leaves at the bottom'),
    'nat_seedling': (40, 'Keimling mit zwei Blättern', 'Seedling with two leaves', P + ['garden'],
                     'a tiny green seedling sprout with two round leaves growing from a small mound of brown soil'),
    'nat_flowerpot': (56, 'Blumentopf mit Blume', 'Flowerpot with a flower', P + ['garden', 'flower'],
                      'a terracotta flowerpot with a pink flower and two green leaves growing out of it'),
    'nat_snowman': (72, 'Schneemann mit Hut und Schal', 'Snowman with a hat and scarf', ['nature', 'weather', 'winter'],
                    'a snowman of two snowballs with a carrot nose, coal eyes, a red scarf and a small black hat, facing right'),
    'nat_moon': (56, 'Mondsichel', 'Crescent moon', ['nature', 'sky'], 'a pale yellow crescent moon, no face'),
    'fruit_apple': (32, 'Roter Apfel', 'Red apple', FRUIT, 'a red apple with a small leaf'),
    'fruit_cherry': (32, 'Zwei Kirschen', 'Two cherries', FRUIT, 'a pair of red cherries joined by their green stems'),
    'fruit_orange': (32, 'Orange', 'Orange', FRUIT, 'a round orange with a small green leaf'),
    'fruit_banana': (32, 'Banane', 'Banana', FRUIT, 'a single curved yellow banana'),
    'fruit_strawberry': (32, 'Erdbeere', 'Strawberry', FRUIT, 'a red strawberry with yellow seeds and a green leafy top'),
    'fruit_grapes': (32, 'Weintrauben', 'Grapes', FRUIT, 'a bunch of purple grapes with a green leaf'),
    'fruit_watermelon': (32, 'Melonenscheibe', 'Watermelon slice', FRUIT,
                         'a triangular watermelon slice, red flesh with black seeds and a green rind'),
    'fruit_pear': (32, 'Grüne Birne', 'Green pear', FRUIT, 'a yellow-green pear with a brown stem'),
    'nat_cloud_1': (96, 'Weiße Wolke, rund', 'White cloud, round', ['nature', 'sky', 'cloud'],
                    'a fluffy white cloud made of three round bumps, flat bottom'),
    'nat_cloud_2': (96, 'Weiße Wolke, lang', 'White cloud, long', ['nature', 'sky', 'cloud'],
                    'a long flat white cloud made of five small bumps'),
    'nat_cloud_3': (64, 'Kleine weiße Wolke', 'Small white cloud', ['nature', 'sky', 'cloud'],
                    'a small white cloud made of two bumps'),
    'nat_sun': (72, 'Sonne mit Strahlen', 'Sun with rays', ['nature', 'sky', 'weather'],
                'a yellow sun disc with short triangular orange rays that touch the disc, no face'),
    'nat_rainbow': (96, 'Regenbogen (Halbbogen)', 'Rainbow (half circle arc)', ['nature', 'sky', 'weather'],
                    'a rainbow arc with six touching colour bands (red, orange, yellow, green, blue, violet) and no clouds'),
    'nat_rain_cloud': (80, 'Graue Regenwolke mit Tropfen', 'Grey rain cloud with drops', ['nature', 'sky', 'weather', 'cloud'],
                       'a grey rain cloud with short blue rain streaks attached directly under it'),
    'fruit_lemon': (32, 'Zitrone', 'Lemon', FRUIT, 'a yellow lemon, oval with pointed ends'),
    'fruit_pineapple': (32, 'Ananas', 'Pineapple', FRUIT, 'a pineapple with a golden body and a spiky green crown'),
    'nat_raindrop': (24, 'Regentropfen', 'Raindrop', ['nature', 'weather'], 'a single blue raindrop'),
    'nat_snowflake': (32, 'Schneeflocke', 'Snowflake', ['nature', 'weather', 'winter'], 'a light blue six-armed snowflake, all arms joined in the middle'),
    'nat_lightning': (48, 'Blitz', 'Lightning bolt', ['nature', 'weather'], 'a yellow zigzag lightning bolt'),
}

_ = None
# sheet -> (grid asked for, names asked for in order, (cols, rows) of the result, cells of the result in reading order)
SHEETS = {
    'trees': ('3 columns and 2 rows',
              ['nat_oak', 'nat_pine', 'nat_palm', 'nat_apple_tree', 'nat_birch', 'nat_dead_tree'],
              (4, 2), ['nat_oak', 'nat_pine', 'nat_palm', _, 'nat_apple_tree', 'nat_birch', _, 'nat_dead_tree']),
    'plants': ('3 columns and 3 rows',
               ['nat_bush', 'nat_fern', 'nat_cactus', 'nat_sunflower', 'nat_tulip', 'nat_daisy', 'nat_rose',
                'nat_grass_tuft', 'nat_tall_grass'],
               (4, 3), ['nat_bush', 'nat_fern', 'nat_cactus', 'nat_sunflower', _, 'nat_tulip', 'nat_daisy', _,
                        'nat_rose', 'nat_grass_tuft', _, 'nat_tall_grass']),
    'forest': ('4 columns and 2 rows',
               ['nat_vine', 'nat_mushroom_brown', 'nat_mushroom_blue', 'nat_log', 'nat_rock_1', 'nat_rock_2', 'nat_rock_3',
                'nat_stump'], (4, 2), None),
    'garden': ('3 columns and 2 rows',
               ['nat_carrot', 'nat_tomato', 'nat_pumpkin', 'nat_corn', 'nat_seedling', 'nat_flowerpot'],
               (4, 2), ['nat_carrot', 'nat_tomato', 'nat_pumpkin', _, 'nat_corn', 'nat_seedling', _, 'nat_flowerpot']),
    'fruits': ('5 columns and 2 rows',
               ['fruit_apple', 'fruit_cherry', 'fruit_orange', 'fruit_banana', 'fruit_strawberry', 'fruit_grapes',
                'fruit_watermelon', 'fruit_pear', 'fruit_lemon', 'fruit_pineapple'], (5, 2), None),
    'sky': ('4 columns and 2 rows',
            ['nat_cloud_1', 'nat_cloud_2', 'nat_cloud_3', 'nat_sun', 'nat_moon', 'nat_rainbow', 'nat_rain_cloud', 'nat_snowman'],
            (4, 2), None),
    'weather': ('4 columns and 1 row', ['nat_raindrop', 'nat_snowflake', 'nat_lightning', 'nat_leaf'],
                (4, 2), ['nat_raindrop', 'nat_snowflake', 'nat_lightning', 'nat_leaf', _, _, _, _]),
}


def prompt(sheet):
    grid, names = SHEETS[sheet][:2]
    lst = ' '.join(f'({i + 1}) {ITEMS[n][4]}.' for i, n in enumerate(names))
    return (STYLE + f'Draw a sprite sheet of exactly {len(names)} separate objects arranged in a grid of {grid}, '
            f'in reading order left to right, top to bottom: {lst} ' + BG)


def full_rainbow(im):
    """The model drew a quarter arc (left half, cut straight at the top right); mirror it into a full arch."""
    a = np.asarray(im)
    cols = np.nonzero(a[..., 3].max(0) > 128)[0]
    a = a[:, :cols.max() - 2]  # drop the soft edge of the straight cut end, so the seam does not show
    return Image.fromarray(np.concatenate([a, a[:, ::-1]], 1), 'RGBA')


FIX = {'nat_rainbow': full_rainbow}


def do_gen(sheet):
    os.makedirs(WORK, exist_ok=True)
    return sheet, gen(os.path.join(WORK, sheet), prompt(sheet), REF)


def cells(path, COLS, ROWS):
    """Key the sheet and return one RGBA crop per grid cell (all opaque parts whose centre lies in that cell)."""
    rgba = key(Image.open(path))
    H, W = rgba.shape[:2]
    lab, n = ndimage.label(ndimage.binary_dilation(rgba[..., 3] > 128, iterations=3))
    groups = {}
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        if (lab[sl] == i).sum() < 60: continue
        cy, cx = (sl[0].start + sl[0].stop) / 2, (sl[1].start + sl[1].stop) / 2
        groups.setdefault((min(ROWS - 1, int(cy * ROWS / H)), min(COLS - 1, int(cx * COLS / W))), []).append(i)
    out = []
    for r in range(ROWS):
        for c in range(COLS):
            ids = groups.get((r, c))
            if not ids: raise ValueError(f'{path}: cell {r},{c} is empty')
            mask = ndimage.binary_dilation(np.isin(lab, ids), iterations=2)
            ys, xs = np.nonzero(mask & (rgba[..., 3] > 0))
            crop = rgba.copy()
            crop[..., 3] = np.where(mask, crop[..., 3], 0)
            crop = crop[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
            out.append(Image.fromarray(crop, 'RGBA'))
    return out


def bleed(im):
    """Give the outer 2 px and semi-transparent edge pixels the colour of the nearest opaque pixel (no magenta or pink fringe)."""
    a = np.asarray(im).copy()
    solid = ndimage.binary_erosion(a[..., 3] > 250, iterations=2)
    if solid.any():
        iy, ix = ndimage.distance_transform_edt(~solid, return_distances=False, return_indices=True)
        a[..., :3] = a[iy, ix, :3]
    return Image.fromarray(a, 'RGBA')


def do_cut(sheet):
    _, names, (cols, rows), cl = SHEETS[sheet]
    kept = 0
    for c, im in zip(cl or names, cells(os.path.join(WORK, sheet + '.png'), cols, rows)):
        if c is None: continue
        im = bleed(im)
        if c in FIX: im = FIX[c](im)
        size = ITEMS[c][0]
        s = size / max(im.size)
        im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
        out = Image.new('RGBA', (im.width + 4, im.height + 4), (0, 0, 0, 0))
        out.paste(im, (2, 2), im)
        out.save(os.path.join(HERE, c + '.png'), optimize=True)
        kept += 1
    return sheet, kept


def write_json():
    names = [n for sh in SHEETS.values() for n in sh[1]]
    assets = [{'name': n, 'file': n + '.png', 'tags': ITEMS[n][3], 'de': ITEMS[n][1], 'en': ITEMS[n][2]}
              for n in ITEMS if n in names]
    pack = {'pack': 'nature', 'title': {'de': 'Natur und Wetter', 'en': 'Nature and weather'}, 'format': 'png', 'assets': assets}
    with open(os.path.join(HERE, 'pack.json'), 'w', encoding='utf-8') as f:
        json.dump(pack, f, ensure_ascii=False, indent=2)
        f.write('\n')
    return len(assets)


if __name__ == '__main__':
    cmd, sheets = sys.argv[1], sys.argv[2:] or list(SHEETS)
    if cmd == 'gen':
        with ThreadPoolExecutor(8) as ex:
            for r in ex.map(do_gen, sheets): print(*r)
    elif cmd == 'cut':
        for s in sheets:
            try: print(*do_cut(s))
            except ValueError as e: print(s, e)
    elif cmd == 'json':
        print(write_json(), 'assets')
