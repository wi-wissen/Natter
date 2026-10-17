"""Synthesises the small sound effects in packages/assets/sounds (CC0, deterministic): python3 scripts/gen-sounds.py"""
import json, math, os, random, struct, wave

RATE = 22050
OUT = os.path.join(os.path.dirname(__file__), '..', 'packages', 'assets', 'sounds')


def env(i, n, a=0.01, r=0.3):
    t = i / RATE
    d = n / RATE
    att = min(1.0, t / a) if a else 1.0
    rel = min(1.0, (d - t) / r) if r else 1.0
    return max(0.0, min(att, rel))


def tone(freq, dur, shape='sine', vol=0.6, a=0.005, r=0.1, slide=0.0, vib=0.0):
    n = int(RATE * dur)
    out = []
    ph = 0.0
    for i in range(n):
        f = freq + slide * (i / n) + (math.sin(i / RATE * 40) * vib if vib else 0)
        ph += f / RATE
        x = math.sin(2 * math.pi * ph)
        if shape == 'square':
            x = 1.0 if (ph % 1.0) < 0.5 else -1.0
            x *= 0.6
        elif shape == 'saw':
            x = 2 * (ph % 1.0) - 1
            x *= 0.6
        out.append(x * vol * env(i, n, a, r))
    return out


def noise(dur, vol=0.5, a=0.002, r=0.2, lp=0.3, seed=1, decay=3.0):
    rnd = random.Random(seed)
    n = int(RATE * dur)
    out = []
    y = 0.0
    for i in range(n):
        y += lp * (rnd.uniform(-1, 1) - y)
        out.append(y * vol * env(i, n, a, r) * math.exp(-decay * i / n))
    return out


def mix(*tracks):
    n = max(len(t) for t in tracks)
    return [sum(t[i] for t in tracks if i < len(t)) for i in range(n)]


def seq(*parts):
    out = []
    for p in parts:
        out += p
    return out


def silence(d):
    return [0.0] * int(RATE * d)


SOUNDS = {
    'platsch': (noise(0.35, 0.9, lp=0.25, seed=3, decay=4) , {'de': 'Wasserplatscher', 'en': 'Water splash', 'tags': ['water']}),
    'coin': (seq(tone(988, 0.07, 'square', 0.35, r=0.02), tone(1319, 0.28, 'square', 0.35, a=0.002, r=0.25)), {'de': 'Münze einsammeln', 'en': 'Collect a coin', 'tags': ['pickup']}),
    'jump': (tone(300, 0.22, 'square', 0.35, slide=500, r=0.08), {'de': 'Sprung', 'en': 'Jump', 'tags': ['move']}),
    'hit': (mix(noise(0.18, 0.7, lp=0.5, seed=5, decay=5), tone(160, 0.18, 'square', 0.35, slide=-90, r=0.05)), {'de': 'Treffer', 'en': 'Hit', 'tags': ['damage']}),
    'explosion': (mix(noise(0.9, 0.9, lp=0.12, seed=7, decay=3), tone(90, 0.8, 'saw', 0.3, slide=-60, r=0.4)), {'de': 'Explosion', 'en': 'Explosion', 'tags': ['damage']}),
    'laser': (tone(1400, 0.2, 'saw', 0.3, slide=-1100, r=0.05), {'de': 'Laserschuss', 'en': 'Laser shot', 'tags': ['shoot']}),
    'powerup': (seq(*[tone(f, 0.07, 'square', 0.3, r=0.02) for f in (523, 659, 784, 1047, 1319)]), {'de': 'Verstärkung', 'en': 'Power up', 'tags': ['pickup']}),
    'click': (tone(1800, 0.03, 'square', 0.3, a=0.001, r=0.02), {'de': 'Klick', 'en': 'Click', 'tags': ['ui']}),
    'blip': (tone(660, 0.08, 'sine', 0.5, r=0.04), {'de': 'Piepton', 'en': 'Blip', 'tags': ['ui']}),
    'win': (seq(*[tone(f, d, 'square', 0.3, r=0.05) for f, d in ((523, .12), (659, .12), (784, .12), (1047, .4))]), {'de': 'Gewonnen', 'en': 'You win', 'tags': ['jingle']}),
    'lose': (seq(*[tone(f, d, 'saw', 0.3, r=0.08) for f, d in ((392, .18), (349, .18), (330, .18), (262, .5))]), {'de': 'Verloren', 'en': 'You lose', 'tags': ['jingle']}),
    'bounce': (tone(200, 0.25, 'sine', 0.6, slide=250, r=0.12, vib=40), {'de': 'Federn', 'en': 'Bounce', 'tags': ['move']}),
    'step': (noise(0.07, 0.6, lp=0.2, seed=11, decay=4), {'de': 'Schritt', 'en': 'Footstep', 'tags': ['move']}),
    'quack': (mix(tone(420, 0.16, 'saw', 0.35, slide=-120, vib=30, r=0.05), tone(840, 0.16, 'saw', 0.15, slide=-240, vib=60, r=0.05)), {'de': 'Quak', 'en': 'Quack', 'tags': ['animal']}),
}

os.makedirs(OUT, exist_ok=True)
manifest = {'pack': 'sounds', 'title': {'de': 'Klänge', 'en': 'Sounds'}, 'sounds': []}
for name, (samples, meta) in SOUNDS.items():
    peak = max(1e-9, max(abs(x) for x in samples))
    scale = min(1.0, 0.85 / peak)
    with wave.open(os.path.join(OUT, name + '.wav'), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, x * scale)) * 32767)) for x in samples))
    manifest['sounds'].append({'name': name, 'file': name + '.wav', 'tags': meta['tags'], 'de': meta['de'], 'en': meta['en']})
with open(os.path.join(OUT, 'sounds.json'), 'w', encoding='utf-8') as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)
    f.write('\n')
