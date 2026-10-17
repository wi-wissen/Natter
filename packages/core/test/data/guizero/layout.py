# Layout rules: grid references and their checks, align, children lists, hiding and destroying widgets.
from guizero import *


def show(label, f):
    try:
        print(label, repr(f()))
    except Exception as e:
        print(label, "EXC", type(e).__name__, str(e).replace("\n", "|"))


app = App(layout="grid")
a = Text(app, text="a", grid=[0, 0])
b = PushButton(app, text="b", grid=[1, 0, 2, 1], align="left")
show("grids", lambda: (str(a.grid), str(b.grid), len(b.grid), b.grid[2], list(b.grid), b.align))
show("missing grid", lambda: Text(app, text="m"))
show("grid not list", lambda: Text(app, text="n", grid="0,1"))
show("grid wrong length", lambda: Text(app, text="o", grid=[1]))
show("children", lambda: [c.value if isinstance(c, Text) else c.text for c in app.children])
for c in list(app.children):
    if isinstance(c, Text) and c.value in "mno":
        c.destroy()
show("cleaned", lambda: [str(c) for c in app.children])
show("negative column", lambda: Text(app, text="p", grid=[-1, 0]))
app.children[-1].destroy()
show("text column", lambda: Text(app, text="q", grid=["x", 0]))
app.children[-1].destroy()
show("float row", lambda: Text(app, text="r", grid=[0, 1.5]))
app.children[-1].destroy()
show("zero span", lambda: Text(app, text="s", grid=[0, 1, 0, 1]))
app.children[-1].destroy()
show("string numbers", lambda: str(Text(app, text="t", grid=["2", "3"]).grid))
c = Text(app, text="c", grid=[0, 2])
c.grid = [3, 4]
show("grid set", lambda: str(c.grid))
c.grid[0] = 5
show("grid item set", lambda: (str(c.grid), c.grid[0]))
show("grid tuple", lambda: str(Text(app, text="u", grid=(1, 1)).grid))
show("align bad", lambda: Text(app, text="v", grid=[0, 5], align="middle").align)
c.align = "top"
show("align set", lambda: c.align)
c.align = "centre"
show("align set bad", lambda: c.align)

box = Box(app, grid=[0, 6], layout="auto")
x = Text(box, text="x")
y = Text(box, text="y", align="left")
z = Text(box, text="z", grid=[0, 0])
show("box children", lambda: [t.value for t in box.children])
show("pack grid", lambda: (x.grid, z.grid, y.align, x.align))
y.hide()
show("hidden", lambda: (y.visible, [t.visible for t in box.children]))
y.visible = True
x.destroy()
show("destroyed", lambda: [t.value for t in box.children])
show("destroyed value", lambda: x.value)
show("destroyed bg", lambda: x.bg)
show("destroyed set", lambda: setattr(x, "value", "again"))
inner = Box(box)
deep = Text(inner, text="deep")
show("nested", lambda: (deep.master is inner, inner.master is box, box.master is app))
box.destroy()
show("box destroyed", lambda: (box in app.children, [str(t) for t in box.children], deep.value))
show("deep bg", lambda: deep.bg)
show("app children", lambda: [type(c).__name__ for c in app.children])

g = Box(app, layout="grid", grid=[0, 7])
for i in range(3):
    for j in range(2):
        Text(g, text=str(i * 10 + j), grid=[i, j])
show("grid box", lambda: [(t.value, str(t.grid)) for t in g.children])
show("not a container", lambda: Text(a, text="bad"))
win = Window(app, layout="grid")
Text(win, text="w", grid=[0, 0])
show("window children", lambda: [str(t) for t in win.children])
win.destroy()
show("after window destroy", lambda: [type(t).__name__ for t in app.children])
app.destroy()
show("app destroyed text", lambda: a.value)
show("app destroyed bg", lambda: a.bg)
