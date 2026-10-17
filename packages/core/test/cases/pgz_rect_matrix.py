# needs: pygame
# pygame.Rect as Pygame Zero's Rect: integer coordinates, truncated arguments, rounded attributes.
import pgzrun


def show(f):
    try:
        return repr(f())
    except Exception as e:
        return type(e).__name__ + ": " + str(e)


RECTS = [(0, 0, 10, 10), (5, 5, 10, 10), (-3, 4, 7, 2), (2, 3, 0, 5), (1, 1, -4, -6), (10, 0, 3, 3),
         (-5, -5, 1, 1), (4, 4, 2, 2), (0, 0, 1, 1), (3, -2, 9, 11), (0, 0, -1, 5), (7, 7, 5, 4)]
ARGS = RECTS + [(1.5, 2.7, 3.2, 4.9), (-1.5, -2.7, 3.9, 4.9), ((1, 2), (3, 4)), [3, 3, 3, 3], Rect(2, 2, 2, 2),
                ZRect(1.5, 1.5, 3.5, 3.5), (1, 2, 3), "abcd", None, 5, (1, "a", 3, 4), ((1, 2), 3)]

for t in RECTS:
    for a in ARGS:
        r = Rect(t)
        print(t, repr(a), show(lambda: r.colliderect(a)), show(lambda: r.contains(a)), show(lambda: r.clip(a)),
              show(lambda: r.union(a)), show(lambda: r.clamp(a)), show(lambda: r.fit(a)), show(lambda: a in r),
              show(lambda: r == a), show(lambda: r != a), show(lambda: r < a), show(lambda: r >= a))
    r = Rect(t)
    print(t, show(lambda: r.collidelist(ARGS[:12])), show(lambda: r.collidelistall(ARGS[:12])),
          show(lambda: r.unionall(ARGS[:12])), show(lambda: r.collidelist(ARGS)), show(lambda: r.unionall([])))
    d = {(1, 1, 3, 3): "a", (8, 8, 4, 4): "b", (-10, -10, 2, 2): "c", ((5, 5), (1, 1)): "d"}
    dv = {"a": (1, 1, 3, 3), "b": Rect(8, 8, 4, 4), "c": (-10, -10, 2, 2)}
    print(t, show(lambda: r.collidedict(d)), show(lambda: r.collidedictall(d)), show(lambda: r.collidedict(dv, 1)),
          show(lambda: r.collidedictall(dv, values=True)), show(lambda: r.collidedict(dv)))
    for p in [(0, 0), (5, 5), (9, 9), (10, 10), (-3, 4), (3.9, 4.9), (-0.5, -0.5), (1, 1), (-1, -2)]:
        print(t, p, show(lambda: r.collidepoint(p)), show(lambda: r.collidepoint(*p)), show(lambda: p in r))
    for dx, dy in [(0, 0), (3, 4), (-3, -5), (1.9, -1.9), (7, -7), (-1, 1)]:
        a = Rect(t)
        a.inflate_ip(dx, dy)
        b = Rect(t)
        b.move_ip(dx, dy)
        print(t, dx, dy, r.inflate(dx, dy), a, r.move(dx, dy), b, r.move((dx, dy)), show(lambda: r.inflate(dx)))
    for f in [(2,), (0.5,), (1.5, 0.25), (-2, 3), (0.1, 0.1), (3, 0), (1 / 3,)]:
        a = Rect(t)
        a.scale_by_ip(*f)
        print(t, f, show(lambda: r.scale_by(*f)), a)
    print(t, show(lambda: r.scale_by(x=2, y=3)), show(lambda: r.scale_by(scale_by=(0.5, 2))))
    print(t, r.x, r.y, r.w, r.h, r.width, r.height, r.top, r.left, r.bottom, r.right, r.topleft, r.topright,
          r.bottomleft, r.bottomright, r.midtop, r.midleft, r.midbottom, r.midright, r.center, r.centerx, r.centery,
          r.size, bool(r), len(r), list(r), r[0], r[-1], r[1:3], r[::-1], show(lambda: r[4]), show(lambda: r["x"]))
    for name in ["x", "y", "w", "h", "width", "height", "top", "left", "bottom", "right", "centerx", "centery"]:
        for v in [3, 2.5, -2.5, 3.4999, 0.49999999999999994, -7.5, 1e10, "a", True]:
            a = Rect(t)
            print(t, name, repr(v), show(lambda: setattr(a, name, v)), a)
    for name in ["topleft", "topright", "bottomleft", "bottomright", "midtop", "midleft", "midbottom", "midright",
                 "center", "size"]:
        for v in [(3, 4), (2.5, -2.5), (1.5, 0.5), [7, 8], (1,), "ab", ((4, 5),)]:
            a = Rect(t)
            print(t, name, repr(v), show(lambda: setattr(a, name, v)), a)
    a = Rect(t)
    a.normalize()
    b = Rect(t)
    b.union_ip(4, 4, 1, 1)
    c = Rect(t)
    c.clamp_ip((0, 0, 6, 6))
    e = Rect(t)
    e.unionall_ip([(0, 0, 1, 1), (20, 20, 1, 1)])
    g = Rect(t)
    g.update(1, 2, 3, 4)
    print(t, a, b, c, e, g, r.copy(), r.copy() is r, show(lambda: r.update()))
    for ln in [(0, 0, 20, 20), ((-5, 3), (30, 3)), ((4, -10), (4, 30)), (1, 1, 2, 2), (-10, 0, 0, -10), (12, -3, -2, 14),
               ((3, 0), (9, 12)), (20, 20, 30, 30), (0.5, 9.9, 7.2, -3.8)]:
        print(t, ln, show(lambda: r.clipline(*ln) if len(ln) != 4 or isinstance(ln[0], tuple) else r.clipline(*ln)),
              show(lambda: r.clipline(ln)))
    a = Rect(t)
    a[0] = 7.9
    a[-1] = -3
    print(t, a, show(lambda: a.__setitem__(4, 1)), show(lambda: a.__setitem__(1, "x")))
    a[1:3] = [11, 12]
    print(t, a)
    a[::2] = 5
    print(t, a, show(lambda: a.__setitem__(slice(0, 2), [1])))

for args in [(), (1, 2, 3, 4), ((1, 2, 3, 4),), ((1, 2), (3, 4)), (((1, 2), (3, 4)),), ([1, 2, 3, 4],), (1.9, -1.9, 2.5, -2.5),
             (1, 2, 3), (Rect(1, 2, 3, 4),), (ZRect(1.7, 2.2, 3.9, 4.1),), ("a", 2, 3, 4), (None,), ((1, 2),),
             ((((1, 2, 3, 4),),),)]:
    print(repr(args), show(lambda: Rect(*args)))

r = Rect(0, 0, 10, 10)
print(show(lambda: r.colliderect(1, 2)), show(lambda: r.colliderect((1, 2), (3, 4))), show(lambda: r.colliderect(1, 2, 3)),
      show(lambda: r.colliderect(1, 2, "a", 4)), show(lambda: r.colliderect("abcd")), show(lambda: r.move(1)),
      show(lambda: r.move("ab")), show(lambda: r.collidelist(5)), show(lambda: r.collidedict([])),
      show(lambda: r.unionall(None)), show(lambda: hash(r)), show(lambda: r.contains(1, 2, 3, 4)))
print(r.collideobjects([(20, 20, 1, 1), (5, 5, 1, 1), (6, 6, 1, 1)]), r.collideobjectsall([(20, 20, 1, 1), (5, 5, 1, 1), (6, 6, 1, 1)]),
      r.collideobjects([[1, 1], [30, 30]], key=lambda p: (p[0], p[1], 1, 1)), show(lambda: r.collideobjects([1, 2])))

seed = 12345


def rnd(n):
    global seed
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed % n - n // 2


for i in range(300):
    a = Rect(rnd(40), rnd(40), rnd(30), rnd(30))
    b = Rect(rnd(40), rnd(40), rnd(30), rnd(30))
    print(a, b, a.colliderect(b), a.contains(b), a.clip(b), a.union(b), a.clamp(b), show(lambda: a.fit(b)),
          a.collidepoint(b.topleft), a.inflate(b.w, b.h), a.clipline(b.topleft, b.bottomright), a.scale_by(b.w / 7, b.h / 9))
