import turtle

state = 12345


def rnd(n):
    global state
    state = (state * 1103515245 + 12345) % 2147483648
    return state % n


def run(mode, units):
    t = turtle.TNavigator(mode)
    if units == "radians":
        t.radians()
    elif units == "gon":
        t.degrees(400)
    full = t._fullcircle
    for i in range(300):
        op = rnd(14)
        a = rnd(721) - 360
        d = rnd(401) - 200
        if op == 0:
            t.forward(d)
        elif op == 1:
            t.back(d)
        elif op == 2:
            t.left(a * full / 360)
        elif op == 3:
            t.right(a * full / 360)
        elif op == 4:
            t.goto(d, a)
        elif op == 5:
            t.setx(d)
        elif op == 6:
            t.sety(a)
        elif op == 7:
            t.setheading(a * full / 360)
        elif op == 8:
            t.home()
        elif op == 9:
            t.circle(d / 4 if d else 10, a if a else 90)
        elif op == 10:
            t.circle(d / 5 if d else 10)
        elif op == 11:
            t.circle(d / 7 if d else 3, 180, 7)
        elif op == 12:
            print(t.distance(d, a), t.towards(d, a), t.distance(t.pos()))
        else:
            print(t.distance((a, d)), t.towards((a, d)))
        print(i, t.pos(), t.xcor(), t.ycor(), t.heading(), t.pos()[0] * 3)


for mode in ("standard", "logo", "world"):
    for units in ("degrees", "radians", "gon"):
        print(mode, units)
        run(mode, units)
