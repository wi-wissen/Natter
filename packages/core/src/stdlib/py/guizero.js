// guizero: forms with the API of guizero 1.6 (https://lawsie.github.io/guizero/). The classes follow the real library
// closely (same defaults, getters, warnings and error messages); where guizero talks to tkinter, this module keeps a small
// stand-in (_Tk) that stores the tk options and tells the host about changes. Nothing visual is computed here except the
// logical layout (which children a container shows, in which order or grid cell); the host lays out and draws.
// Bridge and events: docs/FORMS-BRIDGE.md.

export default String.raw`
import os as _os
import _forms_host as _host

__version__ = "1.6.0"


class GUIZeroException(Exception):
    pass


class TclError(Exception):
    pass


# ---------------------------------------------------------------------------------------------------------------------
# Bridge state

_widgets = {}       # host id -> guizero object
_pending = []       # objects created but not yet sent to the host (sent with all their state at the next flush)
_pending_ids = set()
_dirty = []         # containers whose layout must be sent
_idle = []          # callbacks to run before the program waits again (like tk's idle tasks)
_timers = {}        # timer id -> (function, args, tk)
_next_id = [0]
_root = [None]      # the _Tk of the first App


def _new_id():
    _next_id[0] += 1
    return _next_id[0]


def _send(op, data):
    return _host.cmd(op, data)


def _set(hid, props):
    """Tell the host about changed properties (nothing to do while the widget waits to be created)."""
    if hid is None or hid in _pending_ids:
        return
    _send("set", {"id": hid, "props": props})


def _register(obj, tk, kind):
    hid = _new_id()
    tk.hid = hid
    tk.kind = kind
    _widgets[hid] = obj
    _pending.append(obj)
    _pending_ids.add(hid)
    return hid


def _mark_dirty(container):
    if container not in _dirty:
        _dirty.append(container)


def _flush():
    """Send what the host does not know yet: new widgets (with all their properties), then changed layouts."""
    while _pending:
        obj = _pending.pop(0)
        hid = obj.tk.hid
        _pending_ids.discard(hid)
        if obj.tk.destroyed or not hasattr(obj, "_events"):
            continue
        parent = obj.tk.master
        while parent is not None and parent.hid is None:
            parent = parent.master
        _send("create", {"id": hid, "kind": obj.tk.kind, "parent": None if parent is None else parent.hid, "props": obj._host_props()})
        if isinstance(obj, Container):
            _mark_dirty(obj)
    while _dirty:
        c = _dirty.pop(0)
        if not c.tk.destroyed and c.tk.hid is not None:
            _send("layout", {"id": c.tk.hid, "layout": c._host_layout_kind(), "children": c._host_layout()})


def _run_idle():
    while _idle:
        f = _idle.pop(0)
        f()


def _wait(poll):
    _run_idle()
    _flush()
    return _host.next_event(poll)


def _mainloop():
    root = _root[0]
    if root is None or root.destroyed:
        return
    _flush()
    _send("display", {"id": root.hid})
    while not root.destroyed:
        ev = _wait(False)
        if ev is None:
            # the host ended the program (stop button, page closed)
            root.destroy()
            break
        _dispatch(ev)
    _run_idle()


def _poll():
    """Handle the events that are waiting (app.update())."""
    while True:
        ev = _wait(True)
        if ev is None:
            break
        _dispatch(ev)


_MOUSE = {
    "press1": "<ButtonPress-1>", "release1": "<ButtonRelease-1>", "press3": "<ButtonPress-3>",
    "release3": "<ButtonRelease-3>", "double1": "<Double-Button-1>", "motion": "<Motion>", "drag1": "<B1-Motion>",
    "enter": "<Enter>", "leave": "<Leave>",
}
_MOUSE_NAMES = {}
for _k in _MOUSE:
    _MOUSE_NAMES[_MOUSE[_k]] = _k
_MOUSE_NAMES["<Button-1>"] = "press1"
_MOUSE_NAMES["<Button-3>"] = "press3"
_MOUSE_NAMES["<Key>"] = "keypress"
_MOUSE_NAMES["<KeyPress>"] = "keypress"
_MOUSE_NAMES["<KeyRelease>"] = "keyrelease"
_MOUSE_NAMES["<Configure>"] = "configure"


class _TkEvent:
    """The parts of a tkinter event that guizero programs use (event.tk_event.keysym and friends)."""

    def __init__(self, widget, type, x=0, y=0, x_root=0, y_root=0, char="", keysym="??", keycode=0, width=0, height=0):
        self.widget = widget
        self.type = type
        self.x = x
        self.y = y
        self.x_root = x_root
        self.y_root = y_root
        self.char = char
        self.keysym = keysym
        self.keycode = keycode
        self.width = width
        self.height = height
        self.num = 3 if type in ("<ButtonPress-3>", "<ButtonRelease-3>") else 1


def _toplevel(tk):
    while tk.master is not None and tk.tkclass not in ("Tk", "Toplevel"):
        tk = tk.master
    return tk


def _fire(tk, names, event):
    """Run the bindings for an event like tk does: on the widget, then on its window; on each only the most specific
    binding (the first name in names that has callbacks)."""
    targets = [tk]
    top = _toplevel(tk)
    if top is not tk:
        targets.append(top)
    for t in targets:
        for name in names:
            cbs = [cb for cb in t._bindings.get(name, []) if cb._active()]
            if cbs:
                for cb in cbs:
                    if t.destroyed:
                        return
                    cb._event_callback(event)
                break


def _key_names(kind, keysym):
    """Binding names for a key event, most specific first."""
    if kind == "press":
        names = ["<KeyPress-" + keysym + ">", "<Key-" + keysym + ">", "<" + keysym + ">"] if keysym else []
        return names + ["<KeyPress>", "<Key>"]
    return (["<KeyRelease-" + keysym + ">"] if keysym else []) + ["<KeyRelease>"]


def _dispatch(ev):
    kind = ev[0]
    if kind == "timer":
        entry = _timers.pop(ev[1], None)
        if entry is not None and not entry[2].destroyed:
            entry[0](*entry[1])
        return
    w = _widgets.get(ev[1])
    if w is None or w.tk.destroyed:
        return
    if kind == "command":
        w._host_command()
    elif kind == "change":
        w._host_change(ev[2])
    elif kind == "mouse":
        name = _MOUSE.get(ev[2])
        if name is None:
            return
        tk = w._event_tk()
        x = ev[3] if len(ev) > 3 else 0
        y = ev[4] if len(ev) > 4 else 0
        xr = ev[5] if len(ev) > 5 else x
        yr = ev[6] if len(ev) > 6 else y
        names = [name]
        if ev[2] == "press1":
            names.append("<Button-1>")
        elif ev[2] == "press3":
            names.append("<Button-3>")
        elif ev[2] == "double1":
            names += ["<ButtonPress-1>", "<Button-1>"]
        _fire(tk, names, _TkEvent(tk, name, x, y, xr, yr))
    elif kind == "key":
        tk = w._event_tk()
        char = ev[3] if len(ev) > 3 and ev[3] is not None else ""
        keysym = ev[4] if len(ev) > 4 and ev[4] is not None else char
        keycode = ev[5] if len(ev) > 5 and ev[5] is not None else 0
        names = _key_names(ev[2], keysym)
        _fire(tk, names, _TkEvent(tk, names[-1], char=char, keysym=keysym, keycode=keycode))
    elif kind == "menu":
        w._host_menu(ev[2], ev[3])
    elif kind == "close":
        w._close_window()
    elif kind == "resize":
        w._host_resize(ev[2], ev[3])


def _sim(kind, widget, *args):
    """Test helper: handle an event as if the host had sent it (widget instead of its id)."""
    if kind == "timer":
        _dispatch((kind,) + args)
    else:
        _dispatch((kind, widget.tk.hid) + args)
    _run_idle()


# ---------------------------------------------------------------------------------------------------------------------
# Colours and the tk stand-in

def _hex_color(value):
    """A tk colour (name or #...) as #rrggbb for the host, or raise TclError like tk."""
    if value is None:
        return None
    if not isinstance(value, str):
        value = str(value)
    if value.startswith("#"):
        digits = value[1:]
        ok = len(digits) in (3, 6, 9, 12)
        if ok:
            try:
                int(digits, 16)
            except ValueError:
                ok = False
        if ok and "-" not in digits and "+" not in digits and " " not in digits and "_" not in digits:
            n = len(digits) // 3
            out = "#"
            for i in range(3):
                part = digits[i * n:i * n + n]
                out += (part + part) if n == 1 else part[:2]
            return out.lower()
        raise TclError('invalid color name "' + value + '"')
    h = _host.color(value)
    if h is None:
        raise TclError('unknown color name "' + value + '"')
    return h


_COLOR_KEYS = ("bg", "fg", "activebackground", "activeforeground", "selectcolor", "troughcolor", "highlightbackground")
_HOST_KEYS = {"bg": "bg", "fg": "text_color", "font": "font", "state": "enabled", "text": "text", "show": "hide_text",
              "padx": "padx", "pady": "pady", "wrap": "wrap", "from": "start", "to": "end", "resolution": "step",
              "highlightbackground": "border_color"}
_BORDER_KEY = {"Frame": "highlightthickness", "LabelFrame": "bd"}

_GREY = "#d9d9d9"
_LABEL_FONT = ["Helvetica", 12, "normal", "roman", 0, 0]
_FONT = ["Helvetica", 10, "normal", "roman", 0, 0]


def _defaults(tkclass):
    if tkclass in ("Tk", "Toplevel"):
        return {"bg": _GREY, "width": 0, "height": 0, "highlightthickness": 0, "bd": 0, "menu": ""}
    if tkclass == "Frame":
        return {"bg": _GREY, "width": 0, "height": 0, "highlightthickness": 0, "highlightbackground": _GREY, "bd": 0}
    if tkclass == "LabelFrame":
        return {"bg": _GREY, "fg": "#000000", "font": list(_FONT), "text": "", "width": 0, "height": 0, "bd": 2, "highlightthickness": 0}
    if tkclass == "Label":
        return {"bg": _GREY, "fg": "black", "activebackground": "#ececec", "activeforeground": "black", "state": "normal",
                "width": 0, "height": 0, "font": list(_LABEL_FONT), "text": "", "image": ""}
    if tkclass == "Entry":
        return {"bg": "#ffffff", "fg": "#000000", "state": "normal", "width": 20, "font": list(_FONT), "show": ""}
    if tkclass == "Text":
        return {"bg": "#ffffff", "fg": "#000000", "state": "normal", "width": 80, "height": 24, "font": list(_FONT), "wrap": "char", "padx": 1, "pady": 1}
    if tkclass == "Button":
        return {"bg": _GREY, "fg": "#000000", "activebackground": "#ececec", "activeforeground": "#000000", "state": "normal",
                "width": 0, "height": 0, "font": list(_FONT), "text": "", "image": "", "padx": 10, "pady": 10}
    if tkclass in ("Checkbutton", "Radiobutton"):
        return {"bg": _GREY, "fg": "#000000", "activebackground": "#ececec", "activeforeground": "#000000", "selectcolor": "#ffffff",
                "state": "normal", "width": 0, "height": 0, "font": list(_FONT), "text": ""}
    if tkclass == "OptionMenu":
        return {"bg": _GREY, "fg": "#000000", "activebackground": "#ececec", "activeforeground": "#000000", "state": "normal",
                "width": 0, "height": 0, "font": list(_FONT), "highlightthickness": 2}
    if tkclass == "Menu":
        return {"bg": _GREY, "fg": "#000000", "activebackground": "#ececec", "activeforeground": "#000000", "font": list(_FONT)}
    if tkclass == "Scale":
        return {"bg": _GREY, "fg": "#000000", "activebackground": "#ececec", "troughcolor": "#b3b3b3", "state": "normal",
                "width": 15, "length": 100, "font": list(_FONT), "from": 0.0, "to": 100.0, "resolution": 1.0}
    if tkclass == "Listbox":
        return {"bg": "#ffffff", "fg": "#000000", "state": "normal", "width": 20, "height": 10, "font": list(_FONT)}
    if tkclass == "Canvas":
        return {"bg": _GREY, "state": "normal", "width": 100, "height": 100, "highlightthickness": 0, "bd": 0}
    return {"bg": _GREY}


_names = {}


class _Tk:
    """Stand-in for a tkinter widget: stores the options, checks them like tk and reports changes to the host."""

    def __init__(self, master, tkclass, **options):
        self.master = master
        self.tkclass = tkclass
        self.hid = None
        self.kind = None
        self.destroyed = False
        self.children = []
        self._bindings = {}
        self._cfg = _defaults(tkclass)
        if master is None:
            self._w = "."
        else:
            master.children.append(self)
            base = "!" + tkclass.lower()
            key = (master._w, base)
            n = _names.get(key, 0) + 1
            _names[key] = n
            self._w = (master._w if master._w != "." else "") + "." + base + (str(n) if n > 1 else "")
        if options:
            self.config(**options)

    def _alive(self):
        if self.destroyed:
            raise TclError('invalid command name "' + self._w + '"')

    def keys(self):
        return list(self._cfg.keys())

    def __getitem__(self, key):
        return self.cget(key)

    def __setitem__(self, key, value):
        self.config(**{key: value})

    def cget(self, key):
        self._alive()
        if key not in self._cfg:
            raise TclError('unknown option "-' + key + '"')
        v = self._cfg[key]
        return list(v) if isinstance(v, list) else v

    def _check(self, key, value):
        if key in _COLOR_KEYS:
            _hex_color(value)
        elif key == "font":
            if isinstance(value, str):
                value = [value, 10, "normal", "roman", 0, 0]
            else:
                value = list(value)
            size = value[1] if len(value) > 1 else 10
            if isinstance(size, str):
                try:
                    size = int(size)
                except ValueError:
                    raise TclError('expected integer but got "' + size + '"')
            elif isinstance(size, float):
                raise TclError('expected integer but got "' + str(size) + '"')
            flags = value[2:]
            value = [str(value[0]), size, "bold" if "bold" in flags else "normal", "italic" if "italic" in flags else "roman",
                     1 if "underline" in flags else 0, 1 if "overstrike" in flags else 0]
        elif key in ("width", "height", "highlightthickness", "bd", "length"):
            if isinstance(value, str):
                try:
                    value = int(value)
                except ValueError:
                    raise TclError('expected integer but got "' + value + '"')
            elif isinstance(value, float) and key in ("width", "height") and self.tkclass not in ("Frame", "Canvas", "Tk", "Toplevel"):
                raise TclError('expected integer but got "' + str(value) + '"')
            elif value is True or value is False:
                value = int(value)
        elif key in ("from", "to", "resolution"):
            try:
                value = float(value)
            except (ValueError, TypeError):
                raise TclError('expected floating-point number but got "' + str(value) + '"')
        return value

    def config(self, **options):
        self._alive()
        props = {}
        for key in options:
            if key not in self._cfg:
                raise TclError('unknown option "-' + key + '"')
            value = self._check(key, options[key])
            self._cfg[key] = value
            hp = _HOST_KEYS.get(key)
            if key == _BORDER_KEY.get(self.tkclass):
                hp = "border"
            if hp is not None and self.hid is not None:
                props[hp] = _host_value(key, value)
        if props:
            _set(self.hid, props)

    configure = config

    def bind(self, name, cb):
        self._bindings.setdefault(name, []).append(cb)
        _events_changed(self)

    def destroy(self):
        if self.destroyed:
            return
        if self.master is not None and self in self.master.children:
            self.master.children.remove(self)
        hid = self.hid
        self._kill()
        if hid is not None:
            if hid in _pending_ids:
                _pending_ids.discard(hid)
            else:
                _send("destroy", {"id": hid})

    def _kill(self):
        self.destroyed = True
        for c in list(self.children):
            c._kill()
        for k in list(_timers):
            if _timers[k][2] is self:
                _host.cancel(k)
                del _timers[k]

    def after(self, ms, func, *args):
        self._alive()
        if isinstance(ms, bool) or not isinstance(ms, int):
            raise TclError('bad argument "' + str(ms) + '": must be cancel, idle, info, or an integer')
        tid = _host.after(ms)
        _timers[tid] = (func, args, self)
        return tid

    def after_cancel(self, tid):
        if tid in _timers:
            del _timers[tid]
            _host.cancel(tid)

    def focus_set(self):
        _send("focus", {"id": _owner_hid(self)})

    def __repr__(self):
        return "<tkinter." + self.tkclass + " object " + self._w + ">"


def _owner_hid(tk):
    while tk is not None and tk.hid is None:
        tk = tk.master
    return None if tk is None else tk.hid


def _host_value(key, value):
    if key in _COLOR_KEYS:
        return _hex_color(value)
    if key == "font":
        return {"family": value[0], "size": value[1], "bold": value[2] == "bold", "italic": value[3] == "italic",
                "underline": bool(value[4]), "overstrike": bool(value[5])}
    if key == "state":
        return value != "disabled"
    return value


def _events_changed(tk):
    hid = _owner_hid(tk)
    if hid is None or hid in _pending_ids:
        return
    w = _widgets.get(hid)
    if w is not None:
        _set(hid, {"events": w._host_events()})


# ---------------------------------------------------------------------------------------------------------------------
# utilities (guizero.utilities)

class _TriggeredList:
    """A list which calls a callback when a value is changed (holds a widget's grid reference)."""

    def __init__(self, iterable=(), on_change=None):
        self._list = list(iterable)
        self._on_change = on_change

    def __getitem__(self, key):
        return self._list[key]

    def __setitem__(self, key, item):
        self._list[key] = item
        self._changed()

    def __delitem__(self, key):
        del self._list[key]
        self._changed()

    def __len__(self):
        return len(self._list)

    def __iter__(self):
        return iter(self._list)

    def __contains__(self, x):
        return x in self._list

    def insert(self, index, item):
        self._list.insert(index, item)
        self._changed()

    def append(self, item):
        self.insert(len(self), item)

    def _changed(self):
        if self._on_change is not None:
            self._on_change()

    def __str__(self):
        data = "["
        for item in self._list:
            data = data + str(item) + ", "
        data = data[:-2] + "]"
        return data

    def __repr__(self):
        return "<guizero.utilities.TriggeredList object>"


def _with_args(func_name, *args):
    return lambda: func_name(*args)


def _no_args_expected(func_name):
    return _host.argcount(func_name)


def _error_format(message):
    print("------------------------------------------------------------")
    print("*** GUIZERO WARNING ***")
    print(message)
    print("------------------------------------------------------------")


def _raise_error(message):
    error_message = "\n------------------------------------------------------------\n"
    error_message += "*** GUIZERO ERROR ***\n"
    error_message += message + "\n"
    error_message += "------------------------------------------------------------\n"
    raise GUIZeroException(error_message)


def _convert_color(color):
    """Converts a color from "color", (255, 255, 255) or "#ffffff" into a color tk should understand."""
    if color is not None:
        if isinstance(color, str):
            color = color.strip()
            if color[0] == "#":
                if len(color) != 7:
                    raise ValueError("{} is not a valid # color, it must be in the format #ffffff.".format(color))
                else:
                    hex_colors = (color[1:3], color[3:5], color[5:7])
                    for hex_color in hex_colors:
                        try:
                            int_color = int(hex_color, 16)
                        except:
                            raise ValueError("{} is not a valid value, it must be hex 00 - ff".format(hex_color))
                        if not (0 <= int_color <= 255):
                            raise ValueError("{} is not a valid color value, it must be 00 - ff".format(hex_color))
        else:
            try:
                no_of_colors = len(color)
            except:
                raise ValueError("A color must be a list or tuple of 3 values (red, green, blue)")
            if no_of_colors != 3:
                raise ValueError("A color must contain 3 values (red, green, blue)")
            for c in color:
                if not (0 <= c <= 255):
                    raise ValueError("{} is not a valid color value, it must be 0 - 255")
            color = "#{:02x}{:02x}{:02x}".format(color[0], color[1], color[2])
    return color


class _Utilities:
    pass


utilities = _Utilities()
utilities.GUIZeroException = GUIZeroException
utilities.TriggeredList = _TriggeredList
utilities.with_args = _with_args
utilities.no_args_expected = _no_args_expected
utilities.error_format = _error_format
utilities.raise_error = _raise_error
utilities.convert_color = _convert_color


class _SystemConfig:
    def __init__(self):
        self._tk_options = {}

    @property
    def PIL_available(self):
        return False

    @property
    def supported_image_types(self):
        return ["GIF", "PNG"]

    @property
    def platform(self):
        return "browser"

    @property
    def tk_options(self):
        return self._tk_options


system_config = _SystemConfig()


def _image_size(source):
    """(width, height) of an image file, asked from the host; GUIZeroException like guizero when it cannot be loaded."""
    size = None
    if isinstance(source, str):
        size = _send("image", {"path": source})
    if size is None:
        error_text = "Image import error - '{}'\n".format("couldn't open \"{}\": no such file or directory".format(source) if isinstance(source, str) else "Image must be a file path or tkinter.PhotoImage")
        error_text += "Check the file path and image type is {}".format("/".join(system_config.supported_image_types))
        _raise_error(error_text)
    return size


# ---------------------------------------------------------------------------------------------------------------------
# Events (guizero.event)

class EventData:
    """A single event, passed to callbacks that accept 1 argument."""

    def __init__(self, widget, tk_event):
        self._widget = widget
        self._tk_event = tk_event

    @property
    def widget(self):
        return self._widget

    @property
    def tk_event(self):
        return self._tk_event

    @property
    def key(self):
        return self._tk_event.char

    @property
    def keycode(self):
        return self._tk_event.keycode

    @property
    def x(self):
        return self._tk_event.x

    @property
    def y(self):
        return self._tk_event.y

    @property
    def display_x(self):
        return self._tk_event.x_root

    @property
    def display_y(self):
        return self._tk_event.y_root

    @property
    def width(self):
        return self._tk_event.width

    @property
    def height(self):
        return self._tk_event.height


class EventCallback:

    def __init__(self, widget, tks, tk_event):
        self._widget = widget
        self._tks = tks
        self._tk_event = tk_event
        self._callbacks = {}
        for tk in self._tks:
            if tk is not None:
                tk.bind(tk_event, self)

    def _event_callback(self, tk_event):
        for ref in list(self._callbacks):
            callback = self._callbacks.get(ref)
            if callback is None:
                continue
            args_expected = _no_args_expected(callback)
            if args_expected == 0:
                callback()
            elif args_expected == 1:
                callback(EventData(self._widget, tk_event))
            else:
                _error_format("An event callback function must accept either 0 or 1 arguments.\nThe current callback has {} arguments.".format(args_expected))

    def get_callback(self, ref):
        if ref in self._callbacks:
            return self._callbacks[ref]
        else:
            return None

    def set_callback(self, ref, callback):
        self.remove_callback(ref)
        if callback is not None:
            self._callbacks[ref] = callback
        for tk in self._tks:
            if tk is not None:
                _events_changed(tk)

    def remove_callback(self, ref):
        if ref in self._callbacks:
            del self._callbacks[ref]
            for tk in self._tks:
                if tk is not None:
                    _events_changed(tk)

    def _active(self):
        return len(self._callbacks) > 0

    @property
    def widget(self):
        return self._widget

    @property
    def tk_event(self):
        return self._tk_event


class EventManager:

    def __init__(self, widget, *tks):
        self._widget = widget
        self._tks = tks
        self._refs = {}
        self._event_callbacks = {}

    def get_event(self, ref):
        if ref in self._refs:
            return self._refs[ref].get_callback(ref)
        else:
            return None

    def set_event(self, ref, tk_event, callback):
        if tk_event not in self._event_callbacks:
            self._event_callbacks[tk_event] = EventCallback(self._widget, self._tks, tk_event)
        self._refs[ref] = self._event_callbacks[tk_event]
        self._refs[ref].set_callback(ref, callback)

    def remove_event(self, ref):
        if ref in self._refs:
            self._refs[ref].remove_callback(ref)

    def rebind_events(self, *tks):
        pass


# ---------------------------------------------------------------------------------------------------------------------
# Mixins (guizero.tkmixins)

class ScheduleMixin:
    _callback = {}

    def after(self, time, function, args=[]):
        """Call function after time milliseconds."""
        callback_id = self.tk.after(time, self._call_wrapper, time, function, *args)
        self._callback[function] = [callback_id, False]

    def repeat(self, time, function, args=[]):
        """Repeat function every time milliseconds."""
        callback_id = self.tk.after(time, self._call_wrapper, time, function, *args)
        self._callback[function] = [callback_id, True]

    def cancel(self, function):
        """Cancel the scheduled function calls."""
        if function in self._callback.keys():
            callback_id = self._callback[function][0]
            self.tk.after_cancel(callback_id)
            self._callback.pop(function)
        else:
            _error_format("Could not cancel function - it doesnt exist, it may have already run")

    def _call_wrapper(self, time, function, *args):
        if function in self._callback.keys():
            repeat = self._callback[function][1]
            if repeat:
                callback_id = self.tk.after(time, self._call_wrapper, time, function, *args)
                self._callback[function][0] = callback_id
            else:
                self._callback.pop(function)
        function(*args)


class DestroyMixin:
    def destroy(self):
        self.tk.destroy()


class EnableMixin:
    def _get_enabled(self):
        state = self._get_tk_config("state")
        return state == "normal" or state == "active"

    def _set_enabled(self, value):
        if value:
            self.enable()
        else:
            self.disable()

    enabled = property(lambda self: self._get_enabled(), lambda self, value: self._set_enabled(value))

    def disable(self):
        self._set_tk_config("state", "disabled")

    def enable(self):
        self._set_tk_config("state", "normal")


class FocusMixin:
    def focus(self):
        self.tk.focus_set()


class DisplayMixin:

    def _get_visible(self):
        return self._visible

    def _set_visible(self, value):
        if value:
            self.show()
        else:
            self.hide()

    visible = property(lambda self: self._get_visible(), lambda self, value: self._set_visible(value))

    def hide(self):
        self._visible = False
        self.master.display_widgets()

    def show(self):
        self._visible = True
        self.master.display_widgets()


def _tk_font(widget, default=False):
    f = widget._get_tk_config("font", default=default)
    return {"family": f[0], "size": f[1], "weight": f[2], "slant": f[3], "underline": f[4], "overstrike": f[5]}


def _font_list(f, family=None, size=None, weight=None, slant=None, underline=None, overstrike=None):
    kw = [f["family"] if family is None else family, f["size"] if size is None else size,
          f["weight"] if weight is None else weight, f["slant"] if slant is None else slant]
    if f["underline"] if underline is None else underline:
        kw.append("underline")
    if f["overstrike"] if overstrike is None else overstrike:
        kw.append("overstrike")
    return tuple(kw)


class TextMixin:

    FG_KEYS = ["fg", "activeforeground"]

    @staticmethod
    def get_text_color(widget):
        return widget._get_tk_config("fg")

    @staticmethod
    def set_text_color(widget, color):
        widget._set_tk_config(TextMixin.FG_KEYS, _convert_color(color))

    @staticmethod
    def get_font(widget):
        return _tk_font(widget)["family"]

    @staticmethod
    def set_font(widget, font):
        f = _tk_font(widget)
        if font is None:
            font = _tk_font(widget, default=True)["family"]
        widget._set_tk_config("font", _font_list(f, family=font))

    @staticmethod
    def get_text_size(widget):
        return _tk_font(widget)["size"]

    @staticmethod
    def set_text_size(widget, size):
        f = _tk_font(widget)
        if size is None:
            size = _tk_font(widget, default=True)["size"]
        widget._set_tk_config("font", _font_list(f, size=size))

    @staticmethod
    def get_text_bold(widget):
        return _tk_font(widget)["weight"] == "bold"

    @staticmethod
    def set_text_bold(widget, bold):
        widget._set_tk_config("font", _font_list(_tk_font(widget), weight="bold" if bold else "normal"))

    @staticmethod
    def get_text_italic(widget):
        return _tk_font(widget)["slant"] == "italic"

    @staticmethod
    def set_text_italic(widget, italic):
        widget._set_tk_config("font", _font_list(_tk_font(widget), slant="italic" if italic else "roman"))

    @staticmethod
    def get_text_underline(widget):
        return _tk_font(widget)["underline"]

    @staticmethod
    def set_text_underline(widget, underline):
        widget._set_tk_config("font", _font_list(_tk_font(widget), underline=bool(underline)))

    @staticmethod
    def get_text_overstrike(widget):
        return _tk_font(widget)["overstrike"]

    @staticmethod
    def set_text_overstrike(widget, overstrike):
        widget._set_tk_config("font", _font_list(_tk_font(widget), overstrike=bool(overstrike)))

    def _get_text_color(self):
        return TextMixin.get_text_color(self)

    def _set_text_color(self, color):
        TextMixin.set_text_color(self, color)

    def _get_font(self):
        return TextMixin.get_font(self)

    def _set_font(self, font):
        TextMixin.set_font(self, font)

    def _get_text_size(self):
        return TextMixin.get_text_size(self)

    def _set_text_size(self, size):
        TextMixin.set_text_size(self, size)

    def _get_text_bold(self):
        return TextMixin.get_text_bold(self)

    def _set_text_bold(self, bold):
        TextMixin.set_text_bold(self, bold)

    def _get_text_italic(self):
        return TextMixin.get_text_italic(self)

    def _set_text_italic(self, italic):
        TextMixin.set_text_italic(self, italic)

    def _get_text_underline(self):
        return TextMixin.get_text_underline(self)

    def _set_text_underline(self, underline):
        TextMixin.set_text_underline(self, underline)

    def _get_text_overstrike(self):
        return TextMixin.get_text_overstrike(self)

    def _set_text_overstrike(self, overstrike):
        TextMixin.set_text_overstrike(self, overstrike)


class ColorMixin:

    BG_KEYS = ["bg", "activebackground", "selectcolor", "troughcolor"]

    def _get_bg(self):
        return self._get_tk_config("bg")

    def _set_bg(self, color):
        self._set_tk_config(self.BG_KEYS, _convert_color(color))

    bg = property(lambda self: self._get_bg(), lambda self, value: self._set_bg(value))


class SizeMixin:

    def _get_width(self):
        return self._width

    def _set_width_prop(self, value):
        self.resize(value, self._height)

    def _get_height(self):
        return self._height

    def _set_height_prop(self, value):
        self.resize(self._width, value)

    width = property(lambda self: self._get_width(), lambda self, value: self._set_width_prop(value))
    height = property(lambda self: self._get_height(), lambda self, value: self._set_height_prop(value))

    def resize(self, width, height):
        self._width = width
        self._height = height
        if width != "fill":
            self._set_tk_config("width", width)
        if height != "fill":
            self._set_tk_config("height", height)
        self._send_size()
        if width == "fill" or height == "fill":
            self.master.display_widgets()

    def _send_size(self):
        _set(self.tk.hid, {"width": self._width, "height": self._height})


class LayoutMixin:

    def _get_grid(self):
        return self._grid

    def _set_grid(self, value):
        self._update_grid(value)
        self.master.display_widgets()

    grid = property(lambda self: self._get_grid(), lambda self, value: self._set_grid(value))

    def _update_grid(self, grid):
        self._grid = None
        if self.master.layout == "grid":
            if grid is None:
                _error_format("{} will not be displayed because it has a missing grid reference.".format(self.description))
            elif not isinstance(grid, (list, tuple)):
                _error_format("{} will not be displayed because the grid reference is not a list or tuple.".format(self.description))
            elif (len(grid) != 2 and len(grid) != 4):
                _error_format("{} will not be displayed because the grid reference should be either grid=[x, y] or grid=[x, y, columnspan, rowspan].".format(self.description))
            else:
                self._grid = _TriggeredList(grid, on_change=self.master.display_widgets)
        else:
            if grid is not None:
                _error_format("A grid is not required for {} as it is not using a 'grid' layout.".format(self.description))

    def _get_align(self):
        return self._align

    def _set_align(self, value):
        self._update_align(value)
        self.master.display_widgets()

    align = property(lambda self: self._get_align(), lambda self, value: self._set_align(value))

    def _update_align(self, align):
        self._align = None
        if align is not None:
            if align in ["top", "bottom", "left", "right"]:
                self._align = align
            else:
                _error_format("Invalid align value ('{}') for {}\nShould be: top, bottom, left or right".format(align, self.description))


def _event_prop(ref, tk_event):
    return property(lambda self: self.events.get_event(ref), lambda self, value: self.events.set_event(ref, tk_event, value))


class EventsMixin:
    when_clicked = _event_prop("<when_clicked>", "<ButtonPress-1>")
    when_double_clicked = _event_prop("<when_double_clicked>", "<Double-Button-1>")
    when_left_button_pressed = _event_prop("<when_left_button_pressed>", "<ButtonPress-1>")
    when_left_button_released = _event_prop("<when_left_button_released>", "<ButtonRelease-1>")
    when_right_button_pressed = _event_prop("<when_right_button_pressed>", "<ButtonPress-3>")
    when_right_button_released = _event_prop("<when_right_button_released>", "<ButtonRelease-3>")
    when_key_pressed = _event_prop("<when_key_pressed>", "<KeyPress>")
    when_key_released = _event_prop("<when_key_released>", "<KeyRelease>")
    when_mouse_enters = _event_prop("<when_mouse_enters>", "<Enter>")
    when_mouse_leaves = _event_prop("<when_mouse_leaves>", "<Leave>")
    when_mouse_moved = _event_prop("<when_mouse_moved>", "<Motion>")
    when_mouse_dragged = _event_prop("<when_mouse_dragged>", "<B1-Motion>")


# ---------------------------------------------------------------------------------------------------------------------
# Base classes (guizero.base)

class Base:

    def __init__(self, tk):
        self._tk = tk
        self._tk_defaults = {}
        for key in self.tk.keys():
            self._tk_defaults[key] = self.tk[key]

    @property
    def tk(self):
        return self._tk

    def _has_tk_config(self, key):
        return key in self.tk.keys()

    def _get_tk_config(self, key, default=False):
        if default:
            return self._tk_defaults[key]
        else:
            return self.tk[key]

    def _set_tk_config(self, keys, value):
        if isinstance(keys, str):
            keys = [keys]
        for key in keys:
            if key in self.tk.keys():
                if value is None:
                    self.tk[key] = self._tk_defaults[key]
                else:
                    self.tk[key] = value

    def __repr__(self):
        return "guizero.{} object".format(self.__class__.__name__)

    # host side
    def _event_tk(self):
        return self.tk

    def _host_events(self):
        names = []
        tks = [self._event_tk()]
        for tk in tks:
            for name in tk._bindings:
                if name in _MOUSE_NAMES and name != "<Configure>" and any(cb._active() for cb in tk._bindings[name]):
                    n = _MOUSE_NAMES[name]
                    if n not in names:
                        names.append(n)
        if getattr(self, "_when_resized", None) is not None:
            names.append("configure")
        return names

    def _host_props(self):
        props = {}
        cfg = self.tk._cfg
        for key in cfg:
            hp = _HOST_KEYS.get(key)
            if key == _BORDER_KEY.get(self.tk.tkclass):
                hp = "border"
            if hp is not None:
                props[hp] = _host_value(key, cfg[key])
        props["events"] = self._host_events()
        self._more_props(props)
        return props

    def _more_props(self, props):
        if hasattr(self, "_width"):
            props["width"] = self._width
            props["height"] = self._height

    def _host_command(self):
        pass

    def _host_change(self, value):
        pass

    def _host_menu(self, i, j):
        pass

    def _close_window(self):
        pass

    def _host_resize(self, width, height):
        if hasattr(self, "_actual_width"):
            self._fire_configure(width, height)

    def _fire_configure(self, width, height):
        _fire(self.tk, ["<Configure>"], _TkEvent(self.tk, "<Configure>", width=width, height=height))


class Component(Base, ScheduleMixin, DestroyMixin, FocusMixin, ColorMixin, EventsMixin):

    def __init__(self, master, tk, displayable):
        Base.__init__(self, tk)
        self._master = master
        self._events = EventManager(self, tk)
        self._displayable = displayable
        self._when_resized = None
        self._actual_height = None
        self._actual_width = None
        self.events.set_event("<Component.Configure>", "<Configure>", self._on_configure_change)
        if self.master is not None:
            if isinstance(master, Container):
                self.master._add_child(self)
            else:
                _raise_error("{}\nMaster is not an [App], [Window] or [Box]".format(self.description))

    @property
    def master(self):
        return self._master

    @property
    def description(self):
        return "[{}] object".format(self.__class__.__name__)

    def __str__(self):
        return self.description

    @property
    def events(self):
        return self._events

    @property
    def displayable(self):
        return self._displayable

    @property
    def when_resized(self):
        return self._when_resized

    @when_resized.setter
    def when_resized(self, value):
        self._when_resized = value
        _events_changed(self.tk)

    def destroy(self):
        if self.master is not None:
            self.master._remove_child(self)
        self.tk.destroy()

    def _on_configure_change(self, event):
        if event.tk_event.widget == self.tk:
            if self._actual_height != event.tk_event.height or self._actual_width != event.tk_event.width:
                self._actual_height = event.tk_event.height
                self._actual_width = event.tk_event.height
                if self._when_resized is not None:
                    args_expected = _no_args_expected(self._when_resized)
                    if args_expected == 0:
                        self._when_resized()
                    elif args_expected == 1:
                        self._when_resized(event)
                    else:
                        _error_format("An event callback function must accept either 0 or 1 arguments.\nThe current callback has {} arguments.".format(args_expected))


class Container(Component):

    def __init__(self, master, tk, layout, displayable):
        Component.__init__(self, master, tk, displayable)
        self._children = []
        self._layout_manager = layout
        self._bg = None
        self._text_color = None
        self._text_size = None
        self._text_bold = None
        self._text_italic = None
        self._text_underline = None
        self._text_overstrike = None
        self._font = None
        self._enabled = True
        if self.master is not None:
            self.bg = master.bg
            self.text_color = master.text_color
            self.text_size = master.text_size
            self.text_bold = master.text_bold
            self.text_italic = master.text_italic
            self.text_underline = master.text_underline
            self.text_overstrike = master.text_overstrike
            self.font = master.font

    @property
    def layout(self):
        return self._layout_manager

    def _get_bg(self):
        return self._bg

    def _set_bg(self, value):
        self._bg = _convert_color(value)
        ColorMixin._set_bg(self, self._bg)
        for child in self.children:
            if isinstance(child, (Container, Widget)):
                child.bg = self._bg

    def _cascade(self, name, value):
        for child in self.children:
            if isinstance(child, (Container, TextWidget)):
                setattr(child, name, value)

    def _get_text_color(self):
        return self._text_color

    def _set_text_color(self, value):
        self._text_color = _convert_color(value)
        self._cascade("text_color", self._text_color)

    def _get_text_size(self):
        return self._text_size

    def _set_text_size(self, value):
        self._text_size = value
        self._cascade("text_size", value)

    def _get_text_bold(self):
        return self._text_bold

    def _set_text_bold(self, value):
        self._text_bold = value
        self._cascade("text_bold", value)

    def _get_text_italic(self):
        return self._text_italic

    def _set_text_italic(self, value):
        self._text_italic = value
        self._cascade("text_italic", value)

    def _get_text_underline(self):
        return self._text_underline

    def _set_text_underline(self, value):
        self._text_underline = value
        self._cascade("text_underline", value)

    def _get_text_overstrike(self):
        return self._text_overstrike

    def _set_text_overstrike(self, value):
        self._text_overstrike = value
        self._cascade("text_overstrike", value)

    def _get_font(self):
        return self._font

    def _set_font(self, value):
        self._font = value
        self._cascade("font", value)

    @property
    def children(self):
        return self._children

    def add_tk_widget(self, tk_widget, grid=None, align=None, visible=True, enabled=None, width=None, height=None):
        _raise_error("add_tk_widget is not available: there is no tkinter in the browser")

    def _add_child(self, child):
        self.children.append(child)

    def _remove_child(self, child):
        self.children.remove(child)

    def display_widgets(self):
        """Work out which children are shown (validated like tk's pack and grid) and send the layout later."""
        for child in self.children:
            if child.displayable and child.visible:
                if self.layout == "grid":
                    _check_grid(child.grid)
        _mark_dirty(self)

    def _host_layout_kind(self):
        return "grid" if self.layout == "grid" else "auto"

    def _host_layout(self):
        out = []
        for child in self.children:
            if child.displayable and child.visible and not child.tk.destroyed:
                entry = {"id": child.tk.hid, "align": child.align}
                if self.layout == "grid":
                    g = child.grid
                    entry["grid"] = [g[0], g[1], g[2], g[3]] if len(g) == 4 else [g[0], g[1], 1, 1]
                out.append(entry)
        return out

    def _get_enabled(self):
        return self._enabled

    def _set_enabled(self, value):
        if value:
            self.enable()
        else:
            self.disable()

    enabled = property(lambda self: self._get_enabled(), lambda self, value: self._set_enabled(value))

    def disable(self):
        self._enabled = False
        _set(self.tk.hid, {"enabled": False})
        for child in self.children:
            if isinstance(child, (Container, Widget)):
                child.disable()

    def enable(self):
        self._enabled = True
        _set(self.tk.hid, {"enabled": True})
        for child in self.children:
            if isinstance(child, (Container, Widget)):
                child.enable()

    def _more_props(self, props):
        Base._more_props(self, props)
        props["enabled"] = self._enabled
        props["layout"] = self._host_layout_kind()


def _grid_int(value, what, positive):
    ok = isinstance(value, int) and not isinstance(value, bool)
    if isinstance(value, str):
        try:
            value = int(value)
            ok = True
        except ValueError:
            ok = False
    if not ok or (positive and value <= 0) or (not positive and value < 0):
        raise TclError('bad ' + what + ' value "' + str(value) + '": must be a ' + ("positive" if positive else "non-negative") + ' integer')


def _check_grid(grid):
    """The checks tk's grid command makes (a missing grid fails like in guizero)."""
    column = grid[0]
    row = grid[1]
    _grid_int(column, "column", False)
    _grid_int(row, "row", False)
    if len(grid) == 4:
        _grid_int(grid[2], "columnspan", True)
        _grid_int(grid[3], "rowspan", True)


# text_color, font ... as properties that call the overridable _get_/_set_ methods
def _prop(name):
    return property(lambda self: getattr(self, "_get_" + name)(), lambda self, value: getattr(self, "_set_" + name)(value))


for _cls in (TextMixin, Container):
    _cls.text_color = _prop("text_color")
    _cls.font = _prop("font")
    _cls.text_size = _prop("text_size")
    _cls.text_bold = _prop("text_bold")
    _cls.text_italic = _prop("text_italic")
    _cls.text_underline = _prop("text_underline")
    _cls.text_overstrike = _prop("text_overstrike")


class BaseWindow(Container):

    def __init__(self, master, tk, title, width, height, layout, bg, visible):
        Container.__init__(self, master, tk, layout, False)
        self._title = str(title)
        self._win_width = 0
        self._win_height = 0
        BaseWindow.resize(self, width, height)
        self._on_close = None
        self._full_screen = False
        self._icon = None
        self._icon_cascade = True
        self._modal = False
        self.bg = bg
        self.visible = visible

    @property
    def title(self):
        return self._title

    @title.setter
    def title(self, text):
        self._title = str(text)
        _set(self.tk.hid, {"title": self._title})

    def _get_height(self):
        return self._win_height

    def _set_height_prop(self, height):
        self.resize(self._win_width, height)

    def _get_width(self):
        return self._win_width

    def _set_width_prop(self, width):
        self.resize(width, self._win_height)

    width = property(lambda self: self._get_width(), lambda self, value: self._set_width_prop(value))
    height = property(lambda self: self._get_height(), lambda self, value: self._set_height_prop(value))

    def _get_visible(self):
        return self._visible

    def _set_visible(self, value):
        if value:
            self.show()
        else:
            self.hide()

    visible = property(lambda self: self._get_visible(), lambda self, value: self._set_visible(value))

    @property
    def full_screen(self):
        return self._full_screen

    @full_screen.setter
    def full_screen(self, make_full_screen):
        if make_full_screen:
            self.set_full_screen()
        else:
            self.exit_full_screen()

    @property
    def when_closed(self):
        return self._on_close

    @when_closed.setter
    def when_closed(self, value):
        self._on_close = value

    @property
    def icon(self):
        return self._icon

    @icon.setter
    def icon(self, value):
        _image_size(value)
        self._icon = value
        _set(self.tk.hid, {"icon": value})

    def resize(self, width, height):
        size = []
        for v in (width, height):
            if isinstance(v, str) and v.isdigit():
                v = int(v)
            if isinstance(v, bool) or not isinstance(v, int):
                raise TclError('bad geometry specifier "' + str(width) + "x" + str(height) + '"')
            size.append(v)
        width, height = size
        self._win_width = width
        self._win_height = height
        _set(self.tk.hid, {"width": width, "height": height})

    def hide(self):
        self._visible = False
        _set(self.tk.hid, {"visible": False})

    def show(self):
        self._visible = True
        _set(self.tk.hid, {"visible": True})

    def _close_window(self):
        if self._on_close is None:
            self.destroy()
        else:
            self._on_close()

    def update(self):
        _poll()

    def set_full_screen(self, keybind="<Escape>"):
        self._full_screen = True
        _set(self.tk.hid, {"full_screen": True})
        self.events.set_event("<FullScreen.Escape>", keybind, self.exit_full_screen)

    def exit_full_screen(self):
        self._full_screen = False
        _set(self.tk.hid, {"full_screen": False})
        self.events.remove_event("<FullScreen.Escape>")

    def warn(self, title, text):
        warn(title, text, master=self)

    def info(self, title, text):
        info(title, text, master=self)

    def error(self, title, text):
        error(title, text, master=self)

    def yesno(self, title, text):
        return yesno(title, text, master=self)

    def question(self, title, question_text, initial_value=None):
        return question(title, question_text, initial_value, master=self)

    def select_file(self, title="Select file", folder=".", filetypes=[["All files", "*.*"]], save=False, filename=""):
        return select_file(title=title, folder=folder, filetypes=filetypes, save=save, master=self, filename=filename)

    def select_folder(self, title="Select folder", folder="."):
        return select_folder(title=title, folder=folder, master=self)

    def select_color(self, color=None):
        return select_color(color, master=self)

    def _more_props(self, props):
        props["enabled"] = self._enabled
        props["layout"] = self._host_layout_kind()
        props["title"] = self._title
        props["width"] = self._win_width
        props["height"] = self._win_height
        props["visible"] = self._visible
        props["full_screen"] = self._full_screen
        props["modal"] = self._modal
        if self._icon is not None:
            props["icon"] = self._icon

    def _host_resize(self, width, height):
        self._win_width = width
        self._win_height = height
        self._fire_configure(width, height)


class Widget(Component, EnableMixin, DisplayMixin, SizeMixin, LayoutMixin):

    def __init__(self, master, tk, grid, align, visible, enabled, width, height):
        Component.__init__(self, master, tk, True)
        self._update_grid(grid)
        self._update_align(align)
        self._width = width
        self._height = height
        self.visible = visible
        self.enabled = enabled
        self.bg = master.bg
        if enabled is None:
            self.enabled = master.enabled
        else:
            self.enabled = enabled
        self.resize(width, height)

    def _more_props(self, props):
        props["width"] = self._width
        props["height"] = self._height


class TextWidget(Widget, TextMixin):

    def __init__(self, master, tk, grid, align, visible, enabled, width, height):
        Widget.__init__(self, master, tk, grid, align, visible, enabled, width, height)
        self.text_color = master.text_color
        self.text_size = master.text_size
        self.text_bold = master.text_bold
        self.text_italic = master.text_italic
        self.text_underline = master.text_underline
        self.text_overstrike = master.text_overstrike
        self.font = master.font


class ContainerWidget(Container, EnableMixin, DisplayMixin, SizeMixin, LayoutMixin):

    def __init__(self, master, tk, layout, grid, align, visible, enabled, width, height):
        Container.__init__(self, master, tk, layout, True)
        self._update_grid(grid)
        self._update_align(align)
        self._width = width
        self._height = height
        self.visible = visible
        if enabled is None:
            self.enabled = master.enabled
        else:
            self.enabled = enabled

    def _set_propagation(self, width, height):
        if width is None:
            width = 0
        if height is None:
            height = 0
        if isinstance(width, int) and isinstance(height, int):
            if (width == 0 and height > 0) or (height == 0 and width > 0):
                _error_format("You must specify a width and a height for {}".format(self.description))

    def _more_props(self, props):
        Container._more_props(self, props)


class ContainerTextWidget(ContainerWidget):

    def _get_text_color(self):
        return TextMixin.get_text_color(self)

    def _set_text_color(self, color):
        TextMixin.set_text_color(self, color)
        Container._set_text_color(self, color)

    def _get_font(self):
        return TextMixin.get_font(self)

    def _set_font(self, font):
        TextMixin.set_font(self, font)
        Container._set_font(self, font)

    def _get_text_size(self):
        return TextMixin.get_text_size(self)

    def _set_text_size(self, size):
        TextMixin.set_text_size(self, size)
        Container._set_text_size(self, size)

    def _get_text_bold(self):
        return TextMixin.get_text_bold(self)

    def _set_text_bold(self, bold):
        TextMixin.set_text_bold(self, bold)
        Container._set_text_bold(self, bold)

    def _get_text_italic(self):
        return TextMixin.get_text_italic(self)

    def _set_text_italic(self, italic):
        TextMixin.set_text_italic(self, italic)
        Container._set_text_italic(self, italic)

    def _get_text_underline(self):
        return TextMixin.get_text_underline(self)

    def _set_text_underline(self, underline):
        TextMixin.set_text_underline(self, underline)
        Container._set_text_underline(self, underline)

    def _get_text_overstrike(self):
        return TextMixin.get_text_overstrike(self)

    def _set_text_overstrike(self, overstrike):
        # guizero sets the underline here (a bug in guizero 1.6, kept for the same results)
        TextMixin.set_text_underline(self, overstrike)
        Container._set_text_overstrike(self, overstrike)


# ---------------------------------------------------------------------------------------------------------------------
# Windows

class App(BaseWindow):

    _main_app = None

    def __init__(self, title="guizero", width=500, height=500, layout="auto", bg=None, visible=True):
        if App._main_app is None:
            tk = _Tk(None, "Tk")
            App._main_app = self
            if _root[0] is None or _root[0].destroyed:
                _root[0] = tk
        else:
            tk = _Tk(App._main_app.tk, "Toplevel")
            _error_format("There should only be 1 guizero App, use Window to create multiple windows.")
        _register(self, tk, "app" if tk.tkclass == "Tk" else "window")
        BaseWindow.__init__(self, None, tk, title, width, height, layout, bg, visible)

    def display(self):
        _mainloop()

    def destroy(self):
        if self == App._main_app:
            App._main_app = None
        self.tk.destroy()


class Window(BaseWindow):

    def __init__(self, master, title="guizero", width=500, height=500, layout="auto", bg=None, visible=True):
        self._modal = False
        tk = _Tk(master.tk, "Toplevel")
        _register(self, tk, "window")
        BaseWindow.__init__(self, master, tk, title, width, height, layout, bg, visible)
        self._icon_cascade = False

    def _close_window(self):
        if self._on_close is None:
            self.hide()
        else:
            self._on_close()

    def hide(self):
        self._visible = False
        self._modal = False
        _set(self.tk.hid, {"visible": False, "modal": False})

    def show(self, wait=False):
        self._visible = True
        self._modal = wait
        _set(self.tk.hid, {"visible": True, "modal": bool(wait)})


# ---------------------------------------------------------------------------------------------------------------------
# Containers

class Box(ContainerWidget):

    def __init__(self, master, layout="auto", grid=None, align=None, visible=True, enabled=None, width=None, height=None, border=None):
        tk = _Tk(master.tk, "Frame")
        _register(self, tk, "box")
        ContainerWidget.__init__(self, master, tk, layout, grid, align, visible, enabled, width, height)
        self.resize(width, height)
        if border is not None:
            self.border = border

    @property
    def border(self):
        return self._get_tk_config("highlightthickness")

    @border.setter
    def border(self, value):
        self.set_border(value, "black")

    def set_border(self, thickness, color="black"):
        self._set_tk_config("highlightthickness", thickness)
        self._set_tk_config("highlightbackground", _convert_color(color))

    def resize(self, width, height):
        self._set_propagation(width, height)
        SizeMixin.resize(self, width, height)


class TitleBox(ContainerTextWidget):

    def __init__(self, master, text, layout="auto", grid=None, align=None, visible=True, enabled=None, width=None, height=None, border=2):
        tk = _Tk(master.tk, "LabelFrame", text=str(text), bd=border)
        _register(self, tk, "titlebox")
        ContainerTextWidget.__init__(self, master, tk, layout, grid, align, visible, enabled, width, height)
        self.resize(width, height)

    @property
    def border(self):
        return self._get_tk_config("bd")

    @border.setter
    def border(self, value):
        self._set_tk_config("bd", value)

    @property
    def text(self):
        return self._get_tk_config("text")

    @text.setter
    def text(self, value):
        self._set_tk_config("text", value)

    def resize(self, width, height):
        self._set_propagation(width, height)
        SizeMixin.resize(self, width, height)


# ---------------------------------------------------------------------------------------------------------------------
# Widgets

class Text(TextWidget):

    def __init__(self, master, text="", size=None, color=None, bg=None, font=None, grid=None, align=None, visible=True,
                 enabled=None, width=None, height=None, bold=None, italic=None, underline=None, overstrike=None):
        self._text = str(text)
        tk = _Tk(master.tk, "Label", text=self._text)
        _register(self, tk, "text")
        TextWidget.__init__(self, master, tk, grid, align, visible, enabled, width, height)
        if bg:
            self.bg = bg
        if size is not None:
            self.text_size = size
        if font is not None:
            self.font = font
        if color is not None:
            self.text_color = color
        if bold is not None:
            self.text_bold = bold
        if italic is not None:
            self.text_italic = italic
        if underline is not None:
            self.text_underline = underline
        if overstrike is not None:
            self.text_overstrike = overstrike

    @property
    def value(self):
        return self._text

    @value.setter
    def value(self, value):
        self.tk.config(text=str(value))
        self._text = str(value)

    size = _prop("text_size")
    bold = _prop("text_bold")
    italic = _prop("text_italic")
    underline = _prop("text_underline")
    overstrike = _prop("text_overstrike")

    @property
    def description(self):
        return "[Text] object with text '{}'".format(self.value)

    def clear(self):
        self._text = ""
        self.tk.config(text="")

    def append(self, text):
        new_text = self._text + str(text)
        self._text = new_text
        self.tk.config(text=new_text)


class TextBox(TextWidget):

    def __init__(self, master, text="", width=10, height=1, grid=None, align=None, visible=True, enabled=None,
                 multiline=False, scrollbar=False, command=None, hide_text=False):
        self._multiline = multiline
        self._scrollbar = scrollbar
        self._text = str(text)
        tk = _Tk(master.tk, "Text" if multiline else "Entry")
        _register(self, tk, "textbox")
        TextWidget.__init__(self, master, tk, grid, align, visible, enabled, width, height)
        self.hide_text = hide_text
        self.update_command(command)
        self.events.set_event("<TextBox.KeyRelease>", "<KeyRelease>", self._key_released)

    @property
    def value(self):
        if self._multiline:
            self.tk._alive()
            return self._text + "\n"
        return self._text

    @value.setter
    def value(self, value):
        self.tk._alive()
        self._text = str(value)
        _set(self.tk.hid, {"value": self._text})

    def resize(self, width, height):
        self._width = width
        if width != "fill":
            self._set_tk_config("width", width)
        if height is not None:
            if self._multiline:
                self._height = height
                if height != "fill":
                    self._set_tk_config("height", height)
            else:
                if isinstance(height, int):
                    if height > 1:
                        _error_format("Cannot change the height of a single line TextBox{}".format(self.description))
        if not hasattr(self, "_height"):
            self._height = height
        self._send_size()
        if width == "fill" or height == "fill":
            self.master.display_widgets()

    @property
    def hide_text(self):
        return self._hide_text

    @hide_text.setter
    def hide_text(self, value):
        self._hide_text = value
        if value == True:
            show_value = "*"
        elif value == False:
            show_value = ""
        else:
            show_value = value
        self._set_tk_config("show", show_value)

    @property
    def description(self):
        return "[TextBox] object with text '{}'".format(self.value)

    @property
    def cursor_position(self):
        return len(self._text)

    @cursor_position.setter
    def cursor_position(self, value):
        _set(self.tk.hid, {"cursor_position": value})

    @property
    def wrap(self):
        if self._multiline:
            return self._get_tk_config("wrap") != "none"
        else:
            return None

    @wrap.setter
    def wrap(self, value):
        if self._multiline:
            self._set_tk_config("wrap", "word" if value else "none")
        else:
            _error_format("wrap can only be set on a multiline TextBox")

    def _key_released(self, event):
        if self._command:
            args_expected = _no_args_expected(self._command)
            if args_expected == 0:
                self._command()
            elif args_expected == 1:
                self._command(event.key)
            else:
                _error_format("TextBox command function must accept either 0 or 1 arguments.\nThe current command has {} arguments.".format(args_expected))

    def update_command(self, command):
        if command is None:
            self._command = lambda: None
        else:
            self._command = command

    def clear(self):
        self.value = ""

    def append(self, text):
        self.value = self._text + str(text)

    def _more_props(self, props):
        Widget._more_props(self, props)
        props["value"] = self._text
        props["multiline"] = bool(self._multiline)
        props["scrollbar"] = bool(self._scrollbar)

    def _host_change(self, value):
        if self.enabled:
            self._text = str(value)


class PushButton(TextWidget):

    def __init__(self, master, command=None, args=None, text="Button", image=None, pady=10, padx=10, grid=None, align=None,
                 icon=None, visible=True, enabled=None, width=None, height=None):
        self._value = 0
        self._image_source = image if image is not None else icon
        self._image = None
        self._text = str(text)
        tk = _Tk(master.tk, "Button", text=self._text)
        _register(self, tk, "pushbutton")
        TextWidget.__init__(self, master, tk, grid, align, visible, enabled, width, height)
        self.tk.config(pady=pady, padx=padx)
        self.events.set_event("<PushButton.ButtonPress-1>", "<ButtonPress-1>", self._on_press)
        self.events.set_event("<PushButton.ButtonRelease-1>", "<ButtonRelease-1>", self._on_release)
        self.update_command(command, args)
        if self._image_source:
            self._load_image()

    def _load_image(self):
        self._set_text("")
        if self._height == "fill" or self._width == "fill":
            _raise_error("{}\nCannot use 'fill' for width and height when using a image.".format(self.description))
        size = _image_size(self._image_source)
        self._image = self._image_source
        self._image_size = size
        w = size[0] if self.width is None else self.width
        h = size[1] if self.height is None else self.height
        self._width = w
        self._height = h
        _set(self.tk.hid, {"image": self._image, "width": w, "height": h})

    def _set_text(self, value):
        self._text = value
        self.tk.config(text=value)

    @property
    def value(self):
        return self._value

    @property
    def text(self):
        return self._text

    @text.setter
    def text(self, value):
        self._clear_image()
        self._set_text(str(value))

    @property
    def image(self):
        return self._image

    @image.setter
    def image(self, value):
        self._clear_image()
        if value is not None:
            self._image_source = value
            self._load_image()

    @property
    def description(self):
        return "[PushButton] object with text '{}'".format(self.text)

    def _on_press(self, event):
        if self.enabled:
            self._value = 1

    def _on_release(self, event):
        if self.enabled:
            self._value = 0

    def padding(self, padx, pady):
        self.tk.config(padx=padx, pady=pady)

    def toggle(self):
        self.enabled = not self.enabled

    def update_command(self, command, args=None):
        if command is None:
            self._command = lambda: None
        else:
            if args is None:
                self._command = command
            else:
                self._command = _with_args(command, *args)

    def resize(self, width, height):
        SizeMixin.resize(self, width, height)
        if self._image:
            self._load_image()

    def _command_callback(self):
        self._command()

    def _clear_image(self):
        if self._image:
            self._image_source = None
            self._image = None
            _set(self.tk.hid, {"image": None})
            self.resize(None, None)
            self._set_text("Button")

    def _more_props(self, props):
        Widget._more_props(self, props)
        props["image"] = self._image

    def _host_command(self):
        if self.enabled:
            self._command_callback()


class CheckBox(TextWidget):

    def __init__(self, master, text="", command=None, grid=None, align=None, args=None, visible=True, enabled=None,
                 width=None, height=None):
        self._text = str(text)
        self._value = 0
        tk = _Tk(master.tk, "Checkbutton", text=self._text)
        _register(self, tk, "checkbox")
        TextWidget.__init__(self, master, tk, grid, align, visible, enabled, width, height)
        self.update_command(command, args)

    @property
    def value(self):
        return self._value

    @value.setter
    def value(self, value):
        try:
            value = int(value)
            if value in [0, 1]:
                self._value = value
                _set(self.tk.hid, {"value": value})
        except ValueError:
            _error_format("You can only set the value of " + self.description + " to either 0 (not checked) or 1 (checked)")

    @property
    def text(self):
        return self._text

    @text.setter
    def text(self, text):
        self._text = str(text)
        self.tk.config(text=self._text)

    @property
    def description(self):
        return "[CheckBox] object with text '{}'".format(self.text)

    def toggle(self):
        self._value = 1 - self._value
        _set(self.tk.hid, {"value": self._value})

    def update_command(self, command, args=None):
        if command is None:
            self._command = lambda: None
        else:
            if args is None:
                self._command = command
            else:
                self._command = _with_args(command, *args)

    def _command_callback(self):
        self._command()

    def _more_props(self, props):
        Widget._more_props(self, props)
        props["value"] = self._value

    def _host_command(self):
        if self.enabled:
            self.toggle()
            self._command_callback()


class RadioButton(TextWidget):
    """Only used as part of a ButtonGroup."""

    def __init__(self, master, text, value, variable, command=None, grid=None, align=None, visible=True, enabled=None):
        self._text = text
        self._value = value
        self._group = variable
        tk = _Tk(master.tk, "Radiobutton", text=str(text))
        _register(self, tk, "radiobutton")
        TextWidget.__init__(self, master, tk, grid, align, visible, enabled, None, None)

    @property
    def value(self):
        return self._value

    @value.setter
    def value(self, value):
        self._value = str(value)
        _set(self.tk.hid, {"value": self._value})

    @property
    def text(self):
        return self._text

    @text.setter
    def text(self, text):
        self._text = str(text)
        self.tk.config(text=self._text)

    @property
    def description(self):
        return "[RadioButton] object with option={} value={}".format(self.text, self.value)

    def _more_props(self, props):
        Widget._more_props(self, props)
        props["value"] = self._value

    def _host_command(self):
        if self.enabled:
            self._group._select(self._value)


class ButtonGroup(ContainerWidget):

    def __init__(self, master, options=[], selected=None, horizontal=False, command=None, grid=None, align=None, args=None,
                 visible=True, enabled=None, width=None, height=None):
        self._rbuttons = []
        self._horizontal = horizontal
        self._selected = ""
        tk = _Tk(master.tk, "Frame")
        _register(self, tk, "buttongroup")
        ContainerWidget.__init__(self, master, tk, "grid", grid, align, visible, enabled, width, height)
        self._options = []
        for option in options:
            self._options.append(self._parse_option(option))
        self._refresh_options()
        if selected is None and len(self._options) > 0:
            self.value = self._options[0][1]
        else:
            self.value = selected
        self.update_command(command, args)
        option_tks = [option.tk for option in self._rbuttons]
        self._events = EventManager(self, self.tk, *option_tks)
        self.resize(width, height)

    def _parse_option(self, option):
        if not isinstance(option, list):
            return [option, option]
        else:
            return [option[0], option[1]]

    def _refresh_options(self):
        for button in self._rbuttons:
            button.destroy()
        self._rbuttons = []
        gridx = 0
        gridy = 0
        for button in self._options:
            if self._horizontal:
                gridx += 1
            else:
                gridy += 1
            rbutton = RadioButton(self, text=str(button[0]), value=str(button[1]), variable=self, grid=[gridx, gridy],
                                  align="left", visible=self.visible, enabled=self.enabled)
            self._rbuttons.append(rbutton)

    def _select(self, value):
        self.value = value
        self._command_callback()

    @property
    def value(self):
        return self._selected

    @value.setter
    def value(self, value):
        self._selected = str(value)
        _set(self.tk.hid, {"value": self._selected})

    @property
    def value_text(self):
        search = self._selected
        for item in self._rbuttons:
            if item.value == search:
                return item.text
        return ""

    @value_text.setter
    def value_text(self, value):
        for item in self._rbuttons:
            if item.text == value:
                self.value = item.value

    def resize(self, width, height):
        self._width = width
        self._height = height
        for item in self._rbuttons:
            item.width = width
        if len(self._rbuttons) > 0:
            button_height = height
            if isinstance(height, int):
                if height % len(self._rbuttons) != 0:
                    button_height = int(round(height / len(self._rbuttons)))
                    new_height = button_height * len(self._rbuttons)
                    _error_format("ButtonGroup height '{}' doesn't divide by the number of buttons '{}' setting height to '{}'.".format(height, len(self._rbuttons), new_height))
                else:
                    button_height = int(height / len(self._rbuttons))
            for item in self._rbuttons:
                item.height = button_height
        SizeMixin.resize(self, width, height)

    @property
    def options(self):
        return self._options

    @property
    def description(self):
        return "[ButtonGroup] object with selected option '{}'".format(self.value)

    def append(self, option):
        self._options.append(self._parse_option(option))
        self._refresh_options()
        self.resize(self._width, self._height)

    def insert(self, index, option):
        self._options.insert(index, self._parse_option(option))
        self._refresh_options()
        self.resize(self._width, self._height)

    def remove(self, option):
        for existing_option in self._options:
            if existing_option[1] == option:
                self._options.remove(existing_option)
                self._refresh_options()
                return True
        return False

    def clear(self):
        self._options = []
        self._refresh_options()
        self.value = ""

    def get_group_as_list(self):
        return [[option.text, option.value] for option in self._rbuttons]

    def update_command(self, command, args=None):
        if command is None:
            self._command = lambda: None
        else:
            if args is None:
                self._command = command
            else:
                self._command = _with_args(command, *args)

    def _command_callback(self):
        self._command()

    def _more_props(self, props):
        ContainerWidget._more_props(self, props)
        props["value"] = self._selected
        props["horizontal"] = bool(self._horizontal)


class Combo(TextWidget):

    def __init__(self, master, options=[], selected=None, command=None, grid=None, align=None, visible=True, enabled=None,
                 width=None, height=None):
        self._options = [str(x) for x in options]
        self._selected = ""
        tk = _Tk(master.tk, "OptionMenu")
        _register(self, tk, "combo")
        self._menu_tk = _Tk(tk, "Menu")
        TextWidget.__init__(self, master, tk, grid, align, visible, enabled, width, height)
        self._set_tk_config("highlightthickness", 0)
        if selected is None:
            self._set_option_by_index(0)
        else:
            self._set_option(selected)
        self._default = selected
        self.update_command(command)

    @property
    def value(self):
        return self._selected

    @value.setter
    def value(self, value):
        value = str(value)
        if not self._set_option(value):
            _error_format("Tried to set " + self.description + " to option \"" + str(value) + "\", which does not exist")

    @property
    def options(self):
        return self._options

    @property
    def description(self):
        return "[Combo] object with options {}".format(self._options)

    def select_default(self):
        if self._default is None:
            if not self._set_option_by_index(0):
                _error_format(self.description + "\n" + "Unable to select default option as the Combo is empty")
        else:
            if not self._set_option(self._default):
                _error_format(self.description + "\n" + "Unable to select default option as it doesnt exist in the Combo")

    def append(self, option):
        self.insert(len(self._options), option)

    def insert(self, index, option):
        option = str(option)
        self._options.insert(index, option)
        if len(self._options) == 1:
            self.value = option
        self._refresh_options()

    def remove(self, option):
        if option in self._options:
            if len(self._options) == 1:
                self.clear()
            else:
                self._options.remove(option)
                self._refresh_options()
                if option == self.value:
                    self._set_option(self._options[0])
            return True
        else:
            return False

    def clear(self):
        self._options = []
        self._selected = ""
        _set(self.tk.hid, {"options": [], "value": ""})

    def _refresh_options(self):
        selected = self.value
        _set(self.tk.hid, {"options": list(self._options)})
        self._set_option(selected)

    def _set_selected(self, value):
        self._selected = value
        _set(self.tk.hid, {"value": value})

    def _set_option(self, value):
        if len(self._options) > 0:
            if value in self._options:
                self._set_selected(value)
                return True
            else:
                return False
        else:
            return False

    def _set_option_by_index(self, index):
        if index < len(self._options):
            self._set_selected(self._options[index])
            return True
        else:
            return False

    def _command_callback(self, value):
        if self._command:
            args_expected = _no_args_expected(self._command)
            if args_expected == 0:
                self._command()
            elif args_expected == 1:
                self._command(value)
            else:
                _error_format("Combo command function must accept either 0 or 1 arguments.\nThe current command has {} arguments.".format(args_expected))

    def update_command(self, command):
        if command is None:
            self._command = lambda: None
        else:
            self._command = command

    def _more_props(self, props):
        Widget._more_props(self, props)
        props["options"] = list(self._options)
        props["value"] = self._selected

    def _host_change(self, index):
        if self.enabled and 0 <= index < len(self._options):
            item = self._options[index]
            self._set_selected(item)
            self._command_callback(item)


class ListBox(ContainerWidget):

    def __init__(self, master, items=None, selected=None, command=None, grid=None, align=None, visible=True, enabled=None,
                 multiselect=False, scrollbar=False, width=None, height=None):
        tk = _Tk(master.tk, "Frame")
        _register(self, tk, "listbox")
        self._multiselect = multiselect
        self._scrollbar = scrollbar
        ContainerWidget.__init__(self, master, tk, "auto", grid, align, visible, enabled, width, height)
        self._listbox = ListBoxWidget(self, items, selected, command, None, "left", visible, enabled, multiselect, None, None)
        self._listbox.resize("fill", "fill")
        if scrollbar:
            ListBoxScrollbar(self)
        self._events = EventManager(self, self._listbox.tk)
        self.resize(width, height)

    def resize(self, width, height):
        self._set_propagation(width, height)
        SizeMixin.resize(self, width, height)

    @property
    def value(self):
        return self._listbox.value

    @value.setter
    def value(self, value):
        self._listbox.value = value

    def insert(self, index, item):
        self._listbox.insert(index, item)

    def append(self, item):
        self._listbox.append(item)

    def remove(self, item):
        return self._listbox.remove(item)

    def clear(self):
        self._listbox.clear()

    @property
    def items(self):
        return self._listbox.items

    def update_command(self, command):
        self._listbox.update_command(command)

    def _event_tk(self):
        return self._listbox.tk

    def _host_layout(self):
        return []

    def _more_props(self, props):
        ContainerWidget._more_props(self, props)
        lb = self._listbox
        props["items"] = [str(i) for i in lb._items]
        props["selected"] = list(lb._sel)
        props["multiselect"] = bool(self._multiselect)
        props["scrollbar"] = bool(self._scrollbar)
        cfg = lb.tk._cfg
        props["bg"] = _host_value("bg", cfg["bg"])
        props["text_color"] = _host_value("fg", cfg["fg"])
        props["font"] = _host_value("font", cfg["font"])
        props["enabled"] = cfg["state"] != "disabled"

    def _host_change(self, indices):
        self._listbox._host_change(indices)


class ListBoxWidget(TextWidget):

    def __init__(self, master, items=None, selected=None, command=None, grid=None, align=None, visible=True, enabled=None,
                 multiselect=False, width=None, height=None):
        self._multiselect = multiselect
        self._items = []
        self._sel = []
        tk = _Tk(master.tk, "Listbox")
        tk.hid = None
        self._owner = master
        if items is not None:
            for item in items:
                self._items.append(item)
        TextWidget.__init__(self, master, tk, grid, align, visible, enabled, width, height)
        self.events.set_event("<ListBox.ListboxSelect>", "<<ListboxSelect>>", self._command_callback)
        if selected is not None:
            self.value = selected
        self.update_command(command)

    def _set_tk_config(self, keys, value):
        Base._set_tk_config(self, keys, value)
        if isinstance(keys, str):
            keys = [keys]
        props = {}
        for key in keys:
            hp = _HOST_KEYS.get(key)
            if hp is not None and key in self.tk._cfg:
                props[hp] = _host_value(key, self.tk._cfg[key])
        if props:
            _set(self._owner.tk.hid, props)

    def _send_size(self):
        pass

    def _sync(self):
        _set(self._owner.tk.hid, {"items": [str(i) for i in self._items], "selected": list(self._sel)})

    @property
    def value(self):
        if len(self._sel) > 0:
            if self._multiselect:
                return [self._items[i] for i in self._sel]
            else:
                return self._items[self._sel[0]]
        else:
            return None

    @value.setter
    def value(self, value):
        sel = []
        for index in range(len(self._items)):
            if self._multiselect:
                for item in value:
                    if self._items[index] == item and index not in sel:
                        sel.append(index)
            else:
                if self._items[index] == value and index not in sel:
                    sel.append(index)
        sel.sort()
        self._sel = sel
        self._sync()

    def insert(self, index, item):
        if index == "end":
            index = len(self._items)
        index = max(0, min(int(index), len(self._items)))
        self._items.insert(index, item)
        self._sel = [i + 1 if i >= index else i for i in self._sel]
        self._sync()

    def append(self, item):
        self.insert("end", item)

    def remove(self, item):
        for index in range(len(self._items)):
            if item == self._items[index]:
                del self._items[index]
                self._sel = [i - 1 if i > index else i for i in self._sel if i != index]
                self._sync()
                return True
        return False

    def clear(self):
        self._items = []
        self._sel = []
        self._sync()

    @property
    def items(self):
        return list(self._items)

    def _command_callback(self):
        if self._command:
            args_expected = _no_args_expected(self._command)
            if args_expected == 0:
                self._command()
            elif args_expected == 1:
                self._command(self.value)
            else:
                _error_format("ListBox command function must accept either 0 or 1 arguments.\nThe current command has {} arguments.".format(args_expected))

    def update_command(self, command):
        if command is None:
            self._command = lambda: None
        else:
            self._command = command

    def _host_change(self, indices):
        if not self.enabled:
            return
        if isinstance(indices, int):
            indices = [indices]
        sel = sorted(set(i for i in indices if 0 <= i < len(self._items)))
        if not self._multiselect:
            sel = sel[:1]
        self._sel = sel
        self._command_callback()


class ListBoxScrollbar:
    """Stands for the scrollbar child of a ListBox (the host draws the scrollbar)."""

    displayable = True
    visible = True
    grid = None
    align = "right"

    def __init__(self, master):
        self._master = master
        master.children.append(self)

    def __repr__(self):
        return "guizero.ListBoxScrollbar object"


def _scale_round(value, res, start):
    """Tk's rounding to the resolution: steps are counted from the start value."""
    if res <= 0:
        return value
    tick = ((value - start) / res) // 1
    rem = value - start - res * tick
    if rem >= res / 2:
        tick += 1
    return start + tick * res


def _scale_digits(res):
    if res <= 0 or res >= 1:
        return 0
    k = 0
    while res * 10 ** k < 1:
        k += 1
    return k


class Slider(TextWidget):

    def __init__(self, master, start=0, end=100, horizontal=True, command=None, grid=None, align=None, visible=True,
                 enabled=None, width=None, height=None, step=1):
        self._horizontal = horizontal
        self._value = 0.0
        self._idle_pending = False
        tk = _Tk(master.tk, "Scale", **{"from": start, "to": end, "resolution": step})
        _register(self, tk, "slider")
        TextWidget.__init__(self, master, tk, grid, align, visible, enabled, width, height)
        self._constrain(False)
        self.update_command(command)

    def _text_value(self):
        return ("%." + str(_scale_digits(self.tk._cfg["resolution"])) + "f") % self._value

    def _constrain(self, invoke):
        cfg = self.tk._cfg
        end = _scale_round(cfg["to"], cfg["resolution"], cfg["from"])
        if end != cfg["to"]:
            cfg["to"] = end
            _set(self.tk.hid, {"end": end})
        v = _scale_round(self._value, cfg["resolution"], cfg["from"])
        lo = cfg["from"]
        hi = cfg["to"]
        if lo > hi:
            lo, hi = hi, lo
        if v < lo:
            v = lo
        if v > hi:
            v = hi
        changed = v != self._value
        self._value = v
        if changed or not invoke:
            _set(self.tk.hid, {"value": self.value})
        if changed and invoke and not self._idle_pending:
            self._idle_pending = True
            _idle.append(self._idle_command)

    def _idle_command(self):
        self._idle_pending = False
        if not self.tk.destroyed:
            self._command_callback(self._text_value())

    @property
    def value(self):
        s = self._text_value()
        if "." in s:
            return float(s)
        return int(s)

    @value.setter
    def value(self, value):
        self.tk._alive()
        try:
            v = float(value)
        except (ValueError, TypeError):
            raise TclError('expected floating-point number but got "' + str(value) + '"')
        old = self._value
        self._value = v
        self._constrain(False)
        if self._value != old:
            if not self._idle_pending:
                self._idle_pending = True
                _idle.append(self._idle_command)

    @property
    def start(self):
        return self._get_tk_config("from")

    @start.setter
    def start(self, value):
        self._set_tk_config("from", value)
        self._constrain(True)

    @property
    def end(self):
        return self._get_tk_config("to")

    @end.setter
    def end(self, value):
        self._set_tk_config("to", value)
        self._constrain(True)

    @property
    def step(self):
        return self._get_tk_config("resolution")

    @step.setter
    def step(self, value):
        self._set_tk_config("resolution", value)
        self._constrain(True)

    def resize(self, width, height):
        self._set_width(width)
        self._set_height(height)
        self._send_size()
        if width == "fill" or height == "fill":
            self.master.display_widgets()

    def _set_width(self, width):
        self._width = width
        if width != "fill":
            if self._horizontal:
                self._set_tk_config("length", width)
            else:
                self._set_tk_config("width", width)

    def _set_height(self, height):
        self._height = height
        if height != "fill":
            if self._horizontal:
                self._set_tk_config("width", height)
            else:
                self._set_tk_config("length", height)

    @property
    def description(self):
        return "[Slider] object from {} to {}".format(self.start, self.end)

    def _command_callback(self, value):
        if self._command:
            args_expected = _no_args_expected(self._command)
            if args_expected == 0:
                self._command()
            elif args_expected == 1:
                self._command(value)
            else:
                _error_format("Slider command function must accept either 0 or 1 arguments.\nThe current command has {} arguments.".format(args_expected))

    def update_command(self, command):
        if command is None:
            self._command = lambda: None
        else:
            self._command = command

    def _more_props(self, props):
        Widget._more_props(self, props)
        props["value"] = self.value
        props["horizontal"] = bool(self._horizontal)

    def _host_change(self, value):
        if not self.enabled:
            return
        old = self._value
        self._value = float(value)
        self._constrain(False)
        if self._value != old:
            self._command_callback(self._text_value())


class Picture(Widget):

    def __init__(self, master, image=None, grid=None, align=None, visible=True, enabled=None, width=None, height=None):
        self._image_source = image
        self._image = None
        tk = _Tk(master.tk, "Label")
        _register(self, tk, "picture")
        Widget.__init__(self, master, tk, grid, align, visible, enabled, width, height)
        self._load_image()

    def _load_image(self):
        if self._height == "fill" or self._width == "fill":
            _raise_error("{}\nCannot use 'fill' for width and height.".format(self.description))
        if self._image_source is not None:
            size = _image_size(self._image_source)
            self._image = self._image_source
            self._width = size[0] if self._width is None else self._width
            self._height = size[1] if self._height is None else self._height
            _set(self.tk.hid, {"image": self._image, "width": self._width, "height": self._height})

    @property
    def value(self):
        return self._image

    @value.setter
    def value(self, image_source):
        self._image_source = image_source
        self._load_image()

    @property
    def image(self):
        return self.value

    @image.setter
    def image(self, image_source):
        self.value = image_source

    def resize(self, width, height):
        self._width = width
        self._height = height
        self._send_size()
        self._load_image()

    def _more_props(self, props):
        Widget._more_props(self, props)
        props["image"] = self._image


class Waffle(Widget):

    def __init__(self, master, height=3, width=3, dim=20, pad=5, color="white", dotty=False, grid=None, align=None,
                 command=None, visible=True, enabled=None, bg=None):
        tk = _Tk(master.tk, "Frame")
        _register(self, tk, "waffle")
        self._pixel_size = dim
        self._pad = pad
        self._color = _convert_color(color)
        _hex_color(self._color)
        self._dotty = dotty
        self._waffle_pixels = {}
        self._canvas = None
        self._enabled = True
        Widget.__init__(self, master, tk, grid, align, visible, enabled, width, height)
        if self._canvas is None:
            self._create_waffle()
        if bg is not None:
            self.bg = bg
        self.update_command(command)
        self._events = EventManager(self, self._canvas)
        self.events.set_event("<Waffle.ButtonPress-1>", "<ButtonPress-1>", self._clicked_on)

    def _create_waffle(self):
        if self._height == "fill" or self._width == "fill":
            _raise_error("{}\nCannot use 'fill' for width and height.".format(self.description))
        if self._canvas is None:
            self._canvas = _Tk(self.tk, "Canvas")
        new_pixels = {}
        for x in range(self._width):
            for y in range(self._height):
                old = self._waffle_pixels.get((x, y))
                if old is not None:
                    new_pixels[x, y] = WafflePixel(x, y, self, old.dotty, old.color)
                else:
                    new_pixels[x, y] = WafflePixel(x, y, self, self._dotty, self._color)
        self._waffle_pixels = new_pixels
        _set(self.tk.hid, self._waffle_props())

    def _waffle_props(self):
        return {"width": self._width, "height": self._height, "dim": self._pixel_size, "pad": self._pad,
                "pixels": [[[_hex_color(self._waffle_pixels[x, y]._color), bool(self._waffle_pixels[x, y]._dotty)]
                            for x in range(self._width)] for y in range(self._height)]}

    def _pixel_changed(self, p):
        _set(self.tk.hid, {"pixel": [p.x, p.y, _hex_color(p._color), bool(p._dotty)]})

    def set_all(self, color):
        for x in range(self._width):
            for y in range(self._height):
                self._waffle_pixels[x, y].color = color

    def set_pixel(self, x, y, color):
        if self.pixel(x, y):
            self._waffle_pixels[x, y].color = color

    def get_pixel(self, x, y):
        if self.pixel(x, y):
            return self._waffle_pixels[x, y].color

    def get_all(self):
        all_pixels = []
        for y in range(self._height):
            row = []
            for x in range(self._width):
                row.append(self._waffle_pixels[x, y].color)
            all_pixels.append(row)
        return all_pixels

    def _clicked_on(self, e):
        if self._enabled:
            x = int(e.tk_event.x - (self._pad / 2))
            y = int(e.tk_event.y - (self._pad / 2))
            if x >= 0 and y >= 0:
                pixel_x = int(x / (self._pixel_size + self._pad))
                pixel_y = int(y / (self._pixel_size + self._pad))
                if self._command and pixel_x < self._width and pixel_y < self._height:
                    args_expected = _no_args_expected(self._command)
                    if args_expected == 0:
                        self._command()
                    elif args_expected == 2:
                        self._command(pixel_x, pixel_y)
                    else:
                        _error_format("Waffle command function must accept either 0 or 2 arguments.\nThe current command has {} arguments.".format(args_expected))

    def update_command(self, command):
        if command is None:
            self._command = lambda: None
        else:
            self._command = command

    def pixel(self, x, y):
        if (x, y) in self._waffle_pixels.keys():
            _pixel = self._waffle_pixels[x, y]
        else:
            _error_format("Pixel x={} y={} is off the edge of the waffle".format(x, y))
            _pixel = None
        return _pixel

    def _get_enabled(self):
        return self._enabled

    def _set_enabled(self, value):
        self._enabled = value
        _set(self.tk.hid, {"enabled": bool(value)})

    def disable(self):
        self._set_enabled(False)

    def enable(self):
        self._set_enabled(True)

    def resize(self, width, height):
        if self._width != width or self._height != height or self._canvas is None:
            self._width = width
            self._height = height
            self._create_waffle()

    @property
    def pixel_size(self):
        return self._pixel_size

    @pixel_size.setter
    def pixel_size(self, value):
        if self._pixel_size != value:
            self._pixel_size = value
            self._create_waffle()

    @property
    def pad(self):
        return self._pad

    @pad.setter
    def pad(self, value):
        if self._pad != value:
            self._pad = value
            self._create_waffle()

    @property
    def color(self):
        return self._color

    @color.setter
    def color(self, value):
        old_color = self._color
        self._color = _convert_color(value)
        for x in range(self._width):
            for y in range(self._height):
                if self._waffle_pixels[x, y].color == old_color:
                    self._waffle_pixels[x, y].color = self._color

    @property
    def dotty(self):
        return self._dotty

    @dotty.setter
    def dotty(self, value):
        self._dotty = value
        for x in range(self._width):
            for y in range(self._height):
                self._waffle_pixels[x, y].dotty = self._dotty

    def _set_bg(self, value):
        if self.bg != value:
            value = _convert_color(value)
            ColorMixin._set_bg(self, value)
            if self._canvas is None and isinstance(self._width, int) and isinstance(self._height, int):
                self._create_waffle()

    @property
    def description(self):
        return "[Waffle] object with text ({}x{})".format(self._height, self._width)

    def reset(self):
        self.set_all(self._color)
        self.dotty = self._dotty

    def __getitem__(self, index):
        return self._waffle_pixels[index]

    def _event_tk(self):
        return self._canvas

    def _more_props(self, props):
        props.update(self._waffle_props())
        props["enabled"] = bool(self._enabled)


class WafflePixel:

    def __init__(self, x, y, waffle, dotty, color):
        self._x = x
        self._y = y
        self._waffle = waffle
        self._size = waffle._pixel_size
        self._canvas_x = waffle._pad + x * (waffle._pixel_size + waffle._pad)
        self._canvas_y = waffle._pad + y * (waffle._pixel_size + waffle._pad)
        self._dotty = dotty
        self._color = color

    @property
    def x(self):
        return self._x

    @property
    def y(self):
        return self._y

    @property
    def canvas_x(self):
        return self._canvas_x

    @property
    def canvas_y(self):
        return self._canvas_x

    @property
    def size(self):
        return self._size

    @property
    def color(self):
        return self._color

    @color.setter
    def color(self, value):
        value = _convert_color(value)
        _hex_color(value)
        self._color = value
        self._waffle._pixel_changed(self)

    @property
    def dotty(self):
        return self._dotty

    @dotty.setter
    def dotty(self, value):
        self._dotty = value
        self._waffle._pixel_changed(self)


def _flat(coords):
    out = []
    for c in coords:
        if isinstance(c, (list, tuple)):
            for v in c:
                out.append(v)
        else:
            out.append(c)
    return out


class Drawing(Widget):

    def __init__(self, master, width=100, height=100, grid=None, align=None, visible=True, enabled=None):
        self._images = {}
        self._shapes = {}
        self._shape_id = 0
        tk = _Tk(master.tk, "Canvas")
        _register(self, tk, "drawing")
        Widget.__init__(self, master, tk, grid, align, visible, enabled, width, height)

    def _add(self, shape, colors=()):
        """Store and send a shape. Like a tk canvas, an item whose colours tk rejects still uses up its id."""
        self.tk._alive()
        self._shape_id += 1
        for key in colors:
            if shape.get(key) is not None:
                shape[key] = _hex_color(shape[key])
        shape["id"] = self._shape_id
        self._shapes[self._shape_id] = shape
        if self.tk.hid not in _pending_ids:
            _send("draw", {"id": self.tk.hid, "shape": shape})
        return self._shape_id

    def line(self, x1, y1, x2, y2, color="black", width=1):
        return self._add({"type": "line", "coords": [x1, y1, x2, y2], "width": width,
                          "color": None if color is None else _convert_color(color)}, ("color",))

    def _shape(self, kind, coords, color, outline, outline_color):
        return self._add({"type": kind, "coords": coords, "color": None if color is None else _convert_color(color),
                          "outline": int(outline), "outline_color": _convert_color(outline_color) if outline else None},
                         ("color", "outline_color"))

    def oval(self, x1, y1, x2, y2, color="black", outline=False, outline_color="black"):
        return self._shape("oval", [x1, y1, x2, y2], color, outline, outline_color)

    def rectangle(self, x1, y1, x2, y2, color="black", outline=False, outline_color="black"):
        return self._shape("rectangle", [x1, y1, x2, y2], color, outline, outline_color)

    def polygon(self, *coords, color="black", outline=False, outline_color="black"):
        return self._shape("polygon", _flat(coords), color, outline, outline_color)

    def triangle(self, x1, y1, x2, y2, x3, y3, color="black", outline=False, outline_color="black"):
        return self.polygon(x1, y1, x2, y2, x3, y3, color=color, outline=outline, outline_color=outline_color)

    def image(self, x, y, image, width=None, height=None):
        size = _image_size(image)
        shape_id = self._add({"type": "image", "coords": [x, y], "image": image,
                              "width": size[0] if width is None else width, "height": size[1] if height is None else height})
        self._images[shape_id] = image
        return shape_id

    def text(self, x, y, text, color="black", font=None, size=None, max_width=None, bold=None, italic=None, underline=None, overstrike=None):
        if size is not None and (isinstance(size, float) or isinstance(size, str) and not size.lstrip("-").isdigit()):
            raise TclError('expected integer but got "' + str(size) + '"')
        f = {"family": _FONT[0] if font is None else font, "size": _FONT[1] if size is None else int(size), "bold": bool(bold),
             "italic": bool(italic), "underline": bool(underline), "overstrike": bool(overstrike)}
        return self._add({"type": "text", "coords": [x, y], "text": str(text), "color": None if color is None else _convert_color(color),
                          "font": f, "max_width": max_width}, ("color",))

    def delete(self, id):
        if id in self._images.keys():
            del self._images[id]
        if id in self._shapes:
            del self._shapes[id]
            if self.tk.hid not in _pending_ids:
                _send("undraw", {"id": self.tk.hid, "shape": id})

    def clear(self):
        self._images.clear()
        self._shapes.clear()
        if self.tk.hid not in _pending_ids:
            _send("clear", {"id": self.tk.hid})

    def _more_props(self, props):
        Widget._more_props(self, props)
        props["shapes"] = [self._shapes[k] for k in self._shapes]


class MenuBar(Component):

    def __init__(self, master, toplevel, options):
        if not isinstance(master, (App, Window)):
            _error_format("The [MenuBar] must have an [App] or [Window] object as its master")
        tk = _Tk(master.tk, "Menu")
        _register(self, tk, "menubar")
        Component.__init__(self, master, tk, False)
        self._sub_menus = []
        self._toplevel = []
        self._commands = []
        for i in range(len(toplevel)):
            labels = []
            commands = []
            for menu_item in options[i]:
                labels.append(str(menu_item[0]))
                commands.append(menu_item[1])
            self._sub_menus.append(labels)
            self._commands.append(commands)
            self._toplevel.append(str(toplevel[i]))

    def _more_props(self, props):
        props["toplevel"] = list(self._toplevel)
        props["options"] = [list(m) for m in self._sub_menus]

    def _host_menu(self, i, j):
        if 0 <= i < len(self._commands) and 0 <= j < len(self._commands[i]):
            self._commands[i][j]()


# ---------------------------------------------------------------------------------------------------------------------
# Dialogs (guizero.dialog): the program waits until the host answers

def _dialog(kind, title, text, initial=None):
    _run_idle()
    _flush()
    return _host.dialog(kind, title, text, initial)


def warn(title, text, master=None):
    _dialog("warn", title, text)


def info(title, text, master=None):
    _dialog("info", title, text)


def error(title, text, master=None):
    _dialog("error", title, text)


def yesno(title, text, master=None):
    return bool(_dialog("yesno", title, text))


def question(title, question, initial_value=None, master=None):
    answer = _dialog("question", title, question, initial_value)
    return None if answer is None else str(answer)


def select_file(title="Select file", folder=".", filetypes=[["All files", "*.*"]], save=False, master=None, filename=""):
    if not _os.path.isdir(folder):
        _error_format("The folder '{}' specified for select_file does not exist.".format(folder))
        folder = "."
    answer = _dialog("save_file" if save else "open_file", title, folder, {"filetypes": filetypes, "filename": filename})
    return "" if answer is None else str(answer)


def select_folder(title="Select folder", folder=".", master=None):
    if not _os.path.isdir(folder):
        _error_format("The folder '{}' specified for select_folder does not exist.".format(folder))
        folder = "."
    answer = _dialog("folder", title, folder)
    return "" if answer is None else str(answer)


def select_color(color=None, master=None):
    initial = None if color is None else _hex_color(_convert_color(color))
    answer = _dialog("color", "", "", initial)
    return None if answer is None else str(answer)
`;
