# needs: pygame
# update() without dt, an animation and keyboard state, as in the Pygame Zero introduction.
import pgzrun

WIDTH = 200
HEIGHT = 100
ball = Actor("dot", center=(10, 10))
speed = 3


def update():
    global speed
    ball.x += speed
    if ball.right > WIDTH or ball.left < 0:
        speed = -speed
    if keyboard.space:
        ball.y += 1


def draw():
    screen.fill((0, 0, 40))
    ball.draw()
    screen.draw.text("x=%d" % ball.x, (5, 5))
    print("draw", ball.pos, ball.topleft, speed)


pgzrun.go()
