"""Arcade pack: prompts, names and post-processing.

python3 make.py gen <sheet> [...]   draw sheets with the image model (writes to WORK)
python3 make.py cut <sheet> [...]   key and cut sheets into the named PNGs
python3 make.py tiles               draw the procedural tiles (roads, maze, boards)
python3 make.py pack                write pack.json
python3 make.py contact             contact sheets on dark and light background (in WORK)
`all` instead of a sheet name means every sheet.
"""
import os, sys, json
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'asset-gen'))
from gen import gen  # noqa: E402
from keyslice import key  # noqa: E402

STYLE = os.path.join(ROOT, 'scripts', 'asset-gen', 'style-emoji.png')
WORK = os.environ.get('ARCADE_WORK', '/tmp/claude-0/-home-user/82af8643-7fd2-511f-b912-5aee8d74fb4e/scratchpad/assets-work/arcade')

HEAD = ('Draw game sprites in exactly the same flat emoji style as the reference image: clear flat shapes, no outlines, '
        'very few colours per object, rounded friendly forms, at most a hint of shading. ')
TAIL = (' Every object is separate, with wide empty space between objects; no object touches another or the image border. '
        'Background: one flat solid pure magenta colour #FF00FF everywhere. No shadows, no ground, no text, no letters, '
        'no numbers, no grid lines, no frames around the objects. Original designs only, no logos, no brands.')

# sheet id -> prompt and items (name, (w, h), mode); mode 'fit' keeps the aspect ratio inside the box and crops tightly
# with a 2 px margin, 'exact' stretches to exactly w x h without margin (tiles that must line up).
SHEETS = {
    'snake': dict(prompt=HEAD + (
        'A sheet of 5 parts of a snake game, in ONE horizontal row, left to right: '
        '1) the head of a friendly green cartoon snake seen from directly above, a rounded square head pointing RIGHT, two big friendly eyes on top, a small red forked tongue sticking out to the right; '
        '2) one body segment of the same green snake seen from above: a rounded square, same width as the head, same green, a lighter green spot in the middle; '
        '3) the tail end of the same snake seen from above, lying STRAIGHT and flat (not curled, not bent): a horizontal piece whose right end is as wide as the body segment, '
        'narrowing evenly to a small rounded point at the LEFT end, like a rounded triangle pointing left, same green, a small lighter spot; '
        '4) a shiny red apple with a small green leaf; '
        '5) a small grey cartoon mouse seen from the side facing right, pink ears, long thin pink tail.'),
        items=[('snake_head_right', (32, 32), 'fit'), ('snake_body', (32, 32), 'fit'), ('snake_tail', (32, 32), 'fit'),
               ('snake_apple', (32, 32), 'fit'), ('snake_mouse', (32, 32), 'fit')]),
    'paddles': dict(prompt=HEAD + (
        'A sheet of 4 objects for ball-and-paddle games, in ONE horizontal row, left to right: '
        '1) a tall narrow upright paddle, a vertical rounded rectangle exactly four times as tall as wide, light blue with a white stripe along its length; '
        '2) a round white ball with a light grey hint; '
        '3) a wide flat horizontal paddle, a rounded rectangle five times as wide as tall, orange with light ends; '
        '4) a round silver-blue ball, smaller.'),
        items=[('pong_paddle', (24, 96), 'fit'), ('pong_ball', (24, 24), 'fit'),
               ('breakout_paddle', (96, 20), 'fit'), ('breakout_ball', (20, 20), 'fit')]),
    'bricks': dict(prompt=HEAD + (
        'A sheet of 6 wall bricks for a brick-breaking game, in a grid of 2 columns and 3 rows, reading order left to right, top to bottom: '
        'red, orange, yellow, green, blue, purple. Every brick is a flat wide rounded rectangle, more than twice as wide as tall, '
        'all exactly the same size and shape, one flat colour with a slightly lighter top edge and a slightly darker bottom edge.'),
        items=[(f'brick_{c}', (64, 28), 'exact') for c in ['red', 'orange', 'yellow', 'green', 'blue', 'purple']]),
    'blocks': dict(prompt=HEAD + (
        'A sheet of 7 square blocks for a falling-blocks puzzle game, in ONE horizontal row, left to right: '
        'red, orange, yellow, green, cyan, blue, purple. Every block is a perfect square with slightly rounded corners, '
        'all exactly the same size, one flat colour with a lighter bevel on the top and left edge and a darker bevel on the bottom and right edge.'),
        items=[(f'block_{c}', (32, 32), 'exact') for c in ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple']]),
    'cars': dict(prompt=HEAD + (
        'A sheet of 6 vehicles for a racing game, seen from DIRECTLY ABOVE (top-down view), every vehicle pointing UP (front at the top), '
        'in ONE horizontal row, left to right, all the same width: '
        '1) a red sports car; 2) a blue car; 3) a yellow car; 4) a green car; '
        '5) a generic police car painted black and white with a blue and red light bar on the roof (no writing); '
        '6) a longer delivery truck with an orange cab at the top and a big grey box body behind it. '
        'Cars show windscreen, roof and four dark tyres peeking out at the sides; simple and friendly.'),
        items=[('car_red', (48, 96), 'fit'), ('car_blue', (48, 96), 'fit'), ('car_yellow', (48, 96), 'fit'),
               ('car_green', (48, 96), 'fit'), ('car_police', (48, 96), 'fit'), ('car_truck', (56, 128), 'fit')]),
    'track': dict(prompt=HEAD + (
        'A sheet of 3 objects for a top-down racing game, in ONE horizontal row, left to right: '
        '1) an orange traffic cone with two white stripes, seen slightly from above; '
        '2) a flat dark oil puddle seen from above, irregular rounded blob shape, dark blue-black with a few small rainbow sheen highlights; '
        '3) a chequered black and white finish flag on a short pole, waving to the right.'),
        items=[('cone', (40, 40), 'fit'), ('oil', (64, 64), 'fit'), ('finish_flag', (64, 64), 'fit')]),
    'dice': dict(prompt=HEAD + (
        'A sheet of 6 dice faces seen straight from the front, in ONE horizontal row, left to right showing 1, 2, 3, 4, 5, 6 pips. '
        'Each die is a white rounded square, all exactly the same size, with dark round pips in the classic die layout '
        '(1: one pip in the centre; 2: two diagonal corners; 3: diagonal of three; 4: four corners; 5: four corners and centre; 6: two columns of three).'),
        items=[(f'dice_{n}', (64, 64), 'fit') for n in range(1, 7)]),
    'board': dict(prompt=HEAD + (
        'A sheet of 5 board game pieces seen straight from the front, in ONE horizontal row, left to right, all the same size: '
        '1) a thick bold X cross made of two rounded strokes, coral red; '
        '2) a thick bold ring O, light blue; '
        '3) a round red game disc (a flat coin-like playing piece) with a slightly lighter inner ring; '
        '4) the same disc in yellow; '
        '5) the same round disc shape but empty: a very light grey-blue flat circle.'),
        items=[('ttt_x', (64, 64), 'fit'), ('ttt_o', (64, 64), 'fit'), ('c4_red', (64, 64), 'fit'),
               ('c4_yellow', (64, 64), 'fit'), ('c4_empty', (64, 64), 'fit')]),
    'memory': dict(prompt=HEAD + (
        'A sheet of 9 memory game cards, all exactly the same size, square cards with rounded corners, '
        'in a grid of 3 columns and 3 rows, reading order left to right, top to bottom: '
        '1) the card BACK: purple with a simple pattern of small lighter diamonds; '
        'then 8 card FRONTS, each a white card with one big centred picture: '
        '2) a friendly orange cat face; 3) a yellow star; 4) a yellow crescent moon; 5) a red heart; '
        '6) a smiling orange sun with rays; 7) a blue fish facing right; 8) a pink flower with a yellow centre; 9) a white and red rocket.'),
        found=10, pick=[0, 2, 3, 4, 5, 6, 7, 8, 9],  # the model added a purple cat card
        items=[(n, (96, 96), 'fit') for n in ['memory_back', 'memory_cat', 'memory_star', 'memory_moon', 'memory_heart',
                                             'memory_sun', 'memory_fish', 'memory_flower', 'memory_rocket']]),
    'balloons': dict(prompt=HEAD + (
        'A sheet of 4 objects, in ONE horizontal row, left to right: '
        '1) a red party balloon with a small knot and a short curly string; 2) the same balloon in blue; 3) the same balloon in yellow; '
        '4) a red balloon bursting: a cartoon pop burst with jagged red rubber pieces flying outwards and small white star sparks.'),
        grow=40,
        items=[('balloon_red', (48, 72), 'fit'), ('balloon_blue', (48, 72), 'fit'), ('balloon_yellow', (48, 72), 'fit'),
               ('balloon_pop', (72, 72), 'fit')]),
    'shoot': dict(prompt=HEAD + (
        'A sheet of 6 objects, in ONE horizontal row, left to right: '
        '1) a round target board seen from the front: concentric rings red, white, red, white, with a red bullseye; '
        '2) a dart pointing RIGHT: thin silver tip, slim red body, yellow feather fins on the left; '
        '3) a cartoon cannon facing right: dark grey barrel angled slightly upward on a brown wooden carriage with two wheels; '
        '4) a round dark grey cannonball with a small white highlight; '
        '5) a golden trophy cup with two handles (a goal to reach); '
        '6) a cute round character: a simple round teal ball body with two big eyes and a smile, tiny feet, no arms.'),
        found=8, pick=[0, 1, 2, 3, 4, 7],  # the model added a blue ball and a second cup
        items=[('target', (80, 80), 'fit'), ('dart', (64, 64), 'fit'), ('cannon', (96, 96), 'fit'),
               ('cannonball', (32, 32), 'fit'), ('maze_goal', (32, 32), 'fit'), ('maze_player', (32, 32), 'fit')]),
}

# per-object item size: each object is scaled to its own box (the sheet only fixes the look)
DESC = {
    'snake_head_right': ('Schlangenkopf von oben, schaut nach rechts', 'Snake head from above, facing right'),
    'snake_head_up': ('Schlangenkopf von oben, schaut nach oben', 'Snake head from above, facing up'),
    'snake_head_left': ('Schlangenkopf von oben, schaut nach links', 'Snake head from above, facing left'),
    'snake_head_down': ('Schlangenkopf von oben, schaut nach unten', 'Snake head from above, facing down'),
    'snake_body': ('Körperglied der Schlange (32x32)', 'Snake body segment (32x32)'),
    'snake_tail': ('Schwanzende der Schlange, Spitze nach links', 'Snake tail, tip pointing left'),
    'snake_apple': ('Roter Apfel als Futter', 'Red apple to eat'),
    'snake_mouse': ('Graue Maus als Futter, schaut nach rechts', 'Grey mouse to eat, facing right'),
    'pong_paddle': ('Senkrechter Schläger für Pong (24x96)', 'Upright pong paddle (24x96)'),
    'pong_ball': ('Weißer Ball für Pong', 'White pong ball'),
    'breakout_paddle': ('Waagrechter Schläger zum Mauernzerschlagen (96x20)', 'Flat breakout paddle (96x20)'),
    'breakout_ball': ('Kleiner Ball zum Mauernzerschlagen', 'Small breakout ball'),
    'cone': ('Leitkegel', 'Traffic cone'),
    'oil': ('Ölfleck auf der Straße', 'Oil puddle on the road'),
    'finish_flag': ('Karierte Zielflagge', 'Chequered finish flag'),
    'car_police': ('Schwarz-weißes Polizeiauto von oben, fährt nach oben', 'Black and white police car from above, pointing up'),
    'car_truck': ('Lastwagen von oben, fährt nach oben', 'Truck from above, pointing up'),
    'road_straight': ('Gerade Straße, senkrecht (Kachel 128x128)', 'Straight road, vertical (tile 128x128)'),
    'road_curve': ('Straßenkurve von unten nach rechts (Kachel 128x128)', 'Road curve from bottom to right (tile 128x128)'),
    'road_grass': ('Wiese neben der Straße (Kachel 128x128)', 'Grass beside the road (tile 128x128)'),
    'ttt_x': ('Kreuz für Tic-Tac-Toe', 'Cross for tic-tac-toe'),
    'ttt_o': ('Kreis für Tic-Tac-Toe', 'Ring for tic-tac-toe'),
    'ttt_board': ('Spielfeld für Tic-Tac-Toe, drei mal drei Felder (192x192)', 'Tic-tac-toe board, three by three cells (192x192)'),
    'c4_red': ('Roter Spielstein für Vier gewinnt', 'Red disc for four in a row'),
    'c4_yellow': ('Gelber Spielstein für Vier gewinnt', 'Yellow disc for four in a row'),
    'c4_empty': ('Leeres Loch für Vier gewinnt', 'Empty slot for four in a row'),
    'c4_board_cell': ('Ein Feld des Vier-gewinnt-Gitters mit Loch (64x64)', 'One cell of the four-in-a-row frame with a hole (64x64)'),
    'memory_back': ('Rückseite einer Memory-Karte', 'Back of a memory card'),
    'balloon_pop': ('Platzender Luftballon', 'Balloon popping'),
    'target': ('Zielscheibe', 'Target board'),
    'dart': ('Wurfpfeil, zeigt nach rechts', 'Dart, pointing right'),
    'cannon': ('Kanone, zielt nach rechts', 'Cannon, aiming right'),
    'cannonball': ('Kanonenkugel', 'Cannonball'),
    'maze_wall': ('Mauerstück fürs Labyrinth (Kachel 32x32)', 'Maze wall (tile 32x32)'),
    'maze_floor': ('Boden im Labyrinth (Kachel 32x32)', 'Maze floor (tile 32x32)'),
    'maze_goal': ('Pokal als Ziel im Labyrinth', 'Trophy as the maze goal'),
    'maze_player': ('Runde Spielfigur fürs Labyrinth', 'Round maze player character'),
}
COL = {'red': ('rot', 'red'), 'orange': ('orange', 'orange'), 'yellow': ('gelb', 'yellow'), 'green': ('grün', 'green'),
       'cyan': ('türkis', 'cyan'), 'blue': ('blau', 'blue'), 'purple': ('lila', 'purple')}
for c, (de, en) in COL.items():
    DESC[f'block_{c}'] = (f'Fallender Block, {de} (32x32)', f'Falling block, {en} (32x32)')
    if c != 'cyan':
        DESC[f'brick_{c}'] = (f'Mauerstein, {de} (64x28)', f'Wall brick, {en} (64x28)')
    if c in ('red', 'blue', 'yellow', 'green'):
        DESC[f'car_{c}'] = (f'Auto von oben, {de}, fährt nach oben', f'Car from above, {en}, pointing up')
    if c in ('red', 'blue', 'yellow'):
        DESC[f'balloon_{c}'] = (f'Luftballon, {de}', f'Balloon, {en}')
for n in range(1, 7):
    DESC[f'dice_{n}'] = (f'Würfel mit {n} Augen', f'Die showing {n}')
for n, de, en in [('cat', 'Katze', 'cat'), ('star', 'Stern', 'star'), ('moon', 'Mond', 'moon'), ('heart', 'Herz', 'heart'),
                  ('sun', 'Sonne', 'sun'), ('fish', 'Fisch', 'fish'), ('flower', 'Blume', 'flower'), ('rocket', 'Rakete', 'rocket')]:
    DESC[f'memory_{n}'] = (f'Memory-Karte: {de}', f'Memory card: {en}')

TAGS = [('snake_', ['snake']), ('pong_', ['pong']), ('breakout_', ['breakout']), ('brick_', ['breakout', 'tile']),
        ('block_', ['blocks', 'tile']), ('car_', ['racing', 'vehicle']), ('road_', ['racing', 'tile']),
        ('cone', ['racing', 'obstacle']), ('oil', ['racing', 'obstacle']), ('finish_flag', ['racing']),
        ('dice_', ['dice']), ('ttt_', ['board']), ('c4_', ['board']), ('memory_', ['card']), ('balloon_', ['balloon']),
        ('target', ['shooting']), ('dart', ['shooting']), ('cannon', ['shooting']), ('maze_', ['maze'])]
ORDER = (['snake_head_right', 'snake_head_up', 'snake_head_left', 'snake_head_down'] + [n for s in SHEETS.values() for n, _, _ in s['items']
         if not n.startswith('snake_head')] + ['road_straight', 'road_curve', 'road_grass', 'ttt_board', 'c4_board_cell', 'maze_wall', 'maze_floor'])
ORDER = list(dict.fromkeys(ORDER))


def defringe(rgba):
    """Edge pixels that still look magenta take the colour of the nearest solid inner pixel."""
    a = rgba[..., 3]
    inner = ndimage.binary_erosion(a == 255, iterations=3)
    edge = (a > 0) & ~ndimage.binary_erosion(a > 0, iterations=4)
    c = rgba[..., :3].astype(np.int32)
    m = np.minimum(c[..., 0], c[..., 2]) - c[..., 1]
    bad = edge & (m > 12)
    if inner.any() and bad.any():
        _, (iy, ix) = ndimage.distance_transform_edt(~inner, return_indices=True)
        rgba[..., :3][bad] = rgba[..., :3][iy[bad], ix[bad]]
    return rgba


def components(path, count, min_area=1500, grow=8):
    rgba = defringe(key(Image.open(path)))
    alpha = rgba[..., 3] > 128
    lab, n = ndimage.label(ndimage.binary_dilation(alpha, iterations=grow))
    comps = [(sl, i) for i, sl in enumerate(ndimage.find_objects(lab), 1) if (lab[sl] == i).sum() >= min_area]
    if len(comps) != count:
        raise ValueError(f'{path}: found {len(comps)} objects, expected {count}')
    cy = [(s[0].start + s[0].stop) / 2 for s, _ in comps]
    h = np.median([s[0].stop - s[0].start for s, _ in comps])
    order = sorted(range(len(comps)), key=lambda k: (round(cy[k] / (h * 0.9)), comps[k][0][1].start))
    out = []
    for k in order:
        sl, i = comps[k]
        crop = rgba[sl].copy()
        crop[..., 3] = np.where(ndimage.binary_dilation(lab[sl] == i, iterations=2), crop[..., 3], 0)
        im = Image.fromarray(crop, 'RGBA')
        out.append(im.crop(im.getbbox()))
    return out


def unpremul_resize(im, size):
    """Resize without dark/magenta halos: premultiply alpha, resize, unpremultiply."""
    a = np.asarray(im).astype(np.float32)
    pm = np.dstack([a[..., :3] * a[..., 3:] / 255, a[..., 3]])
    r = np.dstack([np.asarray(Image.fromarray(pm[..., c], 'F').resize(size, Image.LANCZOS)) for c in range(4)])
    al = np.clip(r[..., 3], 0, 255)
    rgb = np.where(al[..., None] > 0.5, r[..., :3] * 255 / np.maximum(al[..., None], 1e-3), 0)
    return Image.fromarray(np.dstack([np.clip(rgb, 0, 255), al]).astype(np.uint8), 'RGBA')


def place(im, box, mode, pad=2):
    w, h = box
    if mode == 'exact':
        # cut the 1-2 px soft rim so the tile edges are solid, then stretch
        im = im.crop((1, 1, im.width - 1, im.height - 1))
        out = unpremul_resize(im, (w, h))
        a = np.asarray(out).copy()
        return Image.fromarray(a, 'RGBA')
    s = min((w - 2 * pad) / im.width, (h - 2 * pad) / im.height)
    im = unpremul_resize(im, (max(1, round(im.width * s)), max(1, round(im.height * s))))
    canvas = Image.new('RGBA', (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
    canvas.paste(im, (pad, pad), im)
    return canvas


def save(im, name):
    im.save(os.path.join(HERE, name + '.png'), optimize=True)


def cut(sheet):
    s = SHEETS[sheet]
    # 'pick': indices of the wanted objects when the model drew extra ones (recorded per generated sheet);
    # 'grow': merge radius for objects made of separate pieces
    pick = s.get('pick')
    crops = components(os.path.join(WORK, sheet + '.png'), s.get('found', len(s['items'])), grow=s.get('grow', 8))
    if pick:
        crops = [crops[k] for k in pick]
    for (name, box, mode), im in zip(s['items'], crops):
        out = place(im, box, mode)
        save(out, name)
        if name == 'snake_head_right':
            for d, rot in (('up', 90), ('left', 180), ('down', 270)):
                save(out.rotate(rot, expand=True), 'snake_head_' + d)


# ---------- procedural tiles (must tile seamlessly, so they are drawn, not generated) ----------
SS = 4  # supersampling
GRASS, GRASS_D, ROAD, ROAD_EDGE, LINE = (124, 186, 82), (98, 160, 64), (96, 104, 116), (230, 232, 236), (250, 250, 250)


def grass_tufts(d, size, seed):
    rng = np.random.default_rng(seed)
    for _ in range(5):
        x, y = rng.integers(10, size - 14, 2) * SS
        for dx in (-3, 0, 3):
            d.ellipse([x + dx * SS - SS, y - 5 * SS, x + dx * SS + SS, y + SS], fill=GRASS_D)


def road_straight():
    n = 128 * SS
    im = Image.new('RGBA', (n, n), GRASS)
    d = ImageDraw.Draw(im)
    d.rectangle([20 * SS, 0, 108 * SS - 1, n], fill=ROAD_EDGE)
    d.rectangle([24 * SS, 0, 104 * SS - 1, n], fill=ROAD)
    for y in (8, 72):  # dashes repeat every 64 px, so the tile is seamless
        d.rounded_rectangle([62 * SS, y * SS, 66 * SS - 1, (y + 32) * SS], radius=2 * SS, fill=LINE)
    return im.resize((128, 128), Image.LANCZOS)


def road_curve():
    """Road entering at the bottom edge and leaving at the right edge (centre of the curve in the bottom-right corner)."""
    n = 128 * SS
    im = Image.new('RGBA', (n, n), GRASS)
    d = ImageDraw.Draw(im)
    c = (128 * SS, 128 * SS)

    def ring(r, fill):
        d.ellipse([c[0] - r * SS, c[1] - r * SS, c[0] + r * SS, c[1] + r * SS], fill=fill)
    ring(108, ROAD_EDGE); ring(104, ROAD); ring(24, ROAD_EDGE); ring(20, GRASS)
    # dashed centre line on radius 64
    for a0 in (7, 52):
        d.arc([c[0] - 66 * SS, c[1] - 66 * SS, c[0] + 66 * SS, c[1] + 66 * SS], 180 + a0, 180 + a0 + 31, fill=LINE, width=4 * SS)
    grass_tufts(d, 128, 3)  # tufts outside the road only (redraw road over them)
    ring(108, ROAD_EDGE); ring(104, ROAD); ring(24, ROAD_EDGE); ring(20, GRASS)
    for a0 in (7, 52):
        d.arc([c[0] - 66 * SS, c[1] - 66 * SS, c[0] + 66 * SS, c[1] + 66 * SS], 180 + a0, 180 + a0 + 31, fill=LINE, width=4 * SS)
    return im.resize((128, 128), Image.LANCZOS)


def road_grass():
    n = 128 * SS
    im = Image.new('RGBA', (n, n), GRASS)
    grass_tufts(ImageDraw.Draw(im), 128, 7)
    return im.resize((128, 128), Image.LANCZOS)


def ttt_board():
    n = 192 * SS
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    col, w = (92, 72, 140), 6 * SS
    for k in (64, 128):
        d.rounded_rectangle([k * SS - w // 2, 6 * SS, k * SS + w // 2, n - 6 * SS], radius=w // 2, fill=col)
        d.rounded_rectangle([6 * SS, k * SS - w // 2, n - 6 * SS, k * SS + w // 2], radius=w // 2, fill=col)
    return im.resize((192, 192), Image.LANCZOS)


def c4_board_cell():
    n = 64 * SS
    im = Image.new('RGBA', (n, n), (52, 104, 196, 255))
    d = ImageDraw.Draw(im)
    d.ellipse([7 * SS, 7 * SS, 57 * SS, 57 * SS], fill=(40, 86, 170, 255))
    d.ellipse([9 * SS, 9 * SS, 55 * SS, 55 * SS], fill=(0, 0, 0, 0))
    return im.resize((64, 64), Image.LANCZOS)


def maze_wall():
    n = 32 * SS
    im = Image.new('RGBA', (n, n), (150, 92, 64, 255))
    d = ImageDraw.Draw(im)
    mortar = (120, 70, 50, 255)
    for y in (0, 16):
        d.rectangle([0, (y + 15) * SS, n, (y + 16) * SS], fill=mortar)
    for x, y in ((15, 0), (7, 16), (23, 16)):
        d.rectangle([x * SS, y * SS, (x + 1) * SS, (y + 15) * SS], fill=mortar)
    d.rectangle([0, 0, n, SS], fill=(178, 116, 84, 255))
    return im.resize((32, 32), Image.LANCZOS)


def maze_floor():
    n = 32 * SS
    im = Image.new('RGBA', (n, n), (238, 226, 200, 255))
    d = ImageDraw.Draw(im)
    for x, y in ((8, 10), (22, 24), (25, 7)):
        d.ellipse([x * SS, y * SS, (x + 2) * SS, (y + 2) * SS], fill=(222, 206, 176, 255))
    return im.resize((32, 32), Image.LANCZOS)


def tiles():
    for f in (road_straight, road_curve, road_grass, ttt_board, c4_board_cell, maze_wall, maze_floor):
        save(f(), f.__name__)


def tags(name):
    for p, t in TAGS:
        if name.startswith(p):
            return ['arcade'] + t
    return ['arcade']


def write_pack():
    assets = [dict(name=n, file=n + '.png', tags=tags(n), de=DESC[n][0], en=DESC[n][1]) for n in ORDER]
    pack = dict(pack='arcade', title=dict(de='Spielhalle', en='Arcade'), format='png', assets=assets)
    json.dump(pack, open(os.path.join(HERE, 'pack.json'), 'w'), ensure_ascii=False, indent=2)
    print(len(assets), 'assets')


def contact():
    names = [n for n in ORDER if os.path.exists(os.path.join(HERE, n + '.png'))]
    ims = [Image.open(os.path.join(HERE, n + '.png')).convert('RGBA') for n in names]
    cell, cols = 140, 10
    rows = (len(ims) + cols - 1) // cols
    for bg, tag in (((40, 40, 48), 'dark'), ((245, 245, 240), 'light')):
        sheet = Image.new('RGBA', (cols * cell, rows * cell), bg + (255,))
        for k, im in enumerate(ims):
            x, y = (k % cols) * cell, (k // cols) * cell
            sheet.paste(im, (x + (cell - im.width) // 2, y + (cell - im.height) // 2), im)
        sheet.save(os.path.join(WORK, f'contact_{tag}.png'))


def run_gen(sheet):
    os.makedirs(WORK, exist_ok=True)
    return sheet, gen(os.path.join(WORK, sheet), SHEETS[sheet]['prompt'] + TAIL, STYLE)


if __name__ == '__main__':
    cmd, args = sys.argv[1], sys.argv[2:]
    if args == ['all']:
        args = list(SHEETS)
    if cmd == 'gen':
        with ThreadPoolExecutor(6) as ex:
            for s, r in ex.map(run_gen, args):
                print(s, r)
    elif cmd == 'cut':
        for s in args:
            try:
                cut(s); print(s, 'ok')
            except Exception as e:
                print(s, 'ERROR', e)
    elif cmd == 'tiles':
        tiles()
    elif cmd == 'pack':
        write_pack()
    elif cmd == 'contact':
        contact()
