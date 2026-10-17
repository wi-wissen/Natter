# needs: pygame
# Tween functions, animate() and the clock: values and order of calls as in Pygame Zero.
import pgzrun

TWEENS = ["accel_decel", "accelerate", "bounce_end", "bounce_start", "bounce_start_end", "decelerate", "in_elastic",
          "in_out_elastic", "linear", "out_elastic"]


class Box:
    x = 0


def tween_value(name, n):
    # animate from 0 to 1 and tick the clock by n: the value is the tween function at n
    box = Box()
    an = animate(box, tween=name, duration=1, x=1.0)
    clock.tick(n)
    an.stop()
    return box.x


for name in TWEENS:
    print(name, [tween_value(name, i / 40) for i in range(40)])
    print(name, [tween_value(name, n) for n in (0, 0.5, 0.25, 1 / 3, 0.999999, 1e-9, 0.36363636363636365, 0.7272727272727273)])


class Thing:
    def __init__(self, name):
        self.name = name
        self.x = 0
        self.y = 10.5
        self.pos = (0, 0)
        self.color = [0, 100, 200]

    def __repr__(self):
        return "<Thing " + self.name + ">"


def done():
    print("finished at", round(clock.clock.t, 6))


def show(f):
    try:
        return repr(f())
    except Exception as e:
        return type(e).__name__ + ": " + str(e)


for tw in TWEENS:
    t = Thing(tw)
    an = animate(t, tween=tw, duration=0.45, on_finished=done, x=100, pos=(30, -20), color=[255, 0, 100])
    for i in range(6):
        clock.tick(0.1)
        print(tw, i, t.x, t.pos, t.color, an.running)

t = Thing("replace")
a1 = animate(t, x=50, y=20, duration=1)
clock.tick(0.25)
a2 = animate(t, x=-50, duration=0.5)
for i in range(6):
    clock.tick(0.125)
    print("replace", i, t.x, t.y, a1.running, a2.running, sorted(a1.targets), sorted(a2.targets))

t = Thing("stop")
a3 = animate(t, x=10, duration=1)
clock.tick(0.3)
a3.stop()
print("stop", t.x, a3.running)
a4 = animate(t, x=20, y=0, duration=1, tween="accelerate")
clock.tick(0.5)
a4.stop(complete=True)
print("stop complete", t.x, t.y, a4.running)
clock.tick(1)
print("after", t.x, t.y)
print(show(lambda: animate(t, z=5)))
print(show(lambda: animate(t, tween="wobble", x=5)))

hero = Actor("alien", (0, 0))
animate(hero, pos=(100, 50), tween="bounce_end", duration=1)
animate(hero, angle=90, duration=0.5)
for i in range(12):
    clock.tick(0.1)
    print("hero", i, hero.pos, hero.angle, hero.width, hero.height)


def a():
    print("a", clock.clock.t)


def b():
    print("b", clock.clock.t)


def c():
    print("c", clock.clock.t)


def d():
    print("d", clock.clock.t)
    clock.schedule(c, 0)


ticks = []


def every(dt):
    ticks.append(round(dt, 3))


class Counter:
    def __init__(self):
        self.n = 0

    def bump(self):
        self.n += 1
        print("bump", self.n)


k = Counter()
for f in [a, b, c, d, a, b, c]:
    clock.schedule(f, 1)
clock.schedule(b, 0.5)
clock.schedule(c, 0.25)
clock.schedule_interval(a, 0.3)
clock.schedule_interval(k.bump, 0.4)
clock.each_tick(every)
for i in range(10):
    print("tick", i)
    clock.tick(0.15)
clock.unschedule(a)
clock.unschedule(k.bump)
clock.unschedule(every)
clock.schedule_unique(d, 0.2)
clock.schedule_unique(d, 0.4)
clock.schedule(b, 0.1)
clock.schedule(b, 0.1)
clock.unschedule(b)
for i in range(4):
    print("tick2", i)
    clock.tick(0.15)
print(ticks, k.n, len(clock.clock.events), clock.clock.fired)
my = clock.Clock()
my.schedule(a, 2)
my.schedule_interval(c, 0.75)
for i in range(4):
    my.tick(0.5)
print(my.t, len(my.events), clock.clock.t)
