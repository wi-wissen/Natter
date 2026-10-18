"""Redraw the `animals` pack.
python3 make.py gen [sheet ...]   ask the image model for the sheets (raw sheets go to WORK)
python3 make.py cut [sheet ...]   key and cut the sheets into the pack folder
python3 make.py json              write pack.json
Sheets are drawn in flat emoji style with scripts/asset-gen/style-emoji.png as reference."""
import sys, os, json, base64, subprocess, shutil, tempfile
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'asset-gen'))
import keyslice  # noqa: E402

STYLE = os.path.join(ROOT, 'scripts', 'asset-gen', 'style-emoji.png')
WORK = os.environ.get('ANIMALS_WORK', os.path.join(tempfile.gettempdir(), 'assets-work', 'animals'))

BG = ('Background: one flat solid pure magenta colour #FF00FF everywhere, no shadows, no ground, no text, no labels, '
      'no grid lines, no frames. Every object is clearly separated from the others by wide magenta space, nothing touches '
      'or overlaps. Do not use magenta or pink-purple inside the objects.')
STYLE_TXT = ('in exactly the same flat emoji style as the reference image (clear flat shapes, no outlines, few colours, '
             'rounded friendly cute forms, soft hint of shading only). All animals are original, friendly and cute, not '
             'any known cartoon character. ')


def grid(items, cols, rows, view='Every animal is seen fully from the side, facing RIGHT, whole body visible, standing.'):
    lst = ' '.join(f'{i + 1}. {d}.' for i, d in enumerate(items))
    return (f'Draw a sprite sheet of exactly {len(items)} separate animals {STYLE_TXT}'
            f'Exactly {len(items)} animals in total, each animal appears only once, no extra or repeated animals. '
            f'Arrange them in a grid of {cols} columns and {rows} rows, reading order left to right, top to bottom: {lst} '
            f'{view} Each animal alone in its own cell, roughly the same drawn size. ' + BG)


# name -> long side in pixels (natural game size)
SIZE = {
    'an_cat': 72, 'an_dog': 80, 'an_rabbit': 64, 'an_horse': 96, 'an_unicorn': 96, 'an_frog': 56,
    'an_mouse': 52, 'an_penguin': 72, 'an_fox': 80, 'an_owl': 64, 'an_hedgehog': 60, 'an_pig': 76,
    'an_cow': 96, 'an_chicken': 64, 'an_sheep': 76, 'an_bear': 88, 'an_elephant': 96, 'an_giraffe': 96,
    'an_monkey': 76, 'an_panda': 80, 'an_turtle': 72, 'an_snail': 56, 'an_ladybug': 48, 'an_squirrel': 64,
    'an_duck': 64,
    'pet_food_bowl': 48, 'pet_fish_treat': 40, 'pet_ball': 36, 'pet_bed': 80,
}

SHEETS = {
    # the kept farm1 sheet came back with 8 animals (a second rabbit and a second horse); `cut` lists what to keep,
    # names starting with '_' are dropped. Remove `cut` after a redraw that has exactly 6.
    'farm1': dict(kind='items', names=['an_cat', 'an_dog', 'an_rabbit', 'an_horse', 'an_unicorn', 'an_frog'],
                  cut=['an_cat', 'an_dog', 'an_rabbit', '_rabbit2', 'an_horse', 'an_unicorn', '_horse2', 'an_frog'], prompt=grid([
        'an orange tabby cat with a raised tail', 'a light brown dog with floppy ears and a short tail',
        'a white-grey rabbit with long ears, sitting', 'a chestnut brown horse with dark mane and tail',
        'a white unicorn with a golden horn and a pastel rainbow mane', 'a green frog sitting'], 3, 2)),
    'farm2': dict(kind='items', names=['an_mouse', 'an_penguin', 'an_fox', 'an_owl', 'an_hedgehog', 'an_pig'], prompt=grid([
        'a small grey mouse with round pink ears and a long thin tail',
        'a black and white penguin with orange feet and beak, standing upright',
        'an orange fox with white chest and a bushy white-tipped tail', 'a brown owl perched upright (no branch)',
        'a brown garden hedgehog with short brown spines and a light brown face, calm and round',
        'a pink pig with a curly tail'], 3, 2)),
    'farm3': dict(kind='items', names=['an_cow', 'an_chicken', 'an_sheep', 'an_bear', 'an_elephant', 'an_giraffe'], prompt=grid([
        'a black and white spotted cow with small horns', 'a white hen with a red comb',
        'a fluffy white sheep with a dark grey face and legs', 'a brown bear on four legs',
        'a grey elephant with big ears and a raised trunk', 'a giraffe with brown patches and a long neck'], 3, 2)),
    'farm4': dict(kind='items', names=['an_monkey', 'an_panda', 'an_turtle', 'an_snail', 'an_ladybug', 'an_squirrel'], prompt=grid([
        'a brown monkey with a light face and a curled tail, on all fours', 'a black and white giant panda on four legs',
        'a green turtle with a brown shell, walking', 'a snail with a spiral orange-brown shell',
        'a red ladybug with black spots seen from the side, walking on its legs',
        'a red-brown squirrel with a big bushy tail, sitting upright'], 3, 2)),
    'farm5': dict(kind='items', names=['an_duck', 'pet_food_bowl', 'pet_fish_treat', 'pet_ball', 'pet_bed'], prompt=(
        f'Draw a sprite sheet of exactly 5 separate objects {STYLE_TXT}'
        'Arrange them in one row from left to right: 1. a yellow duck seen from the side facing right, standing. '
        '2. a blue pet food bowl filled with brown kibble, seen slightly from the front. '
        '3. a small silver-blue fish-shaped cat treat, facing right. 4. a red and yellow toy ball. '
        '5. a round cozy pet bed (basket cushion) in teal with a cream cushion, empty, seen slightly from the front. ' + BG)),
    'bee': dict(kind='frames', height=48, names=['an_bee_1', 'an_bee_2'], prompt=(
        f'Draw a 2-frame flying animation of the same cute round bee {STYLE_TXT}'
        'The bee is seen from the side, facing RIGHT, yellow body with black stripes and small stinger, OPAQUE solid pale blue wings (not transparent, no see-through). '
        'Two frames in ONE horizontal row, widely spaced, same size, same body position: frame 1 wings raised UP, '
        'frame 2 wings pushed DOWN. ' + BG)),
    'butterfly': dict(kind='frames', height=56, names=['an_butterfly_1', 'an_butterfly_2'], prompt=(
        f'Draw a 2-frame flying animation of the same butterfly {STYLE_TXT}'
        'Orange and yellow wings with a few round dark dots, small dark body with two antennae, seen exactly from the SIDE, '
        'body horizontal, head on the RIGHT. Two frames in ONE horizontal row, widely spaced, the body identical in size, '
        'angle and position in both frames, only the wings change: frame 1 wings raised high up above the body, '
        'frame 2 wings swung down below the body. ' + BG)),
    'cat_walk': dict(kind='frames', height=72, ref2='an_cat', names=[f'an_cat_walk_{i}' for i in range(1, 5)], prompt=(
        'The second reference image shows a cat. Draw exactly this cat (same colours, same proportions) '
        f'{STYLE_TXT}as a 4-frame WALK CYCLE sprite sheet seen from the side, facing RIGHT: 4 frames in ONE horizontal '
        'row, evenly and widely spaced, same size, paws at the same height, each frame a different phase of a calm '
        'walk (legs alternating). ' + BG)),
    'dog_walk': dict(kind='frames', height=80, ref2='an_dog', names=[f'an_dog_walk_{i}' for i in range(1, 5)], prompt=(
        'The second reference image shows a dog. Draw exactly this dog (same colours, same proportions) '
        f'{STYLE_TXT}as a 4-frame WALK CYCLE sprite sheet seen from the side, facing RIGHT: 4 frames in ONE horizontal '
        'row, evenly and widely spaced, same size, paws at the same height, each frame a different phase of a calm '
        'walk (legs alternating). ' + BG)),
    'pet_cat': dict(kind='frames', height=96, ref2='an_cat', names=['pet_cat_happy', 'pet_cat_sleep', 'pet_cat_hungry',
                                                                    'pet_cat_eating', 'pet_cat_sad'], prompt=(
        'The second reference image shows a cat. Draw this same orange tabby cat '
        f'{STYLE_TXT}as a virtual pet, seen from the FRONT, sitting, in 5 moods, all the same size, in ONE horizontal row, '
        'widely spaced, left to right: 1. happy, big smile, eyes bright. 2. sleeping curled up, eyes closed, peaceful (no letters, no symbols). 3. hungry, mouth open, tongue licking lips, looking up. '
        '4. eating from a small blue bowl placed in front of it, head down. 5. sad, ears down, a small tear. ' + BG)),
}

DESC = {
    'an_cat': ('Katze', 'Cat'), 'an_dog': ('Hund', 'Dog'), 'an_rabbit': ('Hase', 'Rabbit'), 'an_horse': ('Pferd', 'Horse'),
    'an_unicorn': ('Einhorn', 'Unicorn'), 'an_frog': ('Frosch', 'Frog'), 'an_mouse': ('Maus', 'Mouse'),
    'an_penguin': ('Pinguin', 'Penguin'), 'an_fox': ('Fuchs', 'Fox'), 'an_owl': ('Eule', 'Owl'),
    'an_hedgehog': ('Igel', 'Hedgehog'), 'an_pig': ('Schwein', 'Pig'), 'an_cow': ('Kuh', 'Cow'),
    'an_chicken': ('Huhn', 'Chicken'), 'an_sheep': ('Schaf', 'Sheep'), 'an_bear': ('Bär', 'Bear'),
    'an_elephant': ('Elefant', 'Elephant'), 'an_giraffe': ('Giraffe', 'Giraffe'), 'an_monkey': ('Affe', 'Monkey'),
    'an_panda': ('Panda', 'Panda'), 'an_turtle': ('Schildkröte', 'Turtle'), 'an_snail': ('Schnecke', 'Snail'),
    'an_ladybug': ('Marienkäfer', 'Ladybug'), 'an_squirrel': ('Eichhörnchen', 'Squirrel'), 'an_duck': ('Ente', 'Duck'),
}


def gen(path, prompt, refs, model='google/gemini-3.1-flash-image'):
    """Like scripts/asset-gen/gen.py, but with several reference images."""
    content = [{'type': 'text', 'text': prompt}]
    for ref in refs:
        b = base64.b64encode(open(ref, 'rb').read()).decode()
        content.append({'type': 'image_url', 'image_url': {'url': 'data:image/png;base64,' + b}})
    body = {'model': model, 'modalities': ['image', 'text'], 'messages': [{'role': 'user', 'content': content}]}
    r = subprocess.run(['curl', '-s', '-m', '280', 'https://openrouter.ai/api/v1/chat/completions', '-H',
                        'Content-Type: application/json', '-d', '@-'], input=json.dumps(body), capture_output=True, text=True)
    try:
        url = json.loads(r.stdout)['choices'][0]['message']['images'][0]['image_url']['url']
        open(path, 'wb').write(base64.b64decode(url.split(',', 1)[1]))
        return 'ok'
    except Exception:
        return 'fail ' + r.stdout[:300]


def ref2_path(name):
    """A bigger copy of a cut animal on magenta, used as second reference."""
    im = Image.open(os.path.join(HERE, name + '.png'))
    im = im.resize((im.width * 4, im.height * 4), Image.LANCZOS)
    c = Image.new('RGB', (im.width + 64, im.height + 64), (255, 0, 255))
    c.paste(im, (32, 32), im)
    p = os.path.join(WORK, 'ref_' + name + '.png')
    c.save(p)
    return p


def do_gen(sheet):
    s = SHEETS[sheet]
    refs = [STYLE] + ([ref2_path(s['ref2'])] if 'ref2' in s else [])
    return sheet, gen(os.path.join(WORK, sheet + '.png'), s['prompt'], refs)


def save_small(im, path, long_side, pad=2):
    a = im.getchannel('A').getbbox()
    im = im.crop(a)
    k = long_side / max(im.size)
    im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    c = Image.new('RGBA', (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
    c.paste(im, (pad, pad), im)
    c.save(path, optimize=True)


def do_cut(sheet):
    s = SHEETS[sheet]
    src = os.path.join(WORK, sheet + '.png')
    if s['kind'] == 'items':
        tmp = os.path.join(WORK, 'cut_' + sheet)
        cut = s.get('cut', s['names'])
        files = keyslice.cut_items(src, cut, 1024, tmp)
        for name, f in zip(cut, files):
            if name.startswith('_'):
                continue
            save_small(Image.open(f), os.path.join(HERE, name + '.png'), SIZE[name])
    else:
        import numpy as np
        fr = keyslice.frames(keyslice.key(Image.open(src)))
        if len(fr) != len(s['names']):
            raise ValueError(f'{sheet}: found {len(fr)} frames, expected {len(s["names"])}')
        h = s['height']
        # align() scales to the tallest frame; scale with height so that the frame canvas stays near `h`
        for name, im in zip(s['names'], keyslice.align(fr, h)):
            bb = im.getchannel('A').getbbox()
            im.save(os.path.join(HERE, name + '.png'), optimize=True)
    return sheet


def frame_desc(name):
    base, n = name.rsplit('_', 1)
    return base, int(n)


def write_json():
    assets = []
    for sheet in SHEETS.values():
        for name in sheet['names']:
            if os.path.exists(os.path.join(HERE, name + '.png')):
                assets.append(entry(name))
    order = sorted(assets, key=lambda a: a['name'])
    pack = {'pack': 'animals', 'title': {'de': 'Tiere', 'en': 'Animals'}, 'format': 'png', 'assets': order}
    open(os.path.join(HERE, 'pack.json'), 'w').write(json.dumps(pack, ensure_ascii=False, indent=2) + '\n')


def entry(name):
    side_de, side_en = '(von der Seite, nach rechts)', '(side view, facing right)'
    if name in DESC:
        de, en = DESC[name]
        return dict(name=name, file=name + '.png', tags=['animal'], de=f'{de} {side_de}', en=f'{en} {side_en}')
    pets = {
        'pet_cat_happy': ('Haustier-Katze, fröhlich', 'Pet cat, happy'),
        'pet_cat_sleep': ('Haustier-Katze, schläft', 'Pet cat, sleeping'),
        'pet_cat_hungry': ('Haustier-Katze, hungrig', 'Pet cat, hungry'),
        'pet_cat_eating': ('Haustier-Katze, frisst', 'Pet cat, eating'),
        'pet_cat_sad': ('Haustier-Katze, traurig', 'Pet cat, sad'),
    }
    if name in pets:
        de, en = pets[name]
        return dict(name=name, file=name + '.png', tags=['animal', 'pet'],
                    de=f'{de} (von vorn)', en=f'{en} (front view)')
    items = {
        'pet_food_bowl': ('Futternapf mit Trockenfutter', 'Food bowl with kibble'),
        'pet_fish_treat': ('Fisch-Leckerli für die Katze', 'Fish-shaped cat treat'),
        'pet_ball': ('Spielball', 'Toy ball'),
        'pet_bed': ('Körbchen für ein Haustier', 'Pet bed'),
    }
    if name in items:
        de, en = items[name]
        return dict(name=name, file=name + '.png', tags=['item', 'pet'], de=de, en=en)
    base, n = frame_desc(name)
    anim = {
        'an_bee': ('Biene fliegt', 'Bee flying', 2, ['Flügel oben', 'Flügel unten'], ['wings up', 'wings down']),
        'an_butterfly': ('Schmetterling fliegt', 'Butterfly flying', 2, ['Flügel offen', 'Flügel zu'], ['wings open', 'wings closed']),
        'an_cat_walk': ('Katze läuft', 'Cat walking', 4, None, None),
        'an_dog_walk': ('Hund läuft', 'Dog walking', 4, None, None),
    }
    de, en, k, xde, xen = anim[base]
    de = f'{de}, Bild {n} von {k}' + (f', {xde[n - 1]}' if xde else '') + ' (nach rechts)'
    en = f'{en}, frame {n} of {k}' + (f', {xen[n - 1]}' if xen else '') + ' (facing right)'
    return dict(name=name, file=name + '.png', tags=['animal', 'animation'], de=de, en=en)


if __name__ == '__main__':
    os.makedirs(WORK, exist_ok=True)
    cmd, names = sys.argv[1], sys.argv[2:] or list(SHEETS)
    if cmd == 'gen':
        with ThreadPoolExecutor(6) as ex:
            for sheet, res in ex.map(do_gen, names):
                print(sheet, res)
    elif cmd == 'cut':
        for n in names:
            try:
                print(do_cut(n), 'ok')
            except Exception as e:
                print(n, 'ERROR', e)
    elif cmd == 'json':
        write_json()
