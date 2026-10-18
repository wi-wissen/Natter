"""Redraw the `space` pack: WORK=<scratch dir> python3 make.py gen [sheet ...] | cut | json
Sheets are generated into WORK (scratch), then cut into this folder."""
import sys, os, json
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'asset-gen'))
from gen import gen
from keyslice import key, cut_items

WORK = os.environ.get('WORK', '/tmp/assets-work/space')
REF = os.path.join(ROOT, 'scripts', 'asset-gen', 'style-emoji.png')

STYLE = ('in exactly the same flat emoji style as the reference image (clear flat shapes, no outlines, few colours per object, '
         'rounded friendly forms, at most a hint of shading). Do NOT draw the reference characters. ')
BG = ('Background: one flat solid pure magenta colour #FF00FF everywhere, no shadows, no ground, no text, no letters, '
      'no numbers, no grid lines, no frames. Objects never use pink or magenta colours. Every object is completely separate with a wide magenta gap around it, nothing touches.')
TOP = 'Top-down view as in a vertical space shooter game. '

SHEETS = {
    'ship': ('Draw 6 objects ' + STYLE + TOP +
             'They all show THE SAME small friendly player rocket ship (rounded white body, red nose and fins, a round light-blue cockpit window), '
             'seen from above, nose pointing UP, identical size and design in every picture. Grid of 2 rows x 3 columns, reading order: '
             'row 1: (1) the ship flying straight, no flame; (2) the ship banking LEFT (body slightly tilted and narrowed, left wing smaller); '
             '(3) the ship banking RIGHT (mirror of 2). Row 2: the ship flying straight with an orange-yellow engine flame coming out of the BOTTOM, '
             'as a 3-frame flame flicker animation: (4) short flame, (5) long flame, (6) medium flame with a different flicker shape. '
             'The flame touches the ship. ' + BG),
    'enemies': ('Draw 6 different objects ' + STYLE + TOP +
                'Grid of 2 rows x 3 columns, reading order: (1) a purple enemy spaceship with two swept wings, pointing DOWN; '
                '(2) a green enemy fighter with a round body and three spikes, pointing DOWN; (3) an orange-red enemy ship shaped like a '
                'wide arrowhead with a glowing yellow window, pointing DOWN; (4) a friendly cartoon alien head, round light-green face with '
                'two antennae with little balls, three big cute eyes and a small smile (front view, original design); '
                '(5) a classic grey flying saucer with a light-blue glass dome and small yellow lights on the rim (slightly from above); '
                '(6) a small white satellite with two blue solar panels and a dish. ' + BG),
    'rocks': ('Draw 6 different objects ' + STYLE + TOP +
              'Grid of 2 rows x 3 columns, reading order: (1) a small grey-brown lumpy asteroid with two craters; (2) a medium grey-brown '
              'lumpy asteroid with three craters, different shape; (3) a big grey-brown lumpy asteroid with several craters, different shape; '
              '(4) a comet: a light-blue icy head with a long glowing white-blue tail going to the upper right; (5) a cute astronaut in a '
              'white spacesuit with a round dark-blue visor, floating, front view, arms open; (6) a red rocket missile with grey fins, '
              'pointing UP, with a tiny orange flame at the bottom. ' + BG),
    'planets': ('Draw 4 different planets ' + STYLE +
                'Grid of 2 rows x 2 columns, all the same size, reading order: (1) a pale-orange planet with a wide tilted ring around it; '
                '(2) an earth-like planet with blue oceans, green continents and a few white clouds; (3) a red-orange desert planet with darker '
                'red craters; (4) a pale icy blue-white planet with ice cracks. Only flat circles with flat details. ' + BG),
    'shots': ('Draw 6 different small objects ' + STYLE + TOP +
              'Grid of 2 rows x 3 columns, reading order: (1) a small 4-pointed yellow twinkle star; (2) a small white 4-pointed twinkle '
              'star with a soft round centre; (3) a small light-blue 5-pointed sparkle star; (4) a vertical blue laser bolt: a long rounded '
              'capsule, light blue with a white core, pointing UP; (5) the same vertical laser bolt in red with a pink-white core; '
              '(6) a small round yellow-orange energy bullet. Draw them big. ' + BG),
    'explosion': ('Draw a 6-frame EXPLOSION animation ' + STYLE + 'One horizontal row of 6 frames, evenly spaced, centred on the same point, '
                  'reading order left to right: (1) a small bright yellow-white flash; (2) a bigger round yellow-orange fireball; '
                  '(3) the biggest fireball, orange with yellow core and a few round bumps; (4) the fireball breaks up into red-orange puffs; '
                  '(5) grey-brown smoke puffs with small orange bits; (6) a few small fading grey smoke puffs, close together. '
                  'Keep the puffs of one frame touching each other so that each frame is ONE connected shape. ' + BG),
    'power': ('Draw 4 round power-up pickups ' + STYLE + 'Each is a glossy round coin-like badge with a light rim and a white symbol, '
              'all the same size. Grid of 2 rows x 2 columns, reading order: (1) blue badge with a white shield symbol; (2) orange badge '
              'with a white double lightning bolt symbol; (3) green badge with a white heart symbol; (4) red badge with a white round bomb '
              'symbol with a fuse. No letters. ' + BG),
    'boss': ('Draw 2 objects ' + STYLE + TOP + 'Side by side in one row. (1) left, big: a huge alien mothership seen from above, pointing '
             'DOWN, wide rounded dark-purple hull with violet and teal panels, two side pods, a row of glowing yellow round '
             'windows and a big friendly-menacing face-like front with two glowing eyes; it looks powerful but cartoon-cute, original '
             'design. (2) right, smaller: an energy shield bubble: a thin light-cyan circular ring with a white highlight arc, the inside '
             'is EMPTY and shows the magenta background (only the ring is drawn). ' + BG),
}

BG_PROMPT = ('A game background for a space shooter, wide landscape 5:3, ' + STYLE +
             'Deep blue-violet night sky of outer space, many small white and pale-yellow stars of different sizes, a soft pink-violet '
             'nebula cloud drawn as a few flat rounded shapes, one small distant pale planet. Calm, not busy, so that game sprites stay '
             'readable on it. No text, no frame, no spaceships.')

# sheet -> list of (name, long side in px), in reading order
CUT = {
    'ship': [('sp_ship', 64), ('sp_ship_left', 64), ('sp_ship_right', 64), ('sp_ship_fire_1', 0), ('sp_ship_fire_2', 0), ('sp_ship_fire_3', 0)],
    'enemies': [('sp_enemy_1', 56), ('sp_enemy_2', 56), ('sp_enemy_3', 56), ('sp_alien', 56), ('sp_ufo', 72), ('sp_satellite', 64)],
    'rocks': [('sp_asteroid_s', 32), ('sp_asteroid_m', 56), ('sp_asteroid_l', 96), ('sp_comet', 96), ('sp_astronaut', 64), ('sp_missile', 32)],
    'planets': [('sp_planet_1', 96), ('sp_planet_2', 96), ('sp_planet_3', 96), ('sp_planet_4', 96)],
    'shots': [('sp_star_1', 16), ('sp_star_2', 16), ('sp_star_3', 16), ('sp_laser_blue', 32), ('sp_laser_red', 32), ('sp_bullet', 12)],
    'explosion': [(f'sp_explosion_{i}', 0) for i in range(1, 7)],
    'power': [('sp_power_shield', 48), ('sp_power_rapid', 48), ('sp_power_life', 48), ('sp_power_bomb', 48)],
    'boss': [('sp_boss', 160), ('sp_shield_bubble', 96)],
}


def gen_sheet(s):
    out = os.path.join(WORK, 'sheet-' + s)
    if s == 'bg':
        return s, gen(out, BG_PROMPT, REF)
    return s, gen(out, SHEETS[s], REF)


def raw_crops(sheet, n, min_area=300):
    rgba = key(Image.open(sheet))
    alpha = rgba[..., 3] > 128
    lab, _ = ndimage.label(ndimage.binary_dilation(alpha, iterations=8))
    comps = [(sl, i) for i, sl in enumerate(ndimage.find_objects(lab), 1) if (lab[sl] == i).sum() >= min_area]
    if len(comps) != n:
        raise ValueError(f'{sheet}: found {len(comps)} objects, expected {n}')
    cy = [(s[0].start + s[0].stop) / 2 for s, _ in comps]
    h = np.median([s[0].stop - s[0].start for s, _ in comps])
    order = sorted(range(len(comps)), key=lambda k: (round(cy[k] / (h * 0.9)), comps[k][0][1].start))
    out = []
    for k in order:
        sl, i = comps[k]
        c = rgba[sl].copy()
        c[..., 3] = np.where(ndimage.binary_dilation(lab[sl] == i, iterations=2), c[..., 3], 0)
        # tighten to visible pixels
        ys, xs = np.nonzero(c[..., 3] > 8)
        c = c[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        out.append(Image.fromarray(c, 'RGBA'))
    return out


def grid_crops(sheet, rows, cols):
    """Cut a sheet into rows x cols equal cells and take everything visible in each cell."""
    rgba = key(Image.open(sheet))
    H, W = rgba.shape[:2]
    out = []
    for r in range(rows):
        for c in range(cols):
            cell = rgba[r * H // rows:(r + 1) * H // rows, c * W // cols:(c + 1) * W // cols].copy()
            m = cell[..., 3] > 8
            lab, n = ndimage.label(ndimage.binary_dilation(m, iterations=3))
            sizes = ndimage.sum(m, lab, range(1, n + 1))
            keep = np.isin(lab, [i + 1 for i, v in enumerate(sizes) if v >= 40])  # drop specks
            cell[..., 3] = np.where(keep, cell[..., 3], 0)
            ys, xs = np.nonzero(cell[..., 3] > 8)
            out.append(Image.fromarray(cell[ys.min():ys.max() + 1, xs.min():xs.max() + 1], 'RGBA'))
    return out


def bank(im, deg):
    """Banking ship from the straight one: narrower body, slightly turned (deg > 0 turns the nose left)."""
    im = im.resize((round(im.width * 0.86), im.height), Image.LANCZOS)
    return im.rotate(deg, resample=Image.BICUBIC, expand=True)


def save(im, name, scale=None, long_side=None, pad=2):
    if long_side:
        scale = long_side / max(im.size)
    im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    cv = Image.new('RGBA', (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
    cv.paste(im, (pad, pad), im)
    cv.save(os.path.join(HERE, name + '.png'), optimize=True)


def cut():
    for s, items in CUT.items():
        if s == 'ship':
            # the sheet has 2 rows x 4 ships: cell 1 is the straight ship, cells 5, 7, 8 the flame frames
            # (short, long, flicker). The drawn banking ships were turned too far, so banking is derived from the straight ship.
            g = grid_crops(os.path.join(WORK, 'sheet-ship.png'), 2, 4)
            sc = 64 / max(g[0].size)
            save(g[0], 'sp_ship', scale=sc)
            save(bank(g[0], 12), 'sp_ship_left', scale=sc)
            save(bank(g[0], -12), 'sp_ship_right', scale=sc)
            fr = [c.resize((round(c.width * sc), round(c.height * sc)), Image.LANCZOS) for c in (g[4], g[6], g[7])]
            w = max(f.width for f in fr) + 4; h = max(f.height for f in fr) + 4
            for n, f in zip(['sp_ship_fire_1', 'sp_ship_fire_2', 'sp_ship_fire_3'], fr):
                cv = Image.new('RGBA', (w, h), (0, 0, 0, 0)); cv.paste(f, ((w - f.width) // 2, 2), f)
                cv.save(os.path.join(HERE, n + '.png'), optimize=True)
            continue
        if s == 'explosion':
            # the sheet has 2 rows x 4 frames; frames 1, 2, 3, 4, 6, 8 make the 6-frame animation.
            g = grid_crops(os.path.join(WORK, 'sheet-explosion.png'), 2, 4)
            cs = [g[i] for i in (0, 1, 2, 3, 5, 7)]
            sc = 96 / max(max(c.size) for c in cs)
            fr = [c.resize((max(1, round(c.width * sc)), max(1, round(c.height * sc))), Image.LANCZOS) for c in cs]
            w = max(f.width for f in fr) + 4; h = max(f.height for f in fr) + 4
            for (n, _), f in zip(items, fr):
                cv = Image.new('RGBA', (w, h), (0, 0, 0, 0)); cv.paste(f, ((w - f.width) // 2, (h - f.height) // 2), f)
                cv.save(os.path.join(HERE, n + '.png'), optimize=True)
            continue
        cs = raw_crops(os.path.join(WORK, f'sheet-{s}.png'), len(items))
        if s == 'shots':
            for (n, ls), c in zip(items, cs):
                save(c, n, long_side=ls, pad=1)
        else:
            for (n, ls), c in zip(items, cs):
                save(c, n, long_side=ls)
    bg = Image.open(os.path.join(WORK, 'sheet-bg.png')).convert('RGB')
    # crop to 5:3 then scale to 800x480
    W, H = bg.size
    if W / H > 5 / 3:
        nw = round(H * 5 / 3); bg = bg.crop(((W - nw) // 2, 0, (W - nw) // 2 + nw, H))
    else:
        nh = round(W * 3 / 5); bg = bg.crop((0, (H - nh) // 2, W, (H - nh) // 2 + nh))
    # the model output is slightly noisy: smooth and reduce to 32 colours so the file stays under 80 KB
    bg = bg.resize((800, 480), Image.LANCZOS).filter(ImageFilter.MedianFilter(5))
    bg.quantize(32, method=Image.MEDIANCUT, dither=Image.NONE).save(os.path.join(HERE, 'sp_bg_space.png'), optimize=True)


T = {  # name: (tags, de, en)
    'sp_ship': (['ship', 'player'], 'Raumschiff des Spielers, Spitze nach oben', 'Player rocket ship, nose pointing up'),
    'sp_ship_left': (['ship', 'player'], 'Raumschiff neigt sich nach links', 'Player ship banking left'),
    'sp_ship_right': (['ship', 'player'], 'Raumschiff neigt sich nach rechts', 'Player ship banking right'),
    'sp_enemy_1': (['enemy', 'ship'], 'Lila Feindschiff mit Flügeln, Spitze nach unten', 'Purple winged enemy ship, pointing down'),
    'sp_enemy_2': (['enemy', 'ship'], 'Grünes Stachel-Feindschiff, Spitze nach unten', 'Green spiky enemy ship, pointing down'),
    'sp_enemy_3': (['enemy', 'ship'], 'Orange Pfeil-Feindschiff, Spitze nach unten', 'Orange arrowhead enemy ship, pointing down'),
    'sp_alien': (['enemy', 'character'], 'Freundlicher grüner Alien-Kopf mit drei Augen', 'Friendly green alien head with three eyes'),
    'sp_ufo': (['enemy', 'ship'], 'Fliegende Untertasse mit Glaskuppel', 'Flying saucer with a glass dome'),
    'sp_asteroid_s': (['obstacle', 'asteroid'], 'Kleiner Asteroid', 'Small asteroid'),
    'sp_asteroid_m': (['obstacle', 'asteroid'], 'Mittlerer Asteroid', 'Medium asteroid'),
    'sp_asteroid_l': (['obstacle', 'asteroid'], 'Großer Asteroid', 'Large asteroid'),
    'sp_planet_1': (['planet', 'decoration'], 'Planet mit Ring', 'Ringed planet'),
    'sp_planet_2': (['planet', 'decoration'], 'Erdähnlicher Planet', 'Earth-like planet'),
    'sp_planet_3': (['planet', 'decoration'], 'Roter Wüstenplanet', 'Red desert planet'),
    'sp_planet_4': (['planet', 'decoration'], 'Eisplanet', 'Ice planet'),
    'sp_star_1': (['star', 'decoration'], 'Kleiner gelber Funkelstern', 'Tiny yellow twinkle star'),
    'sp_star_2': (['star', 'decoration'], 'Kleiner weißer Funkelstern', 'Tiny white twinkle star'),
    'sp_star_3': (['star', 'decoration'], 'Kleiner hellblauer Stern', 'Tiny light-blue star'),
    'sp_laser_blue': (['shot'], 'Blauer Laserstrahl, senkrecht', 'Blue laser bolt, vertical'),
    'sp_laser_red': (['shot'], 'Roter Laserstrahl, senkrecht', 'Red laser bolt, vertical'),
    'sp_bullet': (['shot'], 'Kleine Energiekugel', 'Small energy bullet'),
    'sp_missile': (['shot'], 'Rakete, Spitze nach oben', 'Missile, pointing up'),
    'sp_power_shield': (['item', 'powerup'], 'Extra: Schild (blaue Münze)', 'Power-up: shield (blue badge)'),
    'sp_power_rapid': (['item', 'powerup'], 'Extra: Schnellfeuer (orange Münze)', 'Power-up: rapid fire (orange badge)'),
    'sp_power_life': (['item', 'powerup'], 'Extra: Leben (grüne Münze mit Herz)', 'Power-up: extra life (green badge with heart)'),
    'sp_power_bomb': (['item', 'powerup'], 'Extra: Bombe (rote Münze)', 'Power-up: bomb (red badge)'),
    'sp_shield_bubble': (['effect'], 'Schutzschild-Blase (Ring, innen durchsichtig)', 'Shield bubble (ring, see-through inside)'),
    'sp_boss': (['enemy', 'boss', 'ship'], 'Großes Mutterschiff (Endgegner), Spitze nach unten', 'Big mothership (boss), pointing down'),
    'sp_astronaut': (['character'], 'Schwebende Astronautin', 'Floating astronaut'),
    'sp_satellite': (['decoration'], 'Satellit mit Solarflügeln', 'Satellite with solar panels'),
    'sp_comet': (['obstacle'], 'Komet mit Schweif nach rechts oben', 'Comet with its tail to the upper right'),
    'sp_bg_space': (['background'], 'Weltraum-Hintergrund mit Sternen und Nebel (800x480)', 'Space background with stars and a nebula (800x480)'),
}
for i in range(1, 4):
    T[f'sp_ship_fire_{i}'] = (['ship', 'player', 'animation'], f'Raumschiff mit Flamme, Bild {i} von 3', f'Player ship with engine flame, frame {i} of 3')
for i in range(1, 7):
    T[f'sp_explosion_{i}'] = (['effect', 'animation'], f'Explosion, Bild {i} von 6', f'Explosion, frame {i} of 6')


def write_json():
    order = ['sp_ship', 'sp_ship_left', 'sp_ship_right'] + [f'sp_ship_fire_{i}' for i in range(1, 4)] + \
        [n for n in T if not n.startswith(('sp_ship', 'sp_explosion'))]
    order[order.index('sp_missile') + 1:order.index('sp_missile') + 1] = [f'sp_explosion_{i}' for i in range(1, 7)]
    assets = [{'name': n, 'file': n + '.png', 'tags': ['space'] + T[n][0], 'de': T[n][1], 'en': T[n][2]} for n in order]
    pack = {'pack': 'space', 'title': {'de': 'Weltraum', 'en': 'Space'}, 'format': 'png', 'assets': assets}
    json.dump(pack, open(os.path.join(HERE, 'pack.json'), 'w'), ensure_ascii=False, indent=2)


if __name__ == '__main__':
    os.makedirs(WORK, exist_ok=True)
    cmd = sys.argv[1]
    if cmd == 'gen':
        todo = sys.argv[2:] or list(SHEETS) + ['bg']
        with ThreadPoolExecutor(8) as ex:
            for s, r in ex.map(gen_sheet, todo):
                print(s, r)
    elif cmd == 'cut':
        cut()
    elif cmd == 'json':
        write_json()
