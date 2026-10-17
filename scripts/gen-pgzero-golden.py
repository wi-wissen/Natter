#!/usr/bin/env python3
"""Golden data for Natter's Pygame Zero modules, made with the real pgzero and pygame.

Usage (a Python with pgzero and pygame, e.g. a venv: python3 -m venv /tmp/pgz && /tmp/pgz/bin/pip install pgzero pygame):
  /tmp/pgz/bin/python scripts/gen-pgzero-golden.py

It
  1. writes the test images (packages/core/test/cases/images/*.png) and sounds (cases/sounds/*.wav),
  2. runs every packages/core/test/cases/pgz_*.py with pgzero and writes its .out (with an x.frames file through
     scripts/pgzero-frames.py, frame by frame with scripted input),
  3. writes packages/core/test/data/pgzero-golden.json: pygame's colour table and Color parsing, the key codes,
     sizes of rotated images (pygame.transform.rotate) and Rect.fit/scale_by on random rectangles.
Runs headless (SDL dummy drivers).
"""
import glob
import json
import os
import random
import subprocess
import sys
import wave

os.environ.setdefault('SDL_VIDEODRIVER', 'dummy')
os.environ.setdefault('SDL_AUDIODRIVER', 'dummy')
os.environ.setdefault('PYGAME_HIDE_SUPPORT_PROMPT', '1')

try:
    import pygame
    import pgzero
    from pgzero.constants import keys, keymods, mouse
except ImportError:  # pragma: no cover
    sys.exit('needs pgzero and pygame: python3 -m venv /tmp/pgz && /tmp/pgz/bin/pip install pgzero pygame')

HERE = os.path.dirname(os.path.abspath(__file__))
TEST = os.path.join(HERE, '..', 'packages', 'core', 'test')
CASES = os.path.join(TEST, 'cases')

IMAGES = {'alien': (66, 92), 'box': (40, 30), 'tall': (11, 25), 'dot': (1, 1), 'wide': (101, 7)}
SOUNDS = {'eep': 0.5, 'boom': 1.25}


def write_assets():
    os.makedirs(os.path.join(CASES, 'images'), exist_ok=True)
    os.makedirs(os.path.join(CASES, 'sounds'), exist_ok=True)
    for name, size in IMAGES.items():
        s = pygame.Surface(size)
        s.fill((200, 80, 40))
        pygame.image.save(s, os.path.join(CASES, 'images', name + '.png'))
    for name, secs in SOUNDS.items():
        w = wave.open(os.path.join(CASES, 'sounds', name + '.wav'), 'wb')
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(22050)
        w.writeframes(b'\x00\x00' * int(22050 * secs))
        w.close()


def run_cases():
    for py in sorted(glob.glob(os.path.join(CASES, 'pgz_*.py'))):
        frames = py[:-3] + '.frames'
        if os.path.exists(frames):
            args = [sys.executable, '-I', '-W', 'ignore', os.path.join(HERE, 'pgzero-frames.py'), py, frames]
        else:
            args = [sys.executable, '-I', '-W', 'ignore', py]
        out = subprocess.run(args, capture_output=True, text=True, check=True, cwd='/').stdout
        with open(py[:-3] + '.out', 'w') as f:
            f.write(out)
        print(os.path.basename(py), len(out.splitlines()), 'lines')


def color_or_error(*args):
    try:
        return list(pygame.Color(*args))
    except Exception as e:
        return type(e).__name__ + ': ' + str(e)


def golden():
    from pygame.colordict import THECOLORS
    r = random.Random(20261017)
    color_inputs = [['red'], ['Dark Blue'], ['GREY50'], ['light goldenrod yellow'], ['#ff8000'], ['#FF800080'],
                    ['0x10ff20'], ['0x10ff2040'], ['#12345'], ['#1234567'], ['0X10ff20'], ['nocolor'], [''],
                    [0x11223344], [0], [4294967295], [[1, 2, 3]], [[1, 2, 3, 4]], [[255.9, 0, 0]], [[256, 0, 0]],
                    [[-1, 0, 0]], [[1, 2]], [1, 2, 3], [1, 2, 3, 4], [255, 0, 0, 300], ['#gg0000'], ['white smoke']]
    rotations = []
    for i in range(2000):
        w = r.choice([1, 2, 3, 7, 10, 11, 25, 40, 64, 66, 92, 101, 255, r.randint(1, 400)])
        h = r.choice([1, 2, 5, 7, 16, 25, 30, 92, 128, r.randint(1, 400)])
        angle = r.choice([0, 90, 180, 270, -90, 360, 450, -720, 45, 30, 60, 1, 89, 91, 179.5, 0.001, 1e-7,
                          round(r.uniform(-720, 720), r.randint(0, 6)), r.uniform(-1000, 1000)])
        size = pygame.transform.rotate(pygame.Surface((w, h)), angle).get_size()
        rotations.append([w, h, angle, list(size)])
    rects = []
    for i in range(1500):
        a = pygame.Rect(r.randint(-50, 50), r.randint(-50, 50), r.randint(-60, 60), r.randint(-60, 60))
        b = pygame.Rect(r.randint(-50, 50), r.randint(-50, 50), r.randint(-60, 60), r.randint(-60, 60))
        fx = r.choice([0.5, 2, 1.5, 0.1, r.uniform(0, 5), r.uniform(-3, 3), 1 / 3])
        fy = r.choice([0, 1, 0.25, r.uniform(0, 5)])
        rects.append([list(a), list(b), list(a.fit(b)), fx, fy, list(a.scale_by(fx, fy))])
    data = {
        'pygame': pygame.version.ver,
        'pgzero': pgzero.__version__,
        'colors': {k: list(v) for k, v in THECOLORS.items()},
        'colorInputs': [[args, color_or_error(*args)] for args in color_inputs],
        'keys': {name: m.value for name, m in keys.__members__.items()},
        'keymods': {name: m.value for name, m in keymods.__members__.items()},
        'mouse': {name: m.value for name, m in mouse.__members__.items()},
        'rotations': rotations,
        'rects': rects,
    }
    with open(os.path.join(TEST, 'data', 'pgzero-golden.json'), 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    print('pgzero-golden.json:', len(rotations), 'rotations,', len(rects), 'rects')


if __name__ == '__main__':
    write_assets()
    run_cases()
    golden()
