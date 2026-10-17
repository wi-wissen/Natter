# needs: pygame
# Actor: anchors, positions, rotation (size of the rotated image), distances and collisions.
import pgzrun


def show(f):
    try:
        return repr(f())
    except Exception as e:
        return type(e).__name__ + ": " + str(e)


def state(a):
    return (a.pos, a.x, a.y, a.anchor, a.topleft, a.width, a.height, a.center, a.bottomright, a.midtop, a.left,
            a.right, a.top, a.bottom, a.angle, a.image, list(a))


IMAGES = ["alien", "box", "tall", "dot", "wide"]
ANCHORS = [None, ("center", "center"), ("left", "top"), ("right", "bottom"), ("middle", "top"), (10, 5), (2.5, -3),
           ("left", 7), (0, "bottom")]

for img in IMAGES:
    for anc in ANCHORS:
        a = Actor(img, anchor=anc)
        print(img, anc, state(a))
        b = Actor(img, (100, 50), anc)
        print(img, anc, state(b))
        for angle in [0, 10, 45, 90, -90, 270, 450, 33.3, -12.5, 1e-7, 89.99999]:
            c = Actor(img, pos=(30, 40), anchor=anc)
            c.angle = angle
            print(img, anc, angle, state(c))
            c.pos = (5, 6)
            c.anchor = ("left", "bottom")
            print(img, anc, angle, state(c))

for kw in ["topleft", "bottomleft", "topright", "bottomright", "midtop", "midleft", "midbottom", "midright", "center"]:
    a = Actor("alien", **{kw: (10, 20)})
    print(kw, state(a))

print(show(lambda: Actor("alien", pos=(1, 2), center=(3, 4))))
print(show(lambda: Actor("alien", topleft=(1, 2), center=(3, 4))))
print(show(lambda: Actor("alien", centre=(1, 2))))
print(show(lambda: state(Actor("alien", posx=(1, 2)))))
print(show(lambda: Actor("nothing")))
print(show(lambda: Actor("alien", anchor=("up", "top"))))
print(show(lambda: Actor("alien", anchor=("left", "up"))))
print(show(lambda: Actor("alien", anchor=("left",))))
print(show(lambda: state(Actor("alien", pos=(0, 0)))))

a = Actor("alien", (100, 100))
b = Actor("box", (130, 150))
c = Actor("dot", (300, 300))
for target in [b, c, (100, 100), (0, 0), (100, 0), (200, 100), (100.5, 99.5)]:
    print(show(lambda: a.distance_to(target)), show(lambda: a.angle_to(target)))
print(a.colliderect(b), a.colliderect(c), b.colliderect(a), a.colliderect(Rect(60, 60, 10, 10)), a.colliderect((0, 0, 70, 60)),
      a.colliderect(ZRect(132, 145, 5, 5)), a.collidelist([c, b]), a.collidelistall([c, b, a]), a.contains(b),
      a.contains(Rect(90, 90, 5, 5)), Rect(60, 60, 10, 10).colliderect(a.left, a.top, a.width, a.height))
for p in [(100, 100), (67, 54), (66.9, 53.9), (133, 146), (132.99, 145.99), (0, 0)]:
    print(p, a.collidepoint(p), a.collidepoint(*p), b.collidepoint(p))

d = Actor("box", (50, 60))
d.x += 10.5
d.y -= 3
print(state(d))
d.left = 3
d.bottom = 99
print(state(d))
d.center = (7, 8)
d.midright = (100, 1)
print(state(d))
d.width = 4
d.topright = (50, 50)
print(state(d))
d.image = "alien"
print(state(d))
d.image = "dot"
print(state(d))
d.move_ip(3, 4)
d.inflate_ip(10, 20)
print(state(d), d.move(1, 1), d.inflate(2, 2), d.copy(), d.clamp((0, 0, 20, 20)), d.union((0, 0, 1, 1)))

e = Actor("alien", (0, 0))
for i in range(10):
    e.angle += 37
    e.x += 3.25
    print(i, state(e))
for i in range(10):
    e.angle = -i * 13.7
    print(i, e.width, e.height, e.pos, e.topleft)
