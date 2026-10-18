"""Sea pack: prompts, names and cutting. Redraw with
   python3 packages/assets/sea/make.py gen [sheet ...]   (writes sheets to WORK)
   python3 packages/assets/sea/make.py cut [sheet ...]   (cuts sheets into packages/assets/sea)
   python3 packages/assets/sea/make.py pack              (writes pack.json)"""
import os, sys, json
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(REPO, 'scripts', 'asset-gen'))
from gen import gen
import keyslice

REF = os.path.join(REPO, 'scripts', 'asset-gen', 'style-emoji.png')
WORK = os.environ.get('SEA_WORK', '/tmp/claude-0/-home-user/82af8643-7fd2-511f-b912-5aee8d74fb4e/scratchpad/assets-work/sea')

STYLE = ('Draw in exactly the same flat emoji style as the reference image: clear flat shapes, no outlines, very few colours per object, '
         'rounded friendly forms, no gradients, no hard shading. Do NOT draw any of the objects from the reference image. ')
BG = ('Background: one flat solid pure magenta colour #FF00FF everywhere, no shadows, no ground, no water surface, no text, no labels, '
      'no grid lines, no frames. Every object stands alone with lots of empty magenta space around it; objects must not touch or overlap. '
      'Do not use magenta or pink-purple inside the objects. ')

# sheet: (prompt, [(name, long side in px, de, en, tags)])
SHEETS = {
    'boats': (STYLE + 'A sprite sheet of 6 different small boats seen exactly from the side, all pointing to the right, in a grid of 3 columns and 2 rows, '
              'reading order left to right, top to bottom: '
              '1 a small sailboat with a white triangular sail and a red hull; 2 a small white and blue motorboat with a windshield; '
              '3 a friendly cartoon wooden sailing ship with three cream sails and a small flag with a simple yellow star (no skull, no bones, no cannons); '
              '4 a round yellow submarine with portholes and a periscope; 5 a simple raft of brown wooden logs tied together with a small mast and cloth sail; '
              '6 a long slim red-brown canoe with a paddle lying in it. '
              'Boats float on nothing: no water, no waves under them. ' + BG,
              [('sea_sailboat', 112, 'Segelboot, Seitenansicht nach rechts', 'Sailboat, side view facing right', ['boat', 'vehicle']),
               ('sea_motorboat', 112, 'Motorboot, Seitenansicht nach rechts', 'Motorboat, side view facing right', ['boat', 'vehicle']),
               ('sea_pirate_ship', 128, 'Freundliches Piratenschiff mit drei Segeln, nach rechts', 'Friendly pirate ship with three sails, facing right', ['boat', 'vehicle']),
               ('sea_submarine', 112, 'Gelbes U-Boot, nach rechts', 'Yellow submarine, facing right', ['boat', 'vehicle', 'underwater']),
               ('sea_raft', 96, 'Floß aus Baumstämmen mit kleinem Segel', 'Log raft with a small sail', ['boat', 'vehicle']),
               ('sea_canoe', 112, 'Kanu mit Paddel, nach rechts', 'Canoe with a paddle, facing right', ['boat', 'vehicle'])]),
    'fish': (STYLE + 'A sprite sheet of 6 cute sea animals seen from the side, in a grid of 3 columns and 2 rows, reading order left to right, top to bottom. '
             'The four fish all swim to the right (head on the right side): '
             '1 a round orange fish with white stripes; 2 a slim blue fish with a yellow tail; 3 a round green fish with big fins; '
             '4 a flat yellow fish with a few blue spots; 5 a light purple-blue jellyfish with a round bell and wavy tentacles hanging down; '
             '6 a friendly red octopus with eight curly tentacles. Each animal has a simple friendly dot eye. ' + BG,
             [('sea_fish_1', 56, 'Orangener Fisch mit weißen Streifen, schwimmt nach rechts', 'Orange fish with white stripes, swimming right', ['animal', 'fish', 'underwater']),
              ('sea_fish_2', 56, 'Schlanker blauer Fisch, schwimmt nach rechts', 'Slim blue fish, swimming right', ['animal', 'fish', 'underwater']),
              ('sea_fish_3', 56, 'Runder grüner Fisch, schwimmt nach rechts', 'Round green fish, swimming right', ['animal', 'fish', 'underwater']),
              ('sea_fish_4', 56, 'Gelber Fisch mit blauen Punkten, schwimmt nach rechts', 'Yellow fish with blue spots, swimming right', ['animal', 'fish', 'underwater']),
              ('sea_jellyfish', 64, 'Qualle', 'Jellyfish', ['animal', 'enemy', 'underwater']),
              ('sea_octopus', 72, 'Roter Krake', 'Red octopus', ['animal', 'enemy', 'underwater'])]),
    'big': (STYLE + 'A sprite sheet of 4 big sea animals seen from the side, all facing to the right (head on the right side), in a grid of 2 columns and 2 rows, '
            'reading order left to right, top to bottom: '
            '1 a big friendly blue whale with a light belly and a small water spout; 2 a friendly cartoon grey shark with a light belly and a smile without teeth showing; '
            '3 a happy grey-blue dolphin; 4 an orange seahorse standing upright with a curled tail. ' + BG,
            [('sea_whale', 96, 'Blauwal, nach rechts', 'Blue whale, facing right', ['animal', 'underwater']),
             ('sea_shark', 96, 'Freundlicher Hai, nach rechts', 'Friendly shark, facing right', ['animal', 'enemy', 'underwater']),
             ('sea_dolphin', 88, 'Delfin, nach rechts', 'Dolphin, facing right', ['animal', 'underwater']),
             ('sea_seahorse', 64, 'Seepferdchen, nach rechts', 'Seahorse, facing right', ['animal', 'underwater'])]),
    'items': (STYLE + 'A sprite sheet of 8 small objects in a grid of 4 columns and 2 rows, reading order left to right, top to bottom: '
              '1 a red crab seen from the front with two claws up; 2 an orange starfish with five arms; 3 a wooden treasure chest with gold bands, '
              'closed, with a few gold coins on top; 4 a dark blue-grey ship anchor; 5 a red and white striped round buoy floating upright with a small light on top; '
              '6 a green glass bottle lying on its side with a cork and a rolled paper message inside; 7 a light blue round air bubble with a white shine spot; '
              '8 a coral branch in coral orange. ' + BG,
              [('sea_crab', 56, 'Rote Krabbe', 'Red crab', ['animal', 'enemy', 'underwater']),
               ('sea_starfish', 48, 'Seestern', 'Starfish', ['animal', 'item', 'underwater']),
               ('sea_chest', 48, 'Schatztruhe mit Goldmünzen', 'Treasure chest with gold coins', ['item', 'treasure']),
               ('sea_anchor', 48, 'Anker', 'Anchor', ['item', 'object']),
               ('sea_buoy', 56, 'Rot-weiße Boje', 'Red and white buoy', ['object']),
               ('sea_message_bottle', 48, 'Flaschenpost', 'Message in a bottle', ['item']),
               ('sea_bubble', 24, 'Luftblase', 'Air bubble', ['item', 'underwater', 'effect']),
               ('sea_coral_1', 64, 'Orange Koralle', 'Orange coral', ['plant', 'underwater', 'decoration'])]),
    'scene': (STYLE + 'A sprite sheet of 5 objects in a grid of 3 columns and 2 rows (the last cell stays empty), reading order left to right, top to bottom: '
              '1 a small round sandy island seen from the side with one green palm tree with a curved trunk; '
              '2 a tall lighthouse with red and white stripes, a dark red roof and a yellow light, standing on a small grey rock; '
              '3 a light blue and white iceberg with pointy peaks; 4 a fluffy white cloud; 5 a purple-blue sea plant coral with round branch tips. '
              'No water under the island, lighthouse or iceberg. ' + BG,
              [('sea_island', 160, 'Kleine Insel mit Palme', 'Small island with a palm tree', ['object', 'decoration']),
               ('sea_lighthouse', 160, 'Leuchtturm auf einem Felsen', 'Lighthouse on a rock', ['object', 'building']),
               ('sea_iceberg', 128, 'Eisberg', 'Iceberg', ['object', 'obstacle']),
               ('sea_cloud', 112, 'Weiße Wolke', 'White cloud', ['decoration', 'sky']),
               ('sea_coral_2', 64, 'Blau-lila Koralle', 'Blue-purple coral', ['plant', 'underwater', 'decoration'])]),
}

ANIMS = {
    'gull': (STYLE + 'A side-view FLYING animation sprite sheet of one white seagull with grey wings, a yellow beak and a friendly dot eye, '
             'flying to the right. 3 frames in ONE horizontal row, evenly spaced, same size, same body height: '
             'frame 1 wings fully up, frame 2 wings straight out to the sides, frame 3 wings fully down. The body is the same in every frame. ' + BG,
             'sea_seagull', 56, ['animal', 'bird', 'animation'],
             ('Möwe fliegt, Bild {n} von 3 (nach rechts)', 'Seagull flying, frame {n} of 3 (facing right)')),
}

WAVE = ('Draw in exactly the same flat emoji style as the reference image (flat shapes, no outlines, no gradients). Do NOT draw any of the objects from the reference image. '
        'Draw 3 separate wide horizontal strips of stylized cartoon sea water, stacked vertically with lots of empty space between them; each strip is 4 times wider than tall. '
        'Each strip: a flat mid-blue water band whose top edge is a row of 4 identical round wave crests with small white foam tips, the bottom edge straight. '
        'The 3 strips are animation frames: the crests move a bit to the right from strip 1 to strip 2 to strip 3. ' + BG)

SKY = ('Draw in a flat emoji illustration style like the reference image (flat shapes, no outlines, soft simple colours). Do NOT draw any of the objects from the reference image. '
       'A wide game background, landscape 5:3: the upper half is a light blue sky with two or three simple white clouds and a small yellow sun, '
       'the lower half is calm blue sea with a few lighter blue wave lines, the horizon a straight line across the middle. '
       'No boats, no animals, no land, no islands, no text. Fill the whole image.')

# the sheets in use have extra objects: reading order with 'skip_n' for objects that are not used
SKIP = {'boats': ['sea_sailboat', 'sea_motorboat', 'sea_pirate_ship', 'skip_1', 'sea_submarine', 'sea_raft', 'sea_canoe', 'skip_2']}

def key_color(img, col):
    """keyslice.key for a sheet whose background is not exactly #FF00FF (the wave sheet came back in (209, 50, 160))."""
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    d = np.sqrt(((a - np.array(col, np.float32)) ** 2).sum(-1))
    alpha = np.clip((d - 40) / 60, 0, 1)
    rgb = a.copy()
    edge = (alpha > 0.05) & (alpha < 1)
    rgb[edge] = np.clip((a[edge] - (1 - alpha[edge, None]) * np.array(col, np.float32)) / alpha[edge, None], 0, 255)
    return np.dstack([rgb, alpha * 255]).astype(np.uint8)

def W(*p): return os.path.join(WORK, *p)

def do_gen(key):
    os.makedirs(WORK, exist_ok=True)
    prompt = SHEETS[key][0] if key in SHEETS else ANIMS[key][0] if key in ANIMS else WAVE if key == 'wave' else SKY
    for attempt in range(3):
        r = gen(W('sheet-' + key), prompt, REF)
        if r == 'ok': return key + ' ok'
    return key + ' ' + r

def fit(im, long_side, pad=2):
    a = np.asarray(im)[..., 3]
    ys, xs = np.nonzero(a > 8)
    im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    s = long_side / max(im.size)
    im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    c = Image.new('RGBA', (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
    c.paste(im, (pad, pad))
    return c

def clean_alpha(im):
    """Drop faint alpha and take leftover magenta out of the edge ring (pixels within 2 px of transparency)."""
    from scipy import ndimage
    a = np.asarray(im).copy()
    a[..., 3] = np.where(a[..., 3] < 10, 0, a[..., 3])
    ring = ndimage.binary_dilation(a[..., 3] < 250, iterations=2)
    rgb = a[..., :3].astype(np.int32)
    m = np.minimum(rgb[..., 0], rgb[..., 2])
    spill = np.clip(m - rgb[..., 1], 0, None) * ring
    rgb[..., 0] -= spill; rgb[..., 2] -= spill
    a[..., :3] = np.clip(rgb, 0, 255)
    a[..., 3] = np.where(ring & (a[..., 3] < 255), (a[..., 3].astype(np.int32) * 0.85).astype(np.uint8), a[..., 3])
    a[a[..., 3] == 0, :3] = 0
    return Image.fromarray(a, 'RGBA')

def do_cut(key):
    if key in SHEETS:
        items = SHEETS[key][1]
        names = SKIP.get(key, [n for n, *_ in items])
        files = dict(zip(names, keyslice.cut_items(W('sheet-' + key + '.png'), names, 600, W('raw'))))
        for name, size, *_ in items:
            clean_alpha(fit(Image.open(files[name]), size)).save(os.path.join(HERE, name + '.png'), optimize=True)
    elif key in ANIMS:
        _, prefix, h, *_ = ANIMS[key]
        fr = keyslice.align(keyslice.frames(keyslice.key(Image.open(W('sheet-' + key + '.png')))), h)
        assert len(fr) == 3, len(fr)
        for n, im in enumerate(fr, 1): clean_alpha(im).save(os.path.join(HERE, f'{prefix}_{n}.png'), optimize=True)
    elif key == 'wave':
        # the top strip of the sheet: a tile of two crest periods is cut from its crest part,
        # then shifted by a third of a period per frame, so that the three frames loop and tile seamlessly
        src = Image.open(W('sheet-wave.png')).convert('RGB')
        rgba = key_color(src, np.asarray(src)[4:20, 4:20].reshape(-1, 3).mean(0))
        al = rgba[..., 3] > 128
        rows = np.nonzero(al.any(1))[0]
        y0 = rows[0]; y1 = y0
        while y1 + 1 < len(al) and al[y1 + 1].any(): y1 += 1
        y1 += 1
        top = np.array([np.argmax(al[y0:y1, x]) if al[y0:y1, x].any() else y1 - y0 for x in range(al.shape[1])])
        crest = np.nonzero(top < (y1 - y0) * 0.25)[0]
        x0, x1 = crest.min(), crest.max()
        prof = top[x0:x1].astype(float) - top[x0:x1].mean()
        ac = [np.dot(prof[:-p], prof[p:]) / (len(prof) - p) for p in range(30, len(prof) // 2)]
        period = 30 + int(np.argmax(ac))
        start = x0 + period // 2 + int(np.argmax(top[x0 + period // 2:x0 + period // 2 + period]))  # start in a trough
        tile = Image.fromarray(rgba[y0:y1, start:start + 2 * period], 'RGBA').resize((128, 32), Image.LANCZOS)
        for n in range(3):
            t = np.roll(np.asarray(tile), round(n * 64 / 3), axis=1)
            clean_alpha(Image.fromarray(t, 'RGBA')).save(os.path.join(HERE, f'sea_wave_{n + 1}.png'), optimize=True)
        print('wave period', period, 'strip', y0, y1, 'start', start)
    elif key == 'sky':
        im = Image.open(W('sheet-sky.png')).convert('RGB')
        # the model drew a white beach band at the horizon: cut those rows out so that sky meets sea
        a = np.asarray(im)
        band = np.nonzero((a[:, :, 0] > 200).mean(1) > 0.9)[0]
        if len(band): a = np.concatenate([a[:band.min() - 2], a[band.max() + 3:]]); im = Image.fromarray(a)
        r = 800 / 480
        w, h = im.size
        if w / h > r: nw = round(h * r); im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
        else: nh = round(w / r); im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
        im.resize((800, 480), Image.LANCZOS).quantize(colors=128, method=Image.MEDIANCUT, dither=Image.NONE).save(os.path.join(HERE, 'sea_bg.png'), optimize=True)

ALL = list(SHEETS) + list(ANIMS) + ['wave', 'sky']

def write_pack():
    assets = []
    def add(name, tags, de, en): assets.append({'name': name, 'file': name + '.png', 'tags': tags, 'de': de, 'en': en})
    for key in SHEETS:
        for name, _, de, en, tags in SHEETS[key][1]: add(name, ['sea'] + tags, de, en)
    for key, (_, prefix, _, tags, (de, en)) in ANIMS.items():
        for n in (1, 2, 3): add(f'{prefix}_{n}', ['sea'] + tags, de.format(n=n), en.format(n=n))
    for n in (1, 2, 3): add(f'sea_wave_{n}', ['sea', 'water', 'animation', 'tile'], f'Wellenstreifen 128x32, Bild {n} von 3', f'Wave strip 128x32, frame {n} of 3')
    add('sea_bg', ['sea', 'background'], 'Hintergrund: Himmel oben, Meer unten (800x480)', 'Background: sky above, sea below (800x480)')
    json.dump({'pack': 'sea', 'title': {'de': 'Meer', 'en': 'Sea'}, 'format': 'png', 'assets': assets},
              open(os.path.join(HERE, 'pack.json'), 'w'), ensure_ascii=False, indent=2)

if __name__ == '__main__':
    cmd, keys = sys.argv[1], sys.argv[2:] or ALL
    if cmd == 'gen':
        with ThreadPoolExecutor(8) as ex:
            for r in ex.map(do_gen, keys): print(r)
    elif cmd == 'cut':
        for k in keys:
            try: do_cut(k); print(k, 'cut')
            except Exception as e: print(k, 'ERROR', e)
    elif cmd == 'pack':
        write_pack()
