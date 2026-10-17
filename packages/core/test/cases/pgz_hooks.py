# needs: pygame
# Without update() Pygame Zero only redraws after input or a clock event; misspelt hooks give warnings.
WIDHT = 500
TITLE = "Hooks"


def draw():
    print("draw", round(clock.clock.t, 6))


def on_key_down():
    print("key down")


def on_mouse_down(button):
    print("mouse down", button)


def on_mouse_dwon(pos):
    print("never called")


def on_music_end():
    print("music ended")


def later():
    print("later", round(clock.clock.t, 6))


clock.schedule(later, 0.1)
