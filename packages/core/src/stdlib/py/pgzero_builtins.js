// pgzero_builtins: the names a Pygame Zero program gets (pgzero/builtins.py plus screen). `from pgzero_builtins
// import *` or `import pgzrun` brings them in; a host in game mode predefines them (installPgzero in stdlib/pgzero.js).
export default String.raw`
import pgzero_clock as clock
from pgzero_audio import music, tone, sounds
from pgzero_actor import Actor
from pgzero_keys import keyboard, keys, keymods, mouse
from pgzero_animation import animate
from pgzero_rect import Rect, ZRect
from pgzero_screen import images, screen


def exit():
    """End the game."""
    raise SystemExit()


__all__ = ["clock", "music", "tone", "sounds", "Actor", "keyboard", "keys", "keymods", "mouse", "animate", "Rect",
           "ZRect", "images", "screen", "exit"]


def _names():
    return {"clock": clock, "music": music, "tone": tone, "sounds": sounds, "Actor": Actor, "keyboard": keyboard,
            "keys": keys, "keymods": keymods, "mouse": mouse, "animate": animate, "Rect": Rect, "ZRect": ZRect,
            "images": images, "screen": screen, "exit": exit}
`;
