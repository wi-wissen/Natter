#!/usr/bin/env python3
"""Runs a Pygame Zero program with the real pgzero/pygame, frame by frame with scripted input (reference for Natter).

Usage: python pgzero-frames.py game.py game.frames

game.frames is JSON: [{"dt": 0.016, "events": [["key_down", 97, 0, "a", 4], ["mouse_down", [10, 20], 1], ...]}, ...]
with the event tuples of Natter's frame driver (pgzero_main.js). The program runs like `pgzrun game.py`; before every
frame "--- frame N" is printed. Needs pgzero and pygame; runs headless (SDL dummy drivers).
"""
import json
import os
import sys
from types import ModuleType

os.environ.setdefault('SDL_VIDEODRIVER', 'dummy')
os.environ.setdefault('SDL_AUDIODRIVER', 'dummy')
os.environ.setdefault('PYGAME_HIDE_SUPPORT_PROMPT', '1')

import pygame  # noqa: E402
import pgzero.runner  # noqa: E402
from pgzero import constants  # noqa: E402
from pgzero.game import PGZeroGame  # noqa: E402


def to_event(ev):
    kind = ev[0]
    if kind in ('key_down', 'key_up'):
        names = ('key', 'mod', 'unicode', 'scancode')
        fields = dict(zip(names, ev[1:]))
        fields.setdefault('unicode', '')
        fields.setdefault('scancode', 0)
        return pygame.event.Event(pygame.KEYDOWN if kind == 'key_down' else pygame.KEYUP, fields)
    if kind in ('mouse_down', 'mouse_up'):
        return pygame.event.Event(pygame.MOUSEBUTTONDOWN if kind == 'mouse_down' else pygame.MOUSEBUTTONUP,
                                  pos=tuple(ev[1]), button=ev[2])
    if kind == 'mouse_move':
        return pygame.event.Event(pygame.MOUSEMOTION, pos=tuple(ev[1]), rel=tuple(ev[2]), buttons=tuple(ev[3]))
    if kind == 'music_end':
        return pygame.event.Event(constants.MUSIC_END)
    if kind == 'quit':
        return pygame.event.Event(pygame.QUIT)
    raise ValueError(kind)


def main(path, frames_path):
    with open(frames_path) as f:
        frames = json.load(f)
    with open(path) as f:
        src = f.read()
    code = compile(src, os.path.basename(path), 'exec', dont_inherit=True)
    mod = ModuleType('__main__')
    mod.__file__ = path
    sys.modules['__main__'] = mod
    sys._pgzrun = True
    pgzero.runner.prepare_mod(mod)
    exec(code, mod.__dict__)

    state = {'i': 0}

    class FakeClock:
        def tick(self, fps=0):
            i = state['i']
            return round(frames[i]['dt'] * 1000) if i < len(frames) else 0

    def get_events():
        i = state['i']
        state['i'] += 1
        if i >= len(frames):
            return [pygame.event.Event(pygame.QUIT)]
        print('--- frame', i)
        return [to_event(e) for e in frames[i]['events']]

    pygame.time.Clock = FakeClock
    pygame.event.get = get_events
    PGZeroGame(mod).run()


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
