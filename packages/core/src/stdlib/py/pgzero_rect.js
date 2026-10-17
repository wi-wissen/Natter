// pgzero_rect: Rect (pygame.Rect with integer coordinates, as Pygame Zero's builtin Rect) and ZRect (Pygame Zero's
// float rect, used by Actor). Follows pygame 2.6 (src_c/rect.c) and pgzero 1.2 (rect.py) to the detail: arguments are
// truncated towards zero, assigned attributes are rounded half away from zero, divisions by 2 are C integer divisions,
// fit() and scale_by() compute in single precision.
export default String.raw`
import math


class NoIntersect(Exception):
    pass


_NO = object()


def _num(v):
    return isinstance(v, (int, float))


def _int(v):
    # pg_IntFromObj: ints stay, floats are truncated, anything else fails (None)
    if isinstance(v, int):
        return int(v)
    if isinstance(v, float):
        if v != v or v in (math.inf, -math.inf):
            return -2147483648
        return int(v)
    return None


def _round(v):
    # value assigned to an attribute: a number, rounded half away from zero (C round())
    if isinstance(v, int):
        r = int(v)
    elif isinstance(v, float):
        if v != v:
            return -2147483648
        r = int(v) if v not in (math.inf, -math.inf) else 0
        if v - r >= 0.5:
            r += 1
        elif r - v >= 0.5:
            r -= 1
    else:
        raise TypeError("invalid rect assignment")
    if v > 2147483647 or v < -2147483648:
        raise TypeError("invalid rect assignment, expected value between -2147483648 < x < 2147483647")
    return r


def _round2(v):
    if isinstance(v, tuple) and len(v) == 1:
        return _round2(v[0])
    if not _isseq(v) or len(v) != 2 or not _num(v[0]) or not _num(v[1]):
        raise TypeError("invalid rect assignment")
    return _round(v[0]), _round(v[1])


def _isseq(v):
    return isinstance(v, (tuple, list, str, ZRect, Rect)) or (not isinstance(v, (dict, int, float, set)) and hasattr(v, "__getitem__") and hasattr(v, "__len__"))


def _half(a):
    # C integer division by 2 (towards zero)
    return a // 2 if a >= 0 else -((-a) // 2)


def _i32(v):
    # C int arithmetic wraps around
    return (v + 2147483648) % 4294967296 - 2147483648


def _f32(x):
    # round a float to single precision (round half to even), like a C float
    if x == 0 or x != x or x in (math.inf, -math.inf):
        return float(x)
    a = abs(x)
    e = int(math.floor(math.log2(a)))
    while math.ldexp(1.0, e) > a:
        e -= 1
    while math.ldexp(1.0, e + 1) <= a:
        e += 1
    if e < -126:
        e = -126
    m = round(math.ldexp(a, 23 - e))
    r = math.ldexp(float(m), e - 23)
    if r >= 3.4028235677973366e38:
        r = math.inf
    return r if x > 0 else -r


def _two_ints(args):
    # pg_TwoIntsFromObj: (x, y) or ((x, y),)
    if isinstance(args, tuple) and len(args) == 1:
        return _two_ints(args[0])
    if not _isseq(args) or len(args) != 2:
        return None
    a = _int(args[0])
    b = _int(args[1])
    if a is None or b is None:
        return None
    return a, b


def _rect4(obj):
    # pgRect_FromObject: (x, y, w, h) as ints or None
    if isinstance(obj, Rect):
        return obj._x, obj._y, obj._w, obj._h
    if isinstance(obj, ZRect):
        obj = (obj.x, obj.y, obj.w, obj.h)
    if _isseq(obj):
        n = len(obj)
        if n == 4:
            x = _int(obj[0])
            y = _int(obj[1])
            w = _int(obj[2])
            h = _int(obj[3])
            if x is None or y is None or w is None or h is None:
                return None
            return x, y, w, h
        if n == 2:
            a = obj[0]
            b = obj[1]
            if not _isseq(a) or len(a) != 2 or not _isseq(b) or len(b) != 2:
                return None
            x = _int(a[0])
            y = _int(a[1])
            w = _int(b[0])
            h = _int(b[1])
            if x is None or y is None or w is None or h is None:
                return None
            return x, y, w, h
        if n == 1 and isinstance(obj, tuple):
            return _rect4(obj[0])
    if hasattr(obj, "rect"):
        r = obj.rect
        if callable(r):
            r = r()
        return _rect4(r)
    return None


def _need_rect(obj):
    r = _rect4(obj)
    if r is None:
        raise TypeError("Argument must be rect style object")
    return r


def _intersect(ax, ay, aw, ah, b):
    # _pg_do_rects_intersect: empty rects never collide, negative sizes count from the other edge
    bx, by, bw, bh = b
    if aw == 0 or ah == 0 or bw == 0 or bh == 0:
        return False
    if aw < 0:
        ax += aw
        aw = -aw
    if ah < 0:
        ay += ah
        ah = -ah
    if bw < 0:
        bx += bw
        bw = -bw
    if bh < 0:
        by += bh
        bh = -bh
    return ax < bx + bw and ay < by + bh and ax + aw > bx and ay + ah > by


def _clamped(x, y, w, h, o):
    ox, oy, ow, oh = o
    if w >= ow:
        nx = ox + _half(ow) - _half(w)
    elif x < ox:
        nx = ox
    elif x + w > ox + ow:
        nx = ox + ow - w
    else:
        nx = x
    if h >= oh:
        ny = oy + _half(oh) - _half(h)
    elif y < oy:
        ny = oy
    elif y + h > oy + oh:
        ny = oy + oh - h
    else:
        ny = y
    return nx, ny


def _scale_args(args, kw, name):
    if "scale_by" in kw:
        if len(kw) > 1:
            raise TypeError("The 'scale_by' keyword cannot be combined with other arguments.")
        v = kw["scale_by"]
        if not _isseq(v) or len(v) != 2 or not _num(v[0]) or not _num(v[1]):
            raise TypeError("number pair expected")
        return v[0], v[1]
    for k in kw:
        if k not in ("x", "y"):
            raise TypeError("Float values expected.")
    vals = list(args)
    if "x" in kw:
        if len(vals) > 0:
            raise TypeError("Float values expected.")
        vals.append(kw["x"])
    if "y" in kw:
        if len(vals) > 1:
            raise TypeError("Float values expected.")
        if not vals:
            raise TypeError("Float values expected.")
        vals.append(kw["y"])
    if len(vals) == 0 or len(vals) > 2:
        raise TypeError("Float values expected.")
    for v in vals:
        if not _num(v):
            raise TypeError("Float values expected.")
    return vals[0], (vals[1] if len(vals) > 1 else 0)


def _scaled(x, y, w, h, fx, fy):
    fx = abs(_f32(fx))
    fy = abs(_f32(fy))
    if not fy > 0:
        fy = fx
    nx = _int(_f32(_f32(x + _half(w)) - _f32(_f32(w * fx) / 2)))
    ny = _int(_f32(_f32(y + _half(h)) - _f32(_f32(h * fy) / 2)))
    return nx, ny, _int(_f32(w * fx)), _int(_f32(h * fy))


def _outcode(x, y, rx, ry, rw, rh):
    code = 0
    if y < ry:
        code |= 2
    elif y >= ry + rh:
        code |= 1
    if x < rx:
        code |= 4
    elif x >= rx + rw:
        code |= 8
    return code


def _cdiv(a, b):
    q = abs(a) // abs(b)
    return q if (a >= 0) == (b > 0) else -q


def _clipline(rx, ry, rw, rh, x1, y1, x2, y2):
    # SDL_IntersectRectAndLine (Cohen-Sutherland with integer arithmetic)
    if rw <= 0 or rh <= 0:
        return None
    rx2 = rx + rw - 1
    ry2 = ry + rh - 1
    if rx <= x1 <= rx2 and rx <= x2 <= rx2 and ry <= y1 <= ry2 and ry <= y2 <= ry2:
        return x1, y1, x2, y2
    if (x1 < rx and x2 < rx) or (x1 > rx2 and x2 > rx2) or (y1 < ry and y2 < ry) or (y1 > ry2 and y2 > ry2):
        return None
    if y1 == y2:
        if x1 < rx:
            x1 = rx
        elif x1 > rx2:
            x1 = rx2
        if x2 < rx:
            x2 = rx
        elif x2 > rx2:
            x2 = rx2
        return x1, y1, x2, y2
    if x1 == x2:
        if y1 < ry:
            y1 = ry
        elif y1 > ry2:
            y1 = ry2
        if y2 < ry:
            y2 = ry
        elif y2 > ry2:
            y2 = ry2
        return x1, y1, x2, y2
    c1 = _outcode(x1, y1, rx, ry, rw, rh)
    c2 = _outcode(x2, y2, rx, ry, rw, rh)
    x = 0
    y = 0
    while c1 or c2:
        if c1 & c2:
            return None
        c = c1 if c1 else c2
        if c & 2:
            y = ry
            x = x1 + _cdiv((x2 - x1) * (y - y1), y2 - y1)
        elif c & 1:
            y = ry2
            x = x1 + _cdiv((x2 - x1) * (y - y1), y2 - y1)
        elif c & 4:
            x = rx
            y = y1 + _cdiv((y2 - y1) * (x - x1), x2 - x1)
        elif c & 8:
            x = rx2
            y = y1 + _cdiv((y2 - y1) * (x - x1), x2 - x1)
        if c1:
            x1 = x
            y1 = y
            c1 = _outcode(x, y, rx, ry, rw, rh)
        else:
            x2 = x
            y2 = y
            c2 = _outcode(x, y, rx, ry, rw, rh)
    return x1, y1, x2, y2


def _four_ints(obj):
    n = len(obj) if _isseq(obj) else -1
    if n == 2:
        a = _two_ints(obj[0])
        if a is None:
            raise TypeError("number pair expected for first argument")
        b = _two_ints(obj[1])
        if b is None:
            raise TypeError("number pair expected for second argument")
        return a[0], a[1], b[0], b[1]
    if n == 4:
        out = []
        for i, word in enumerate(("first", "second", "third", "fourth")):
            v = _int(obj[i])
            if v is None:
                raise TypeError("number expected for " + word + " argument")
            out.append(v)
        return tuple(out)
    raise TypeError("sequence argument takes 2 or 4 items (" + str(n) + " given)")


class Rect:
    """A rectangle with integer coordinates (pygame.Rect)."""

    __hash__ = None

    def __init__(self, *args):
        r = _rect4(args)
        if r is None:
            raise TypeError("Argument must be rect style object")
        self._x, self._y, self._w, self._h = r

    def _new(self, x, y, w, h):
        return self.__class__(x, y, w, h)

    # ----- attributes -----
    def _get_x(self):
        return self._x

    def _set_x(self, v):
        self._x = _round(v)

    def _get_y(self):
        return self._y

    def _set_y(self, v):
        self._y = _round(v)

    def _get_w(self):
        return self._w

    def _set_w(self, v):
        self._w = _round(v)

    def _get_h(self):
        return self._h

    def _set_h(self, v):
        self._h = _round(v)

    x = property(_get_x, _set_x)
    left = property(_get_x, _set_x)
    y = property(_get_y, _set_y)
    top = property(_get_y, _set_y)
    w = property(_get_w, _set_w)
    width = property(_get_w, _set_w)
    h = property(_get_h, _set_h)
    height = property(_get_h, _set_h)

    @property
    def right(self):
        return self._x + self._w

    @right.setter
    def right(self, v):
        self._x = _round(v) - self._w

    @property
    def bottom(self):
        return self._y + self._h

    @bottom.setter
    def bottom(self, v):
        self._y = _round(v) - self._h

    @property
    def centerx(self):
        return self._x + (self._w >> 1)

    @centerx.setter
    def centerx(self, v):
        self._x = _round(v) - (self._w >> 1)

    @property
    def centery(self):
        return self._y + (self._h >> 1)

    @centery.setter
    def centery(self, v):
        self._y = _round(v) - (self._h >> 1)

    @property
    def topleft(self):
        return (self._x, self._y)

    @topleft.setter
    def topleft(self, v):
        self._x, self._y = _round2(v)

    @property
    def topright(self):
        return (self._x + self._w, self._y)

    @topright.setter
    def topright(self, v):
        a, b = _round2(v)
        self._x = a - self._w
        self._y = b

    @property
    def bottomleft(self):
        return (self._x, self._y + self._h)

    @bottomleft.setter
    def bottomleft(self, v):
        a, b = _round2(v)
        self._x = a
        self._y = b - self._h

    @property
    def bottomright(self):
        return (self._x + self._w, self._y + self._h)

    @bottomright.setter
    def bottomright(self, v):
        a, b = _round2(v)
        self._x = a - self._w
        self._y = b - self._h

    @property
    def midtop(self):
        return (self._x + (self._w >> 1), self._y)

    @midtop.setter
    def midtop(self, v):
        a, b = _round2(v)
        self._x = a - (self._w >> 1)
        self._y = b

    @property
    def midleft(self):
        return (self._x, self._y + (self._h >> 1))

    @midleft.setter
    def midleft(self, v):
        a, b = _round2(v)
        self._x = a
        self._y = b - (self._h >> 1)

    @property
    def midbottom(self):
        return (self._x + (self._w >> 1), self._y + self._h)

    @midbottom.setter
    def midbottom(self, v):
        a, b = _round2(v)
        self._x = a - (self._w >> 1)
        self._y = b - self._h

    @property
    def midright(self):
        return (self._x + self._w, self._y + (self._h >> 1))

    @midright.setter
    def midright(self, v):
        a, b = _round2(v)
        self._x = a - self._w
        self._y = b - (self._h >> 1)

    @property
    def center(self):
        return (self._x + (self._w >> 1), self._y + (self._h >> 1))

    @center.setter
    def center(self, v):
        a, b = _round2(v)
        self._x = a - (self._w >> 1)
        self._y = b - (self._h >> 1)

    @property
    def size(self):
        return (self._w, self._h)

    @size.setter
    def size(self, v):
        self._w, self._h = _round2(v)

    # ----- sequence protocol, comparison -----
    def __repr__(self):
        return "<rect(%d, %d, %d, %d)>" % (self._x, self._y, self._w, self._h)

    def __len__(self):
        return 4

    def __iter__(self):
        return iter((self._x, self._y, self._w, self._h))

    def __getitem__(self, i):
        if isinstance(i, slice):
            return [self._x, self._y, self._w, self._h][i]
        if not isinstance(i, int):
            raise TypeError("Invalid Rect slice")
        if i < -4 or i > 3:
            raise IndexError("Invalid rect Index")
        return (self._x, self._y, self._w, self._h)[i]

    def __setitem__(self, i, v):
        vals = [self._x, self._y, self._w, self._h]
        if isinstance(i, slice):
            idx = list(range(4))[i]
            if _int(v) is not None:
                for k in idx:
                    vals[k] = _int(v)
            elif _isseq(v):
                if len(v) != len(idx):
                    raise TypeError("Expected a length " + str(len(idx)) + " sequence")
                for k, item in zip(idx, v):
                    n = _int(item)
                    if n is None:
                        raise TypeError("Expected an integer between -2147483648 and 2147483647")
                    vals[k] = n
            else:
                raise TypeError("Expected an integer or sequence")
        elif isinstance(i, int):
            if i < -4 or i > 3:
                raise IndexError("Invalid rect Index")
            n = _int(v)
            if n is None:
                raise TypeError("Must assign numeric values")
            vals[i] = n
        else:
            raise TypeError("Invalid Rect slice")
        self._x, self._y, self._w, self._h = vals

    def __bool__(self):
        return self._w != 0 and self._h != 0

    def __contains__(self, other):
        if isinstance(other, int):
            return other == self._x or other == self._y or other == self._w or other == self._h
        r = _rect4(other)
        if r is None:
            raise TypeError("'in <pygame.Rect>' requires rect style object or int as left operand")
        return self._contains(r)

    def _cmp(self, other):
        o = _rect4(other)
        if o is None:
            return None
        a = (self._x, self._y, self._w, self._h)
        return -1 if a < o else (1 if a > o else 0)

    def __eq__(self, other):
        c = self._cmp(other)
        return NotImplemented if c is None else c == 0

    def __ne__(self, other):
        c = self._cmp(other)
        return NotImplemented if c is None else c != 0

    def __lt__(self, other):
        c = self._cmp(other)
        return NotImplemented if c is None else c < 0

    def __le__(self, other):
        c = self._cmp(other)
        return NotImplemented if c is None else c <= 0

    def __gt__(self, other):
        c = self._cmp(other)
        return NotImplemented if c is None else c > 0

    def __ge__(self, other):
        c = self._cmp(other)
        return NotImplemented if c is None else c >= 0

    # ----- methods -----
    def copy(self):
        return self._new(self._x, self._y, self._w, self._h)

    __copy__ = copy

    def normalize(self):
        if self._w < 0:
            self._x += self._w
            self._w = -self._w
        if self._h < 0:
            self._y += self._h
            self._h = -self._h

    def move(self, *args):
        d = _two_ints(args)
        if d is None:
            raise TypeError("argument must contain two numbers")
        return self._new(self._x + d[0], self._y + d[1], self._w, self._h)

    def move_ip(self, *args):
        d = _two_ints(args)
        if d is None:
            raise TypeError("argument must contain two numbers")
        self._x += d[0]
        self._y += d[1]

    def inflate(self, *args):
        d = _two_ints(args)
        if d is None:
            raise TypeError("argument must contain two numbers")
        return self._new(self._x - _half(d[0]), self._y - _half(d[1]), self._w + d[0], self._h + d[1])

    def inflate_ip(self, *args):
        d = _two_ints(args)
        if d is None:
            raise TypeError("argument must contain two numbers")
        self._x -= _half(d[0])
        self._y -= _half(d[1])
        self._w += d[0]
        self._h += d[1]

    def scale_by(self, *args, **kw):
        fx, fy = _scale_args(args, kw, "scale_by")
        return self._new(*_scaled(self._x, self._y, self._w, self._h, fx, fy))

    def scale_by_ip(self, *args, **kw):
        fx, fy = _scale_args(args, kw, "scale_by_ip")
        self._x, self._y, self._w, self._h = _scaled(self._x, self._y, self._w, self._h, fx, fy)

    def update(self, *args):
        self._x, self._y, self._w, self._h = _need_rect(args)

    def _unioned(self, o):
        x = min(self._x, o[0])
        y = min(self._y, o[1])
        return x, y, max(self._x + self._w, o[0] + o[2]) - x, max(self._y + self._h, o[1] + o[3]) - y

    def union(self, *args):
        return self._new(*self._unioned(_need_rect(args)))

    def union_ip(self, *args):
        self._x, self._y, self._w, self._h = self._unioned(_need_rect(args))

    def _unionall(self, rects):
        if not _isseq(rects):
            raise TypeError("Argument must be a sequence of rectstyle objects.")
        l = self._x
        t = self._y
        r = self._x + self._w
        b = self._y + self._h
        for obj in rects:
            o = _rect4(obj)
            if o is None:
                raise TypeError("Argument must be a sequence of rectstyle objects.")
            l = min(l, o[0])
            t = min(t, o[1])
            r = max(r, o[0] + o[2])
            b = max(b, o[1] + o[3])
        return l, t, r - l, b - t

    def unionall(self, rect):
        return self._new(*self._unionall(rect))

    def unionall_ip(self, rects):
        self._x, self._y, self._w, self._h = self._unionall(rects)

    def clamp(self, *args):
        nx, ny = _clamped(self._x, self._y, self._w, self._h, _need_rect(args))
        return self._new(nx, ny, self._w, self._h)

    def clamp_ip(self, *args):
        self._x, self._y = _clamped(self._x, self._y, self._w, self._h, _need_rect(args))

    def clip(self, *args):
        bx, by, bw, bh = _need_rect(args)
        ax = self._x
        ay = self._y
        aw = self._w
        ah = self._h
        if ax >= bx and ax < bx + bw:
            x = ax
        elif bx >= ax and bx < ax + aw:
            x = bx
        else:
            return self._new(ax, ay, 0, 0)
        if ax + aw > bx and ax + aw <= bx + bw:
            w = ax + aw - x
        elif bx + bw > ax and bx + bw <= ax + aw:
            w = bx + bw - x
        else:
            return self._new(ax, ay, 0, 0)
        if ay >= by and ay < by + bh:
            y = ay
        elif by >= ay and by < ay + ah:
            y = by
        else:
            return self._new(ax, ay, 0, 0)
        if ay + ah > by and ay + ah <= by + bh:
            h = ay + ah - y
        elif by + bh > ay and by + bh <= ay + ah:
            h = by + bh - y
        else:
            return self._new(ax, ay, 0, 0)
        return self._new(x, y, w, h)

    def clipline(self, *args, **kw):
        if kw:
            if "first_coordinate" in kw and "second_coordinate" in kw:
                if len(kw) > 2:
                    raise TypeError("Only 2 keyword argument can be passed when using 'first_coordinate' and 'second_coordinate'")
                args = args + (kw["first_coordinate"], kw["second_coordinate"])
            elif "rect_arg" in kw:
                if len(kw) > 1:
                    raise TypeError("Only 1 keyword argument can be passed when using 'rect_arg")
                args = args + (_four_ints(kw["rect_arg"]),)
            else:
                args = args + tuple(kw[k] for k in ("x1", "x2", "x3", "x4") if k in kw)
        if len(args) == 1:
            x1, y1, x2, y2 = _four_ints(args[0])
        elif len(args) == 2:
            a = _two_ints(args[0])
            if a is None:
                raise TypeError("number pair expected for first argument")
            b = _two_ints(args[1])
            if b is None:
                raise TypeError("number pair expected for second argument")
            x1, y1, x2, y2 = a[0], a[1], b[0], b[1]
        elif len(args) == 4:
            vals = []
            for i, word in enumerate(("first", "second", "third", "fourth")):
                v = _int(args[i])
                if v is None:
                    raise TypeError("number expected for " + word + " argument")
                vals.append(v)
            x1, y1, x2, y2 = vals
        elif len(args) == 3:
            raise TypeError("clipline() takes 1, 2, or 4 arguments (3 given)")
        else:
            raise TypeError("function takes at most 4 arguments (" + str(len(args)) + " given)")
        rx = self._x
        ry = self._y
        rw = self._w
        rh = self._h
        if rw < 0:
            rx += rw
            rw = -rw
        if rh < 0:
            ry += rh
            rh = -rh
        r = _clipline(rx, ry, rw, rh, x1, y1, x2, y2)
        if r is None:
            return ()
        return ((r[0], r[1]), (r[2], r[3]))

    def fit(self, *args):
        o = _need_rect(args)
        xr = _f32(float(self._w) / o[2]) if o[2] else (math.inf if self._w > 0 else (-math.inf if self._w < 0 else math.nan))
        yr = _f32(float(self._h) / o[3]) if o[3] else (math.inf if self._h > 0 else (-math.inf if self._h < 0 else math.nan))
        m = xr if xr > yr else yr
        w = _int(_f32(self._w / m)) if m else -2147483648
        h = _int(_f32(self._h / m)) if m else -2147483648
        return self._new(_i32(o[0] + _half(_i32(o[2] - w))), _i32(o[1] + _half(_i32(o[3] - h))), w, h)

    def _contains(self, o):
        x = self._x
        y = self._y
        return (x <= o[0] and y <= o[1] and x + self._w >= o[0] + o[2] and y + self._h >= o[1] + o[3]
                and x + self._w > o[0] and y + self._h > o[1])

    def contains(self, *args):
        return self._contains(_need_rect(args))

    def collidepoint(self, a=_NO, b=_NO):
        if b is _NO:
            p = _two_ints(a) if a is not _NO else None
        else:
            p = _two_ints((a, b))
        if p is None:
            raise TypeError("argument must contain two numbers")
        x = self._x
        y = self._y
        return x <= p[0] < x + self._w and y <= p[1] < y + self._h

    def colliderect(self, a=_NO, b=_NO, c=_NO, d=_NO):
        if b is _NO and a is not _NO:
            if a.__class__ is Rect:
                bx = a._x
                by = a._y
                bw = a._w
                bh = a._h
            else:
                o = _rect4(a)
                if o is None:
                    raise TypeError("Invalid rect, all 4 fields must be numeric")
                bx, by, bw, bh = o
        else:
            args = tuple(v for v in (a, b, c, d) if v is not _NO)
            n = len(args)
            if n == 2:
                p = _two_ints(args[0])
                q = _two_ints(args[1])
                if p is None or q is None:
                    raise TypeError("Invalid rect, all 4 fields must be numeric")
                bx, by, bw, bh = p[0], p[1], q[0], q[1]
            elif n == 4:
                vals = []
                for i, ch in enumerate("xywh"):
                    v = _int(args[i])
                    if v is None:
                        raise TypeError("Invalid " + ch + " value for rect, must be numeric")
                    vals.append(v)
                bx, by, bw, bh = vals
            else:
                raise ValueError("Incorrect arguments number, must be either 1, 2 or 4")
        aw = self._w
        ah = self._h
        if aw > 0 and ah > 0 and bw > 0 and bh > 0:
            ax = self._x
            ay = self._y
            return ax < bx + bw and ay < by + bh and ax + aw > bx and ay + ah > by
        return _intersect(self._x, self._y, aw, ah, (bx, by, bw, bh))

    def collidelist(self, rects):
        if not _isseq(rects):
            raise TypeError("Argument must be a sequence of rectstyle objects.")
        x = self._x
        y = self._y
        w = self._w
        h = self._h
        i = 0
        for obj in rects:
            o = (obj._x, obj._y, obj._w, obj._h) if obj.__class__ is Rect else _rect4(obj)
            if o is None:
                raise TypeError("Argument must be a sequence of rectstyle objects.")
            if _intersect(x, y, w, h, o):
                return i
            i += 1
        return -1

    def collidelistall(self, rects):
        if not _isseq(rects):
            raise TypeError("Argument must be a sequence of rectstyle objects.")
        out = []
        x = self._x
        y = self._y
        w = self._w
        h = self._h
        i = 0
        for obj in rects:
            o = (obj._x, obj._y, obj._w, obj._h) if obj.__class__ is Rect else _rect4(obj)
            if o is None:
                raise TypeError("Argument must be a sequence of rectstyle objects.")
            if _intersect(x, y, w, h, o):
                out.append(i)
            i += 1
        return out

    def _objrect(self, obj, key):
        if key is not None:
            o = _rect4(key(obj))
            if o is None:
                raise TypeError("Key function must return rect or rect-like objects")
        else:
            o = _rect4(obj)
            if o is None:
                raise TypeError("Sequence must contain rect or rect-like objects")
        return o

    def collideobjects(self, objects, key=None):
        if not _isseq(objects):
            raise TypeError("Argument must be a sequence of objects.")
        if key is not None and not callable(key):
            raise TypeError("Key function must be callable with one argument.")
        for obj in objects:
            if _intersect(self._x, self._y, self._w, self._h, self._objrect(obj, key)):
                return obj
        return None

    def collideobjectsall(self, objects, key=None):
        if not _isseq(objects):
            raise TypeError("Argument must be a sequence of objects.")
        if key is not None and not callable(key):
            raise TypeError("Key function must be callable with one argument.")
        return [obj for obj in objects if _intersect(self._x, self._y, self._w, self._h, self._objrect(obj, key))]

    def collidedict(self, rect_dict, values=0):
        if not isinstance(rect_dict, dict):
            raise TypeError("first argument must be a dict")
        for k, v in rect_dict.items():
            o = _rect4(v if values else k)
            if o is None:
                raise TypeError("dict must have rectstyle " + ("values" if values else "keys"))
            if _intersect(self._x, self._y, self._w, self._h, o):
                return (k, v)
        return None

    def collidedictall(self, rect_dict, values=0):
        if not isinstance(rect_dict, dict):
            raise TypeError("first argument must be a dict")
        out = []
        for k, v in rect_dict.items():
            o = _rect4(v if values else k)
            if o is None:
                raise TypeError("dict must have rectstyle " + ("values" if values else "keys"))
            if _intersect(self._x, self._y, self._w, self._h, o):
                out.append((k, v))
        return out


RECT_CLASSES = (Rect,)


class ZRect:
    """A rectangle whose coordinates may be floats (pgzero.rect.ZRect)."""

    _item_mapping = dict(enumerate("xywh"))

    def __init__(self, *args):
        if len(args) == 1:
            args = tuple(self._handle_one_arg(args[0]))
        if len(args) == 4:
            self.x, self.y, self.w, self.h = args
        elif len(args) == 2:
            (self.x, self.y), (self.w, self.h) = args
        elif len(args) == 1:
            self.x, self.y, self.w, self.h = args[0]
        else:
            raise NameError("name 'cls' is not defined")
        self.rect = self

    def _handle_one_arg(self, arg):
        if isinstance(arg, ZRect):
            return arg.x, arg.y, arg.w, arg.h
        if isinstance(arg, Rect):
            return arg._x, arg._y, arg._w, arg._h
        if hasattr(arg, "rect"):
            rectobj = arg.rect
            if callable(rectobj):
                rectobj = rectobj()
            return self._handle_one_arg(rectobj)
        return arg

    def __repr__(self):
        return "<%s (x: %s, y: %s, w: %s, h: %s)>" % (self.__class__.__name__, self.x, self.y, self.w, self.h)

    def copy(self):
        return self.__class__(self.x, self.y, self.w, self.h)

    __copy__ = copy

    def __len__(self):
        return 4

    def __getitem__(self, item):
        if item not in self._item_mapping:
            raise IndexError
        return getattr(self, self._item_mapping[item])

    def __setitem__(self, item, value):
        if item not in self._item_mapping:
            raise IndexError
        raise TypeError("setattr expected 3 arguments, got 2")

    def __bool__(self):
        return self.w != 0 and self.h != 0

    def __iter__(self):
        return iter((self.x, self.y, self.w, self.h))

    def __hash__(self):
        raise TypeError("ZRect instances may not be used as dictionary keys")

    def _key(self, other):
        r = self.__class__(*other)
        return (r.x, r.y, r.w, r.h)

    def __eq__(self, *other):
        return (self.x, self.y, self.w, self.h) == self._key(other)

    def __ne__(self, *other):
        return (self.x, self.y, self.w, self.h) != self._key(other)

    def __lt__(self, *other):
        return (self.x, self.y, self.w, self.h) < self._key(other)

    def __gt__(self, *other):
        return (self.x, self.y, self.w, self.h) > self._key(other)

    def __le__(self, *other):
        return (self.x, self.y, self.w, self.h) <= self._key(other)

    def __ge__(self, *other):
        return (self.x, self.y, self.w, self.h) >= self._key(other)

    def __contains__(self, other):
        if len(other) == 2:
            return self.collidepoint(*other)
        else:
            return self.contains(*other)

    def _get_width(self):
        return self.w

    def _set_width(self, width):
        self.w = width

    width = property(_get_width, _set_width)

    def _get_height(self):
        return self.h

    def _set_height(self, height):
        self.h = height

    height = property(_get_height, _set_height)

    def _get_top(self):
        return self.y

    def _set_top(self, top):
        self.y = top

    top = property(_get_top, _set_top)

    def _get_left(self):
        return self.x

    def _set_left(self, left):
        self.x = left

    left = property(_get_left, _set_left)

    @property
    def right(self):
        return self.x + self.w

    @right.setter
    def right(self, right):
        self.x = right - self.w

    @property
    def bottom(self):
        return self.y + self.h

    @bottom.setter
    def bottom(self, bottom):
        self.y = bottom - self.h

    @property
    def centerx(self):
        return self.x + (self.w / 2)

    @centerx.setter
    def centerx(self, centerx):
        self.x = centerx - (self.w / 2)

    @property
    def centery(self):
        return self.y + (self.h / 2)

    @centery.setter
    def centery(self, centery):
        self.y = centery - (self.h / 2)

    @property
    def topleft(self):
        return self.x, self.y

    @topleft.setter
    def topleft(self, topleft):
        self.x, self.y = topleft

    @property
    def topright(self):
        return self.x + self.w, self.y

    @topright.setter
    def topright(self, topright):
        x, y = topright
        self.x = x - self.w
        self.y = y

    @property
    def bottomleft(self):
        return self.x, self.y + self.h

    @bottomleft.setter
    def bottomleft(self, bottomleft):
        x, y = bottomleft
        self.x = x
        self.y = y - self.h

    @property
    def bottomright(self):
        return self.x + self.w, self.y + self.h

    @bottomright.setter
    def bottomright(self, bottomright):
        x, y = bottomright
        self.x = x - self.w
        self.y = y - self.h

    @property
    def midtop(self):
        return self.x + self.w / 2, self.y

    @midtop.setter
    def midtop(self, midtop):
        x, y = midtop
        self.x = x - self.w / 2
        self.y = y

    @property
    def midleft(self):
        return self.x, self.y + self.h / 2

    @midleft.setter
    def midleft(self, midleft):
        x, y = midleft
        self.x = x
        self.y = y - self.h / 2

    @property
    def midbottom(self):
        return self.x + self.w / 2, self.y + self.h

    @midbottom.setter
    def midbottom(self, midbottom):
        x, y = midbottom
        self.x = x - self.w / 2
        self.y = y - self.h

    @property
    def midright(self):
        return self.x + self.w, self.y + self.h / 2

    @midright.setter
    def midright(self, midright):
        x, y = midright
        self.x = x - self.w
        self.y = y - self.h / 2

    @property
    def center(self):
        return self.x + self.w / 2, self.y + self.h / 2

    @center.setter
    def center(self, center):
        x, y = center
        self.x = x - self.w / 2
        self.y = y - self.h / 2

    @property
    def size(self):
        return self.w, self.h

    @size.setter
    def size(self, size):
        self.w, self.h = size

    def move(self, x, y):
        return self.__class__(self.x + x, self.y + y, self.w, self.h)

    def move_ip(self, x, y):
        self.x += x
        self.y += y

    def _inflated(self, x, y):
        return self.x - x / 2, self.y - y / 2, self.w + x, self.h + y

    def inflate(self, x, y):
        return self.__class__(*self._inflated(x, y))

    def inflate_ip(self, x, y):
        self.x, self.y, self.w, self.h = self._inflated(x, y)

    def _clamped(self, *other):
        rect = self.__class__(*other)
        if self.w >= rect.w:
            x = rect.x + rect.w / 2 - self.w / 2
        elif self.x < rect.x:
            x = rect.x
        elif self.x + self.w > rect.x + rect.w:
            x = rect.x + rect.w - self.w
        else:
            x = self.x
        if self.h >= rect.h:
            y = rect.y + rect.h / 2 - self.h / 2
        elif self.y < rect.y:
            y = rect.y
        elif self.y + self.h > rect.y + rect.h:
            y = rect.y + rect.h - self.h
        else:
            y = self.y
        return x, y

    def clamp(self, *other):
        rect = self.__class__(*other)
        x, y = self._clamped(rect)
        return self.__class__(x, y, self.w, self.h)

    def clamp_ip(self, *other):
        rect = self.__class__(*other)
        self.x, self.y = self._clamped(rect)

    def _clipped(self, *other):
        rect = self.__class__(*other)
        if self.x >= rect.x and self.x < (rect.x + rect.w):
            x = self.x
        elif rect.x >= self.x and rect.x < (self.x + self.w):
            x = rect.x
        else:
            raise NoIntersect
        if (self.x + self.w) > rect.x and (self.x + self.w) <= (rect.x + rect.w):
            w = self.x + self.w - x
        elif (rect.x + rect.w) > self.x and (rect.x + rect.w) <= (self.x + self.w):
            w = rect.x + rect.w - x
        else:
            raise NoIntersect
        if self.y >= rect.y and self.y < (rect.y + rect.h):
            y = self.y
        elif rect.y >= self.y and rect.y < (self.y + self.h):
            y = rect.y
        else:
            raise NoIntersect
        if (self.y + self.h) > rect.y and (self.y + self.h) <= (rect.y + rect.h):
            h = self.y + self.h - y
        elif (rect.y + rect.h) > self.y and (rect.y + rect.h) <= (self.y + self.h):
            h = rect.y + rect.h - y
        else:
            raise NoIntersect
        return x, y, w, h

    def clip(self, *other):
        rect = self.__class__(*other)
        try:
            x, y, w, h = self._clipped(rect)
        except NoIntersect:
            x, y, w, h = self.x, self.y, 0, 0
        return self.__class__(x, y, w, h)

    def clip_ip(self, *other):
        rect = self.__class__(*other)
        try:
            self.x, self.y, self.w, self.h = self._clipped(rect)
        except NoIntersect:
            self.x, self.y, self.w, self.h = self.x, self.y, 0, 0

    def _unioned(self, *other):
        rect = self.__class__(*other)
        x = min(self.x, rect.x)
        y = min(self.y, rect.y)
        w = max(self.x + self.w, rect.x + rect.w) - x
        h = max(self.y + self.h, rect.y + rect.h) - y
        return x, y, w, h

    def union(self, *other):
        rect = self.__class__(*other)
        return self.__class__(*self._unioned(rect))

    def union_ip(self, *other):
        rect = self.__class__(*other)
        self.x, self.y, self.w, self.h = self._unioned(rect)

    def _unionalled(self, others):
        allrects = [self] + [self.__class__(other) for other in others]
        x = min(r.x for r in allrects)
        y = min(r.y for r in allrects)
        w = max(r.x + r.w for r in allrects) - x
        h = max(r.y + r.h for r in allrects) - y
        return x, y, w, h

    def unionall(self, others):
        return self.__class__(*self._unionalled(others))

    def unionall_ip(self, others):
        self.x, self.y, self.w, self.h = self._unionalled(others)

    def fit(self, *other):
        rect = self.__class__(*other)
        ratio = max(self.w / rect.w, self.h / rect.h)
        w = self.w / ratio
        h = self.h / ratio
        x = rect.x + (rect.w - w) / 2
        y = rect.y + (rect.h - h) / 2
        return self.__class__(x, y, w, h)

    def normalize(self):
        if self.w < 0:
            self.x += self.w
            self.w = abs(self.w)
        if self.h < 0:
            self.y += self.h
            self.h = abs(self.h)

    def contains(self, *other):
        rect = self.__class__(*other)
        return (
            self.x <= rect.x and
            self.y <= rect.y and
            self.x + self.w >= rect.x + rect.w and
            self.y + self.h >= rect.y + rect.h and
            self.x + self.w > rect.x and
            self.y + self.h > rect.y
        )

    def collidepoint(self, *args):
        if len(args) == 1:
            x, y = args[0]
        else:
            x, y = args
        return (
            self.x <= x < (self.x + self.w) and
            self.y <= y < (self.y + self.h)
        )

    def colliderect(self, a=_NO, b=_NO, c=_NO, d=_NO):
        if b is _NO and a is not _NO and a.__class__ is ZRect:
            ox = a.x
            oy = a.y
            ow = a.w
            oh = a.h
        else:
            rect = self.__class__(*[v for v in (a, b, c, d) if v is not _NO])
            ox, oy, ow, oh = rect.x, rect.y, rect.w, rect.h
        x = self.x
        y = self.y
        return x < ox + ow and y < oy + oh and x + self.w > ox and y + self.h > oy

    def collidelist(self, others):
        for n, other in enumerate(others):
            if self.colliderect(other):
                return n
        else:
            return -1

    def collidelistall(self, others):
        return [n for n, other in enumerate(others) if self.colliderect(other)]

    def collidedict(self, dict, use_values=True):
        for k, v in dict.items():
            if self.colliderect(v if use_values else k):
                return k, v

    def collidedictall(self, dict, use_values=True):
        return [(k, v) for (k, v) in dict.items() if self.colliderect(v if use_values else k)]


RECT_CLASSES = (Rect, ZRect)
`;
