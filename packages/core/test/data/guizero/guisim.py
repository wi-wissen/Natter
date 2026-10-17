# Test helper for the guizero golden files: sim(kind, widget, ...) handles an event the way a user would cause it.
# In Natter it goes through the same dispatch as host events (guizero._sim); in CPython it drives tkinter.
try:
    from guizero import _sim as _natter_sim
except ImportError:
    _natter_sim = None

_TK_MOUSE = {
    "press1": "<ButtonPress-1>", "release1": "<ButtonRelease-1>", "press3": "<ButtonPress-3>",
    "release3": "<ButtonRelease-3>", "double1": "<Double-Button-1>", "motion": "<Motion>", "drag1": "<B1-Motion>",
    "enter": "<Enter>", "leave": "<Leave>",
}


def _event_tk(w):
    if hasattr(w, "_listbox"):
        return w._listbox.tk
    if hasattr(w, "_canvas"):
        return w._canvas
    return w.tk


def sim(kind, w, *args):
    """kind: command, change, mouse, key, menu, close (see docs/FORMS-BRIDGE.md)."""
    if _natter_sim is not None:
        return _natter_sim(kind, w, *args)
    name = type(w).__name__
    if kind == "command":
        if name == "RadioButton":
            w.tk.invoke()
        else:
            w.tk.invoke()
    elif kind == "change":
        value = args[0]
        if name == "TextBox":
            if w._multiline:
                w.tk.delete(1.0, "end")
                w.tk.insert("end", value)
            else:
                w._text.set(value)
        elif name == "Combo":
            w._combo_menu.tk.invoke(value)
        elif name == "ListBox":
            lb = w._listbox.tk
            lb.selection_clear(0, "end")
            for i in ([value] if isinstance(value, int) else value):
                lb.selection_set(i)
            lb.event_generate("<<ListboxSelect>>")
        elif name == "Slider":
            if w.enabled:
                w.tk.set(value)
                w.tk.update_idletasks()
    elif kind == "mouse":
        t = _event_tk(w)
        x = args[1] if len(args) > 1 else 0
        y = args[2] if len(args) > 2 else 0
        if args[0] == "double1":
            # tk sees a second press soon after the first as a double click
            t.event_generate("<ButtonPress-1>", x=x, y=y)
        else:
            t.event_generate(_TK_MOUSE[args[0]], x=x, y=y)
    elif kind == "key":
        t = _event_tk(w)
        t.focus_force()
        t.update()
        keysym = args[2] if len(args) > 2 else args[1]
        t.event_generate("<KeyPress>" if args[0] == "press" else "<KeyRelease>", keysym=keysym)
    elif kind == "menu":
        w.tk.nametowidget(w.tk.entrycget(args[0] + 1, "menu")).invoke(args[1])
    elif kind == "close":
        w._close_window()
