"""Grid action pack: pieces for grid based action, strategy and farming games (top view, flat emoji style).

python3 make.py gen <sheet> [...]   draw sheets with the image model (writes to WORK)
python3 make.py cut <sheet> [...]   key and cut sheets into the named PNGs
python3 make.py tiles               draw the procedural pieces (blast fire, roads, ring, fences, crossing tiles)
python3 make.py pack                write pack.json
python3 make.py contact             contact sheets on dark and light background (in WORK)
`all` instead of a sheet name means every sheet.

Drawn in code (they must connect or tile): bomb_blast_*, td_road_*, td_range_ring, farm_fence_*, cross_road,
cross_grass, cross_water, cross_goal_home. Derived in code: bomb_1..3 (one drawn bomb, pulsing scale and glow),
cross_frog_down/left/right (the drawn frog facing up, rotated).
"""
import os, sys, json, math
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
WORK = os.environ.get('GRID_ACTION_WORK', '/tmp/claude-0/-home-user/82af8643-7fd2-511f-b912-5aee8d74fb4e/scratchpad/assets-work/grid_action')

HEAD = ('Draw game sprites in exactly the same flat emoji style as the reference image: clear flat shapes, no outlines, '
        'very few colours per object, rounded friendly forms, at most a hint of shading. Do not draw the characters of the reference. ')
TAIL = (' Every object is separate, with wide empty space between objects; no object touches another or the image border. '
        'Background: one flat solid pure magenta colour #FF00FF everywhere. No shadows, no ground, no grass under objects, '
        'no text, no letters, no numbers, no grid lines, no frames around the objects. Original designs only, no logos, no brands.')
TOP = 'seen from DIRECTLY ABOVE (top-down view, as in a grid map game)'


def crop_prompt(plant, stages):
    return HEAD + (
        f'A sheet of 4 growth stages of ONE {plant} plant in a vegetable garden, in ONE horizontal row, left to right, '
        'evenly spaced. It is the same plant growing, so all four stand on the SAME small round mound of brown soil, '
        'seen slightly from above, the mound has exactly the same size, shape and colour in all four pictures: '
        f'1) seed: {stages[0]}; 2) sprout: {stages[1]}; 3) growing: {stages[2]}; 4) ready to harvest: {stages[3]}. '
        'The plant gets bigger from left to right, same leaf colours throughout.')


# sheet id -> prompt, items (name, (w, h), mode), optional found/pick/grow/cut
# modes: 'fit' keep ratio in the box, crop tightly + 2 px margin; 'exact' stretch to w x h (tiles);
# 'canvas' one scale for the whole sheet (largest object fills the box), every object on a w x h canvas, bottom aligned;
# 'center' like canvas but centred.
SHEETS = {
    'bomb': dict(prompt=HEAD + (
        'A sheet of 6 objects for a maze game where players lay bombs, in a grid of 3 columns and 2 rows, '
        'reading order left to right, top to bottom: '
        '1) a round black cartoon bomb with a small dark grey highlight, a short grey metal cap on top and a short curved fuse '
        'with a bright yellow and orange spark at its tip; '
        f'2) a breakable wooden crate {TOP}: a perfect square, light brown planks, a darker brown frame and a diagonal brace; '
        f'3) an unbreakable solid block {TOP}: a perfect square of grey stone, lighter bevel at the top and left edge, '
        'darker bevel at the bottom and right edge, a small round rivet in each corner; '
        '4) a round power-up token: a red-orange disc with a light rim and a white flame symbol; '
        '5) a round power-up token: a blue disc with a light rim and a small white round bomb symbol; '
        '6) a round power-up token: a green disc with a light rim and a white lightning bolt symbol.'),
        items=[('bomb_src', (64, 64), 'fit'), ('bomb_block_soft', (64, 64), 'exact'), ('bomb_block_hard', (64, 64), 'exact'),
               ('bomb_power_range', (48, 48), 'fit'), ('bomb_power_count', (48, 48), 'fit'), ('bomb_power_speed', (48, 48), 'fit')]),
    'towers': dict(prompt=HEAD + (
        f'A sheet of 9 defence towers for a tower defence game, {TOP}: we look straight down onto the round tower tops. '
        'Grid of 3 columns and 3 rows. Each ROW is one tower kind, the three COLUMNS are its upgrade levels: '
        'left = level 1, small and simple with a round base of wooden planks; '
        'middle = level 2, a round base of grey stone blocks, the weapon bigger; '
        'right = level 3, a round base of grey stone blocks with a golden rim and four small coloured pennants, the weapon biggest and finest. '
        'Row 1, archer towers: a crossbow on top, pointing UP (level 2 two crossbows, level 3 a big golden crossbow); '
        'Row 2, cannon towers: a dark grey cannon barrel on top, pointing UP (level 2 a thicker barrel, level 3 two barrels side by side); '
        'Row 3, frost towers: a light blue ice crystal on top (level 2 a bigger crystal cluster, level 3 a big glowing crystal star). '
        'All nine towers are round and about the same size.'),
        cut='towers',
        items=[(f'td_tower_{k}_{n}', (64, 64), 'tower') for k in ('arrow', 'cannon', 'ice') for n in (1, 2, 3)]),
    'td_places': dict(prompt=HEAD + (
        f'A sheet of 3 places for a tower defence map, {TOP} (a slight top-down three-quarter view is fine), '
        'in ONE horizontal row, left to right: '
        '1) the home base to defend: a small cosy castle with a round blue roof tower in the middle, light stone walls '
        'with battlements and a little red flag; '
        '2) the monster spawn: a dark cave entrance in a round grey rock mound with a little moss on top, dark inside; '
        '3) an empty tower plot: a flat square of light packed sand with rounded corners, a slightly darker sandy border '
        'and four small grey stones at the corners, nothing on it.'),
        items=[('td_base', (64, 64), 'fit'), ('td_spawn', (64, 64), 'fit'), ('td_build_spot', (64, 64), 'fit')]),
    'td_items': dict(prompt=HEAD + (
        'A sheet of 5 small items for a tower defence game, in ONE horizontal row, left to right: '
        '1) a shiny round gold coin with a lighter rim and a small star in the middle; '
        '2) a red heart; '
        '3) an arrow flying to the RIGHT, horizontal: brown shaft, grey tip on the right, white feathers on the left; '
        '4) a round dark grey cannonball with a small light highlight; '
        '5) a sharp light blue ice shard flying to the RIGHT, horizontal, pointed on the right, with a tiny white frost tail.'),
        items=[('td_coin', (32, 32), 'fit'), ('td_heart', (32, 32), 'fit'), ('td_shot_arrow', (24, 24), 'fit'),
               ('td_shot_ball', (24, 24), 'fit'), ('td_shot_ice', (24, 24), 'fit')]),
    'td_enemies': dict(prompt=HEAD + (
        f'A sheet of 4 original monster creeps for a tower defence game, all {TOP}, every one heading to the RIGHT '
        '(face and front at the right side), in ONE horizontal row, left to right: '
        '1) a small round green slime blob with two big eyes looking right; '
        '2) a round orange beetle with a shiny shell split in the middle, six short dark legs and two feelers pointing right; '
        '3) a small blue bat-like flyer with wide spread wings, a round body and two eyes looking right; '
        '4) a big boss monster, twice as big as the others: a round dark red armoured shell with a row of white spikes, '
        'two big pincers in front pointing right, angry yellow eyes and a small golden crown.'),
        items=[('td_enemy_1', (48, 48), 'fit'), ('td_enemy_2', (48, 48), 'fit'), ('td_enemy_3', (48, 48), 'fit'),
               ('td_boss', (80, 80), 'fit')]),
    'crop_carrot': dict(prompt=crop_prompt('carrot', [
        'only the mound with a small dug hole and three tiny pale seeds beside it',
        'two tiny light green feathery leaves',
        'a bunch of feathery green carrot leaves, half grown',
        'a big lush bunch of feathery carrot leaves and a thick orange carrot top clearly sticking out of the soil']),
        cut='crop', items=[(f'farm_carrot_{n}', (64, 64), 'canvas') for n in range(1, 5)]),
    'crop_tomato': dict(prompt=crop_prompt('tomato', [
        'only the mound with a small dug hole and three tiny pale seeds beside it',
        'two tiny green leaves on a short stem',
        'a small tomato plant with several leaves and yellow flowers, tied to a thin wooden stake',
        'a tall bushy tomato plant tied to the same wooden stake, with five shiny round red tomatoes']),
        cut='crop', items=[(f'farm_tomato_{n}', (64, 64), 'canvas') for n in range(1, 5)]),
    'crop_pumpkin': dict(prompt=crop_prompt('pumpkin', [
        'only the mound with a small dug hole and three tiny pale seeds beside it',
        'two small round green leaves',
        'a spreading vine with big round green leaves and a small yellow flower',
        'the same vine with big leaves and one big round orange pumpkin with ribs and a short stem lying in front']),
        cut='crop', items=[(f'farm_pumpkin_{n}', (64, 64), 'canvas') for n in range(1, 5)]),
    'crop_wheat': dict(prompt=crop_prompt('wheat', [
        'only the mound with a small dug hole and three tiny pale seeds beside it',
        'three thin short green blades of grass',
        'a tuft of tall thin green wheat stalks with small green ears',
        'a tuft of tall golden yellow wheat stalks with full golden ears of grain']),
        cut='crop', items=[(f'farm_wheat_{n}', (64, 64), 'canvas') for n in range(1, 5)]),
    'farm_tools': dict(prompt=HEAD + (
        'A sheet of 7 farm objects, in a grid of 4 columns and 2 rows, reading order left to right, top to bottom: '
        '1) a small cloth seed bag tied with a string, beige, with a green sprout symbol on it; '
        '2) a green metal watering can with a long spout to the right; '
        '3) a garden hoe: long wooden handle, diagonal, grey metal blade at the top; '
        '4) a woven brown wicker basket with a handle, empty; '
        '5) a friendly scarecrow on a wooden pole: straw hat, sack face with a stitched smile, patched blue shirt, straw hands; '
        '6) an old stone water well with a small wooden roof, a crank and a bucket; '
        '7) a shiny gold coin with a lighter rim and a small wheat ear in the middle.'),
        items=[('farm_seeds', (48, 48), 'fit'), ('farm_watering_can', (48, 48), 'fit'), ('farm_hoe', (48, 48), 'fit'),
               ('farm_basket', (48, 48), 'fit'), ('farm_scarecrow', (64, 64), 'fit'), ('farm_well', (64, 64), 'fit'),
               ('farm_coin', (32, 32), 'fit')]),
    'farm_animals': dict(prompt=HEAD + (
        'A sheet of 3 farm animals for a top-down map game, seen from STRAIGHT ABOVE like a bird looking down: we see only the back '
        'of each animal, its spine runs horizontally through the middle, the head is at the RIGHT end, the shape is symmetric '
        'top to bottom, no legs from the side, no belly; in ONE horizontal row, left to right: '
        '1) a white hen from above: an oval white body with two folded wings on both sides, a short tail fan on the left, '
        'a small round head on the right with a red comb on top and a yellow beak pointing right; '
        '2) a black and white spotted cow from above: a long rounded rectangle body with black patches, a short tail on the left, '
        'the head on the right with two small horns and two ears sticking out to the top and bottom and a pink nose at the right; '
        '3) a pink pig from above: a round oval pink body, a curly tail on the left, the head on the right with two floppy ears '
        'to the top and bottom and a round pink snout at the right.'),
        items=[('farm_chicken', (40, 40), 'fit'), ('farm_cow', (64, 64), 'fit'), ('farm_pig', (56, 56), 'fit')]),
    'farm_barn': dict(prompt=HEAD + (
        'ONE single object in the middle of the image: a big red farm barn seen from the front and slightly from above, '
        'red wooden walls, a white trimmed gabled roof in dark red, a big double door with a white X brace, '
        'a small round window under the roof.'),
        items=[('farm_barn', (128, 128), 'fit')]),
    'cross_frog': dict(prompt=HEAD + (
        f'A sheet of 2 pictures of the same small cute green frog {TOP}, facing UP (head at the top), in ONE horizontal row: '
        '1) sitting: round green body, two big round eyes on top of the head, lighter green spots on the back, '
        'the folded legs visible at both sides; '
        '2) the same frog in mid jump: front legs stretched forward up, long back legs stretched out backwards down, body a bit longer. '
        'Both exactly the same colours.'),
        items=[('cross_frog_up', (48, 48), 'frog'), ('cross_frog_hop_up', (48, 48), 'frog')], cut='frog'),
    'cross_cars': dict(prompt=HEAD + (
        f'A sheet of 4 vehicles {TOP}, every vehicle driving to the RIGHT (front at the right side), '
        'one vehicle per row, 4 rows, left aligned: '
        '1) a small round red car; 2) a blue car; 3) a yellow car with a black stripe on the roof; '
        '4) a long truck: short orange cab on the right and a long light grey box trailer behind it. '
        'Cars show windscreen, roof and four dark tyres peeking out at the sides; simple and friendly.'),
        items=[('cross_car_1', (96, 48), 'fit'), ('cross_car_2', (96, 48), 'fit'), ('cross_car_3', (96, 48), 'fit'),
               ('cross_truck', (160, 48), 'fit')]),
    'cross_river': dict(prompt=HEAD + (
        f'A sheet of 4 objects floating on a river, {TOP}, each in its own row, left aligned: '
        '1) a short floating log lying horizontally: brown bark, light round cut faces at both ends, about two times as long as thick; '
        '2) the same kind of log but much longer, five times as long as thick, horizontal; '
        '3) a swimming turtle heading RIGHT: a round green shell with lighter hexagon plates, head on the right, four flippers; '
        '4) the same turtle with the flippers in the other swimming position (front flippers back, back flippers forward).'),
        items=[('cross_log_s', (64, 48), 'fit'), ('cross_log_l', (160, 48), 'fit'),
               ('cross_turtle_1', (56, 56), 'turtle'), ('cross_turtle_2', (56, 56), 'turtle')], cut='turtle'),
    'cross_misc': dict(prompt=HEAD + (
        'A sheet of 3 objects, in ONE horizontal row, left to right: '
        f'1) a round green lily pad {TOP}, one thin narrow slit from the edge to the centre, light green veins, a small pink water lily flower on it; '
        f'2) a small fly {TOP}: black round body, two big light blue wings, red eyes; '
        f'3) a green snake {TOP}, crawling to the right in a tight wavy zigzag S line with two bends, head on the RIGHT with two small eyes '
        'and a tiny red tongue, lighter green spots; the whole snake is only THREE times as wide as tall.'),
        items=[('cross_lily', (56, 56), 'fit'), ('cross_fly', (32, 32), 'fit'), ('cross_snake', (96, 32), 'fit')]),
    'extras': dict(prompt=HEAD + (
        'A sheet of 6 items, in a grid of 3 columns and 2 rows, reading order left to right, top to bottom: '
        '1) a blue fish seen from the side, head on the RIGHT, tail fin on the left, lighter belly; '
        '2) a blue gem seen from DIRECTLY ABOVE: a flat rhombus (a square standing on one corner) cut into facets, a small rhombus '
        'table in the middle, four light and four darker triangular facets around it; '
        '3) the same gem in red; 4) the same gem in green; '
        '5) a battery: a short upright cylinder, green body, grey top with a small knob, a white lightning bolt on the side; '
        '6) a yellow wedge of cheese with round holes.'),
        items=[('fish_item', (40, 40), 'fit'), ('gem_blue', (40, 40), 'fit'), ('gem_red', (40, 40), 'fit'),
               ('gem_green', (40, 40), 'fit'), ('battery', (40, 40), 'fit'), ('cheese', (40, 40), 'fit')]),
}

# ---------------------------------------------------------------- descriptions
DESC = {
    'bomb_block_soft': ('Holzkiste, lässt sich wegsprengen (Kachel 64x64)', 'Wooden crate that can be blown up (tile 64x64)'),
    'bomb_block_hard': ('Fester Steinblock, unzerstörbar (Kachel 64x64)', 'Solid stone block, unbreakable (tile 64x64)'),
    'bomb_blast_center': ('Explosion, Mitte (Feuer nach allen vier Seiten)', 'Blast centre (fire to all four sides)'),
    'bomb_blast_h': ('Explosion, waagrechtes Mittelstück', 'Blast, horizontal middle piece'),
    'bomb_blast_v': ('Explosion, senkrechtes Mittelstück', 'Blast, vertical middle piece'),
    'bomb_blast_end_up': ('Explosion, Ende oben', 'Blast, end pointing up'),
    'bomb_blast_end_down': ('Explosion, Ende unten', 'Blast, end pointing down'),
    'bomb_blast_end_left': ('Explosion, Ende links', 'Blast, end pointing left'),
    'bomb_blast_end_right': ('Explosion, Ende rechts', 'Blast, end pointing right'),
    'bomb_power_range': ('Extra: größere Reichweite (Flamme)', 'Power-up: bigger range (flame)'),
    'bomb_power_count': ('Extra: eine Bombe mehr', 'Power-up: one more bomb'),
    'bomb_power_speed': ('Extra: schneller laufen (Blitz)', 'Power-up: faster (lightning)'),
    'td_base': ('Kleine Burg, die verteidigt wird', 'Small castle to defend'),
    'td_spawn': ('Höhle, aus der die Monster kommen', 'Cave where the monsters come from'),
    'td_build_spot': ('Leerer Bauplatz für einen Turm', 'Empty plot for a tower'),
    'td_range_ring': ('Durchsichtiger Kreis für die Reichweite (192x192, beliebig skalieren)', 'Transparent range ring (192x192, scale as needed)'),
    'td_coin': ('Goldmünze', 'Gold coin'),
    'td_heart': ('Herz (Leben)', 'Heart (life)'),
    'td_shot_arrow': ('Pfeil, fliegt nach rechts', 'Arrow flying right'),
    'td_shot_ball': ('Kanonenkugel', 'Cannonball'),
    'td_shot_ice': ('Eissplitter, fliegt nach rechts', 'Ice shard flying right'),
    'td_enemy_1': ('Grüner Schleim von oben, kriecht nach rechts', 'Green slime from above, heading right'),
    'td_enemy_2': ('Orangefarbener Käfer von oben, krabbelt nach rechts', 'Orange beetle from above, heading right'),
    'td_enemy_3': ('Blauer Flatterer von oben, fliegt nach rechts', 'Blue flapper from above, flying right'),
    'td_boss': ('Großes gepanzertes Boss-Monster von oben, nach rechts', 'Big armoured boss monster from above, heading right'),
    'farm_seeds': ('Saatgutbeutel', 'Seed bag'),
    'farm_watering_can': ('Gießkanne', 'Watering can'),
    'farm_hoe': ('Hacke', 'Hoe'),
    'farm_basket': ('Weidenkorb', 'Wicker basket'),
    'farm_scarecrow': ('Vogelscheuche', 'Scarecrow'),
    'farm_chicken': ('Huhn von oben, schaut nach rechts', 'Hen from above, facing right'),
    'farm_cow': ('Kuh von oben, schaut nach rechts', 'Cow from above, facing right'),
    'farm_pig': ('Schwein von oben, schaut nach rechts', 'Pig from above, facing right'),
    'farm_barn': ('Rote Scheune', 'Red barn'),
    'farm_fence_h': ('Zaunstück, waagrecht (64x64, schließt an)', 'Fence piece, horizontal (64x64, connects)'),
    'farm_fence_v': ('Zaunstück, senkrecht (64x64, schließt an)', 'Fence piece, vertical (64x64, connects)'),
    'farm_well': ('Brunnen', 'Water well'),
    'farm_coin': ('Goldmünze mit Ähre', 'Gold coin with a wheat ear'),
    'cross_frog_up': ('Frosch von oben, schaut nach oben', 'Frog from above, facing up'),
    'cross_frog_down': ('Frosch von oben, schaut nach unten', 'Frog from above, facing down'),
    'cross_frog_left': ('Frosch von oben, schaut nach links', 'Frog from above, facing left'),
    'cross_frog_right': ('Frosch von oben, schaut nach rechts', 'Frog from above, facing right'),
    'cross_frog_hop_up': ('Frosch mitten im Sprung nach oben', 'Frog in mid-jump, facing up'),
    'cross_truck': ('Lastwagen von oben, fährt nach rechts (160x48)', 'Truck from above, driving right (160x48)'),
    'cross_log_s': ('Kurzer Baumstamm im Fluss (64 breit)', 'Short floating log (64 wide)'),
    'cross_log_l': ('Langer Baumstamm im Fluss (160 breit)', 'Long floating log (160 wide)'),
    'cross_lily': ('Seerosenblatt', 'Lily pad'),
    'cross_road': ('Asphalt mit Mittelstreifen (Kachel 64x64)', 'Asphalt with a dashed line (tile 64x64)'),
    'cross_grass': ('Gras am Ufer (Kachel 64x64)', 'Grass bank (tile 64x64)'),
    'cross_water': ('Wasser (Kachel 64x64)', 'Water (tile 64x64)'),
    'cross_goal_home': ('Zielbucht mit Seerose im Ufer (Kachel 64x64)', 'Home bay with a lily pad in the bank (tile 64x64)'),
    'cross_fly': ('Fliege für Bonuspunkte', 'Bonus fly'),
    'cross_snake': ('Grüne Schlange von oben, nach rechts (96x32)', 'Green snake from above, heading right (96x32)'),
    'fish_item': ('Fisch zum Einsammeln', 'Fish to collect'),
    'gem_blue': ('Blauer Edelstein von oben', 'Blue gem from above'),
    'gem_red': ('Roter Edelstein von oben', 'Red gem from above'),
    'gem_green': ('Grüner Edelstein von oben', 'Green gem from above'),
    'battery': ('Batterie', 'Battery'),
    'cheese': ('Stück Käse', 'Piece of cheese'),
}
for n in (1, 2, 3):
    DESC[f'bomb_{n}'] = (f'Runde Bombe mit Zündschnur, pulsiert, Bild {n} von 3', f'Round fuse bomb pulsing, frame {n} of 3')
    DESC[f'cross_car_{n}'] = (f'Auto von oben, fährt nach rechts, Sorte {n} (96x48)', f'Car from above, driving right, kind {n} (96x48)')
    for k, de, en in (('arrow', 'Bogenturm', 'Archer tower'), ('cannon', 'Kanonenturm', 'Cannon tower'), ('ice', 'Frostturm', 'Frost tower')):
        DESC[f'td_tower_{k}_{n}'] = (f'{de} von oben, Stufe {n} von 3', f'{en} from above, level {n} of 3')
for n in (1, 2):
    DESC[f'cross_turtle_{n}'] = (f'Schwimmende Schildkröte von oben, nach rechts, Bild {n} von 2', f'Swimming turtle from above, heading right, frame {n} of 2')
for d, de, en in (('h', 'waagrecht', 'horizontal'), ('v', 'senkrecht', 'vertical'), ('ne', 'Kurve oben-rechts', 'curve top-right'),
                  ('nw', 'Kurve oben-links', 'curve top-left'), ('se', 'Kurve unten-rechts', 'curve bottom-right'), ('sw', 'Kurve unten-links', 'curve bottom-left')):
    DESC[f'td_road_{d}'] = (f'Weg für die Monster, {de} (Kachel 64x64, schließt an)', f'Monster path, {en} (tile 64x64, connects)')
for crop, de, en in (('carrot', 'Karotte', 'Carrot'), ('tomato', 'Tomate', 'Tomato'), ('pumpkin', 'Kürbis', 'Pumpkin'), ('wheat', 'Weizen', 'Wheat')):
    for n, sde, sen in ((1, 'Saat', 'seed'), (2, 'Keimling', 'sprout'), (3, 'wächst', 'growing'), (4, 'reif', 'ready')):
        DESC[f'farm_{crop}_{n}'] = (f'{de}, Stufe {n} von 4: {sde}', f'{en}, stage {n} of 4: {sen}')

ORDER = (['bomb_1', 'bomb_2', 'bomb_3', 'bomb_blast_center', 'bomb_blast_h', 'bomb_blast_v', 'bomb_blast_end_up', 'bomb_blast_end_down',
          'bomb_blast_end_left', 'bomb_blast_end_right', 'bomb_block_soft', 'bomb_block_hard', 'bomb_power_range', 'bomb_power_count',
          'bomb_power_speed']
         + [f'td_tower_{k}_{n}' for k in ('arrow', 'cannon', 'ice') for n in (1, 2, 3)]
         + ['td_base', 'td_spawn'] + [f'td_road_{d}' for d in ('h', 'v', 'ne', 'nw', 'se', 'sw')]
         + ['td_shot_arrow', 'td_shot_ball', 'td_shot_ice', 'td_coin', 'td_heart', 'td_build_spot', 'td_range_ring',
            'td_enemy_1', 'td_enemy_2', 'td_enemy_3', 'td_boss']
         + [f'farm_{c}_{n}' for c in ('carrot', 'tomato', 'pumpkin', 'wheat') for n in range(1, 5)]
         + ['farm_seeds', 'farm_watering_can', 'farm_hoe', 'farm_basket', 'farm_scarecrow', 'farm_chicken', 'farm_cow', 'farm_pig',
            'farm_barn', 'farm_fence_h', 'farm_fence_v', 'farm_well', 'farm_coin']
         + ['cross_frog_up', 'cross_frog_down', 'cross_frog_left', 'cross_frog_right', 'cross_frog_hop_up', 'cross_car_1', 'cross_car_2',
            'cross_car_3', 'cross_truck', 'cross_log_s', 'cross_log_l', 'cross_turtle_1', 'cross_turtle_2', 'cross_lily', 'cross_road',
            'cross_grass', 'cross_water', 'cross_goal_home', 'cross_fly', 'cross_snake']
         + ['fish_item', 'gem_blue', 'gem_red', 'gem_green', 'battery', 'cheese'])

TAGS = [('bomb_block', ['bomb', 'tile']), ('bomb_blast', ['bomb', 'effect']), ('bomb_power', ['bomb', 'item']), ('bomb_', ['bomb']),
        ('td_tower', ['tower_defense', 'tower']), ('td_road', ['tower_defense', 'tile']), ('td_enemy', ['tower_defense', 'enemy']),
        ('td_boss', ['tower_defense', 'enemy']), ('td_shot', ['tower_defense', 'projectile']), ('td_coin', ['tower_defense', 'item']),
        ('td_heart', ['tower_defense', 'item']), ('td_', ['tower_defense']),
        ('farm_carrot', ['farm', 'plant']), ('farm_tomato', ['farm', 'plant']), ('farm_pumpkin', ['farm', 'plant']),
        ('farm_wheat', ['farm', 'plant']), ('farm_chicken', ['farm', 'animal']), ('farm_cow', ['farm', 'animal']),
        ('farm_pig', ['farm', 'animal']), ('farm_fence', ['farm', 'tile']), ('farm_coin', ['farm', 'item']), ('farm_', ['farm']),
        ('cross_frog', ['crossing', 'player']), ('cross_car', ['crossing', 'vehicle']), ('cross_truck', ['crossing', 'vehicle']),
        ('cross_road', ['crossing', 'tile']), ('cross_grass', ['crossing', 'tile']), ('cross_water', ['crossing', 'tile']),
        ('cross_goal', ['crossing', 'tile']), ('cross_snake', ['crossing', 'enemy']), ('cross_', ['crossing']),
        ('gem_', ['item']), ('', ['item'])]


# ---------------------------------------------------------------- cutting helpers
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


def scaled(im, s):
    return unpremul_resize(im, (max(1, round(im.width * s)), max(1, round(im.height * s))))


def fit(im, box, pad=2):
    w, h = box
    im = scaled(im, min((w - 2 * pad) / im.width, (h - 2 * pad) / im.height))
    canvas = Image.new('RGBA', (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
    canvas.paste(im, (pad, pad), im)
    return canvas


def exact(im, box):
    """Tile: cut the soft rim, stretch to the box, make it opaque."""
    im = im.crop((2, 2, im.width - 2, im.height - 2))
    a = np.asarray(unpremul_resize(im, box)).copy()
    a[..., 3] = 255
    return Image.fromarray(a, 'RGBA')


def on_canvas(im, box, valign='bottom', pad=2):
    w, h = box
    c = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    y = h - pad - im.height if valign == 'bottom' else (h - im.height) // 2
    c.paste(im, ((w - im.width) // 2, y), im)
    return c


def save(im, name):
    a = np.asarray(im.convert('RGBA')).copy()
    a[a[..., 3] < 8] = 0  # clean invisible pixels for better compression
    path = os.path.join(HERE, name + '.png')
    Image.fromarray(a, 'RGBA').save(path, optimize=True)
    return path


def cut(sheet):
    s = SHEETS[sheet]
    crops = components(os.path.join(WORK, sheet + '.png'), s.get('found', len(s['items'])), grow=s.get('grow', 8))
    if s.get('pick'):
        crops = [crops[k] for k in s['pick']]
    kind = s.get('cut')
    items = s['items']
    if kind == 'crop':
        # one scale for the four stages, so the soil mound stays the same size; bottom aligned on 64x64
        sc = min(60 / max(c.width for c in crops), 60 / max(c.height for c in crops))
        for (name, box, _), im in zip(items, crops):
            save(on_canvas(scaled(im, sc), box), name)
        return
    if kind == 'towers':
        # levels grow a little: 52, 58, 62 px on a common 64x64 canvas, centred
        for (name, box, _), im in zip(items, crops):
            lvl = int(name[-1])
            side = (52, 58, 62)[lvl - 1]
            save(on_canvas(scaled(im, side / max(im.width, im.height)), box, 'center'), name)
        return
    if kind == 'frog':
        sc = 44 / max(max(c.width, c.height) for c in crops)
        up = on_canvas(scaled(crops[0], sc), (48, 48), 'center')
        save(up, 'cross_frog_up')
        for d, rot in (('left', 90), ('down', 180), ('right', 270)):
            save(up.rotate(rot), 'cross_frog_' + d)
        hop = scaled(crops[1], sc)
        save(on_canvas(hop, (max(48, hop.width + 4), max(48, hop.height + 4)), 'center'), 'cross_frog_hop_up')
        return
    if kind == 'turtle':
        for (name, box, mode), im in zip(items[:2], crops[:2]):
            save(fit(im, box), name)
        t = crops[2:4]
        sc = 52 / max(max(c.width, c.height) for c in t)
        for (name, box, _), im in zip(items[2:], t):
            save(on_canvas(scaled(im, sc), box, 'center'), name)
        return
    for (name, box, mode), im in zip(items, crops):
        if name == 'bomb_src':
            bombs(im)
            continue
        save(exact(im, box) if mode == 'exact' else fit(im, box), name)


def bombs(im):
    """bomb_1..3 from one drawn bomb: it swells and glows a little warmer each frame (same 64x64 canvas)."""
    base = scaled(im, 56 / max(im.width, im.height))
    for n, (s, warm) in enumerate(((0.90, 0.0), (0.95, 0.12), (1.0, 0.25)), 1):
        b = scaled(base, s)
        a = np.asarray(b).astype(np.float32)
        # tint the dark body towards red
        dark = (a[..., :3].max(-1) < 90)[..., None]
        tint = a[..., :3] * (1 - warm) + np.array([200, 40, 40], np.float32) * warm
        a[..., :3] = np.where(dark, tint, a[..., :3])
        save(on_canvas(Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGBA'), (64, 64), 'center'), f'bomb_{n}')


# ---------------------------------------------------------------- drawn pieces
SS = 4
N = 64 * SS


def _done(im, size=(64, 64)):
    return im.resize(size, Image.LANCZOS)


# blast: three nested bands (orange, yellow, white core) with wavy edges; the waves repeat every 32 px,
# so pieces join seamlessly in both directions
FIRE = [((242, 106, 46), 26), ((255, 186, 60), 19), ((255, 244, 200), 10)]  # colour, half width in px


def _band(x, half, phase=0.0):
    return half + 2.0 * math.sin(2 * math.pi * x / 32 + phase)


def blast_h(end=None):
    """Horizontal band; end='right' makes a rounded tip at the right (the band starts at the left edge)."""
    im = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for col, half in FIRE:
        stop = 64
        if end == 'right':
            stop = 64 - (26 - half) - 8  # inner bands end earlier
        pts_top, pts_bot = [], []
        for k in range(0, int(stop * 4) + 1):
            x = k / 4
            hw = _band(x, half)
            if end == 'right' and x > stop - half:  # taper to a round tip
                t = (x - (stop - half)) / half
                hw = hw * math.sqrt(max(0.0, 1 - t * t))
            pts_top.append((x * SS, (32 - hw) * SS))
            pts_bot.append((x * SS, (32 + hw) * SS))
        d.polygon(pts_top + pts_bot[::-1], fill=col)
    return im


def blast_center():
    im = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for col, half in FIRE:
        for rot in (0, 1):
            pts_top, pts_bot = [], []
            for k in range(0, 257):
                x = k / 4
                hw = _band(x, half)
                pts_top.append((x, 32 - hw))
                pts_bot.append((x, 32 + hw))
            pts = pts_top + pts_bot[::-1]
            if rot:
                pts = [(y, x) for x, y in pts]
            d.polygon([(x * SS, y * SS) for x, y in pts], fill=col)
        r = half + 7
        d.ellipse([(32 - r) * SS, (32 - r) * SS, (32 + r) * SS, (32 + r) * SS], fill=col)
    return im


def road_tile(kind):
    """Sand path on grass, 40 px wide, centred; kind h, v or a curve ne/nw/se/sw (joins the two named sides)."""
    im = Image.new('RGBA', (N, N), GRASS + (255,))
    d = ImageDraw.Draw(im)
    tufts(d, kind)
    edge, path = (196, 160, 104), (226, 196, 138)
    if kind in ('h', 'v'):
        for col, half in ((edge, 21), (path, 18)):
            if kind == 'h':
                d.rectangle([0, (32 - half) * SS, N, (32 + half) * SS - 1], fill=col)
            else:
                d.rectangle([(32 - half) * SS, 0, (32 + half) * SS - 1, N], fill=col)
    else:
        cx = 64 if 'e' in kind else 0
        cy = 0 if 'n' in kind else 64
        for col, r in ((edge, 53), (path, 50), (edge, 14), (GRASS, 11)):
            d.ellipse([(cx - r) * SS, (cy - r) * SS, (cx + r) * SS, (cy + r) * SS], fill=col + (255,))
    # pebbles inside the path (never on the tile border)
    peb = (200, 170, 118)
    spots = {'h': [(14, 26), (40, 38), (52, 24)], 'v': [(26, 12), (38, 40), (24, 52)]}
    if kind in spots:
        pts = spots[kind]
    else:
        cx = 64 if 'e' in kind else 0
        cy = 0 if 'n' in kind else 64
        pts = []
        for ang, r in ((20, 26), (50, 38), (75, 30)):
            a = math.radians(ang)
            sx = -1 if cx == 64 else 1
            sy = 1 if cy == 0 else -1
            pts.append((cx + sx * r * math.cos(a), cy + sy * r * math.sin(a)))
    for x, y in pts:
        d.ellipse([(x - 2) * SS, (y - 1.5) * SS, (x + 2) * SS, (y + 1.5) * SS], fill=peb)
    return im


GRASS, GRASS_D = (124, 186, 82), (104, 166, 66)


def tufts(d, seed):
    rng = np.random.default_rng(abs(hash(str(seed))) % 1000 if False else sum(map(ord, str(seed))))
    for _ in range(6):
        x, y = rng.integers(6, 58, 2)
        for dx in (-2, 0, 2):
            d.ellipse([(x + dx - 0.8) * SS, (y - 3.5) * SS, (x + dx + 0.8) * SS, (y + 0.5) * SS], fill=GRASS_D)


def range_ring():
    n = 192 * SS
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse([2 * SS, 2 * SS, n - 2 * SS, n - 2 * SS], fill=(255, 255, 255, 46), outline=(255, 255, 255, 200), width=3 * SS)
    return im.resize((192, 192), Image.LANCZOS)


def fence(vertical):
    """Wooden fence piece seen from above at a slant: rails run edge to edge, one post in the middle."""
    im = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    wood, dark, light = (186, 128, 74), (150, 98, 54), (214, 160, 102)
    if not vertical:
        for y in (24, 38):
            d.rectangle([0, y * SS, N, (y + 5) * SS - 1], fill=dark)
            d.rectangle([0, y * SS, N, (y + 2) * SS - 1], fill=wood)
        for x in (32,):
            d.rounded_rectangle([(x - 5) * SS, 14 * SS, (x + 5) * SS, 50 * SS], radius=3 * SS, fill=wood)
            d.rounded_rectangle([(x - 5) * SS, 14 * SS, (x + 5) * SS, 20 * SS], radius=3 * SS, fill=light)
    else:
        for x in (27, 34):
            d.rectangle([x * SS, 0, (x + 4) * SS - 1, N], fill=dark)
            d.rectangle([x * SS, 0, (x + 2) * SS - 1, N], fill=wood)
        d.rounded_rectangle([25 * SS, 25 * SS, 39 * SS, 39 * SS], radius=3 * SS, fill=wood)
        d.rounded_rectangle([27 * SS, 27 * SS, 37 * SS, 35 * SS], radius=2 * SS, fill=light)
    return im


WATER, WATER_L, ASPHALT, ASPHALT_D = (84, 160, 222), (140, 198, 240), (92, 98, 110), (82, 88, 100)


def cross_road():
    im = Image.new('RGBA', (N, N), ASPHALT + (255,))
    d = ImageDraw.Draw(im)
    for x, y in ((10, 12), (46, 50), (54, 14), (20, 44)):
        d.ellipse([x * SS, y * SS, (x + 3) * SS, (y + 2) * SS], fill=ASPHALT_D)
    d.rounded_rectangle([16 * SS, 30 * SS, 48 * SS, 34 * SS], radius=2 * SS, fill=(244, 244, 236))  # dashes every 64 px
    return im


def cross_grass():
    im = Image.new('RGBA', (N, N), GRASS + (255,))
    tufts(ImageDraw.Draw(im), 'cross')
    return im


def wavelets(d, pts):
    for x, y in pts:
        d.arc([x * SS, y * SS, (x + 12) * SS, (y + 6) * SS], 200, 340, fill=WATER_L, width=int(1.6 * SS))


def cross_water():
    im = Image.new('RGBA', (N, N), WATER + (255,))
    wavelets(ImageDraw.Draw(im), ((6, 10), (36, 20), (14, 40), (44, 50)))
    return im


def cross_goal_home():
    """Grass tile with a bay of water open to the bottom edge, a lily pad with a pink flower in it."""
    im = cross_grass()
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([12 * SS, 12 * SS, 52 * SS, 72 * SS], radius=20 * SS, fill=WATER)
    wavelets(d, ((16, 52),))
    # lily pad with a wedge cut out
    d.pieslice([19 * SS, 22 * SS, 45 * SS, 48 * SS], 300, 250, fill=(98, 170, 74))
    d.pieslice([22 * SS, 25 * SS, 42 * SS, 45 * SS], 300, 250, fill=(116, 188, 88))
    for a in range(0, 360, 60):
        r = math.radians(a)
        x, y = 32 + 4 * math.cos(r), 35 + 4 * math.sin(r)
        d.ellipse([(x - 3.5) * SS, (y - 3.5) * SS, (x + 3.5) * SS, (y + 3.5) * SS], fill=(242, 140, 180))
    d.ellipse([29.5 * SS, 32.5 * SS, 34.5 * SS, 37.5 * SS], fill=(255, 214, 90))
    return im


def tiles():
    save(_done(blast_center()), 'bomb_blast_center')
    h = _done(blast_h())
    save(h, 'bomb_blast_h')
    save(h.rotate(90), 'bomb_blast_v')
    r = _done(blast_h('right'))
    save(r, 'bomb_blast_end_right')
    save(r.rotate(90), 'bomb_blast_end_up')
    save(r.rotate(180), 'bomb_blast_end_left')
    save(r.rotate(270), 'bomb_blast_end_down')
    for k in ('h', 'v', 'ne', 'nw', 'se', 'sw'):
        save(_done(road_tile(k)), 'td_road_' + k)
    save(range_ring(), 'td_range_ring')
    save(_done(fence(False)), 'farm_fence_h')
    save(_done(fence(True)), 'farm_fence_v')
    for f in (cross_road, cross_grass, cross_water, cross_goal_home):
        save(_done(f()), f.__name__)


# ---------------------------------------------------------------- pack, contact, main
def tags(name):
    for p, t in TAGS:
        if name.startswith(p):
            return ['grid'] + t
    return ['grid']


def write_pack():
    assets = [dict(name=n, file=n + '.png', tags=tags(n), de=DESC[n][0], en=DESC[n][1]) for n in ORDER]
    pack = dict(pack='grid_action', title=dict(de='Raster-Action', en='Grid action'), format='png', assets=assets)
    json.dump(pack, open(os.path.join(HERE, 'pack.json'), 'w'), ensure_ascii=False, indent=2)
    print(len(assets), 'assets')


def contact(prefix=''):
    names = [n for n in ORDER if n.startswith(prefix) and os.path.exists(os.path.join(HERE, n + '.png'))]
    ims = [Image.open(os.path.join(HERE, n + '.png')).convert('RGBA') for n in names]
    cell, cols = 150, 10
    rows = (len(ims) + cols - 1) // cols
    for bg, tag in (((40, 40, 48), 'dark'), ((245, 245, 240), 'light')):
        sheet = Image.new('RGBA', (cols * cell, rows * cell), bg + (255,))
        for k, im in enumerate(ims):
            if im.width > cell - 6:
                im = im.resize((cell - 6, round(im.height * (cell - 6) / im.width)), Image.LANCZOS)
            x, y = (k % cols) * cell, (k // cols) * cell
            sheet.paste(im, (x + (cell - im.width) // 2, y + (cell - im.height) // 2), im)
        sheet.save(os.path.join(WORK, f'contact_{prefix or "all"}_{tag}.png'))


def run_gen(sheet):
    os.makedirs(WORK, exist_ok=True)
    return sheet, gen(os.path.join(WORK, sheet), SHEETS[sheet]['prompt'] + TAIL, STYLE)


if __name__ == '__main__':
    cmd, args = sys.argv[1], sys.argv[2:]
    if args == ['all']:
        args = list(SHEETS)
    if cmd == 'gen':
        with ThreadPoolExecutor(8) as ex:
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
        contact(args[0] if args else '')
