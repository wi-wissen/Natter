"""Redraw the `platformer` pack (side-scrolling jump and run: tiles, items, enemies, decor, backgrounds, boy hero).

python3 packages/assets/platformer/make.py gen [sheet ...]   # draw sheets into the work folder
python3 packages/assets/platformer/make.py cut [sheet ...]   # key, cut and scale into this folder
python3 packages/assets/platformer/make.py json              # write pack.json

The sheet `boy_ref` must be drawn first: it is the character reference for the boy sheets.
Some frames are derived from one drawn image (coin spin = horizontal squash, spiky ball roll = rotation); the gem spin
(`gem_spin`, 4 colours x 4 phases) is drawn as one sheet and keyed without magenta fringe (`clean_key`),
the plain earth tile `pf_dirt` is filled with the colours of the drawn grass strip so that it tiles seamlessly.
"""
import os, sys, json, base64, subprocess, tempfile
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'asset-gen'))
from keyslice import key, frames, align  # noqa: E402
from scipy import ndimage  # noqa: E402

REF = os.path.join(ROOT, 'scripts', 'asset-gen', 'style-emoji.png')
WORK = os.environ.get('WORK', os.path.join(tempfile.gettempdir(), 'assets-work', 'platformer'))
BOY_REF = os.path.join(WORK, 'boy_ref.png')


def gen(name, prompt, refs=(), model='google/gemini-3.1-flash-image'):
    """Like scripts/asset-gen/gen.py, but with several reference images."""
    content = [{'type': 'text', 'text': prompt}]
    for ref in refs:
        b = base64.b64encode(open(ref, 'rb').read()).decode()
        content.append({'type': 'image_url', 'image_url': {'url': 'data:image/png;base64,' + b}})
    body = {'model': model, 'modalities': ['image', 'text'], 'messages': [{'role': 'user', 'content': content}]}
    r = subprocess.run(['curl', '-s', '-m', '280', 'https://openrouter.ai/api/v1/chat/completions',
                        '-H', 'Content-Type: application/json', '-d', '@-'],
                       input=json.dumps(body), capture_output=True, text=True)
    try:
        d = json.loads(r.stdout)
        url = d['choices'][0]['message']['images'][0]['image_url']['url']
        open(name + '.png', 'wb').write(base64.b64decode(url.split(',', 1)[1]))
        return 'ok'
    except Exception:
        return 'fail ' + r.stdout[:400]


STYLE = ('Draw in exactly the same flat emoji style as the first reference image: clear flat shapes without outlines, '
         'very few colours per object, rounded friendly forms, no hard shading, no gradients. '
         'Do not draw the characters of the reference unless asked. ')
BG = ('Every object stands alone, fully separated from the others by wide empty space, none touching or overlapping, '
      'none touching the image border. '
      'Background: one flat solid pure magenta colour #FF00FF everywhere, no shadows, no ground, no grass under objects, '
      'no text, no labels, no numbers, no grid lines, no frames.')
BOY = ('the boy from the second reference image (yellow emoji skin, short black hair, blue jacket over a white T-shirt, '
       'dark grey trousers, orange sneakers), exactly the same character, same proportions, same colours, same flat emoji style')
ANIM_BG = ('Background: one flat solid pure magenta colour #FF00FF everywhere, no shadows, no ground line, no text, '
           'no numbers, no grid lines. The frames must not touch each other.')

# sheet id -> (prompt, refs)
SHEETS = {
    'boy_ref': (STYLE + 'Invent a new ORIGINAL character who belongs to the same game as the heroine in the reference: '
                'a boy of the same age, same size, same proportions and same flat emoji style, with yellow emoji skin '
                'like the heroine, short black hair, a blue jacket over a white T-shirt, dark grey trousers and orange '
                'sneakers, friendly face. Draw only him, three times in one row, evenly spaced: '
                '1) standing, front view, arms hanging, 2) standing in side view facing right, '
                '3) jumping happily with both arms up. ' + BG, [REF]),
    'boy_idle': ('Use ' + BOY + '. Draw a side-view IDLE (breathing) animation sprite sheet, facing right: '
                 '4 frames in ONE horizontal row, evenly spaced, same size, feet at the same height, ALL FOUR in the same side view '
                 'facing right like the second figure of the boy reference (none from the front), he stands relaxed and '
                 'only his body rises and sinks a little and the arms swing very slightly. ' + ANIM_BG, [REF, BOY_REF]),
    'boy_run': ('Use ' + BOY + '. Draw a side-view RUN CYCLE sprite sheet facing right: 8 frames in ONE horizontal row, '
                'EXACTLY 8 figures, no more, no second row, evenly spaced, same size, same feet height. A real fast RUN, not a walk: '
                'the body leans forward, big strides, elbows bent at 90 degrees; frame 1 front leg reaching far forward, '
                'frame 2 landing with knee bent, frame 3 legs passing under the body, frame 4 pushing off with both feet off the '
                'ground, frames 5 to 8 the same phases with the other leg in front. Arms swing opposite to the legs, '
                'clearly different pose in every frame. '
                + ANIM_BG, [REF, BOY_REF]),
    'boy_poses': ('Use ' + BOY + '. Draw 4 single side-view poses facing right in ONE horizontal row, evenly spaced, same scale: '
                  '1) JUMP: going up, one knee pulled up, one arm raised, '
                  '2) FALL: coming down, legs stretched down, both arms raised up and a little worried face, '
                  '3) LAND: crouching after landing, knees bent, arms forward for balance, '
                  '4) HURT: knocked back, leaning backwards, eyes squeezed shut, arms flung up. ' + ANIM_BG, [REF, BOY_REF]),
    'grass': (STYLE + 'Draw ONE long straight horizontal grass-topped earth platform for a side-scrolling game, '
              'about 6 times as wide as tall, seen exactly from the side: a green grass layer on top with a wavy lower edge '
              'and small grass blades, under it brown earth with a few darker round pebbles, '
              'the left and right ends rounded, the bottom edge straight. The top edge of the grass is perfectly horizontal. '
              'Only this one object, centred. ' + BG, [REF]),
    'blocks': (STYLE + 'Draw 5 square game tiles (blocks) for a side-scrolling game, seen exactly from the front, all the same size, '
               'slightly rounded corners, in 2 rows (3 in the first row, 2 in the second): '
               '1) a grey stone block made of a few big rounded stones, '
               '2) a red-brown brick wall block with light mortar lines, '
               '3) a light blue shiny ice block with two small white highlights, '
               '4) a sand block, pale yellow with a few tiny dots and a wavy lighter top, '
               '5) a wooden crate with planks and a diagonal cross brace. ' + BG, [REF]),
    'gadgets': (STYLE + 'Draw 5 objects for a side-scrolling game in ONE horizontal row, seen exactly from the side: '
                '1) a row of four silver-grey metal spikes on a flat dark grey bar (wider than tall), '
                '2) a red jump spring pad, COMPRESSED: a red top plate, a squeezed grey coil spring, a dark grey base, '
                '3) the same jump spring pad EXTENDED: same plates, coil stretched tall, '
                '4) a short wooden ladder piece with two straight vertical rails and three rungs, '
                '5) a thin horizontal floating wooden plank platform, much wider than tall, with two small nails. ' + BG, [REF]),
    'items': (STYLE + 'Draw 7 collectible items for a jump and run game, in 2 rows (4 in the first row, 3 in the second): '
              '1) a round gold coin seen from the front with a simple raised star in the middle, '
              '2) a pink cut gemstone (like the pink gem in the reference), '
              '3) a blue cut gemstone of the same shape, '
              '4) a green cut gemstone of the same shape, '
              '5) a red heart, '
              '6) a yellow five-pointed star with rounded tips, '
              '7) a golden old-fashioned key, lying horizontal. ' + BG, [REF]),
    'doors': (STYLE + 'Draw 4 objects for a jump and run game in ONE horizontal row: '
              '1) a closed wooden door with a rounded arched top in a grey stone frame, taller than wide (2:3), with a small golden knob, '
              '2) the same door OPEN: the same stone frame, the door swung open, a dark inside visible, '
              '3) a closed wooden treasure chest with golden metal bands and a lock, seen from the front-side, '
              '4) the same treasure chest OPEN, lid up, golden coins shining inside. ' + BG, [REF]),
    'flag': (STYLE + 'Draw a checkpoint flag animation for a jump and run game: 3 frames in ONE horizontal row, evenly spaced, '
             'same size: a grey pole with a small round golden ball on top and a small grey foot, a green triangular-ish flag '
             'with a white circle on it attached to the upper part of the pole and pointing right, '
             'the flag waving in the wind, a different wave shape in each frame, the pole identical in all frames. ' + BG, [REF]),
    'decor': (STYLE + 'Draw 5 background decoration objects for a jump and run game in ONE horizontal row: '
              '1) a small white fluffy cloud, '
              '2) a wide flat white cloud, '
              '3) a big round white cloud made of several puffs, '
              '4) a round green bush made of three bumps, '
              '5) a friendly yellow sun with short rounded rays (no face). ' + BG, [REF]),
    'scenery': (STYLE + 'Draw 2 background objects for a jump and run game in ONE horizontal row: '
                '1) a round-crowned green tree with a brown trunk, taller than wide, '
                '2) a wide soft green hill, about twice as wide as tall, with a flat bottom and a few small lighter dots. ' + BG, [REF]),
    'slug': (STYLE + 'Draw an original cartoon enemy for a jump and run game: a chubby snail with a spiral orange shell on its back '
             'and a soft lilac body, friendly-grumpy face with half-closed eyes and a small pout, two short eye stalks, '
             'crawling to the RIGHT (head on the right side). A side-view CRAWL animation: 4 frames in ONE horizontal row, '
             'evenly spaced, same size, the body stretches and squeezes a little from frame to frame, the bottom always on '
             'the same line. ' + ANIM_BG, [REF]),
    'bat': (STYLE + 'Draw an original cartoon bat enemy for a jump and run game: a small round dark purple body, big pointy ears, '
            'cute big white eyes, two tiny fangs, purple wings, facing right. A FLYING animation: 4 frames in ONE horizontal '
            'row, evenly spaced, same body size: 1) wings fully up, 2) wings level, 3) wings fully down, 4) wings level again. '
            + ANIM_BG, [REF]),
    'blob': (STYLE + 'Draw an original cartoon enemy for a jump and run game: a round, glossy green jelly blob with two big '
             'eyes and a small determined mouth, looking right. A HOPPING animation: 4 frames in ONE horizontal row, '
             'evenly spaced: 1) squashed flat and wide before the jump, 2) stretched tall and thin while jumping up, '
             '3) round in the air, 4) squashed a little when landing. All frames the same blob, bottoms on the same line. '
             + ANIM_BG, [REF]),
    'spiky': (STYLE + 'Draw ONE original cartoon enemy for a jump and run game: a round red-orange ball covered evenly with '
              'eight short cream-coloured cone spikes all around, two angry little eyes. Only this one object, centred. '
              + BG, [REF]),
    'gem_spin': (STYLE + 'Draw a SPINNING GEMSTONE animation sprite sheet for a jump and run game: EXACTLY 16 gems in a grid of '
                 '4 rows and 4 columns, evenly spaced, all the same height, with wide magenta gaps, none touching. '
                 'Every gem is the same upright cut gemstone as the pink gem in the reference (a tall hexagonal crystal with '
                 'pointed top and bottom and a lighter flat front facet), turning around its vertical axis. '
                 'Row 1 blue gems, row 2 green gems, row 3 light bubblegum pink gems (lighter than the background, clearly pink, '
                 'not magenta), row 4 red gems. The 4 columns are the 4 phases of the spin, the same in every row: '
                 'column 1 seen from the front (the wide flat front facet in the middle, a narrower facet left and right), '
                 'column 2 turned a quarter: the front facet moved to the RIGHT and narrower, a wide facet on the left, '
                 'column 3 seen exactly edge-on: a narrow gem, two equal facets meeting in a vertical ridge in the middle, '
                 'column 4 turned the other way: the front facet moved to the LEFT and narrower, a wide facet on the right. '
                 'Top and bottom points always at the same height, each gem centred in its cell. One small white shine spot. '
                 + BG, [REF]),
    'bg_day': ('Draw a wide background image for a side-scrolling jump and run game in the flat emoji style of the reference '
               '(flat shapes, no outlines, soft colours): a bright light-blue day sky, a few white flat clouds, rolling green '
               'hills in two layers in the lower third, a few round trees far away. Calm, not busy, no characters, no text, '
               'no ground platforms, no sun in a corner. Landscape format 5:3.', [REF]),
    'bg_night': ('Draw a wide background image for a side-scrolling jump and run game in the flat emoji style of the reference '
                 '(flat shapes, no outlines): a dark blue night sky with small stars and a pale crescent moon, dark '
                 'blue-green rolling hills in two layers in the lower third, a few dark tree silhouettes. Calm, not busy, '
                 'no characters, no text. Landscape format 5:3.', [REF]),
    'bg_cave': ('Draw a wide background image for a side-scrolling jump and run game in the flat emoji style of the reference '
                '(flat shapes, no outlines): the inside of a cave, dark brown-purple rock walls, a few stalactites hanging from '
                'the top and stalagmites at the bottom, some glowing teal crystals, darker in the back. Calm, not busy, '
                'the middle rather empty, no characters, no text. Landscape format 5:3.', [REF]),
}

# ---------------------------------------------------------------- names and descriptions
TILE, ITEM, ENEMY, DECOR, BGT, HERO = ['platformer', 'tile'], ['platformer', 'item'], ['platformer', 'enemy'], \
    ['platformer', 'decor'], ['platformer', 'background'], ['character', 'player', 'platformer']
DESC = {}


def d(name, tags, de, en):
    DESC[name] = (tags, de, en)


d('pf_grass_left', TILE, 'Grasboden, linkes Ende (64x64)', 'Grass ground, left end (64x64)')
d('pf_grass_mid', TILE, 'Grasboden, Mittelstück, nahtlos (64x64)', 'Grass ground, middle piece, seamless (64x64)')
d('pf_grass_right', TILE, 'Grasboden, rechtes Ende (64x64)', 'Grass ground, right end (64x64)')
d('pf_dirt', TILE, 'Erde ohne Gras, nahtlos, für unter den Grasboden (64x64)', 'Plain earth, seamless, to put under the grass (64x64)')
d('pf_stone', TILE, 'Steinblock (64x64)', 'Stone block (64x64)')
d('pf_brick', TILE, 'Ziegelblock (64x64)', 'Brick block (64x64)')
d('pf_ice', TILE, 'Eisblock (64x64)', 'Ice block (64x64)')
d('pf_sand', TILE, 'Sandblock (64x64)', 'Sand block (64x64)')
d('pf_crate', TILE, 'Holzkiste (64x64)', 'Wooden crate (64x64)')
d('pf_wood_platform', TILE, 'Dünnes schwebendes Holzbrett (64 breit)', 'Thin floating wooden plank (64 wide)')
d('pf_spikes', TILE + ['danger'], 'Stacheln am Boden (64 breit)', 'Spikes on the ground (64 wide)')
d('pf_spring_1', TILE + ['animation'], 'Sprungfeder, zusammengedrückt (Bild 1 von 2, 64x64)', 'Jump spring, compressed (frame 1 of 2, 64x64)')
d('pf_spring_2', TILE + ['animation'], 'Sprungfeder, ausgefahren (Bild 2 von 2, 64x64)', 'Jump spring, extended (frame 2 of 2, 64x64)')
d('pf_ladder', TILE, 'Leiterstück, nahtlos übereinander stapelbar (64x64)', 'Ladder piece, stacks seamlessly (64x64)')
for i in range(1, 5):
    d(f'pf_coin_{i}', ITEM + ['animation'], f'Goldmünze dreht sich, Bild {i} von 4', f'Spinning gold coin, frame {i} of 4')
for c, de, en in (('pink', 'rosa', 'pink'), ('blue', 'blau', 'blue'), ('green', 'grün', 'green')):
    d(f'pf_gem_{c}', ITEM, f'Edelstein, {de}', f'Gemstone, {en}')
for c, de, en in (('blue', 'blauer', 'blue'), ('green', 'grüner', 'green'), ('pink', 'rosa', 'pink'), ('red', 'roter', 'red')):
    for i in range(1, 5):
        d(f'pf_gem_{c}_{i}', ITEM + ['animation'], f'{de[0].upper() + de[1:]} Edelstein dreht sich, Bild {i} von 4',
          f'Spinning {en} gemstone, frame {i} of 4')
d('pf_heart', ITEM, 'Rotes Herz (Extraleben)', 'Red heart (extra life)')
d('pf_star', ITEM, 'Gelber Stern', 'Yellow star')
d('pf_key', ITEM, 'Goldener Schlüssel', 'Golden key')
d('pf_door_closed', ITEM, 'Tür, geschlossen (64x96)', 'Door, closed (64x96)')
d('pf_door_open', ITEM, 'Tür, offen (64x96)', 'Door, open (64x96)')
for i in range(1, 4):
    d(f'pf_flag_{i}', ITEM + ['animation'], f'Wehende Zielfahne (Checkpoint), Bild {i} von 3 (64x96)',
      f'Waving checkpoint flag, frame {i} of 3 (64x96)')
d('pf_chest_closed', ITEM, 'Schatztruhe, geschlossen', 'Treasure chest, closed')
d('pf_chest_open', ITEM, 'Schatztruhe, offen mit Münzen', 'Treasure chest, open with coins')
for i in range(1, 5):
    d(f'slug_walk_{i}', ENEMY + ['animation'], f'Grummelige Schnecke kriecht, Bild {i} von 4 (nach rechts)',
      f'Grumpy snail crawling, frame {i} of 4 (facing right)')
    d(f'bat_fly_{i}', ENEMY + ['animation'], f'Fledermaus fliegt, Bild {i} von 4 (nach rechts)',
      f'Bat flying, frame {i} of 4 (facing right)')
    d(f'blob_hop_{i}', ENEMY + ['animation'], f'Glibber-Klecks hüpft, Bild {i} von 4 (nach rechts)',
      f'Jelly blob hopping, frame {i} of 4 (facing right)')
    d(f'spiky_roll_{i}', ENEMY + ['animation', 'danger'], f'Stachelkugel rollt nach rechts, Bild {i} von 4',
      f'Spiky ball rolling right, frame {i} of 4')
for i, (de, en) in enumerate((('klein', 'small'), ('flach', 'flat'), ('groß', 'big')), 1):
    d(f'pf_cloud_{i}', DECOR, f'Wolke, {de}', f'Cloud, {en}')
d('pf_bush', DECOR, 'Runder Busch', 'Round bush')
d('pf_tree', DECOR, 'Baum mit runder Krone', 'Tree with a round crown')
d('pf_hill', DECOR, 'Grüner Hügel (160 breit)', 'Green hill (160 wide)')
d('pf_sun', DECOR, 'Sonne', 'Sun')
d('pf_bg_day', BGT, 'Hintergrund: Hügel am Tag (800x480)', 'Background: hills by day (800x480)')
d('pf_bg_night', BGT, 'Hintergrund: Hügel bei Nacht (800x480)', 'Background: hills at night (800x480)')
d('pf_bg_cave', BGT, 'Hintergrund: Höhle (800x480)', 'Background: cave (800x480)')
for i in range(1, 5):
    d(f'boy_idle_{i}', HERO + ['animation'], f'Junge steht, Bild {i} von 4 (nach rechts)', f'Boy standing, frame {i} of 4 (facing right)')
for i in range(1, 9):
    d(f'boy_run_{i}', HERO + ['animation'], f'Junge rennt, Bild {i} von 8 (nach rechts)', f'Boy running, frame {i} of 8 (facing right)')
d('boy_jump', HERO, 'Junge springt hoch (nach rechts)', 'Boy jumping up (facing right)')
d('boy_fall', HERO, 'Junge fällt herunter (nach rechts)', 'Boy falling down (facing right)')
d('boy_land', HERO, 'Junge landet in der Hocke (nach rechts)', 'Boy landing, crouching (facing right)')
d('boy_hurt', HERO, 'Junge wird getroffen (nach rechts)', 'Boy getting hurt (facing right)')


# ---------------------------------------------------------------- helpers
def sheet(s):
    return os.path.join(WORK, s + '.png')


def crops(s, n):
    """The n objects of a sheet in reading order, keyed, unscaled (same keying and ordering as keyslice.cut_items)."""
    rgba = key(Image.open(sheet(s)))
    lab, _ = ndimage.label(ndimage.binary_dilation(rgba[..., 3] > 128, iterations=8))
    comps = [(sl, i) for i, sl in enumerate(ndimage.find_objects(lab), 1) if (lab[sl] == i).sum() >= 1500]
    if len(comps) != n:
        raise ValueError(f'{s}: found {len(comps)} objects, expected {n}')
    cy = [(c[0].start + c[0].stop) / 2 for c, _ in comps]
    h = np.median([c[0].stop - c[0].start for c, _ in comps])
    order = sorted(range(n), key=lambda k: (round(cy[k] / (h * 0.9)), comps[k][0][1].start))
    out = []
    for k in order:
        sl, i = comps[k]
        crop = rgba[sl].copy()
        crop[..., 3] = np.where(ndimage.binary_dilation(lab[sl] == i, iterations=2), crop[..., 3], 0)
        im = Image.fromarray(crop, 'RGBA')
        out.append(im.crop(im.getbbox()))
    return out


def fit(im, w=None, h=None):
    """Scale to width w or height h (keeping the ratio), or to the box w x h if both are given."""
    if w and h:
        s = min(w / im.width, h / im.height)
    elif w:
        s = w / im.width
    else:
        s = h / im.height
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)


def pad(im, p=2):
    c = Image.new('RGBA', (im.width + 2 * p, im.height + 2 * p), (0, 0, 0, 0))
    c.paste(im, (p, p), im)
    return c


def on_canvas(im, w, h, valign='bottom'):
    c = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    y = h - im.height if valign == 'bottom' else (h - im.height) // 2
    c.paste(im, ((w - im.width) // 2, y), im)
    return c


def save(im, name):
    path = os.path.join(HERE, name + '.png')
    if 'background' in DESC[name][0]:
        # median filter takes out the model's pixel noise, few colours keep the file under 80 KB
        im = im.convert('RGB').filter(ImageFilter.MedianFilter(3)).quantize(colors=64, method=Image.MEDIANCUT, dither=Image.NONE)
    else:
        a = np.asarray(im).copy()
        a[a[..., 3] < 8] = 0  # clean invisible pixels for better compression
        im = Image.fromarray(a, 'RGBA')
    im.save(path, optimize=True)
    if os.path.getsize(path) > 78 * 1024:
        raise ValueError(f'{name} too big')
    return path


def stretch_tile(im):
    return im.resize((64, 64), Image.LANCZOS)


def solid(im):
    """Make an edge-to-edge tile opaque (no see-through seams at the border)."""
    a = np.asarray(im).copy()
    a[..., 3] = 255
    return Image.fromarray(a, 'RGBA')


def anim(s, prefix, height, expected, start=1, names=None):
    rgba = key(Image.open(sheet(s)))
    fr = frames(rgba)
    if len(fr) == expected:  # all sheets are one row: order by x only (a hop frame may sit higher)
        alpha = rgba[..., 3] > 128
        lab, _ = ndimage.label(ndimage.binary_dilation(alpha, iterations=6))
        xs = [sl[1].start for i, sl in enumerate(ndimage.find_objects(lab), 1) if (lab[sl] == i).sum() > 2500]
        if len(xs) == expected:
            cy = [(sl[0].start + sl[0].stop) / 2 for i, sl in enumerate(ndimage.find_objects(lab), 1) if (lab[sl] == i).sum() > 2500]
            h = np.median([sl[0].stop - sl[0].start for i, sl in enumerate(ndimage.find_objects(lab), 1) if (lab[sl] == i).sum() > 2500])
            old = sorted(range(expected), key=lambda k: (round(cy[k] / (h * 0.8)), xs[k]))  # order used by keyslice.frames
            byx = sorted(range(expected), key=lambda k: xs[k])
            fr = [fr[old.index(k)] for k in byx]
    if len(fr) != expected:
        raise ValueError(f'{s}: found {len(fr)} frames, expected {expected}')
    fr = align(fr, height)
    names = names or [f'{prefix}_{i}' for i in range(start, start + expected)]
    for n, im in zip(names, fr):
        save(im, n)


# ---------------------------------------------------------------- cutting
def cut_grass():
    im = crops('grass', 1)[0]
    im = fit(im, h=64)
    a = np.asarray(im).astype(np.float32)
    W, H = 64, 64
    al = a[..., 3]
    cols = np.where(al.max(0) > 250)[0]
    x0, x1 = cols[0], cols[-1] + 1
    # the straight part: columns whose alpha profile is full from grass top to the bottom
    o = 12
    p = x0 + (x1 - x0) // 2  # wrap point of the middle tile
    # middle tile: strip[p-W .. p), its first o columns cross-faded to the columns after p -> periodic
    mid = a[:, p - W:p].copy()
    for j in range(o):
        t = j / o
        mid[:, j] = (1 - t) * a[:, p + j] + t * a[:, p - W + j]
    # left tile: the left end; its last o columns cross-faded to the columns before p
    left = a[:, x0:x0 + W].copy()
    for j in range(o):
        t = (j + 1) / o
        left[:, W - o + j] = (1 - t) * left[:, W - o + j] + t * a[:, p - o + j]
    right = a[:, x1 - W:x1].copy()
    for j in range(o):
        t = 1 - j / o
        right[:, j] = t * a[:, p + j] + (1 - t) * right[:, j]
    for n, t in (('pf_grass_left', left), ('pf_grass_mid', mid), ('pf_grass_right', right)):
        save(Image.fromarray(np.clip(t, 0, 255).astype(np.uint8), 'RGBA'), n)
    # plain earth: base and pebble colours of the earth part of the strip
    body = a[int(H * 0.62):H - 2, p - W:p, :3].reshape(-1, 3)
    q = (body // 8).astype(int)
    keys, counts = np.unique(q[:, 0] * 1024 + q[:, 1] * 32 + q[:, 2], return_counts=True)
    base = keys[counts.argmax()]
    base_c = tuple(int(v) for v in body[(q[:, 0] * 1024 + q[:, 1] * 32 + q[:, 2]) == base].mean(0))
    dark = tuple(int(v * 0.8) for v in base_c)
    big = 4
    dirt = Image.new('RGBA', (64 * big, 64 * big), base_c + (255,))
    dr = ImageDraw.Draw(dirt)
    for (x, y, r) in ((14, 12, 5), (44, 22, 4), (26, 42, 6), (52, 50, 3), (8, 54, 3), (34, 6, 2)):
        dr.ellipse([(x - r) * big, (y - r) * big, (x + r) * big, (y + r) * big], fill=dark + (255,))
    save(dirt.resize((64, 64), Image.LANCZOS), 'pf_dirt')


def cut_blocks():
    for n, im in zip(['pf_stone', 'pf_brick', 'pf_ice', 'pf_sand', 'pf_crate'], crops('blocks', 5)):
        save(stretch_tile(im), n)


def cut_gadgets():
    spikes, s1, s2, ladder, plank = crops('gadgets', 5)
    save(pad(fit(spikes, w=60)), 'pf_spikes')
    s = 60 / max(s1.height, s2.height, s1.width * 60 / 56, s2.width * 60 / 56)
    for n, im in (('pf_spring_1', s1), ('pf_spring_2', s2)):
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
        save(on_canvas(im, 64, 64), n)
    # ladder: 56 wide; a 64-high piece that starts and ends in a rails-only row, so it stacks without a seam
    lad = fit(ladder, w=56)
    a = np.asarray(lad)
    cover = (a[..., 3] > 128).sum(1)
    rails = cover <= np.percentile(cover, 30) + 2
    starts = [y for y in range(4, a.shape[0] - 68) if rails[y] and rails[y + 64]]
    if not starts:
        raise ValueError('ladder: no rails-only rows 64 apart')
    y0 = min(starts, key=lambda y: abs(y - (a.shape[0] - 64) // 2))
    save(on_canvas(Image.fromarray(a[y0:y0 + 64].copy(), 'RGBA'), 64, 64), 'pf_ladder')
    save(fit(plank, w=64), 'pf_wood_platform')


def cut_items_sheet():
    coin, pink, blue, green, heart, star, keyim = crops('items', 7)
    coin = fit(coin, 36, 36)
    edge_w = max(4, coin.width // 6)
    widths = [coin.width, round(coin.width * 0.6), edge_w, round(coin.width * 0.6)]
    for i, w in enumerate(widths, 1):
        im = coin.resize((w, coin.height), Image.LANCZOS)
        if i == 4:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        save(on_canvas(im, coin.width + 4, coin.height + 4, 'middle'), f'pf_coin_{i}')
    for n, im in (('pf_gem_pink', pink), ('pf_gem_blue', blue), ('pf_gem_green', green)):
        save(pad(fit(im, h=38)), n)
    save(pad(fit(heart, 38, 38)), 'pf_heart')
    save(pad(fit(star, 40, 40)), 'pf_star')
    save(pad(fit(keyim, 42, 42)), 'pf_key')


def clean_key(path):
    """Key without magenta fringe (as in grid_chars): every magenta-hued pixel becomes pure key colour first,
    then edge pixels take the colour of the nearest solid pixel instead of a magenta blend."""
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.int32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    lo, hi = np.minimum(r, b), np.maximum(r, b)
    pinkish = (lo > 80) & (g < 0.35 * lo) & (np.abs(r - b) < 0.3 * hi)
    a[pinkish] = (255, 0, 255)
    rgba = key(Image.fromarray(a.astype(np.uint8), 'RGB'))
    # dark pink facets lie near the key colour and come out half transparent: inside the outline everything is opaque
    inner = ndimage.binary_erosion(ndimage.binary_fill_holes(rgba[..., 3] > 128), iterations=2)
    rgba[inner, :3] = a[inner]
    rgba[inner, 3] = 255
    solid = ndimage.binary_erosion(rgba[..., 3] > 250, iterations=1) & ~pinkish
    iy, ix = ndimage.distance_transform_edt(~solid, return_distances=False, return_indices=True)
    rgba[..., :3] = rgba[iy, ix, :3]
    rgba[..., :3][rgba[..., 3] == 0] = 0
    return rgba


GEM_COLOURS = ('blue', 'green', 'pink', 'red')  # sheet rows


def cut_gem_spin():
    """4x4 sheet: rows = colours, columns = spin phases (front, turned, edge-on, turned the other way).
    All frames get the same height and one 40x40 canvas, centred; the turned frames are squeezed to the
    mean width of front and edge so that the spin narrows and widens smoothly."""
    rgba = clean_key(sheet('gem_spin'))
    lab, _ = ndimage.label(ndimage.binary_dilation(rgba[..., 3] > 128, iterations=3))
    comps = [(sl, i) for i, sl in enumerate(ndimage.find_objects(lab), 1) if (lab[sl] == i).sum() >= 1500]
    if len(comps) != 16:
        raise ValueError(f'gem_spin: found {len(comps)} objects, expected 16')
    cy = [(c[0].start + c[0].stop) / 2 for c, _ in comps]
    h = np.median([c[0].stop - c[0].start for c, _ in comps])
    order = sorted(range(16), key=lambda k: (round(cy[k] / (h * 0.9)), comps[k][0][1].start))
    gems = []
    for k in order:
        sl, i = comps[k]
        crop = rgba[sl].copy()
        crop[..., 3] = np.where(lab[sl] == i, crop[..., 3], 0)
        im = Image.fromarray(crop, 'RGBA')
        gems.append(fit(im.crop(im.getbbox()), h=36))
    for row, colour in enumerate(GEM_COLOURS):
        fr = gems[row * 4:row * 4 + 4]
        mid = round((fr[0].width + fr[2].width) / 2)
        fr[1] = fr[1].resize((mid, 36), Image.LANCZOS)
        fr[3] = fr[3].resize((mid, 36), Image.LANCZOS)
        for i, im in enumerate(fr, 1):
            save(on_canvas(im, 40, 40, 'middle'), f'pf_gem_{colour}_{i}')


def cut_doors():
    dc, do, cc, co = crops('doors', 4)
    s = min(64 / max(dc.width, do.width), 96 / max(dc.height, do.height))
    for n, im in (('pf_door_closed', dc), ('pf_door_open', do)):
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
        save(on_canvas(im, 64, 96), n)
    s = 56 / max(cc.width, co.width)
    h = round(max(cc.height, co.height) * s)
    for n, im in (('pf_chest_closed', cc), ('pf_chest_open', co)):
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
        save(on_canvas(im, 60, h + 4), n)


def cut_flag():
    fr = crops('flag', 3)
    s = min(96 / max(f.height for f in fr), 64 / max(f.width for f in fr))
    for i, im in enumerate(fr, 1):
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
        # align the poles: the pole is the leftmost opaque column block
        c = Image.new('RGBA', (64, 96), (0, 0, 0, 0))
        c.paste(im, (2, 96 - im.height), im)
        save(c, f'pf_flag_{i}')


def cut_decor():
    c1, c2, c3, bush, sun = crops('decor', 5)
    save(pad(fit(c1, w=72)), 'pf_cloud_1')
    save(pad(fit(c2, w=112)), 'pf_cloud_2')
    save(pad(fit(c3, w=128)), 'pf_cloud_3')
    save(pad(fit(bush, w=80)), 'pf_bush')
    save(pad(fit(sun, 80, 80)), 'pf_sun')


def cut_scenery():
    tree, hill = crops('scenery', 2)
    save(pad(fit(tree, h=150)), 'pf_tree')
    save(pad(fit(hill, w=156)), 'pf_hill')


def cut_spiky():
    ball = fit(crops('spiky', 1)[0], 52, 52)
    s = max(ball.width, ball.height) + 8
    base = on_canvas(ball, s, s, 'middle')
    for i in range(4):
        save(base.rotate(-90 * i, resample=Image.BICUBIC), f'spiky_roll_{i + 1}')


def cut_bg(s):
    im = Image.open(sheet(s)).convert('RGB')
    w, h = im.size
    if w / h > 5 / 3:
        nw = round(h * 5 / 3)
        im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        nh = round(w * 3 / 5)
        im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    save(im.resize((800, 480), Image.LANCZOS), 'pf_' + s)


CUT = {
    'grass': cut_grass, 'blocks': cut_blocks, 'gadgets': cut_gadgets, 'items': cut_items_sheet, 'doors': cut_doors,
    'gem_spin': cut_gem_spin, 'flag': cut_flag, 'decor': cut_decor, 'scenery': cut_scenery, 'spiky': cut_spiky,
    'slug': lambda: anim('slug', 'slug_walk', 44, 4),
    'bat': lambda: anim('bat', 'bat_fly', 48, 4),
    'blob': lambda: anim('blob', 'blob_hop', 48, 4),
    'boy_idle': lambda: anim('boy_idle', 'boy_idle', 96, 4),
    'boy_run': lambda: anim('boy_run', 'boy_run', 96, 8),
    'boy_poses': lambda: anim('boy_poses', None, 96, 4, names=['boy_jump', 'boy_fall', 'boy_land', 'boy_hurt']),
    'bg_day': lambda: cut_bg('bg_day'), 'bg_night': lambda: cut_bg('bg_night'), 'bg_cave': lambda: cut_bg('bg_cave'),
}


def write_json():
    assets = []
    for name, (tags, de, en) in DESC.items():
        assets.append({'name': name, 'file': name + '.png', 'tags': tags, 'de': de, 'en': en})
    pack = {'pack': 'platformer', 'title': {'de': 'Jump and Run', 'en': 'Platformer'}, 'format': 'png', 'assets': assets}
    with open(os.path.join(HERE, 'pack.json'), 'w', encoding='utf-8') as f:
        json.dump(pack, f, ensure_ascii=False, indent=2)
        f.write('\n')


if __name__ == '__main__':
    cmd, args = sys.argv[1], sys.argv[2:]
    os.makedirs(WORK, exist_ok=True)
    if cmd == 'gen':
        todo = args or [s for s in SHEETS if s != 'boy_ref']
        def one(s):
            p, refs = SHEETS[s]
            return s, gen(os.path.join(WORK, s), p, refs)
        with ThreadPoolExecutor(8) as ex:
            for s, r in ex.map(one, todo):
                print(s, r[:200], flush=True)
    elif cmd == 'cut':
        for s in args or list(CUT):
            try:
                CUT[s]()
                print(s, 'ok')
            except Exception as e:
                print(s, 'ERROR', e)
    elif cmd == 'json':
        write_json()
