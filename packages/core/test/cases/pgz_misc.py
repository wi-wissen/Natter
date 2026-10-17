# needs: pygame
# keys, keymods, mouse, keyboard, images, sounds and tone of Pygame Zero.
import pgzrun


def show(f):
    try:
        return repr(f())
    except Exception as e:
        return type(e).__name__ + ": " + str(e)


print(keys.A, keys.Z, keys.K_0, keys.K_9, keys.SPACE, keys.RETURN, keys.ESCAPE, keys.LEFT, keys.RIGHT, keys.UP, keys.DOWN,
      keys.LSHIFT, keys.RSHIFT, keys.LCTRL, keys.TAB, keys.BACKSPACE, keys.F1, keys.F12, keys.KP0, keys.KP_ENTER,
      keys.PAUSE, keys.BREAK, keys.EURO, keys.LSUPER, keys.LMETA, keys.PLUS, keys.MINUS, keys.EQUALS, keys.DELETE)
print(len(keys), keys["A"], keys(97), show(lambda: keys(5)), keys.A == 97, keys.LEFT > 1000, show(lambda: keys["NOPE"]))
print(keymods.SHIFT, keymods.LSHIFT, keymods.CTRL, keymods.ALT, keymods.META, keymods.GUI, keymods.CAPS, keymods.NUM,
      keymods.NONE, keymods.MODE, keymods.LMETA)
print(mouse.LEFT, mouse.MIDDLE, mouse.RIGHT, mouse.WHEEL_UP, mouse.WHEEL_DOWN, mouse(3), len(mouse), [int(m) for m in mouse],
      show(lambda: mouse(7)))
print(keyboard.a, keyboard.left, keyboard.space, keyboard.k_1, keyboard[keys.A], keyboard.kp_enter)
print(show(lambda: keyboard.nokey))
print(images.alien.get_size(), images.box.get_width(), images.tall.get_height(), images.load("wide").get_size(),
      images.dot.get_rect(), images.alien.get_rect(center=(100, 100)), images.box.get_rect(topleft=(1.5, 2.5)))
print(images.alien is images.alien, images.load("alien") is images.alien)
print(show(lambda: images.nothing))
print(show(lambda: images.load("nothing")))
print(show(lambda: images.Alien))
print(sounds.eep.get_length(), sounds.boom.get_length(), sounds.eep is sounds.eep)
s = sounds.eep
print(s.get_volume())
for v in [0.5, 0.3, 1.0, 2.0, 0.999, -1, 0, 0.01, 0.0078125]:
    s.set_volume(v)
    print(v, s.get_volume())
print(show(lambda: sounds.nothing))
for note in ["A4", "A0", "C4", "C#4", "Db4", "B8", "G#7", "E2", "Fb3", "Cb0", "B#8", "H4", "A9", "a4", "A", "A#", "A4 "]:
    print(note, show(lambda: tone.note_to_hertz(note)))
print(show(lambda: tone.play("A4", 5)), show(lambda: tone.play("A4", 0)), show(lambda: tone.play("X1", 1)))
for pitch, dur in [("A4", 0.5), (440, 1), ("C5", 0.1), (261.63, 2.5)]:
    print(pitch, dur, round(tone.create(pitch, dur).get_length(), 6))
