"""Make the `adventure` pack (top-down role playing / dungeon games).

python3 make.py gen [sheet ...]   draw sheets with the image model into the work folder
python3 make.py cut [sheet ...]   key and cut the sheets into the pack folder
python3 make.py json              write pack.json
python3 make.py sheet             contact sheet (dark and light) for checking

Sheets are drawn on flat magenta and keyed out by scripts/asset-gen/keyslice.py.
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
HEROINE = os.path.join(ROOT, 'packages', 'assets', 'characters', 'heroine_idle_1.png')

BG = ('Background: one flat solid pure magenta colour #FF00FF everywhere, no shadows, no ground, no floor, '
      'no text, no letters, no numbers, no grid lines, no frames. ')
STYLE_TXT = ('Same flat emoji style as the reference image: clear flat shapes, no outlines, few colours, rounded friendly forms, '
             'no gradients, no hard shading. Every object is completely separate from the others with wide magenta gaps. ')
ORIG = 'Everything is original; it must not resemble any existing video game, film or brand character. '

GIRL = ('the girl from the reference image: chestnut brown ponytail with a small yellow hair band, yellow emoji skin, '
        'teal jacket over a white shirt, beige trousers, red sneakers')
BOY = ('a boy in the same style as the girl of the reference image: short black hair, yellow emoji skin, '
       'blue jacket over a white shirt, grey trousers, orange sneakers, same proportions and size as the girl')


def walk_prompt(who):
    return (f'Sprite sheet for a top-down role playing game: {who}. Full body, same size in every frame. '
            'Exactly 12 figures in a grid of 4 rows and 3 columns, evenly spaced, all feet on the same height within a row. '
            'Row 1: front view, walking towards the viewer (frame 1 left foot forward, frame 2 standing still with both feet together, frame 3 right foot forward). '
            'Row 2: back view, walking away from the viewer, we see the back of the head (same three phases). '
            'Row 3: side view, facing and walking to the LEFT (same three phases). '
            'Row 4: side view, facing and walking to the RIGHT (same three phases). '
            + STYLE_TXT + BG)


SHEETS = {
    'girl': dict(ref=STYLE, prompt=walk_prompt(GIRL)),
    'boy': dict(ref=STYLE, prompt=walk_prompt(BOY)),
    'npc': dict(ref=STYLE, prompt=(
        'Seven separate characters for a top-down role playing game, full body, front view, standing, friendly faces, '
        'in ONE row from left to right with wide gaps: '
        '1 an old wizard with a long white beard, a tall blue pointed hat and blue robe, holding a wooden staff; '
        '2 a friendly cartoon knight in shiny round silver armour with a red plume, holding a small toy-like wooden sword; '
        '3 a village woman with a green dress, white apron and a brown braid; '
        '4 a village man with a straw hat, orange shirt and brown trousers; '
        '5 a cheerful merchant with a round belly, purple vest, a red cap and a big brown bag on his back; '
        '6 a small sitting orange cat; '
        '7 a small standing brown dog with floppy ears. '
        'People have yellow emoji skin and the same proportions as the girl in the reference. ' + ORIG + STYLE_TXT + BG)),
    'monsters': dict(ref=STYLE, prompt=(
        'Eight separate cute cartoon monsters for a top-down role playing game, front view, friendly-spooky not scary, '
        'in a grid of 2 rows and 4 columns with wide gaps, reading order left to right, top to bottom: '
        '1 a round light green jelly slime blob with two eyes, squashed wide; '
        '2 the same green slime blob stretched tall (bouncing frame); '
        '3 a small white friendly ghost with a wavy bottom and a shy smile; '
        '4 a purple bat with wings spread up; '
        '5 the same purple bat with wings down; '
        '6 a friendly cartoon skeleton with a big round skull and a grin, standing; '
        '7 a small green goblin with big pointy ears, a brown tunic and a mischievous grin; '
        '8 a small chubby green baby dragon with tiny wings and a yellow belly, standing. '
        + ORIG + STYLE_TXT + BG)),
    'monsters2': dict(ref=STYLE, prompt=(
        'Three separate cute cartoon monsters for a top-down role playing game, front view, in ONE row with wide gaps: '
        '1 a round light green jelly slime blob with two eyes, a simple dome shape, about as wide as tall; '
        '2 EXACTLY the same green slime blob, same eyes, same colours, only slightly squashed: about 10 percent lower and 10 percent wider; '
        '3 a small chubby goblin with ORANGE skin, a round potato-shaped head, small rounded ears close to the head, '
        'a wide toothy grin with one tooth showing, a messy tuft of dark red hair, a patched blue tunic and a little wooden club. '
        + ORIG + STYLE_TXT + BG)),
    'tiles1': dict(ref=STYLE, prompt=(
        'Eight square ground tiles for a top-down role playing game seen straight from above, each a perfect square with sharp '
        'square corners, the pattern fills the whole square edge to edge and is seamless (tileable), flat simple pattern with few colours. '
        'Grid of 2 rows and 4 columns with wide magenta gaps between the squares, reading order: '
        '1 green grass with a few small darker grass tufts; 2 light brown dirt path with a few small pebbles; '
        '3 blue water with a few light wave lines; 4 light yellow sand with a few dots; '
        '5 grey cobblestone floor of rounded stones; 6 warm brown wooden floor planks running horizontally; '
        '7 dark grey dungeon floor of large square stone slabs; 8 white snow with a few light blue dots. '
        'Seen from directly above, no perspective. ' + STYLE_TXT + BG)),
    'tiles2': dict(ref=STYLE, prompt=(
        'Eight square tiles for a top-down role playing game, each a perfect square with sharp square corners that fills the whole square edge to edge. '
        'Grid of 2 rows and 4 columns with wide magenta gaps between the squares, reading order: '
        '1 orange-red glowing lava with darker cracks and yellow spots, seamless; '
        '2 a grey stone brick wall seen from the front, seamless; '
        '3 a dark purple-grey dungeon brick wall seen from the front, seamless; '
        '4 a closed wooden door with a round top set in a grey stone wall, filling the square; '
        '5 the same door open, showing a dark doorway in the same grey stone wall; '
        '6 stone stairs going down into darkness, seen from above, inside a grey square; '
        '7 stone stairs going up with light at the top, seen from above, inside a grey square; '
        '8 wooden bridge planks running horizontally seen from above, with a rope rail at the top and bottom edge. '
        + STYLE_TXT + BG)),
    'items': dict(ref=STYLE, prompt=(
        'Thirteen separate small item icons for a role playing game, grid of 3 rows (5, 4, 4 icons) with wide gaps, reading order left to right, top to bottom: '
        'row 1: 1 a closed brown wooden treasure chest with gold bands, 2 the same treasure chest open with gold coins inside, 3 a golden key, '
        '4 a round glass potion bottle with red liquid and a cork, 5 the same potion bottle with blue liquid; '
        'row 2: 6 the same potion bottle with green liquid, 7 a cartoon sword with a silver blade and a golden handle, pointing up, '
        '8 a round blue and silver shield, 9 a wooden torch with a bright flame; '
        'row 3: 10 a gold coin with a star on it, 11 a red heart, 12 a rolled paper scroll with a red ribbon, 13 a closed brown leather book. '
        + ORIG + STYLE_TXT + BG)),
    'props': dict(ref=STYLE, prompt=(
        'Nine separate objects for a top-down role playing game map, slight front view, grid of 3 rows and 3 columns with wide gaps, reading order: '
        '1 a wooden signpost with a blank board (no writing); 2 a round stone well with a little wooden roof and a bucket; '
        '3 a short section of wooden fence, two posts and two rails, seen from the front; '
        '4 a round leafy green tree with a brown trunk; 5 a wooden barrel with iron bands; 6 a wooden crate; '
        '7 a single thick wooden bridge post with a rope wrapped around it; 8 a rounded grey gravestone with a small cross carved in it (no writing); '
        '9 a magic portal: a glowing swirling purple-blue oval ring standing upright. '
        + ORIG + STYLE_TXT + BG)),
    'buildings': dict(ref=STYLE, prompt=(
        'Two separate buildings for a top-down role playing game map, slight front view, side by side with a wide gap: '
        '1 a small cosy cottage with a red roof, cream walls, a wooden door and one window, a little chimney; '
        '2 a small friendly fairy-tale castle of grey stone with two round towers with blue pointed roofs, a gate and small flags. '
        + ORIG + STYLE_TXT + BG)),
    'campfire': dict(ref=STYLE, prompt=(
        'Animation sprite sheet: a small campfire of crossed logs with orange and yellow flames, three frames of a flickering '
        'flame animation in ONE horizontal row, evenly spaced, same size, the logs identical in every frame, only the flames change shape. '
        + STYLE_TXT + BG)),
}

# names of each sheet in reading order -> (name, target size: long side in px, or ('h', height) / ('tile', 64))
DIRS = ['down', 'up', 'left', 'right']
HERO_NAMES = {h: [f'hero_{h}_{d}_{i}' for d in DIRS for i in (1, 2, 3)] for h in ('girl', 'boy')}
CUTS = {
    'npc': [('npc_wizard', 64), ('npc_knight', 64), ('npc_villager_1', 64), ('npc_villager_2', 64), ('npc_merchant', 64),
            ('npc_cat', 40), ('npc_dog', 44)],
    # slimes and goblin of this sheet were redrawn in monsters2 (None = not used)
    'monsters': [(None, 0), (None, 0), ('mon_ghost', 56), ('mon_bat_1', ('pair', 34)), ('mon_bat_2', ('pair', 34)),
                 ('mon_skeleton', 64), (None, 0), ('mon_dragon', 64)],
    'monsters2': [('mon_slime_1', ('pair', 44)), ('mon_slime_2', ('pair', 44)), ('mon_goblin', 60)],
    'tiles1': [(n, 'tile') for n in ('tile_grass', 'tile_path', 'tile_water', 'tile_sand', 'tile_stone',
                                     'tile_wood_floor', 'tile_dungeon_floor', 'tile_snow')],
    'tiles2': [(n, 'tile') for n in ('tile_lava', 'tile_wall', 'tile_dungeon_wall', 'tile_door_closed', 'tile_door_open',
                                     'tile_stairs_down', 'tile_stairs_up', 'tile_bridge')],
    'items': [('adv_chest_closed', 48), ('adv_chest_open', 48), ('adv_key', 36), ('adv_potion_red', 36), ('adv_potion_blue', 36),
              ('adv_potion_green', 36), ('adv_sword', 48), ('adv_shield', 42), ('adv_torch', 44), ('adv_coin', 32),
              ('adv_heart', 32), ('adv_scroll', 40), ('adv_book', 40)],
    'props': [('adv_sign', 56), ('adv_well', 80), ('adv_fence', 64), ('adv_tree', 112), ('adv_barrel', 48), ('adv_crate', 48),
              ('adv_bridge_post', 48), ('adv_gravestone', 52), ('adv_portal', 96)],
    'buildings': [('adv_house', 128), ('adv_castle', 160)],
}


def sheet_path(s):
    return os.path.join(WORK, s + '.png')


def do_gen(s):
    os.makedirs(WORK, exist_ok=True)
    spec = SHEETS[s]
    return s, gen(os.path.join(WORK, s), spec['prompt'], spec['ref'])


def save(im, name):
    im.save(os.path.join(HERE, name + '.png'), optimize=True)


def fit(im, long_side, pad=2):
    s = long_side / max(im.size)
    im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    c = Image.new('RGBA', (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
    c.paste(im, (pad, pad), im)
    return c


def tile(im, size=64):
    """Crop a keyed square to its opaque inside (cut away rounded corners/edges) and scale to an opaque size x size tile."""
    a = np.asarray(im)[..., 3]
    ys, xs = np.where(a > 250)
    box = [xs.min(), ys.min(), xs.max() + 1, ys.max() + 1]
    w, h = box[2] - box[0], box[3] - box[1]
    m = max(2, round(min(w, h) * 0.035))  # trim the edge band
    im = im.crop((box[0] + m, box[1] + m, box[2] - m, box[3] - m)).resize((size, size), Image.LANCZOS)
    bg = Image.new('RGBA', im.size, (0, 0, 0, 255))
    bg.alpha_composite(im)
    out = np.asarray(bg).copy()
    out[..., 3] = 255
    return Image.fromarray(out, 'RGBA')


def cut_named(s):
    names = CUTS[s]
    tmp = os.path.join(WORK, 'cut-' + s)
    files = keyslice.cut_items(sheet_path(s), [n or f'unused_{k}' for k, (n, _) in enumerate(names)], 512, tmp)
    pairs = {}
    for (n, size), f in zip(names, files):
        if n is None:
            continue
        im = Image.open(f).convert('RGBA')
        im = im.crop(im.getbbox())
        if isinstance(size, tuple):  # animation frames: one shared canvas and scale
            pairs.setdefault(size, []).append((n, im))
        else:
            save(tile(im) if size == 'tile' else fit(im, size), n)
    for (_, h), group in pairs.items():
        for (n, _), im in zip(group, keyslice.align([im for _, im in group], h)):
            save(im, n)


def cut_hero(h):
    rgba = keyslice.key(Image.open(sheet_path(h)))
    fr = keyslice.frames(rgba)
    if len(fr) != 12:
        raise ValueError(f'{h}: found {len(fr)} frames, expected 12')
    fr = [f.crop(f.getbbox()) for f in fr]
    # all 12 frames share one canvas so that turning around does not jump
    for name, im in zip(HERO_NAMES[h], keyslice.align(fr, 64)):
        save(im, name)


def cut_campfire():
    fr = keyslice.frames(keyslice.key(Image.open(sheet_path('campfire'))))
    if len(fr) != 3:
        raise ValueError(f'campfire: found {len(fr)} frames, expected 3')
    for n, im in enumerate(keyslice.align([f.crop(f.getbbox()) for f in fr], 56), 1):
        save(im, f'adv_campfire_{n}')


def do_cut(s):
    if s in HERO_NAMES:
        cut_hero(s)
    elif s == 'campfire':
        cut_campfire()
    else:
        cut_named(s)


# ---- pack.json ----
DIR_TXT = {'down': ('nach unten (zum Betrachter)', 'down (towards the viewer)'), 'up': ('nach oben (vom Betrachter weg)', 'up (away from the viewer)'),
           'left': ('nach links', 'to the left'), 'right': ('nach rechts', 'to the right')}
HERO_TXT = {'girl': ('Heldin', 'Heroine'), 'boy': ('Held', 'Hero')}
DESC = {
    'npc_wizard': ('Zauberer mit Bart und Stab', 'Wizard with a beard and a staff'),
    'npc_knight': ('Freundlicher Ritter mit Holzschwert', 'Friendly knight with a wooden sword'),
    'npc_villager_1': ('Dorfbewohnerin mit Schürze', 'Villager woman with an apron'),
    'npc_villager_2': ('Dorfbewohner mit Strohhut', 'Villager man with a straw hat'),
    'npc_merchant': ('Händler mit Rucksack', 'Merchant with a pack'),
    'npc_cat': ('Katze, sitzend', 'Cat, sitting'),
    'npc_dog': ('Hund', 'Dog'),
    'mon_slime_1': ('Schleim (Bild 1 von 2)', 'Slime (frame 1 of 2)'),
    'mon_slime_2': ('Schleim, leicht gestaucht (Bild 2 von 2)', 'Slime, slightly squashed (frame 2 of 2)'),
    'mon_ghost': ('Gespenst, freundlich-gruselig', 'Ghost, friendly-spooky'),
    'mon_bat_1': ('Fledermaus, Flügel oben (Bild 1 von 2)', 'Bat, wings up (frame 1 of 2)'),
    'mon_bat_2': ('Fledermaus, Flügel unten (Bild 2 von 2)', 'Bat, wings down (frame 2 of 2)'),
    'mon_skeleton': ('Skelett, freundlich', 'Skeleton, friendly'),
    'mon_goblin': ('Kobold', 'Goblin'),
    'mon_dragon': ('Kleiner grüner Drache', 'Small green dragon'),
    'tile_grass': ('Kachel Gras', 'Tile grass'), 'tile_path': ('Kachel Weg', 'Tile dirt path'),
    'tile_water': ('Kachel Wasser', 'Tile water'), 'tile_sand': ('Kachel Sand', 'Tile sand'),
    'tile_stone': ('Kachel Pflaster', 'Tile cobblestone'), 'tile_wall': ('Kachel Mauer', 'Tile stone wall'),
    'tile_wood_floor': ('Kachel Holzboden', 'Tile wooden floor'), 'tile_dungeon_floor': ('Kachel Verliesboden', 'Tile dungeon floor'),
    'tile_dungeon_wall': ('Kachel Verliesmauer', 'Tile dungeon wall'), 'tile_snow': ('Kachel Schnee', 'Tile snow'),
    'tile_lava': ('Kachel Lava', 'Tile lava'), 'tile_door_closed': ('Kachel Tür, geschlossen', 'Tile door, closed'),
    'tile_door_open': ('Kachel Tür, offen', 'Tile door, open'), 'tile_stairs_down': ('Kachel Treppe nach unten', 'Tile stairs down'),
    'tile_stairs_up': ('Kachel Treppe nach oben', 'Tile stairs up'), 'tile_bridge': ('Kachel Brücke', 'Tile bridge'),
    'adv_chest_closed': ('Schatztruhe, geschlossen', 'Treasure chest, closed'), 'adv_chest_open': ('Schatztruhe, offen', 'Treasure chest, open'),
    'adv_key': ('Goldener Schlüssel', 'Golden key'), 'adv_potion_red': ('Roter Trank', 'Red potion'),
    'adv_potion_blue': ('Blauer Trank', 'Blue potion'), 'adv_potion_green': ('Grüner Trank', 'Green potion'),
    'adv_sword': ('Schwert', 'Sword'), 'adv_shield': ('Schild', 'Shield'), 'adv_torch': ('Fackel', 'Torch'),
    'adv_coin': ('Goldmünze', 'Gold coin'), 'adv_heart': ('Herz', 'Heart'), 'adv_scroll': ('Schriftrolle', 'Scroll'),
    'adv_book': ('Buch', 'Book'), 'adv_house': ('Haus', 'House'), 'adv_castle': ('Burg', 'Castle'),
    'adv_sign': ('Wegweiser', 'Signpost'), 'adv_well': ('Brunnen', 'Well'), 'adv_fence': ('Zaun', 'Fence'),
    'adv_tree': ('Baum', 'Tree'), 'adv_barrel': ('Fass', 'Barrel'), 'adv_crate': ('Kiste', 'Crate'),
    'adv_bridge_post': ('Brückenpfosten', 'Bridge post'), 'adv_gravestone': ('Grabstein', 'Gravestone'),
    'adv_portal': ('Magisches Portal', 'Magic portal'),
}
TAGS = {'npc': ['character', 'npc'], 'mon': ['enemy', 'monster'], 'tile': ['tile'], 'adv': ['item']}
PROP = {'adv_house', 'adv_castle', 'adv_sign', 'adv_well', 'adv_fence', 'adv_tree', 'adv_barrel', 'adv_crate',
        'adv_bridge_post', 'adv_gravestone', 'adv_portal'}


def entries():
    out = []
    for h in ('girl', 'boy'):
        de, en = HERO_TXT[h]
        for d in DIRS:
            for i in (1, 2, 3):
                pose = (' (steht)', ' (standing)') if i == 2 else ('', '')
                out.append({'name': f'hero_{h}_{d}_{i}', 'tags': ['character', 'player', 'animation'],
                            'de': f'{de} geht {DIR_TXT[d][0]}, Bild {i} von 3{pose[0]}',
                            'en': f'{en} walking {DIR_TXT[d][1]}, frame {i} of 3{pose[1]}'})
    for s in ('npc', 'monsters2', 'monsters', 'tiles1', 'tiles2', 'items', 'props', 'buildings'):
        for n, _ in CUTS[s]:
            if n is None:
                continue
            tags = list(TAGS[n.split('_')[0]])
            if n in PROP:
                tags = ['object']
            if n[-2:] in ('_1', '_2') and n.startswith('mon'):
                tags.append('animation')
            out.append({'name': n, 'tags': tags, 'de': DESC[n][0], 'en': DESC[n][1]})
    for i in (1, 2, 3):
        out.append({'name': f'adv_campfire_{i}', 'tags': ['object', 'animation'],
                    'de': f'Lagerfeuer, Bild {i} von 3', 'en': f'Campfire, frame {i} of 3'})
    for e in out:
        e['file'] = e['name'] + '.png'
    return [{k: e[k] for k in ('name', 'file', 'tags', 'de', 'en')} for e in out]


def write_json():
    pack = {'pack': 'adventure', 'title': {'de': 'Abenteuer', 'en': 'Adventure'}, 'format': 'png', 'assets': entries()}
    with open(os.path.join(HERE, 'pack.json'), 'w', encoding='utf-8') as f:
        json.dump(pack, f, ensure_ascii=False, indent=2)
        f.write('\n')


def contact():
    es = entries()
    cols, cell = 12, 100
    rows = (len(es) + cols - 1) // cols
    for tag, col in (('dark', (40, 42, 54, 255)), ('light', (245, 245, 240, 255))):
        c = Image.new('RGBA', (cols * cell, rows * cell), col)
        for k, e in enumerate(es):
            p = os.path.join(HERE, e['file'])
            if not os.path.exists(p):
                continue
            im = Image.open(p).convert('RGBA')
            if max(im.size) > cell - 4:
                im = fit(im, cell - 8, 0)
            c.alpha_composite(im, ((k % cols) * cell + (cell - im.width) // 2, (k // cols) * cell + (cell - im.height) // 2))
        c.save(os.path.join(WORK, f'contact-{tag}.png'))


if __name__ == '__main__':
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == 'gen':
        with ThreadPoolExecutor(8) as ex:
            for s, r in ex.map(do_gen, args or list(SHEETS)):
                print(s, r)
    elif cmd == 'cut':
        for s in args or list(SHEETS):
            try:
                do_cut(s)
                print(s, 'ok')
            except Exception as e:
                print(s, 'ERROR', e)
    elif cmd == 'json':
        write_json()
    elif cmd == 'sheet':
        contact()
