// pgzero_main: the game loop of Pygame Zero (pgzero/game.py PGZeroGame.mainloop), one iteration per call of frame().
// The host calls frame(events, dt) for every animation frame; everything that calls the program's functions
// (on_key_down, update, draw, ...) happens here, in Python.
//
// events: tuples collected by the host since the last frame
//   ("key_down", key, mod, unicode[, scancode])     ("key_up", key, mod[, unicode, scancode])
//   ("mouse_down", (x, y), button)                  ("mouse_up", (x, y), button)
//   ("mouse_move", (x, y), (dx, dy), (left, middle, right))
//   ("music_end",)                                  ("quit",)
// Returns True when draw() ran (the host shows the canvas), False when nothing changed, None after "quit".
export default String.raw`
import _pgz
import pgzero_clock
from pgzero_keys import keyboard, keys, mouse, keymods
from pgzero_screen import screen
from pgzero_audio import music
from pgzero_spellcheck import spellcheck

_cmd = _pgz.cmd
_main = _pgz.main_get

EVENT_HANDLERS = {
    "mouse_down": "on_mouse_down",
    "mouse_up": "on_mouse_up",
    "mouse_move": "on_mouse_move",
    "key_down": "on_key_down",
    "key_up": "on_key_up",
    "music_end": "on_music_end",
}

EVENT_FIELDS = {
    "mouse_down": ("pos", "button"),
    "mouse_up": ("pos", "button"),
    "mouse_move": ("pos", "rel", "buttons"),
    "key_down": ("key", "mod", "unicode", "scancode"),
    "key_up": ("key", "mod", "unicode", "scancode"),
    "music_end": (),
}


class Event:
    """An event as the hooks see it (pygame.event.Event): its fields are attributes."""

    def __init__(self, kind, fields):
        self.type = kind
        for k in fields:
            setattr(self, k, fields[k])

    def __getattr__(self, name):
        raise AttributeError("'pygame.event.Event' object has no attribute '" + name + "'")


def _event(ev):
    kind = ev[0]
    names = EVENT_FIELDS.get(kind, ())
    fields = {}
    for i, name in enumerate(names):
        if i + 1 < len(ev):
            fields[name] = ev[i + 1]
    if kind in ("key_down", "key_up"):
        fields.setdefault("unicode", "")
        fields.setdefault("scancode", 0)
    if "pos" in fields:
        fields["pos"] = tuple(fields["pos"])
    if "rel" in fields:
        fields["rel"] = tuple(fields["rel"])
    if "buttons" in fields:
        fields["buttons"] = tuple(fields["buttons"])
    return Event(kind, fields)


def _map_buttons(val):
    return {c for c, pressed in zip(list(mouse), val) if pressed}


EVENT_PARAM_MAPPERS = {
    "buttons": _map_buttons,
    "button": mouse,
    "key": keys,
}


def prepare_handler(handler):
    """A one-argument function handler(event) that passes the fields the program's function asks for by name."""
    param_names = _pgz.argnames(handler) or ()
    getters = []
    for name in param_names:
        getters.append((name, EVENT_PARAM_MAPPERS.get(name)))

    def new_handler(event):
        prepped = {}
        for name, mapper in getters:
            v = getattr(event, name)
            if mapper is not None:
                try:
                    v = mapper(v)
                except ValueError:
                    return None
            prepped[name] = v
        return handler(**prepped)

    return new_handler


class Game:
    def __init__(self):
        self.started = False
        self.width = None
        self.height = None
        self.title = None
        self.handlers = {}
        self.update = None
        self.draw = None
        self.need_redraw = True

    def reinit_screen(self):
        w = _main("WIDTH")
        h = _main("HEIGHT")
        title = _main("TITLE")
        if w is None:
            w = 800
        if h is None:
            h = 600
        if title is None:
            title = "Pygame Zero Game"
        changed = False
        if w != self.width or h != self.height or title != self.title:
            screen.width = w
            screen.height = h
            self.width = w
            self.height = h
            self.title = title
            _cmd("window", (w, h, str(title)))
        return changed

    def get_update_func(self):
        update = _main("update")
        if update is None:
            return None
        if len(_pgz.argnames(update) or ()) == 0:
            return lambda dt: update()
        return update

    def get_draw_func(self):
        draw = _main("draw")
        if draw is None:
            return lambda: None
        if len(_pgz.argnames(draw) or ()) != 0:
            raise TypeError("draw() must not take any arguments.")
        return draw

    def load_handlers(self):
        spellcheck(_pgz.main_vars())
        self.handlers = {}
        for kind, name in EVENT_HANDLERS.items():
            handler = _main(name)
            if callable(handler):
                self.handlers[kind] = prepare_handler(handler)

    def start(self):
        self.reinit_screen()
        self.update = self.get_update_func()
        self.draw = self.get_draw_func()
        self.load_handlers()
        self.started = True

    def dispatch_event(self, event):
        handler = self.handlers.get(event.type)
        if handler:
            self.need_redraw = True
            handler(event)

    def frame(self, events, dt):
        if not self.started:
            self.start()
        for ev in events:
            kind = ev[0]
            if kind == "quit":
                return None
            event = _event(ev)
            if kind == "key_down":
                if event.key == keys.Q and event.mod & (keymods.CTRL | keymods.META):
                    raise SystemExit(0)
                keyboard._press(event.key)
            elif kind == "key_up":
                keyboard._release(event.key)
            elif kind == "music_end":
                music._ended()
            self.dispatch_event(event)
        clock = pgzero_clock.clock
        clock.tick(dt)
        update = self.update
        if update:
            update(dt)
        screen_change = self.reinit_screen()
        if screen_change or update or clock.fired or self.need_redraw:
            self.draw()
            self.need_redraw = False
            return True
        return False


game = Game()


def start():
    """Read the window settings and the hooks (called by the host before the first frame, or by frame())."""
    if not game.started:
        game.start()


def frame(events, dt):
    """One iteration of the game loop (called by the host)."""
    return game.frame(events, dt)
`;
