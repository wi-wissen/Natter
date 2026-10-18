"""Pack `flyer`: flapping flyers, obstacles, pickups, ground strips, backgrounds and falling objects.
python3 make.py gen [sheet ...]   draw sheets into the work folder (all when none given)
python3 make.py cut               cut the sheets into the pack folder and write pack.json"""
import os, sys, json, threading
import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'asset-gen'))
from gen import gen
import keyslice

WORK = os.environ.get('FLYER_WORK', '/tmp/flyer-work')
STYLE = os.path.join(ROOT, 'scripts', 'asset-gen', 'style-emoji.png')

BASE = ('Use the exact same flat emoji style as the reference image: clear flat shapes without outlines, very few colours per object, '
        'rounded friendly forms, no gradients, no hard shading. ')
MAGENTA = (' Background: one flat solid pure magenta colour #FF00FF everywhere, no shadows, no ground, no text, no labels, no grid lines, no frames. '
           'Every object stands alone with wide magenta space around it; no object touches or overlaps another.')
BIRD = ('an original small ROUND TEAL bird (body almost a ball, teal/turquoise colour, lighter mint belly, ONE big friendly white eye with a dark pupil, '
        'a small orange beak, a small teal wing, a tiny tuft of two feathers on top of the head, no legs visible), seen from the side, facing RIGHT')

ANIM = {
    # sheet: (prompt, names, height, ref)
    'bird': (BASE + 'Draw a FLAP ANIMATION sprite sheet of ' + BIRD + ': exactly 4 frames in ONE horizontal row, evenly spaced, same size, '
             'body at the same height in every frame; frame 1 wing fully up, frame 2 wing level, frame 3 wing fully down, frame 4 wing level again.' + MAGENTA,
             ['fl_bird_1', 'fl_bird_2', 'fl_bird_3', 'fl_bird_4'], 56, STYLE),
    'bee': (BASE + 'Draw a FLYING ANIMATION sprite sheet of a cute round bumble bee (yellow and dark brown stripes, big friendly eye, small light blue wings, '
            'tiny stinger) seen from the side, facing RIGHT: exactly 3 frames in ONE horizontal row, evenly spaced, same size, body at the same height; '
            'frame 1 wings up, frame 2 wings level, frame 3 wings down.' + MAGENTA,
            ['fl_bee_1', 'fl_bee_2', 'fl_bee_3'], 48, STYLE),
    'dragon': (BASE + 'Draw a FLAP ANIMATION sprite sheet of a small friendly round baby dragon (soft orange body, cream belly, small rounded horns, '
               'big friendly eye, short tail, ONE visible purple bat wing on its back) flying, seen from the side, facing RIGHT. '
               'Exactly 4 frames, all in ONE single horizontal row (no second row, nothing else on the sheet), evenly spaced with wide gaps, identical body and pose, '
               'body at the same height; only the wing changes: frame 1 wing pointing straight up, frame 2 wing spread out level backwards, '
               'frame 3 wing pointing down below the belly, frame 4 wing spread out level backwards again.' + MAGENTA,
               ['fl_dragon_1', 'fl_dragon_2', 'fl_dragon_3', 'fl_dragon_4'], 80, STYLE),
    'coin': (BASE + 'Draw a SPINNING COIN animation sprite sheet: a round golden coin with a simple embossed star in the middle, exactly 4 frames in ONE '
             'horizontal row, evenly spaced, same height: frame 1 seen fully from the front (round), frame 2 turned (narrow oval), frame 3 seen edge-on '
             '(thin vertical bar), frame 4 turned the other way (narrow oval).' + MAGENTA,
             ['fl_coin_1', 'fl_coin_2', 'fl_coin_3', 'fl_coin_4'], 40, STYLE),
}

# item sheets: (prompt, [(name, (max_w, max_h)), ...], ref)
ITEMS = {
    'flyers': (BASE + 'Draw exactly 5 separate objects in ONE horizontal row, left to right, evenly spaced: '
               '1) the round teal bird from the second reference picture, knocked out: lying on its back, belly up, eye shown as a small X, wing limp; '
               '2) a hot air balloon with red and white vertical stripes and a small brown basket hanging below; '
               '3) a little red propeller plane seen from the side, facing right, with a light blue window and a grey propeller; '
               '4) a shiny golden five-pointed star; '
               '5) a single light blue feather lying diagonally.' + MAGENTA,
               [('fl_bird_dead', (56, 56)), ('fl_balloon', (64, 64)), ('fl_plane', (80, 80)), ('fl_star', (40, 40)), ('fl_feather', (40, 40))], 'bird'),
    'pillars': (BASE + 'Draw exactly 4 tall narrow obstacles for a flying game in ONE horizontal row, left to right, evenly spaced, each about three times '
                'as tall as wide, all the same height: '
                '1) a carved wooden totem pillar HANGING DOWN from the top (flat cut end at the top, a rounded carved cap with a simple friendly face pattern at the bottom), warm brown wood with a few stone grey bands; '
                '2) the same kind of totem pillar STANDING (rounded carved cap with face pattern at the top, flat cut end at the bottom); '
                '3) a long icy light blue stalactite icicle hanging down (wide flat top, pointed tip at the bottom); '
                '4) a long icy light blue stalagmite standing (wide flat bottom, pointed tip at the top). '
                'Not pipes, not green.' + MAGENTA,
                [('fl_pillar_top', (80, 240)), ('fl_pillar_bottom', (80, 240)), ('fl_icicle_top', (80, 240)), ('fl_icicle_bottom', (80, 240))], STYLE),
    'obstacles': (BASE + 'Draw exactly 2 separate objects in ONE horizontal row, left to right, with wide space between them: '
                  '1) a dark grey storm cloud with an angry frown and a small yellow lightning bolt below it (the bolt touches the cloud); '
                  '2) a VERY TALL, SLENDER upright tree trunk reaching from the top to the bottom of the picture (a vertical log about five times as tall as wide, cut flat at the top showing light tree rings, brown bark with a few vertical lines, one small side branch stump, no leaves, no roots).' + MAGENTA,
                  [('fl_cloud_obstacle', (128, 96)), ('fl_tree_trunk', (64, 224))], STYLE),
    'falling': (BASE + 'Draw exactly 7 separate objects in a grid of TWO rows: top row 4 objects, bottom row 3 objects, evenly spaced, reading order left to right: '
                '1) a shiny red apple with a green leaf; 2) a round black cartoon bomb with a short fuse and a little spark (cartoon, not realistic); '
                '3) a golden five-pointed star with a soft rounded shape; 4) a red gift box with a yellow ribbon and bow; '
                '5) a single blue raindrop; 6) a small round brown-orange meteor rock with a short orange flame tail pointing up; '
                '7) a wide woven brown basket, empty, seen from the front.' + MAGENTA,
                [('fall_apple', (40, 40)), ('fall_bomb', (40, 40)), ('fall_star', (40, 40)), ('fall_gift', (40, 40)),
                 ('fall_raindrop', (40, 40)), ('fall_meteor', (40, 40)), ('fall_basket', (96, 64))], STYLE),
    'ground': (BASE + 'Draw exactly 2 separate wide flat rectangular ground strips, one ABOVE the other, with wide space between them, each about twice as wide as tall, '
               'with STRAIGHT vertical left and right edges and square corners (so it can be repeated side by side seamlessly): '
               '1) top: a strip with a band of green grass on top (small grass tufts along the top edge) and brown soil with a few small pebbles below; '
               '2) bottom: the same kind of strip in winter: a soft white snow layer on top with a gently rounded, slightly bumpy top edge and a few rounded snow drips hanging over the soil, light blue-grey snow shading, dark brown frozen soil with a few small stones below.' + MAGENTA,
               [('fl_ground', (128, 64)), ('fl_ground_snow', (128, 64))], STYLE),
}

BG = ('A wide landscape game background in the same flat emoji style as the reference image (clear flat shapes, no outlines, few colours, no gradients beyond a hint), '
      'side view for a game where a small creature flies from left to right; the lower part is low and simple, the middle is open sky; no characters, no animals, '
      'no text, no frame, no border, wide 5:3 picture. ')
BACKS = {
    'fl_bg_day': BG + 'Bright day: light blue sky, a few soft white clouds, distant rounded green hills and a few round trees at the bottom.',
    'fl_bg_sunset': BG + 'Sunset: sky in flat bands of orange, pink and purple, a big half sun at the horizon, dark purple silhouettes of rounded hills at the bottom.',
    'fl_bg_night': BG + 'Night: dark navy blue sky with small yellow stars and a crescent moon, dark blue rounded hills and a few dark trees at the bottom.',
    'fl_bg_snow': BG + 'Winter: pale blue sky with soft clouds, a few falling snowflakes, white snowy rounded hills and snow-covered fir trees at the bottom.',
}

ASSETS = [  # name, tags, de, en
    *[(f'fl_bird_{i}', ['flyer', 'player', 'animation'], f'Runder türkiser Vogel flattert, Bild {i} von 4 (nach rechts)', f'Round teal bird flapping, frame {i} of 4 (facing right)') for i in range(1, 5)],
    ('fl_bird_dead', ['flyer', 'player'], 'Türkiser Vogel liegt k.o. auf dem Rücken', 'Teal bird knocked out, lying on its back'),
    *[(f'fl_bee_{i}', ['flyer', 'animal', 'animation'], f'Biene fliegt, Bild {i} von 3 (nach rechts)', f'Bee flying, frame {i} of 3 (facing right)') for i in range(1, 4)],
    *[(f'fl_dragon_{i}', ['flyer', 'animal', 'animation'], f'Kleiner Drache flattert, Bild {i} von 4 (nach rechts)', f'Little dragon flapping, frame {i} of 4 (facing right)') for i in range(1, 5)],
    ('fl_balloon', ['flyer', 'vehicle'], 'Heißluftballon, rot-weiß gestreift', 'Hot air balloon, red and white stripes'),
    ('fl_plane', ['flyer', 'vehicle'], 'Kleines rotes Propellerflugzeug (nach rechts)', 'Little red propeller plane (facing right)'),
    ('fl_pillar_top', ['obstacle'], 'Holzsäule, hängt von oben herab (80x240)', 'Wooden pillar hanging from the top (80x240)'),
    ('fl_pillar_bottom', ['obstacle'], 'Holzsäule, steht unten (80x240)', 'Wooden pillar standing at the bottom (80x240)'),
    ('fl_icicle_top', ['obstacle', 'winter'], 'Eiszapfen, hängt von oben herab', 'Icicle hanging from the top'),
    ('fl_icicle_bottom', ['obstacle', 'winter'], 'Eissäule, steht unten mit Spitze nach oben', 'Ice spike standing at the bottom'),
    ('fl_cloud_obstacle', ['obstacle'], 'Dunkle Gewitterwolke mit Blitz', 'Dark storm cloud with lightning'),
    ('fl_tree_trunk', ['obstacle'], 'Hoher Baumstamm, aufrecht', 'Tall upright tree trunk'),
    *[(f'fl_coin_{i}', ['pickup', 'item', 'animation'], f'Goldmünze dreht sich, Bild {i} von 4', f'Gold coin spinning, frame {i} of 4') for i in range(1, 5)],
    ('fl_star', ['pickup', 'item'], 'Goldener Stern', 'Golden star'),
    ('fl_feather', ['pickup', 'item'], 'Hellblaue Feder', 'Light blue feather'),
    ('fl_ground', ['ground', 'tile'], 'Bodenstreifen aus Gras und Erde, nebeneinander kachelbar (128x64)', 'Ground strip of grass and soil, tiles side by side (128x64)'),
    ('fl_ground_snow', ['ground', 'tile', 'winter'], 'Bodenstreifen mit Schnee, nebeneinander kachelbar (128x64)', 'Snowy ground strip, tiles side by side (128x64)'),
    ('fl_bg_day', ['background'], 'Hintergrund: Himmel am Tag mit Hügeln (800x480)', 'Background: daytime sky with hills (800x480)'),
    ('fl_bg_sunset', ['background'], 'Hintergrund: Sonnenuntergang (800x480)', 'Background: sunset (800x480)'),
    ('fl_bg_night', ['background'], 'Hintergrund: Nacht mit Mond und Sternen (800x480)', 'Background: night with moon and stars (800x480)'),
    ('fl_bg_snow', ['background', 'winter'], 'Hintergrund: Winterlandschaft mit Schnee (800x480)', 'Background: snowy winter landscape (800x480)'),
    ('fall_apple', ['falling', 'item'], 'Fallender roter Apfel', 'Falling red apple'),
    ('fall_bomb', ['falling', 'item'], 'Runde Comic-Bombe mit Zündschnur', 'Round cartoon bomb with fuse'),
    ('fall_star', ['falling', 'item'], 'Fallender goldener Stern', 'Falling golden star'),
    ('fall_gift', ['falling', 'item'], 'Geschenk mit Schleife', 'Gift box with bow'),
    ('fall_raindrop', ['falling', 'item'], 'Blauer Regentropfen', 'Blue raindrop'),
    ('fall_meteor', ['falling', 'item'], 'Meteor mit Flammenschweif (fällt nach unten)', 'Meteor with flame tail (falling down)'),
    ('fall_basket', ['falling', 'player'], 'Korb zum Auffangen', 'Basket for catching'),
]


def two_refs(a, b, out):
    """Put two reference pictures side by side (gen takes one)."""
    ia, ib = Image.open(a).convert('RGB'), Image.open(b).convert('RGBA')
    bg = Image.new('RGB', ib.size, (245, 245, 240)); bg.paste(ib, (0, 0), ib)
    ib = bg.resize((ia.height * ib.width // ib.height, ia.height))
    c = Image.new('RGB', (ia.width + ib.width + 40, ia.height), (245, 245, 240))
    c.paste(ia, (0, 0)); c.paste(ib, (ia.width + 40, 0)); c.save(out)
    return out


def ref_for(r):
    if r == 'bird':
        return two_refs(STYLE, os.path.join(HERE, 'fl_bird_1.png'), os.path.join(WORK, 'ref-bird.png'))
    return r


def do_gen(sheet):
    if sheet in ANIM:
        p, _, _, r = ANIM[sheet]
    elif sheet in ITEMS:
        p, _, r = ITEMS[sheet]
        if r == 'bird':
            p = p.replace('second reference picture', 'reference picture on the right')
    else:
        p, r = BACKS[sheet], STYLE
    res = gen(os.path.join(WORK, sheet), p, ref_for(r))
    print(sheet, res, flush=True)


def fit(im, box):
    s = min(box[0] / im.width, box[1] / im.height)
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)


def save(im, name):
    path = os.path.join(HERE, name + '.png')
    im.save(path, optimize=True)
    if os.path.getsize(path) > 78 * 1024:
        im.quantize(colors=128, method=Image.Quantize.FASTOCTREE if im.mode == 'RGBA' else Image.Quantize.MEDIANCUT).save(path, optimize=True)


def plain_ends(im):
    """Crop a strip between two columns near its ends where only the plain band is (no grass tuft, snow lump),
    so that the ends meet on plain ground and the crossfade does not ghost a feature."""
    a = np.asarray(im)[..., 3] > 128
    top = np.argmax(a, 0)
    base = np.median(top)
    ok = np.abs(top - base) <= 1
    ok = np.array([ok[max(0, x - 6):x + 7].all() for x in range(len(ok))])
    W = len(ok); xs = np.where(ok)[0]
    l = [x for x in xs if x < W * 0.25]; r = [x for x in xs if x > W * 0.75]
    return im.crop((l[0] if l else 0, 0, (r[-1] + 1) if r else W, im.height))


def seamless(im, size, overlap=0.05):
    """Make a strip repeat side by side without a seam: crossfade its left end with the part right after its right end
    (result[x] = mix(src[W-o+x], src[x])), so that the last column runs straight on into the first."""
    a = np.asarray(im.convert('RGBA')).astype(np.float32)
    W = a.shape[1]; o = int(W * overlap)
    t = (np.arange(o, dtype=np.float32) / o)[None, :, None]
    out = a[:, :W - o].copy()
    out[:, :o] = a[:, W - o:] * (1 - t) + a[:, :o] * t
    return Image.fromarray(out.round().astype(np.uint8), 'RGBA').resize(size, Image.LANCZOS)


def have(sheet):
    ok = os.path.exists(os.path.join(WORK, sheet + '.png'))
    if not ok: print('missing sheet', sheet)
    return ok


def align_flying(imgs, height):
    """Like keyslice.align, but flyers have no feet: the body (alpha centroid) stays at the same spot in every frame."""
    scale = height / max(i.height for i in imgs)
    ims = [i.resize((max(1, round(i.width * scale)), max(1, round(i.height * scale))), Image.LANCZOS) for i in imgs]
    cents = []
    for im in ims:
        a = np.asarray(im)[..., 3].astype(np.float32)
        cents.append(((a.sum(0) * np.arange(a.shape[1])).sum() / a.sum(), (a.sum(1) * np.arange(a.shape[0])).sum() / a.sum()))
    up = max(cy for _, cy in cents); down = max(im.height - cy for im, (_, cy) in zip(ims, cents))
    left = max(cx for cx, _ in cents); right = max(im.width - cx for im, (cx, _) in zip(ims, cents))
    W, H = int(left + right) + 6, int(up + down) + 6
    res = []
    for im, (cx, cy) in zip(ims, cents):
        c = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        c.paste(im, (int(round(left + 3 - cx)), int(round(up + 3 - cy))), im)
        res.append(c)
    return res


def cut():
    for sheet, (_, names, h, _) in ANIM.items():
        if not have(sheet): continue
        rgba = keyslice.key(Image.open(os.path.join(WORK, sheet + '.png')))
        fr = keyslice.frames(rgba)
        if len(fr) > len(names) and len(fr) % len(names) == 0:
            fr = fr[:len(names)]  # the model sometimes repeats the cycle in a second row: take the first
        if len(fr) != len(names):
            raise ValueError(f'{sheet}: {len(fr)} frames, expected {len(names)}')
        for name, im in zip(names, align_flying(fr, h)):
            save(im, name)
    big = os.path.join(WORK, 'big')
    for sheet, (_, items, _) in ITEMS.items():
        if not have(sheet): continue
        files = keyslice.cut_items(os.path.join(WORK, sheet + '.png'), [n for n, _ in items], 600, big, pad=0)
        for (name, box), f in zip(items, files):
            im = Image.open(f)
            if name.startswith('fl_ground'):
                # straight edges for seamless tiling: cut off rounded corners and stretch to the exact size
                a = np.asarray(im)[..., 3]
                rows = np.where((a > 200).mean(1) > 0.97)[0]
                cols = np.where((a > 200).mean(0) > 0.5)[0]
                im = seamless(plain_ends(im.crop((cols[0] + 6, 0, cols[-1] - 6, rows[-1] - 2))), box)
                save(im, name)
                continue
            im = fit(im, box)
            c = Image.new('RGBA', (im.width + 4, im.height + 4), (0, 0, 0, 0)); c.paste(im, (2, 2), im)
            save(c, name)
    for name in BACKS:
        if not have(name): continue
        im = Image.open(os.path.join(WORK, name + '.png')).convert('RGB')
        w, h = im.size
        if w * 3 > h * 5:
            nw = h * 5 // 3; im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
        else:
            nh = w * 3 // 5; im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
        # median filter takes out the model's pixel noise, a dithered palette keeps the file small
        im = im.filter(ImageFilter.MedianFilter(3)).resize((800, 480), Image.LANCZOS)
        for colors in (256, 128, 64, 32):  # as many flat colours as fit under the size limit
            pal = im.quantize(colors=colors, method=Image.Quantize.FASTOCTREE, kmeans=2)  # palette, then dither onto it (no sky bands)
            im.quantize(palette=pal, dither=Image.Dither.FLOYDSTEINBERG).save(os.path.join(HERE, name + '.png'), optimize=True)
            if os.path.getsize(os.path.join(HERE, name + '.png')) <= 76 * 1024: break
    pack = {'pack': 'flyer', 'title': {'de': 'Flieger und Fallendes', 'en': 'Flyers and falling things'}, 'format': 'png',
            'assets': [{'name': n, 'file': n + '.png', 'tags': t, 'de': de, 'en': en} for n, t, de, en in ASSETS
                       if os.path.exists(os.path.join(HERE, n + '.png'))]}
    json.dump(pack, open(os.path.join(HERE, 'pack.json'), 'w'), ensure_ascii=False, indent=2)
    print('cut', len(pack['assets']), 'of', len(ASSETS))


if __name__ == '__main__':
    os.makedirs(WORK, exist_ok=True)
    if sys.argv[1] == 'gen':
        sheets = sys.argv[2:] or [*ANIM, *ITEMS, *BACKS]
        ts = [threading.Thread(target=do_gen, args=(s,)) for s in sheets]
        [t.start() for t in ts]; [t.join() for t in ts]
    else:
        cut()
