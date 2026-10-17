# needs: pygame
# A small game in the style of the Pygame Zero docs; driven frame by frame with the input in pgz_game.frames.
WIDTH = 300
HEIGHT = 200
TITLE = "Test game"

alien = Actor("alien", (50, 50))
box = Actor("box", topleft=(200, 100))
score = 0


def draw():
    screen.clear()
    alien.draw()
    box.draw()
    print("draw", alien.pos, box.pos, score, keyboard.left, keyboard.right, keyboard.a, keyboard[keys.SPACE])


def update(dt):
    print("update", dt, round(clock.clock.t, 6))
    if keyboard.right:
        alien.x += 2
    if keyboard.left:
        alien.x -= 2
    if alien.colliderect(box):
        print("collision")


def on_key_down(key, mod, unicode):
    print("key_down", key, mod, repr(unicode), key == keys.SPACE, key == keys.RIGHT)
    if key == keys.SPACE:
        animate(box, pos=(100, 50), duration=0.05, tween="accelerate", on_finished=arrived)


def arrived():
    print("arrived", box.pos)


def on_key_up(key):
    print("key_up", key)


def on_mouse_down(pos, button):
    global score
    print("mouse_down", pos, button, button == mouse.LEFT, alien.collidepoint(pos))
    if alien.collidepoint(pos):
        score += 1


def on_mouse_up(button, pos):
    print("mouse_up", pos, button)


def on_mouse_move(rel, buttons, pos):
    print("mouse_move", pos, rel, sorted(int(b) for b in buttons))


def blink():
    print("blink", round(clock.clock.t, 6))


clock.schedule_interval(blink, 0.05)
print("loaded", alien.pos, box.pos)
