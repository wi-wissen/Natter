# Commands, change events, mouse and key events, timers (after/repeat/cancel) and the event loop of display().
from guizero import *
from guisim import sim

log = []


def say(*args):
    print(*args)


app = App(title="Events", width=900, height=1100)
box = Box(app)
b = PushButton(box, text="b", command=say, args=["button", 1])
b2 = PushButton(app, text="off", command=lambda: say("disabled button ran"), enabled=False)
cb = CheckBox(app, text="c", command=lambda: say("checkbox", cb.value))
bg = ButtonGroup(app, options=["x", "y"], command=lambda: say("group", bg.value, bg.value_text))
co = Combo(app, options=["p", "q", "r"], command=lambda v: say("combo", repr(v), co.value))
co0 = Combo(app, options=["p", "q"], command=lambda: say("combo no arg", co0.value))
lb = ListBox(app, items=["i", "j", "k"], command=lambda v: say("listbox", repr(v)))
lbm = ListBox(app, items=["i", "j", "k"], multiselect=True, command=lambda: say("listbox multi", lbm.value))
sl = Slider(app, command=lambda v: say("slider", repr(v), repr(sl.value)))
sl2 = Slider(app, start=0, end=1, step=0.1, command=say)
tb = TextBox(app, command=lambda key: say("textbox key", repr(key), repr(tb.value)))
tb0 = TextBox(app, command=lambda: say("textbox no arg", repr(tb0.value)))
wf = Waffle(app, command=lambda x, y: say("waffle", x, y))
wf0 = Waffle(app, command=lambda: say("waffle no arg"))
dr = Drawing(app)
tx = Text(app, text="label")
mb = MenuBar(app, ["File", "Edit"], [[["Open", lambda: say("open")]], [["Cut", lambda: say("cut")], ["Paste", lambda: say("paste")]]])


def clicked(event):
    say("clicked", event.widget, event.x, event.y, event.display_x is not None)


def app_clicked(event):
    say("app sees click", event.widget)


def key(event):
    say("key", repr(event.key), event.tk_event.keysym, event.widget)


def bad(a, b):
    say("never")


class Handler:
    def __init__(self, name):
        self.name = name

    def on_click(self):
        say("method", self.name)

    def on_event(self, e):
        say("method with event", self.name, e.x)


def phase1():
    say("phase1")
    sim("command", b)
    sim("command", b2)
    sim("command", cb)
    sim("command", cb)
    sim("command", bg.children[1])
    sim("change", co, 2)
    sim("change", co0, 1)
    sim("change", lb, 1)
    sim("change", lbm, [0, 2])
    sim("change", sl, 37)
    sim("change", sl2, 0.35)
    sim("change", tb, "hi")
    sim("key", tb, "release", "", "i")
    sim("change", tb0, "yo")
    sim("key", tb0, "release", "", "o")
    say("textbox value", repr(tb.value))
    sim("mouse", wf, "press1", 30, 30)
    sim("mouse", wf, "press1", 2, 2)
    sim("mouse", wf0, "press1", 10, 10)
    sim("menu", mb, 1, 1)
    sim("menu", mb, 0, 0)
    b.update_command(say, ["updated"])
    sim("command", b)
    b.update_command(None)
    sim("command", b)
    b.when_clicked = clicked
    sim("mouse", b, "press1", 4, 5)
    say("button value", b.value)
    sim("mouse", b, "release1", 4, 5)
    say("button value", b.value)
    app.when_clicked = app_clicked
    sim("mouse", b, "press1", 1, 1)
    sim("mouse", dr, "press1", 1, 1)
    app.when_clicked = None
    b.when_clicked = None
    sim("mouse", b, "press1", 1, 1)
    dr.when_left_button_pressed = clicked
    dr.when_left_button_released = lambda: say("released")
    dr.when_right_button_pressed = lambda e: say("right", e.x)
    dr.when_mouse_moved = lambda e: say("moved", e.x, e.y)
    dr.when_mouse_dragged = lambda e: say("dragged", e.x, e.y)
    dr.when_double_clicked = lambda: say("double")
    dr.when_mouse_enters = lambda: say("enter")
    dr.when_mouse_leaves = lambda: say("leave")
    for k in ["press1", "release1", "press3", "motion", "drag1", "press1", "double1", "enter", "leave"]:
        sim("mouse", dr, k, 7, 8)
    say("event getters", dr.when_mouse_moved is not None, dr.when_clicked)
    h = Handler("h")
    tx.when_clicked = h.on_click
    sim("mouse", tx, "press1", 0, 0)
    tx.when_clicked = h.on_event
    sim("mouse", tx, "press1", 3, 0)
    tx.when_clicked = bad
    sim("mouse", tx, "press1", 0, 0)
    tx.when_clicked = None
    bg.when_clicked = lambda e: say("group clicked", e.widget)
    sim("mouse", bg, "press1", 0, 0)
    sim("mouse", wf, "press1", 0, 0)
    wf.when_clicked = lambda: say("waffle clicked")
    sim("mouse", wf, "press1", 30, 5)
    wf.disable()
    sim("mouse", wf, "press1", 30, 5)
    app.when_key_pressed = key
    dr.when_key_pressed = key
    sim("key", dr, "press", "a", "a")
    sim("key", dr, "press", "", "Left")
    app.when_key_pressed = None
    dr.when_key_released = lambda e: say("key up", e.tk_event.keysym)
    sim("key", dr, "release", "", "space")
    sl.value = 80
    sl.value = 81
    say("slider set", sl.value)
    app.after(100, phase2, ["two", 2])


def phase2(word, number):
    say("phase2", word, number)
    app.repeat(100, tick)
    app.after(1000, late)
    app.after(250, cancel_it)
    app.cancel(never_scheduled)


count = [0]


def tick():
    count[0] += 1
    say("tick", count[0])
    if count[0] == 5:
        app.cancel(tick)
        app.after(50, phase3)


def late():
    say("late (should be cancelled)")


def cancel_it():
    say("cancel late")
    app.cancel(late)


def never_scheduled():
    pass


def phase3():
    say("phase3")
    app.when_closed = closing
    sim("close", app)


def closing():
    say("closing", app.title)
    app.after(20, really_close)


def really_close():
    say("really close")
    app.when_closed = None
    sim("close", app)


app.after(50, phase1)
say("before display")
app.display()
say("after display", count[0])
