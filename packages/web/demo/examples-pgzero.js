// Pygame Zero examples of the demo page. The duck pond is the game of the book (its images ente, kueken and boot are
// not drawn yet: the demo registers placeholder images, see pgzero-placeholders.js).

const POND = `import pgzrun
import random

WIDTH = 800
HEIGHT = 600
TITLE = "Ententeich"

# Farben bekommen Namen, damit man den Teich an einer Stelle umfärben kann.
WATER = (74, 144, 180)
SHORE = (110, 170, 90)

# Der Name in Actor(...) ist der Dateiname: Die Bilder heißen deutsch, der Code englisch.
duck = Actor("ente")
duck.pos = (400, 565)

chick = Actor("kueken")

saved = 0

# Fünfzig helle Punkte reichen als bewegtes Wasser.
waves = []
for i in range(50):
    waves.append([random.randint(0, 800), random.randint(80, 520)])

def new_boat(x, y, speed):
    boat = Actor("boot")
    boat.pos = (x, y)
    boat.speed = speed  # jedes Boot bekommt sein eigenes Tempo
    return boat

boats = [
    new_boat(100, 140, 2),
    new_boat(500, 280, 4),
    new_boat(300, 420, 3)
]

# Zurück an den Start — das wird gleich an mehreren Stellen gebraucht.
def back_to_start():
    duck.pos = (400, 565)

def update():
    global saved

    if saved == 5:
        return  # Spielende: ab hier wird nicht mehr gerechnet, nur noch gezeichnet.

    if keyboard.left:
        duck.x = duck.x - 4
    if keyboard.right:
        duck.x = duck.x + 4
    if keyboard.up:
        duck.y = duck.y - 4
    if keyboard.down:
        duck.y = duck.y + 4

    for boat in boats:
        boat.x = boat.x + boat.speed
        if boat.x > 880:
            boat.x = -80
        if duck.colliderect(boat):
            back_to_start()

    for wave in waves:
        wave[0] = wave[0] + 1
        if wave[0] > 800:
            wave[0] = 0

    if duck.y < 70:
        saved = saved + 1
        back_to_start()

def draw():
    screen.fill(WATER)

    for wave in waves:
        screen.draw.filled_circle((wave[0], wave[1]), 2, (108, 168, 202))

    screen.draw.filled_rect(Rect(0, 0, 800, 70), SHORE)
    screen.draw.filled_rect(Rect(0, 530, 800, 70), SHORE)

    # Ein einziges Küken-Objekt wird mehrfach hingesetzt und gezeichnet.
    for i in range(saved):
        chick.pos = (60 + i * 70, 35)
        chick.draw()

    for boat in boats:
        boat.draw()

    duck.draw()

    screen.draw.text("Gerettet: " + str(saved) + " von 5",
                     (20, 550), fontsize=36, color=(255, 255, 255))

    if saved == 5:
        screen.draw.text("Alle Küken sind drüben!", center=(400, 300),
                         fontsize=64, color=(255, 255, 255))

pgzrun.go()
`;

const POND_START = `import pgzrun

WIDTH = 800
HEIGHT = 600

# Farben bekommen Namen, damit man den Teich an einer Stelle umfärben kann.
WATER = (74, 144, 180)
SHORE = (110, 170, 90)

# Solange die Ente ein Punkt ist, ist sie nichts weiter als zwei Zahlen.
duck_x = 400
duck_y = 565

def update():
    global duck_x, duck_y

    if keyboard.left:
        duck_x = duck_x - 4
    if keyboard.right:
        duck_x = duck_x + 4
    if keyboard.up:
        duck_y = duck_y - 4
    if keyboard.down:
        duck_y = duck_y + 4

def draw():
    screen.fill(WATER)
    screen.draw.filled_rect(Rect(0, 0, 800, 70), SHORE)
    screen.draw.filled_rect(Rect(0, 530, 800, 70), SHORE)
    screen.draw.filled_circle((duck_x, duck_y), 22, (255, 255, 255))

pgzrun.go()
`;

const JUMP = `# Ohne "import pgzrun": so startet auch "pgzrun spiel.py".
WIDTH = 800
HEIGHT = 450
TITLE = "Hüpf!"
GROUND = 386          # Oberkante des Bodens

idle = ["heroine_idle_1", "heroine_idle_2", "heroine_idle_3", "heroine_idle_4"]
run = ["heroine_run_" + str(i) for i in range(1, 9)]

hero = Actor("heroine_idle_1", midbottom=(120, GROUND))
hero.images = idle
hero.fps = 8
hero.vy = 0
hero.on_ground = True

enemy = Actor("enemy_walk_1", midbottom=(620, GROUND))
enemy.images = ["enemy_walk_1", "enemy_walk_2", "enemy_walk_3", "enemy_walk_4"]
enemy.fps = 8
enemy.vx = -2

coins = [[300, 300], [420, 250], [540, 300], [700, 220]]
score = 0


def show(frames):
    if hero.images != frames:
        hero.images = frames


def update():
    global score
    moving = False
    if keyboard.left:
        hero.x -= 4
        hero.flip_x = True
        moving = True
    if keyboard.right:
        hero.x += 4
        hero.flip_x = False
        moving = True
    hero.x = max(30, min(WIDTH - 30, hero.x))

    if (keyboard.space or keyboard.up) and hero.on_ground:
        hero.vy = -13
        hero.on_ground = False
        sounds.jump.play()
    hero.vy += 0.6
    hero.y += hero.vy
    if hero.bottom >= GROUND:
        hero.bottom = GROUND
        hero.vy = 0
        hero.on_ground = True

    if not hero.on_ground:
        show([])
        hero.image = "heroine_jump" if hero.vy < 0 else "heroine_fall"
    elif moving:
        show(run)
        hero.animate()
    else:
        show(idle)
        hero.animate()

    enemy.x += enemy.vx
    if enemy.left < 0 or enemy.right > WIDTH:
        enemy.vx = -enemy.vx
    enemy.flip_x = enemy.vx < 0
    enemy.animate()

    if hero.colliderect(enemy):
        if hero.vy > 0 and hero.bottom < enemy.centery:
            hero.vy = -9            # draufgesprungen
            enemy.x = WIDTH - 60
            score += 5
            sounds.powerup.play()
        else:
            hero.midbottom = (120, GROUND)
            sounds.hit.play()

    for c in coins[:]:
        if hero.colliderect(Rect(c[0] - 12, c[1] - 12, 24, 24)):
            coins.remove(c)
            score += 1
            sounds.coin.play()
            clock.schedule(lambda c=c: coins.append(c), 3)   # nach 3 Sekunden wieder da


def draw():
    screen.fill((150, 205, 255), (232, 244, 255))
    for x in range(0, WIDTH, 64):
        screen.blit("ground_flat", (x, GROUND))
    for c in coins:
        screen.draw.filled_circle((c[0], c[1]), 12, (250, 204, 21))
        screen.draw.circle((c[0], c[1]), 12, (161, 98, 7), 3)
    enemy.draw()
    hero.draw()
    screen.draw.text("Punkte: " + str(score), topleft=(16, 12), fontsize=40, color="white", owidth=1.2, ocolor=(30, 64, 120))
    screen.draw.text("Pfeiltasten: laufen  ·  Leertaste: springen", midtop=(WIDTH // 2, 16), fontsize=26, color=(30, 64, 120))
`;

const PONG = `import pgzrun

WIDTH = 640
HEIGHT = 400
TITLE = "Pong"

left = Rect(20, 160, 12, 80)
right = Rect(608, 160, 12, 80)
ball = [320, 200]
speed = [4, 3]
score = [0, 0]


def on_mouse_move(pos):
    left.centery = pos[1]        # Maus oder Finger steuert den linken Schläger


def update():
    if keyboard.w:
        left.y -= 6
    if keyboard.s:
        left.y += 6
    left.clamp_ip(Rect(0, 0, WIDTH, HEIGHT))
    # der Computer folgt dem Ball, aber nicht ganz so schnell
    if right.centery < ball[1] - 10:
        right.y += 4
    elif right.centery > ball[1] + 10:
        right.y -= 4

    ball[0] += speed[0]
    ball[1] += speed[1]
    if ball[1] < 8 or ball[1] > HEIGHT - 8:
        speed[1] = -speed[1]
        tone.play("E5", 0.05)
    hit = Rect(ball[0] - 8, ball[1] - 8, 16, 16)
    if hit.colliderect(left) and speed[0] < 0 or hit.colliderect(right) and speed[0] > 0:
        speed[0] = -speed[0] * 1.05
        sounds.bounce.play()
    if ball[0] < 0 or ball[0] > WIDTH:
        score[0 if ball[0] > WIDTH else 1] += 1
        ball[0], ball[1] = WIDTH // 2, HEIGHT // 2
        speed[0] = 4 if speed[0] > 0 else -4
        tone.play("C4", 0.3)


def draw():
    screen.clear()
    for y in range(0, HEIGHT, 20):
        screen.draw.filled_rect(Rect(WIDTH // 2 - 2, y, 4, 10), (90, 90, 90))
    screen.draw.filled_rect(left, "white")
    screen.draw.filled_rect(right, "white")
    screen.draw.filled_circle((int(ball[0]), int(ball[1])), 8, "yellow")
    screen.draw.text(str(score[0]) + "   " + str(score[1]), midtop=(WIDTH // 2, 10), fontsize=60, color="white")
    screen.draw.text("W/S, Maus oder Finger", midbottom=(WIDTH // 2, HEIGHT - 6), fontsize=22, color=(150, 150, 150))


pgzrun.go()
`;

const TWEEN = `import pgzrun

WIDTH = 600
HEIGHT = 400
TITLE = "animate, clock und tween"

TWEENS = ["linear", "accelerate", "decelerate", "accel_decel", "in_elastic", "out_elastic", "bounce_end", "bounce_start_end"]
turtle = Actor("turtle", (300, 200))
spinner = Actor("turtle", (60, 60))
spinner.scale = 0.6
which = 0
seconds = 0


def on_mouse_down(pos):
    global which
    which = (which + 1) % len(TWEENS)
    animate(turtle, tween=TWEENS[which], duration=1.2, pos=pos, angle=turtle.angle + 90)


def tick():
    global seconds
    seconds += 1
    turtle.opacity = 0.4 if seconds % 2 else 1


clock.schedule_interval(tick, 1.0)


def update(dt):
    spinner.angle += 90 * dt


def draw():
    screen.fill((20, 24, 40))
    screen.draw.rect(Rect(10, 10, WIDTH - 20, HEIGHT - 20), (90, 110, 160))
    turtle.draw()
    spinner.draw()
    screen.draw.text("Tippe oder klicke irgendwo hin", center=(WIDTH // 2, 40), fontsize=30, color="white", shadow=(1, 1))
    screen.draw.text("tween = " + TWEENS[which], midbottom=(WIDTH // 2, HEIGHT - 50), fontsize=36, color="orange", gcolor="yellow")
    screen.draw.text("Uhr: " + str(seconds) + " s", bottomright=(WIDTH - 24, HEIGHT - 20), fontsize=24, color=(160, 180, 220))
    screen.draw.textbox("Textbox: passt sich an", Rect(380, 70, 200, 60), color="white")


pgzrun.go()
`;

const PIANO = `import pgzrun

WIDTH = 640
HEIGHT = 300
TITLE = "Klavier und Klänge"

NOTES = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"]
KEYS = "asdfghjk"
pressed = None
EFFECTS = ["coin", "jump", "laser", "quack", "platsch"]


def play(i):
    global pressed
    pressed = i
    tone.play(NOTES[i], 0.4)
    clock.schedule_unique(release, 0.3)


def release():
    global pressed
    pressed = None


def on_key_down(key, unicode):
    if unicode and unicode in KEYS:
        play(KEYS.index(unicode))
    if unicode and unicode in "12345":
        sounds.load(EFFECTS[int(unicode) - 1]).play()


def on_mouse_down(pos):
    x, y = pos
    if y > 100:
        play(min(7, x // 80))
    else:
        sounds.load(EFFECTS[min(4, x // 128)]).play()


def draw():
    screen.fill((245, 245, 240))
    for i in range(8):
        color = (255, 220, 120) if pressed == i else (255, 255, 255)
        screen.draw.filled_rect(Rect(i * 80 + 2, 100, 76, 196), color)
        screen.draw.rect(Rect(i * 80 + 2, 100, 76, 196), (60, 60, 60))
        screen.draw.text(KEYS[i] + "\\n" + NOTES[i], midbottom=(i * 80 + 40, 288), fontsize=26, color=(60, 60, 60), align="center")
    for i in range(5):
        screen.draw.filled_rect(Rect(i * 128 + 4, 10, 120, 80), (59, 130, 246))
        screen.draw.text(str(i + 1) + ": " + EFFECTS[i], center=(i * 128 + 64, 50), fontsize=26, color="white")


pgzrun.go()
`;

export const PGZ_EXAMPLES = [
  { id: 'pgz-pond-start', title: 'Spiel: Ententeich, Anfang', code: POND_START },
  { id: 'pgz-pond', title: 'Spiel: Ententeich (Bilder aus dem Buch-Paket)', code: POND },
  { id: 'pgz-jump', title: 'Spiel: Hüpfen mit Animation', code: JUMP },
  { id: 'pgz-pong', title: 'Spiel: Pong', code: PONG },
  { id: 'pgz-tween', title: 'Spiel: animate, clock, tween', code: TWEEN },
  { id: 'pgz-piano', title: 'Spiel: Klavier und Klänge', code: PIANO },
  { id: 'pgz-loop', title: 'Spiel: Endlosschleife in update', code: `import pgzrun\n\nn = 0\n\ndef update():\n    global n\n    while n >= 0:\n        n = n + 1\n\ndef draw():\n    screen.fill("navy")\n\npgzrun.go()\n` },
];
