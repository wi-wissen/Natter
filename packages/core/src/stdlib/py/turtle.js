// turtle: turtle graphics. The movement maths follows CPython's turtle (same formulas, so positions and headings are
// identical); drawing goes to the host as commands through the native _turtle.cmd, and the host says how long to wait.

const METHODS = [
  'forward', 'fd', 'back', 'bk', 'backward', 'right', 'rt', 'left', 'lt', 'goto', 'setpos', 'setposition', 'setx', 'sety',
  'setheading', 'seth', 'home', 'circle', 'dot', 'stamp', 'clearstamp', 'clearstamps', 'speed', 'pos', 'position', 'xcor', 'ycor',
  'heading', 'towards', 'distance', 'degrees', 'radians', 'penup', 'pu', 'up', 'pendown', 'pd', 'down', 'isdown', 'pensize', 'width',
  'pen', 'color', 'pencolor', 'fillcolor', 'filling', 'begin_fill', 'end_fill', 'reset', 'clear', 'write', 'showturtle', 'st',
  'hideturtle', 'ht', 'isvisible', 'shape', 'shapesize', 'turtlesize', 'resizemode', 'clone', 'undo', 'setundobuffer', 'undobufferentries',
  'onclick', 'onrelease', 'ondrag', 'begin_poly', 'end_poly', 'get_poly', 'getscreen', 'teleport', 'shearfactor', 'tilt', 'settiltangle', 'tiltangle',
  'getturtle', 'getpen', 'tracer', 'delay', 'xcor', 'screensize',
];
const SCREEN_METHODS = [
  'bgcolor', 'bgpic', 'title', 'setup', 'window_width', 'window_height', 'tracer', 'update', 'delay', 'exitonclick', 'mainloop', 'done',
  'bye', 'mode', 'colormode', 'listen', 'onkey', 'onkeypress', 'onkeyrelease', 'onscreenclick', 'ontimer', 'textinput', 'numinput',
  'screensize', 'setworldcoordinates', 'register_shape', 'addshape', 'getshapes', 'turtles', 'clearscreen', 'resetscreen', 'onclick',
  'onkeyrelease', 'bye', 'cv', 'getcanvas',
];
const DIRECT = METHODS.filter((n) => !['getscreen', 'getturtle', 'getpen', 'onclick', 'tracer', 'delay', 'screensize', 'reset', 'clear'].includes(n));
const SCREEN_DIRECT = SCREEN_METHODS.filter((n) => !['turtles', 'clearscreen', 'resetscreen', 'cv', 'getcanvas', 'onclick'].includes(n));

const seen = new Set();
const once = (n) => !seen.has(n) && seen.add(n);
const wrappers = [
  ...DIRECT.filter(once).map((n) => `def ${n}(*args, **kw):\n    return _turtle().${n}(*args, **kw)\n`),
  ...SCREEN_DIRECT.filter(once).map((n) => `def ${n}(*args, **kw):\n    return Screen().${n}(*args, **kw)\n`),
].join('\n');

export default String.raw`
import math
import _turtle_host as _host

class TurtleGraphicsError(Exception):
    pass


class Terminator(Exception):
    pass


_COLORS = set("aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen".split())
_SHAPES = ["arrow", "turtle", "circle", "square", "triangle", "classic"]


class Vec2D:
    """A pair of numbers (x, y) with vector arithmetic; behaves like a tuple."""

    def __init__(self, x, y):
        self._v = (x, y)

    def __iter__(self):
        return iter(self._v)

    def __getitem__(self, i):
        return self._v[i]

    def __len__(self):
        return 2

    def __eq__(self, other):
        try:
            return self._v == tuple(other)
        except TypeError:
            return False

    def __hash__(self):
        return hash(self._v)

    def __add__(self, other):
        return Vec2D(self._v[0] + other[0], self._v[1] + other[1])

    def __sub__(self, other):
        return Vec2D(self._v[0] - other[0], self._v[1] - other[1])

    def __mul__(self, other):
        if isinstance(other, Vec2D):
            return self._v[0] * other[0] + self._v[1] * other[1]
        return Vec2D(self._v[0] * other, self._v[1] * other)

    def __rmul__(self, other):
        if isinstance(other, (int, float)):
            return Vec2D(self._v[0] * other, self._v[1] * other)
        return NotImplemented

    def __neg__(self):
        return Vec2D(-self._v[0], -self._v[1])

    def __abs__(self):
        return math.hypot(self._v[0], self._v[1])

    def rotate(self, angle):
        perp = Vec2D(-self._v[1], self._v[0])
        angle = math.radians(angle)
        c, s = math.cos(angle), math.sin(angle)
        return Vec2D(self._v[0] * c + perp[0] * s, self._v[1] * c + perp[1] * s)

    def __repr__(self):
        return "(%.2f,%.2f)" % self._v


def _vec(x, y=None):
    if y is not None:
        return Vec2D(x, y)
    if isinstance(x, Vec2D):
        return x
    if isinstance(x, TNavigator):
        return x._position
    return Vec2D(x[0], x[1])


class TNavigator:
    """Position and heading; the same arithmetic as turtle.TNavigator in CPython."""

    def __init__(self, mode="standard"):
        self._angleOffset = 0
        self._angleOrient = 1
        self._mode = mode
        self.undobuffer = None
        self._fullcircle = 360.0
        self._degreesPerAU = 1.0
        self._setmode(mode)
        self._position = Vec2D(0.0, 0.0)
        self._orient = Vec2D(1.0, 0.0) if mode in ("standard", "world") else Vec2D(0.0, 1.0)

    def _setmode(self, mode=None):
        if mode is None:
            return self._mode
        if mode not in ["standard", "logo", "world"]:
            return
        self._mode = mode
        if mode in ["standard", "world"]:
            self._angleOffset = 0
            self._angleOrient = 1
        else:
            self._angleOffset = self._fullcircle / 4.0
            self._angleOrient = -1

    def _setDegreesPerAU(self, fullcircle):
        self._fullcircle = fullcircle
        self._degreesPerAU = 360 / fullcircle
        if self._mode == "standard":
            self._angleOffset = 0
        else:
            self._angleOffset = fullcircle / 4.0

    def degrees(self, fullcircle=360.0):
        self._setDegreesPerAU(fullcircle)

    def radians(self):
        self._setDegreesPerAU(math.tau)

    def _go(self, distance):
        self._goto(self._position + self._orient * distance)

    def _rotate(self, angle):
        angle *= self._degreesPerAU
        self._orient = self._orient.rotate(angle)

    def _goto(self, end):
        self._position = end

    def forward(self, distance):
        self._go(distance)

    def back(self, distance):
        self._go(-distance)

    def right(self, angle):
        self._rotate(-angle)

    def left(self, angle):
        self._rotate(angle)

    def pos(self):
        return self._position

    def xcor(self):
        return self._position[0]

    def ycor(self):
        return self._position[1]

    def goto(self, x, y=None):
        self._goto(_vec(x, y))

    def home(self):
        self.goto(0, 0)
        self.setheading(0)

    def setx(self, x):
        self._goto(Vec2D(x, self._position[1]))

    def sety(self, y):
        self._goto(Vec2D(self._position[0], y))

    def distance(self, x, y=None):
        return abs(_vec(x, y) - self._position)

    def towards(self, x, y=None):
        x, y = _vec(x, y) - self._position
        result = round(math.degrees(math.atan2(y, x)), 10) % 360.0
        result /= self._degreesPerAU
        return (self._angleOffset + self._angleOrient * result) % self._fullcircle

    def heading(self):
        x, y = self._orient
        result = round(math.degrees(math.atan2(y, x)), 10) % 360.0
        result /= self._degreesPerAU
        return (self._angleOffset + self._angleOrient * result) % self._fullcircle

    def setheading(self, to_angle):
        angle = (to_angle - self.heading()) * self._angleOrient
        full = self._fullcircle
        angle = (angle + full / 2.0) % full - full / 2.0
        self._rotate(angle)

    def circle(self, radius, extent=None, steps=None):
        speed = self.speed()
        if extent is None:
            extent = self._fullcircle
        if steps is None:
            frac = abs(extent) / self._fullcircle
            steps = 1 + int(min(11 + abs(radius) / 6.0, 59.0) * frac)
        w = 1.0 * extent / steps
        w2 = 0.5 * w
        l = 2.0 * radius * math.sin(math.radians(w2) * self._degreesPerAU)
        if radius < 0:
            l, w, w2 = -l, -w, -w2
        self._rotate(w2)
        self._circling = True
        for i in range(steps):
            self._go(l)
            self._rotate(w)
        self._circling = False
        self._rotate(-w2)

    def speed(self, s=0):
        return 0

    fd = forward
    bk = back
    backward = back
    rt = right
    lt = left
    position = pos
    setpos = goto
    setposition = goto
    seth = setheading


def _color(c, mode):
    """A colour argument as text for the host: a name or #rrggbb."""
    if isinstance(c, str):
        if c in _COLORS or c == "":
            return c
        if len(c) == 7 and c[0] == "#":
            try:
                int(c[1:], 16)
                return c
            except ValueError:
                pass
        raise TurtleGraphicsError("bad color string: " + c)
    if isinstance(c, tuple) or isinstance(c, list) or isinstance(c, Vec2D):
        if len(c) != 3:
            raise TurtleGraphicsError("bad color arguments: " + str(tuple(c)))
        r, g, b = c
        out = "#"
        for v in (r, g, b):
            if isinstance(v, bool) or not isinstance(v, (int, float)):
                raise TurtleGraphicsError("bad color sequence: " + str(tuple(c)))
            if v < 0 or v > mode:
                raise TurtleGraphicsError("bad color sequence: " + str(tuple(c)))
            n = int(round(v * 255 / mode)) if mode != 255 else int(v)
            out += "%02x" % n
        return out
    raise TurtleGraphicsError("bad color arguments: " + str(c))


class _ScreenState:
    def __init__(self):
        self.bg = "white"
        self.tracing = 1
        self.delay_ms = 10
        self.colormode = 255
        self.width = 960
        self.height = 810
        self.title = "Python Turtle Graphics"
        self.turtles = []
        self.key_handlers = {}
        self.keyrelease_handlers = {}
        self.click_handler = None
        self.timers = []
        self.listening = False
        self.running = False
        self.exit_on_click = False


_state = _ScreenState()
_next_id = [1]


def _emit(kind, *args):
    """Tell the host and wait as long as it wants (animation)."""
    return _host.cmd(kind, args)


class Turtle(TNavigator):
    def __init__(self, shape="classic", undobuffersize=1000, visible=True):
        TNavigator.__init__(self)
        self._id = _next_id[0]
        _next_id[0] += 1
        self._pencolor = "black"
        self._fillcolor = "black"
        self._pensize = 1
        self._pendown = True
        self._shown = bool(visible)
        self._speed = 3
        self._shape = shape
        self._filling = False
        self._fillpath = None
        self._shapesize = (1.0, 1.0, 1)
        self._resizemode = "noresize"
        self._tilt = 0.0
        self._poly = None
        self._circling = False
        self._stamps = []
        self._screen = None
        _state.turtles.append(self)
        _emit("new", self._id, shape, self._pencolor, self._fillcolor)

    # movement: every step goes through _goto and _rotate
    def _wait_args(self):
        return 0 if (self._speed == 0 or _state.tracing == 0) else self._speed

    def _goto(self, end):
        start = self._position
        self._position = end
        if self._filling and self._fillpath is not None:
            self._fillpath.append((end[0], end[1]))
        if self._poly is not None:
            self._poly.append((end[0], end[1]))
        if self._circling:
            sp = 0 if self._speed == 0 else self._speed
        else:
            sp = self._wait_args()
        _emit("move", self._id, start[0], start[1], end[0], end[1], self._pendown, self._pencolor, self._pensize, sp)

    def _rotate(self, angle):
        before = self.heading()
        TNavigator._rotate(self, angle)
        if not self._circling:
            _emit("turn", self._id, before, self.heading(), self._wait_args())

    def teleport(self, x=None, y=None, fill_gap=False):
        nx = x if x is not None else self._position[0]
        ny = y if y is not None else self._position[1]
        was = self._pendown
        self._pendown = False
        self._goto(Vec2D(nx, ny))
        self._pendown = was

    def speed(self, speed=None):
        names = {"fastest": 0, "fast": 10, "normal": 6, "slow": 3, "slowest": 1}
        if speed is None:
            return self._speed
        if isinstance(speed, str):
            speed = names.get(speed, None)
            if speed is None:
                return
        if speed > 10 or speed < 0.5:
            speed = 0
        self._speed = int(round(speed))
        _emit("speed", self._id, self._speed)

    def penup(self):
        self._pendown = False

    def pendown(self):
        self._pendown = True

    def isdown(self):
        return self._pendown

    def pensize(self, width=None):
        if width is None:
            return self._pensize
        self._pensize = width
        _emit("pen", self._id, self._pencolor, self._fillcolor, self._pensize)

    def pen(self, pen=None, **pendict):
        if pen is None and not pendict:
            return {"shown": self._shown, "pendown": self._pendown, "pencolor": self._pencolor, "fillcolor": self._fillcolor,
                    "pensize": self._pensize, "speed": self._speed, "resizemode": self._resizemode, "stretchfactor": self._shapesize[:2],
                    "outline": self._shapesize[2], "tilt": self._tilt}
        p = {}
        if pen:
            p.update(pen)
        p.update(pendict)
        if "pendown" in p:
            self._pendown = p["pendown"]
        if "pencolor" in p:
            self.pencolor(p["pencolor"])
        if "fillcolor" in p:
            self.fillcolor(p["fillcolor"])
        if "pensize" in p:
            self.pensize(p["pensize"])
        if "speed" in p:
            self.speed(p["speed"])
        if "shown" in p:
            self._shown = p["shown"]
            _emit("visible", self._id, self._shown)

    def _col(self, args):
        if len(args) == 1:
            return _color(args[0], _state.colormode)
        if len(args) == 3:
            return _color(tuple(args), _state.colormode)
        raise TurtleGraphicsError("bad color arguments: " + str(args))

    def pencolor(self, *args):
        if not args:
            return self._pencolor
        self._pencolor = self._col(args)
        _emit("pen", self._id, self._pencolor, self._fillcolor, self._pensize)

    def fillcolor(self, *args):
        if not args:
            return self._fillcolor
        self._fillcolor = self._col(args)
        _emit("pen", self._id, self._pencolor, self._fillcolor, self._pensize)

    def color(self, *args):
        if not args:
            return (self._pencolor, self._fillcolor)
        if len(args) == 2:
            self._pencolor = self._col((args[0],))
            self._fillcolor = self._col((args[1],))
        else:
            self._pencolor = self._fillcolor = self._col(args)
        _emit("pen", self._id, self._pencolor, self._fillcolor, self._pensize)

    def filling(self):
        return self._filling

    def begin_fill(self):
        if not self._filling:
            self._filling = True
            self._fillpath = [(self._position[0], self._position[1])]
            _emit("begin_fill", self._id)

    def end_fill(self):
        if self._filling:
            if len(self._fillpath) > 2:
                _emit("fill", self._id, self._fillpath, self._fillcolor)
            self._filling = False
            self._fillpath = None

    def dot(self, size=None, *color):
        if size is None:
            size = max(self._pensize + 4, 2 * self._pensize)
        c = self._col(color) if color else self._pencolor
        _emit("dot", self._id, self._position[0], self._position[1], size, c)

    def stamp(self):
        _emit("stamp", self._id, self._position[0], self._position[1], self.heading(), self._shape, self._pencolor, self._fillcolor)
        self._stamps.append(len(self._stamps) + 1)
        return len(self._stamps)

    def clearstamp(self, stampid):
        _emit("clearstamp", self._id, stampid)

    def clearstamps(self, n=None):
        _emit("clearstamps", self._id, n)

    def write(self, arg, move=False, align="left", font=("Arial", 8, "normal")):
        if align not in ("left", "center", "right"):
            raise TurtleGraphicsError("bad align argument " + str(align))
        _emit("write", self._id, self._position[0], self._position[1], str(arg), align, tuple(font), self._pencolor)

    def showturtle(self):
        self._shown = True
        _emit("visible", self._id, True)

    def hideturtle(self):
        self._shown = False
        _emit("visible", self._id, False)

    def isvisible(self):
        return self._shown

    def shape(self, name=None):
        if name is None:
            return self._shape
        if name not in _SHAPES and name not in _state_shapes:
            raise TurtleGraphicsError("There is no shape named " + name)
        self._shape = name
        _emit("shape", self._id, name)

    def shapesize(self, stretch_wid=None, stretch_len=None, outline=None):
        if stretch_wid is None and stretch_len is None and outline is None:
            return self._shapesize
        w = stretch_wid if stretch_wid is not None else self._shapesize[0]
        l = stretch_len if stretch_len is not None else (stretch_wid if stretch_wid is not None else self._shapesize[1])
        o = outline if outline is not None else self._shapesize[2]
        self._shapesize = (w, l, o)
        _emit("shapesize", self._id, w, l, o)

    turtlesize = shapesize
    pu = penup
    up = penup
    pd = pendown
    down = pendown
    width = pensize
    st = showturtle
    ht = hideturtle

    def resizemode(self, rmode=None):
        if rmode is None:
            return self._resizemode
        self._resizemode = rmode

    def shearfactor(self, shear=None):
        return 0.0

    def tilt(self, angle):
        self._tilt += angle

    def settiltangle(self, angle):
        self._tilt = angle

    def tiltangle(self, angle=None):
        return self._tilt

    def clear(self):
        _emit("clear", self._id)

    def reset(self):
        self._position = Vec2D(0.0, 0.0)
        self._orient = Vec2D(1.0, 0.0) if self._mode in ("standard", "world") else Vec2D(0.0, 1.0)
        self._pencolor = "black"
        self._fillcolor = "black"
        self._pensize = 1
        self._pendown = True
        self._shown = True
        self._speed = 3
        self._filling = False
        self._fillpath = None
        _emit("reset", self._id)

    def clone(self):
        c = Turtle(self._shape)
        c._position = self._position
        c._orient = self._orient
        c._pencolor = self._pencolor
        c._fillcolor = self._fillcolor
        c._pensize = self._pensize
        c._pendown = self._pendown
        c._speed = self._speed
        _emit("pen", c._id, c._pencolor, c._fillcolor, c._pensize)
        _emit("move", c._id, 0.0, 0.0, c._position[0], c._position[1], False, c._pencolor, c._pensize, 0)
        return c

    def undo(self):
        pass

    def setundobuffer(self, size):
        pass

    def undobufferentries(self):
        return 0

    def begin_poly(self):
        self._poly = [(self._position[0], self._position[1])]

    def end_poly(self):
        self._polyfinal = self._poly
        self._poly = None

    def get_poly(self):
        return tuple(getattr(self, "_polyfinal", ()))

    def getscreen(self):
        return Screen()

    def getturtle(self):
        return self

    getpen = getturtle

    def onclick(self, fun, btn=1, add=None):
        _state.click_handler = None if fun is None else (lambda x, y: fun(x, y))

    def onrelease(self, fun, btn=1, add=None):
        pass

    def ondrag(self, fun, btn=1, add=None):
        pass

    def tracer(self, n=None, delay=None):
        return Screen().tracer(n, delay)

    def delay(self, delay=None):
        return Screen().delay(delay)

    def screensize(self, *args):
        return Screen().screensize(*args)

    def __repr__(self):
        return "<turtle.Turtle object>"


_state_shapes = {}
RawTurtle = Turtle
Pen = Turtle
RawPen = Turtle


class Shape:
    def __init__(self, type_, data=None):
        self._type = type_
        self._data = data

    def addcomponent(self, poly, fill, outline=None):
        pass


class Screen:
    _instance = None

    def __new__(cls):
        if Screen._instance is None:
            Screen._instance = object.__new__(cls)
        return Screen._instance

    def bgcolor(self, *args):
        if not args:
            return _state.bg
        _state.bg = _color(args[0] if len(args) == 1 else tuple(args), _state.colormode)
        _emit("bgcolor", _state.bg)

    def bgpic(self, picname=None):
        _emit("bgpic", picname)

    def title(self, titlestring):
        _state.title = titlestring
        _emit("title", titlestring)

    def setup(self, width=0.5, height=0.75, startx=None, starty=None):
        if isinstance(width, float) and width <= 1:
            width = int(960 * width)
        if isinstance(height, float) and height <= 1:
            height = int(810 * height)
        _state.width = width
        _state.height = height
        _emit("setup", width, height)

    def screensize(self, canvwidth=None, canvheight=None, bg=None):
        if canvwidth is None:
            return (_state.width, _state.height)
        _emit("setup", canvwidth, canvheight)

    def window_width(self):
        return _state.width

    def window_height(self):
        return _state.height

    def tracer(self, n=None, delay=None):
        if n is None:
            return _state.tracing
        _state.tracing = n
        if delay is not None:
            _state.delay_ms = delay
        _emit("tracer", n, _state.delay_ms)

    def delay(self, delay=None):
        if delay is None:
            return _state.delay_ms
        _state.delay_ms = delay

    def update(self):
        _emit("update")

    def mode(self, mode=None):
        if mode is None:
            return "standard"
        _emit("mode", mode)

    def colormode(self, cmode=None):
        if cmode is None:
            return _state.colormode
        if cmode not in (1, 1.0, 255):
            raise TurtleGraphicsError("colormode must be 1.0 or 255")
        _state.colormode = int(cmode) if cmode == 255 else 1

    def register_shape(self, name, shape=None):
        _state_shapes[name] = shape

    addshape = register_shape

    def getshapes(self):
        return sorted(_SHAPES + list(_state_shapes))

    def turtles(self):
        return list(_state.turtles)

    def clearscreen(self):
        _emit("clearscreen")

    clear = clearscreen

    def resetscreen(self):
        for t in _state.turtles:
            t.reset()

    reset = resetscreen

    def listen(self, xdummy=None, ydummy=None):
        _state.listening = True

    def onkey(self, fun, key):
        if fun is None:
            _state.keyrelease_handlers.pop(key, None)
        else:
            _state.keyrelease_handlers[key] = fun

    onkeyrelease = onkey

    def onkeypress(self, fun, key=None):
        k = "" if key is None else key
        if fun is None:
            _state.key_handlers.pop(k, None)
        else:
            _state.key_handlers[k] = fun

    def onscreenclick(self, fun, btn=1, add=None):
        _state.click_handler = fun

    onclick = onscreenclick

    def ontimer(self, fun, t=0):
        _state.timers.append((t, fun))

    def textinput(self, title, prompt):
        return _host.ask("text", title, prompt)

    def numinput(self, title, prompt, default=None, minval=None, maxval=None):
        v = _host.ask("num", title, prompt)
        if v is None:
            return None
        try:
            v = float(v)
        except ValueError:
            return None
        if (minval is not None and v < minval) or (maxval is not None and v > maxval):
            return None
        return v

    def mainloop(self):
        """Wait for events (keys, clicks, timers) until the host ends the program."""
        _state.running = True
        timers = _state.timers
        _state.timers = []
        for t, fun in timers:
            _host.timer(t, fun)
        while True:
            ev = _host.next_event()
            if ev is None:
                break
            kind = ev[0]
            if kind == "key":
                f = _state.key_handlers.get(ev[1]) or _state.key_handlers.get("")
                if f is not None:
                    f()
            elif kind == "keyrelease":
                f = _state.keyrelease_handlers.get(ev[1])
                if f is not None:
                    f()
            elif kind == "click" and _state.exit_on_click:
                break
            elif kind == "click" and _state.click_handler is not None:
                _state.click_handler(ev[1], ev[2])
            elif kind == "timer":
                ev[1]()
                for t, fun in _state.timers:
                    _host.timer(t, fun)
                _state.timers = []
        _state.running = False

    done = mainloop

    def exitonclick(self):
        _state.click_handler = None
        _state.exit_on_click = True
        self.mainloop()

    def bye(self):
        _emit("bye")

    def setworldcoordinates(self, llx, lly, urx, ury):
        _emit("world", llx, lly, urx, ury)

    def cv(self):
        return None

    getcanvas = cv


_default_turtle = []


def _turtle():
    if not _default_turtle:
        _default_turtle.append(Turtle())
    return _default_turtle[0]


def getscreen():
    return Screen()


def getturtle():
    return _turtle()


getpen = getturtle


def reset():
    _turtle().reset()


def clear():
    _turtle().clear()


def tracer(n=None, delay=None):
    return Screen().tracer(n, delay)


def delay(d=None):
    return Screen().delay(d)


def screensize(*args):
    return Screen().screensize(*args)


def onclick(fun, btn=1, add=None):
    _turtle().onclick(fun, btn, add)


def turtles():
    return Screen().turtles()


def clearscreen():
    Screen().clearscreen()


def resetscreen():
    Screen().resetscreen()


${wrappers}

class ScrolledCanvas:
    pass
`;
