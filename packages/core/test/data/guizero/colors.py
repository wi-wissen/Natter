# Colour arguments: Tk colour names (any case, with or without spaces), (r, g, b) and "#rrggbb", and the errors.
from guizero import *


def show(label, f):
    try:
        print(label, repr(f()))
    except Exception as e:
        print(label, "EXC", type(e).__name__, str(e).replace("\n", "|"))


app = App()
t = Text(app)
for c in ["red", "Red", "LightBlue", "light blue", "LIGHT BLUE", "light  blue", "gray50", "grey50", "Grey 50", "navy blue",
          "lightgoldenrod", "DarkSeaGreen3", "rebeccapurple", "crimson", "fuchsia", "nocolor", "", " white ", "#ABCDEF",
          "#abc", "#12345", "#1234567", "#gg0000", "#-10000", (0, 128, 255), [255, 255, 255], (256, 0, 0), (-1, 0, 0),
          (1, 2), (1, 2, 3, 4), 7, None, "SystemButtonFace", "transparent", "blue4", "medium purple", "MediumPurple1"]:
    show("bg " + repr(c), lambda: (setattr(t, "bg", c), t.bg)[1])
    show("fg " + repr(c), lambda: (setattr(t, "text_color", c), t.text_color)[1])
w = Waffle(app, color="light blue")
show("waffle", lambda: w.get_pixel(0, 0))
show("waffle bad", lambda: Waffle(app, color="nocolor"))
show("waffle tuple bad", lambda: w.set_pixel(0, 0, (1, 2, 300)))
d = Drawing(app)
show("drawing", lambda: d.rectangle(0, 0, 1, 1, color=(1, 2, 3), outline=2, outline_color="Dark Orange"))
show("drawing bad outline", lambda: d.rectangle(0, 0, 1, 1, outline=True, outline_color="nocolor"))
show("drawing bad outline unused", lambda: d.rectangle(0, 0, 1, 1, outline_color="nocolor"))
box = Box(app)
show("box border color", lambda: box.set_border(1, "nocolor"))
