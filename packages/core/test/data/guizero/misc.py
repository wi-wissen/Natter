# Inheriting from containers, timer edge cases and the end of display().
from guizero import *


def show(label, f):
    try:
        print(label, repr(f()))
    except Exception as e:
        print(label, "EXC", type(e).__name__, str(e).replace("\n", "|"))


app = App(bg="black")
app.text_color = "white"
app.text_size = 16
app.font = "DejaVu Sans"
t = Text(app, text="inherits")
show("inherited", lambda: (t.bg, t.text_color, t.text_size, t.font))
b = PushButton(app)
show("button inherited", lambda: (b.bg, b.text_color, b.text_size, b.font))
app.bg = "white"
show("cascade", lambda: (t.bg, b.bg))
app.disable()
late = TextBox(app)
show("disabled app", lambda: (app.enabled, t.enabled, late.enabled))
app.enable()
show("enabled app", lambda: (t.enabled, late.enabled))
own = Text(app, enabled=False)
show("own enabled", lambda: own.enabled)
box = Box(app)
box.disable()
inbox = CheckBox(box)
show("disabled box", lambda: inbox.enabled)
show("after float", lambda: app.after(100.5, print))
show("after str", lambda: app.after("x", print))
show("after neg", lambda: app.after(-5, print, ["negative ms"]))
show("cancel unknown", lambda: app.cancel(len))
order = []


def note(x):
    print("note", x)


app.after(30, note, ["a"])
app.after(10, note, ["b"])
app.after(20, note, ["c"])
app.after(20, note, ["d"])
app.repeat(500, note, ["never"])
app.cancel(note)
t.after(40, note, ["on text"])


def finish():
    print("finish")
    app.destroy()
    print("after destroy in callback")


app.after(100, finish)
app.display()
print("display returned", App._main_app)
show("text after app destroy", lambda: t.value)
show("bg after app destroy", lambda: t.bg)
