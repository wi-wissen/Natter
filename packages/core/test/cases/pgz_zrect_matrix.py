# needs: pygame
# ZRect, Pygame Zero's rectangle with float coordinates (the rectangle of every Actor).
import pgzrun


def show(f):
    try:
        return repr(f())
    except Exception as e:
        return type(e).__name__ + ": " + str(e)


RECTS = [(0, 0, 10, 10), (5.5, 5, 10, 10.25), (-3, 4, 7, 2), (2, 3, 0, 5), (1, 1, -4, -6), (10, 0, 3, 3),
         (-5.5, -5.5, 1, 1), (4, 4, 2.5, 2.5), (0.1, 0.2, 0.3, 0.4), (3, -2, 9, 11)]
ARGS = RECTS + [((1, 2), (3, 4)), [3, 3, 3, 3], Rect(2, 2, 2, 2), ZRect(1.5, 1.5, 3.5, 3.5), (1, 2, 3)]

for t in RECTS:
    for a in ARGS:
        r = ZRect(t)
        print(t, repr(a), show(lambda: r.colliderect(a)), show(lambda: r.contains(a)), show(lambda: r.clip(a)),
              show(lambda: r.union(a)), show(lambda: r.clamp(a)), show(lambda: r.fit(a)), show(lambda: a in r),
              show(lambda: r == a), show(lambda: r != a), show(lambda: r < a), show(lambda: r >= a))
        c = ZRect(t)
        c.clip_ip(a) if len(a) != 3 else None
        u = ZRect(t)
        show(lambda: u.union_ip(a))
        k = ZRect(t)
        show(lambda: k.clamp_ip(a))
        print(t, repr(a), c, u, k)
    r = ZRect(t)
    print(t, r.collidelist(ARGS[:10]), r.collidelistall(ARGS[:10]), r.unionall(ARGS[:10]), r.unionall([]))
    d = {"a": (1, 1, 3, 3), "b": ZRect(8, 8, 4, 4), "c": (-10, -10, 2, 2)}
    dk = {(1, 1, 3, 3): "a", (8, 8, 4, 4): "b"}
    print(t, r.collidedict(d), r.collidedictall(d), r.collidedict(dk, False), r.collidedictall(dk, use_values=False))
    for p in [(0, 0), (5, 5), (9.99, 9.99), (10, 10), (-3, 4), (3.9, 4.9), (-0.5, -0.5), (1, 1), (5.5, 5)]:
        print(t, p, r.collidepoint(p), r.collidepoint(*p), p in r)
    for dx, dy in [(0, 0), (3, 4), (-3, -5), (1.9, -1.9), (7, -7)]:
        a = ZRect(t)
        a.inflate_ip(dx, dy)
        b = ZRect(t)
        b.move_ip(dx, dy)
        print(t, dx, dy, r.inflate(dx, dy), a, r.move(dx, dy), b)
    print(t, r.x, r.y, r.w, r.h, r.width, r.height, r.top, r.left, r.bottom, r.right, r.topleft, r.topright,
          r.bottomleft, r.bottomright, r.midtop, r.midleft, r.midbottom, r.midright, r.center, r.centerx, r.centery,
          r.size, bool(r), len(r), list(r), r[0], r[3], show(lambda: r[4]), show(lambda: r[-1]), r.copy(), r.rect is r)
    for name in ["x", "y", "w", "h", "width", "height", "top", "left", "bottom", "right", "centerx", "centery"]:
        for v in [3, 2.5, -2.5, 1e-9]:
            a = ZRect(t)
            setattr(a, name, v)
            print(t, name, v, a)
    for name in ["topleft", "topright", "bottomleft", "bottomright", "midtop", "midleft", "midbottom", "midright",
                 "center", "size"]:
        for v in [(3, 4), (2.5, -2.5), [7, 8.75]]:
            a = ZRect(t)
            setattr(a, name, v)
            print(t, name, v, a)
    a = ZRect(t)
    a.normalize()
    e = ZRect(t)
    e.unionall_ip([(0, 0, 1, 1), (20, 20, 1, 1)])
    print(t, a, e, show(lambda: r.__setitem__(0, 5)), show(lambda: hash(r)), show(lambda: r == None))

for args in [(1, 2, 3, 4), ((1, 2, 3, 4),), ((1, 2), (3, 4)), (((1, 2), (3, 4)),), ([1, 2, 3, 4],), (1.9, -1.9, 2.5, -2.5),
             (1, 2, 3), (Rect(1, 2, 3, 4),), (ZRect(1.7, 2.2, 3.9, 4.1),), ("abcd",)]:
    print(repr(args), show(lambda: ZRect(*args)))

seed = 777


def rnd(n):
    global seed
    seed = (seed * 1103515245 + 12345) % 2147483648
    return (seed % (n * 4) - n * 2) / 4


for i in range(200):
    a = ZRect(rnd(40), rnd(40), rnd(30), rnd(30))
    b = ZRect(rnd(40), rnd(40), rnd(30), rnd(30))
    print(a, b, a.colliderect(b), a.contains(b), a.clip(b), a.union(b), a.clamp(b), show(lambda: a.fit(b)),
          a.collidepoint(b.center), a.inflate(b.w, b.h), a.center, a.midbottom)
