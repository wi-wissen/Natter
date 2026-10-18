"""Make the `grid_chars` pack: top-down characters for grid games (48x48 canvas each).

python3 make.py gen [sheet ...]   draw sheets with the image model into the work folder
python3 make.py cut               key and cut the sheets into the pack folder
python3 make.py json              write pack.json
python3 make.py sheet             contact sheets (dark and light, 1x and 2x) for checking

Method
- Each player character is first drawn once as a model sheet (front, back, side). That sheet is the reference image
  for all its other sheets, so the character looks the same in all 17 images.
- down/up walks: the model draws step (frame 1) and standing (frame 2); frame 3 is frame 1 mirrored, so the feet
  really alternate. left is the mirrored right walk.
- Enemies: bug is drawn straight from above and rotated; the others draw one step and get the second by mirroring
  where the view is symmetric (front/back), side views are drawn twice by the model.
- All frames of one character share one scale and one canvas; the feet (bottom of the standing pose) sit on the same
  line and the body is centred, so swapping frames does not jump.
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
CANVAS = 48

BG = ('Background: one flat solid pure magenta colour #FF00FF everywhere, no shadows, no drop shadow under the feet, no ground, no floor, '
      'no text, no letters, no numbers, no grid lines, no frames, no outlines. ')
STYLE_TXT = ('Flat emoji style: clear flat shapes, no outlines, few colours, rounded friendly forms, '
             'no gradients, no hard shading. Every figure is completely separate from the others with wide magenta gaps. ')
ORIG = 'Original design; it must not resemble any existing video game, film or brand character. '
VIEW = ('Chibi proportions for a top-down grid game: a big head and a small short body. Camera slightly from above '
        '(high three-quarter view like the walking sprites of classic top-down adventure games): we look a little down '
        'onto the character and see the top of the head and the shoulders. ')

CHARS = {
    'robo': 'a cute small cube-shaped robot: a blue-grey rounded cube body that is also its head, one short antenna with an orange ball '
            'on top, two big round black eyes with white highlights on a dark screen face, small orange round cheeks, '
            'two short stubby grey arms with orange hands, two short stubby legs with orange feet',
    'fuchs': 'a little orange fox: orange fur, a cream white face front and chest, big pointed ears with dark tips, black dot eyes, '
             'a small black nose, a bushy orange tail with a white tip, short dark brown legs, standing upright on two legs',
    'maus': 'a round little grey mouse: a round light grey body, very big round pink ears, black dot eyes, a small pink nose, '
            'a pink belly, small pink paws and feet, a thin long pink tail, standing upright on two legs',
    'pinguin': 'a chubby little penguin: round black body with a white belly and white face, black dot eyes, a small orange beak, '
               'short black flipper wings, orange flat feet, standing upright',
}


def char_prompt(c, body):
    return (f'Sprite sheet for a top-down grid game. The character is {CHARS[c]}. ' + VIEW + body + STYLE_TXT + ORIG + BG)


def ref_prompt(c, body):
    return ('Use EXACTLY the same character as in the reference image: same colours, same shapes, same proportions, same style. '
            f'It is {CHARS[c]}. ' + VIEW + body + STYLE_TXT + BG)


MODEL = ('Model sheet: exactly 3 figures of the same character in ONE horizontal row, evenly spaced, same size, all standing still '
         'with the feet on the same height: 1 front view facing the viewer, 2 back view seen from behind (no face visible), '
         '3 side view in profile facing to the RIGHT. ')
DOWN = ('Walk animation towards the viewer: exactly 3 figures in ONE horizontal row, evenly spaced, same size, feet on the same height, '
        'ALL THREE in FRONT view facing the viewer: frame 1 mid-step with its LEFT foot (on our right side) clearly lifted and forward and '
        'the body leaning a little, arms swinging; frame 2 standing still, both feet together, symmetric; '
        'frame 3 mid-step with the other foot lifted. ')
UP = ('Walk animation away from the viewer: exactly 3 figures in ONE horizontal row, evenly spaced, same size, feet on the same height, '
      'ALL THREE in BACK view seen from behind (no face visible): frame 1 mid-step with one foot clearly lifted and the body leaning a little; '
      'frame 2 standing still, both feet together, symmetric; frame 3 mid-step with the other foot lifted. ')
SIDE = ('Walk animation to the right: exactly 3 figures in ONE horizontal row, evenly spaced, same size, feet on the same height, '
        'ALL THREE in pure SIDE VIEW (profile) facing and walking to the RIGHT: frame 1 a big step with the front leg forward and the back leg '
        'back; frame 2 standing still with the legs together; frame 3 a big step with the OTHER leg forward (legs swapped compared with frame 1). ')
EXTRA = ('Exactly 4 figures in ONE horizontal row, evenly spaced, same size, ALL in FRONT view facing the viewer, feet on the same height: '
         '1 standing still, relaxed, eyes open; 2 EXACTLY the same as figure 1 but with the eyes closed (blinking) and breathing out '
         '(body a tiny bit lower and wider); 3 very happy, cheering with both arms/paws raised high, big smile; '
         '4 dizzy: spiral eyes, a wobbly mouth, three small yellow stars circling close around the top of its head. ')
EXTRA_PENGUIN = EXTRA.replace('arms/paws', 'flipper wings')
# redraws where the first try was weak (sheet name -> prompt body); used instead of the generic bodies above
WADDLE_DOWN = ('Waddle walk towards the viewer: exactly 3 figures in ONE horizontal row, evenly spaced, same size, ALL THREE in FRONT view facing the viewer: '
               'frame 1 the whole body tilted about 12 degrees to OUR LEFT, the foot on our right side lifted a little, flippers out; '
               'frame 2 standing upright, both feet on the ground, symmetric; '
               'frame 3 the whole body tilted about 12 degrees to OUR RIGHT, the foot on our left side lifted a little. Feet stay small and flat. ')
WADDLE_UP = WADDLE_DOWN.replace('towards the viewer', 'away from the viewer').replace(
    'FRONT view facing the viewer', 'BACK view seen from behind (no face, no belly visible)')
SIDE_TAIL = ('Walk animation to the right: exactly 3 figures in ONE horizontal row, evenly spaced, same size, feet on the same height, '
             'ALL THREE in pure SIDE VIEW (profile) facing and walking to the RIGHT: frame 1 a big step, the front leg far forward, the back leg far '
             'back, the tail swung HIGH up; frame 2 standing still with the legs together, tail level; frame 3 the legs crossed under the body '
             'mid-stride (clearly different from frame 1), the tail hanging LOW down. ')
SIDE_WADDLE = ('Waddle walk to the right: exactly 3 figures in ONE horizontal row, evenly spaced, same size, ALL THREE in pure SIDE VIEW (profile) '
               'facing to the RIGHT: frame 1 the body tilted FORWARD (to the right) about 12 degrees, the back foot lifted behind; '
               'frame 2 standing upright, both feet on the ground; frame 3 the body tilted BACKWARD (to the left) about 12 degrees, '
               'the front foot lifted in front. Flipper wings slightly out. ')
EXTRA_ROW = ('Exactly 4 figures, no more and no less, in ONE single horizontal row, evenly spaced, same size, ALL in FRONT view facing the viewer, '
             'feet on the same height: 1 standing still, relaxed, eyes open; 2 EXACTLY the same as figure 1 but with the eyes closed (blinking); '
             '3 very happy, cheering with both {arms} raised HIGH above the head, big open smile; '
             '4 dizzy, still facing the viewer: spiral eyes, a wobbly mouth, three small yellow stars circling close around the top of its head. ')
REDO = {
    'pinguin_down': WADDLE_DOWN, 'pinguin_up': WADDLE_UP, 'pinguin_side': SIDE_WADDLE, 'fuchs_side': SIDE_TAIL,
    'maus_extra': EXTRA_ROW.format(arms='paws'), 'pinguin_extra': EXTRA_ROW.format(arms='flipper wings'),
    'maus_extra': ('Exactly 4 figures in a grid of 2 rows and 2 columns with very wide magenta gaps, none touching, same size, ALL in FRONT view '
                   'facing the viewer, reading order left to right, top row first: 1 standing still, relaxed, eyes open; 2 EXACTLY the same as '
                   'figure 1 but with the eyes closed (blinking); 3 very happy, cheering with both paws raised HIGH above the head, big open smile; '
                   '4 dizzy, still facing the viewer: spiral eyes, a wobbly mouth, three small yellow stars circling close around the top of its head. '),
}
EXTRA_SHEETS = {'robo_extra2': ('robo', EXTRA_ROW.format(arms='arms'))}  # robo: happy pose of a second extra sheet

SHEETS = {}
for _c in CHARS:
    SHEETS[f'{_c}_model'] = dict(ref=STYLE, prompt=char_prompt(_c, MODEL))
    for _k, _b in (('down', DOWN), ('up', UP), ('side', SIDE), ('extra', EXTRA_PENGUIN if _c == 'pinguin' else EXTRA)):
        SHEETS[f'{_c}_{_k}'] = dict(ref=f'{_c}_model', prompt=ref_prompt(_c, REDO.get(f'{_c}_{_k}', _b)))
for _s, (_c, _b) in EXTRA_SHEETS.items():
    SHEETS[_s] = dict(ref=f'{_c}_model', prompt=ref_prompt(_c, _b))


def unshadow(img):
    """The model often adds a dark magenta drop shadow under the feet: turn every magenta-hued pixel into pure key colour."""
    a = np.asarray(img.convert('RGB')).astype(np.int32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    lo, hi = np.minimum(r, b), np.maximum(r, b)
    m = (lo > 80) & (g < 0.35 * lo) & (np.abs(r - b) < 0.3 * hi)
    a[m] = (255, 0, 255)
    return Image.fromarray(a.astype(np.uint8), 'RGB')


def key(path):
    return keyslice.key(unshadow(Image.open(path)))


def clean_ref(s):
    """A model sheet without shadows, used as the reference for the other sheets of that character."""
    out = os.path.join(WORK, s + '_clean.png')
    rgba = Image.fromarray(key(sheet_path(s)), 'RGBA')
    bg = Image.new('RGBA', rgba.size, (255, 0, 255, 255))
    bg.alpha_composite(rgba)
    bg.convert('RGB').save(out)
    return out

FOES = {
    'bug': ('Exactly 2 figures in ONE horizontal row with a wide gap, same size: a round shiny beetle for a top-down grid game, seen EXACTLY from '
            'straight above (top view), its HEAD POINTING UP: a round glossy teal-green shell with a thin dark line down the middle and one small '
            'white shine spot, a small dark blue head with two short curved antennae, six thin dark legs, three on each side. '
            'Mid-step, NOT symmetric: 1 all three legs on the LEFT side angled steeply FORWARD (towards the head), all three legs on the RIGHT '
            'side angled steeply BACKWARD (towards the tail); 2 the opposite: right legs forward, left legs backward. '),
    'wisp': ('Exactly 4 figures in ONE horizontal row, evenly spaced, same size: a friendly-spooky little floating flame ghost for a top-down grid game: '
             'a soft light-blue flame-shaped body with a lighter cyan centre, round at the bottom, flickering flame tip on top, two big friendly '
             'dark oval eyes, floating, no legs, no arms. 1 front view facing the viewer, the flame tip curling to OUR LEFT; '
             '2 back view seen from behind (no eyes visible), the flame tip curling to our left; '
             '3 side view moving to the RIGHT, eyes looking right, the flame tip streaming back to the left; '
             '4 the same side view with the flame tip flickering in a different shape (shorter, curled up). '),
    'crab': ('Exactly 4 figures in ONE horizontal row, evenly spaced, same size: a small cute red crab for a top-down grid game, seen slightly from '
             'above: a round red shell, two black eyes on short stalks, two big red claws, four thin legs on each side. '
             '1 front view facing the viewer, the claw on our left raised high and the claw on our right low, the legs on our left lifted; '
             '2 back view seen from behind (eye stalks seen from behind, no face), the claw on our left raised, the legs on our left lifted; '
             '3 scuttling sideways to the RIGHT, still facing the viewer, the body leaning to the right, eyes looking right, legs on the right stretched out; '
             '4 the same sideways scuttle to the right with the legs in the other phase (legs on the right pulled in, legs on the left stretched). '),
    'golem': ('Exactly 4 figures in ONE horizontal row, evenly spaced, same size: a small friendly stone golem for a top-down grid game, chibi: '
              'a big rounded grey boulder body, a smaller round stone head with two glowing yellow eyes, a few green moss patches, '
              'short thick stone arms and stubby stone legs, slow and heavy. '
              '1 front view facing the viewer, mid-step: the leg on our right lifted, the body leaning to our left; '
              '2 back view seen from behind (no eyes visible), mid-step: the leg on our right lifted, the body leaning to our left; '
              '3 side view in profile walking to the RIGHT, a heavy step with the front leg forward; '
              '4 the same side view with the OTHER leg forward and the arms swung the other way. '),
}
for _f, _b in FOES.items():
    SHEETS[_f] = dict(ref=STYLE, prompt='Sprite sheet for a top-down grid game. ' + _b + 'Cute, round, readable at small size. '
                      + STYLE_TXT + ORIG + BG)


def sheet_path(s):
    return os.path.join(WORK, s + '.png')


def ref_path(r):
    return r if os.path.isabs(r) else os.path.join(WORK, r + '_clean.png')


def do_gen(s):
    os.makedirs(WORK, exist_ok=True)
    spec = SHEETS[s]
    return s, gen(os.path.join(WORK, s), spec['prompt'], ref_path(spec['ref']))


if __name__ == '__main__':
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == 'gen':
        for s in {SHEETS[s]['ref'] for s in (args or list(SHEETS))}:
            if not os.path.isabs(s):
                clean_ref(s)  # once, before the parallel requests read it
        with ThreadPoolExecutor(8) as ex:
            for s, r in ex.map(do_gen, args or list(SHEETS)):
                print(s, r)
