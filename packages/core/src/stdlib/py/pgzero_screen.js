// pgzero_screen: screen, images and the draw functions of Pygame Zero (pgzero/screen.py, loaders.py, ptext.py).
// Nothing is drawn here: every call checks and converts its arguments like pygame would and becomes one command
// _pgz.cmd(name, args) that the host executes on its canvas (see docs/PGZERO-BRIDGE.md).
export default String.raw`
import _pgz
from pgzero_rect import Rect, ZRect, RECT_CLASSES, _rect4, _two_ints
from pgzero_color import rgba, make_color, Color

_cmd = _pgz.cmd


def round_pos(pos):
    """Round a tuple position so it can be used for drawing."""
    try:
        x, y = pos
    except TypeError:
        raise TypeError("Coordinate must be a tuple (not {!r})".format(pos)) from None
    try:
        return round(x), round(y)
    except TypeError:
        raise TypeError("Coordinate values must be numbers (not {!r})".format(pos)) from None


def _color(c):
    return rgba(make_color(c))


def _radius(r):
    if isinstance(r, (int, float)):
        return int(r)
    raise TypeError("radius argument must be a number")


def _width(w):
    if isinstance(w, int):
        return int(w)
    raise TypeError("'" + type(w).__name__ + "' object cannot be interpreted as an integer")


class _Missing(KeyError):
    pass


class Surface:
    """An image as the game logic sees it: a name and a size (pygame's Surface without pixels)."""

    def __init__(self, name, size):
        self.name = name
        self._w, self._h = size

    def get_width(self):
        return self._w

    def get_height(self):
        return self._h

    def get_size(self):
        return (self._w, self._h)

    def get_rect(self, **kwargs):
        r = Rect(0, 0, self._w, self._h)
        for k, v in kwargs.items():
            setattr(r, k, v)
        return r

    def __repr__(self):
        return "<Surface(%dx%dx32 SW)>" % (self._w, self._h)


class ResourceLoader:
    """images.alien, sounds.eep: resources by attribute, loaded once (pgzero.loaders)."""

    KIND = "images"
    TYPE = "image"

    def __init__(self, subpath=""):
        self._subpath = subpath
        self._cache = {}

    def _make(self, name, info):
        return info

    def load(self, name):
        """The resource called name (KeyError if it does not exist)."""
        r = self._cache.get(name)
        if r is not None:
            return r
        if not isinstance(name, str):
            raise TypeError("expected str, bytes or os.PathLike object, not " + type(name).__name__)
        full = self._subpath + name
        info = _pgz.resource(self.KIND, full)
        if info is None:
            raise KeyError("No {type} found like '{name}'. Are you sure the {type} exists?".format(type=self.TYPE, name=name))
        r = self._cache[name] = self._make(full, info)
        return r

    def __getattr__(self, name):
        if name[:1] == "_":
            raise AttributeError("'" + type(self).__name__ + "' object has no attribute '" + name + "'")
        try:
            resource = self.load(name)
        except KeyError as e:
            raise AttributeError(*e.args) from None
        setattr(self, name, resource)
        return resource


class ImageLoader(ResourceLoader):
    KIND = "images"
    TYPE = "image"

    def _make(self, name, info):
        return Surface(name, (int(info[0]), int(info[1])))


images = ImageLoader()


def _image(image):
    if isinstance(image, str):
        return images.load(image)
    if isinstance(image, Surface):
        return image
    raise TypeError("argument 1 must be pygame.surface.Surface, not " + type(image).__name__)


def _blit_pos(pos):
    r = _rect4(pos)
    if r is not None:
        return r[0], r[1]
    p = _two_ints(pos)
    if p is None:
        raise TypeError("invalid destination position for blit")
    return p


# ----- text (ptext.draw / ptext.drawbox; the host measures and renders the text) -----

DEFAULT_FONT_SIZE = 24
DEFAULT_LINE_HEIGHT = 1.0
DEFAULT_COLOR = "white"
DEFAULT_OUTLINE_COLOR = "black"
DEFAULT_SHADOW_COLOR = "black"
ALPHA_RESOLUTION = 16
ANGLE_RESOLUTION_DEGREES = 3


def _resolvecolor(color, default):
    if color is None:
        color = default
    if color is None:
        return None
    try:
        return rgba(Color(color) if not isinstance(color, tuple) else color)
    except ValueError:
        return rgba(tuple(color))


def _resolvealpha(alpha):
    if alpha >= 1:
        return 1
    return max(int(round(alpha * ALPHA_RESOLUTION)) / ALPHA_RESOLUTION, 0)


def _resolveangle(angle):
    if not angle:
        return 0
    angle %= 360
    return int(round(angle / ANGLE_RESOLUTION_DEGREES)) * ANGLE_RESOLUTION_DEGREES


def _text_opts(fontname, fontsize, sysfontname, antialias, bold, italic, underline, color, background, width, widthem,
               lineheight, strip, align, owidth, ocolor, shadow, scolor, gcolor, alpha, angle):
    return {
        "fontname": fontname, "fontsize": fontsize or DEFAULT_FONT_SIZE, "sysfontname": sysfontname,
        "antialias": bool(antialias), "bold": bold, "italic": italic, "underline": underline,
        "color": _resolvecolor(color, DEFAULT_COLOR), "background": _resolvecolor(background, None),
        "width": width, "widthem": widthem, "lineheight": DEFAULT_LINE_HEIGHT if lineheight is None else lineheight,
        "strip": True if strip is None else strip, "align": align,
        "owidth": owidth, "ocolor": _resolvecolor(ocolor, DEFAULT_OUTLINE_COLOR) if owidth else None,
        "shadow": tuple(shadow) if shadow else None, "scolor": _resolvecolor(scolor, DEFAULT_SHADOW_COLOR) if shadow else None,
        "gcolor": _resolvecolor(gcolor, None), "alpha": _resolvealpha(alpha), "angle": _resolveangle(angle),
    }


def _ptext_draw(text, pos=None, fontname=None, fontsize=None, sysfontname=None, antialias=True, bold=None, italic=None,
                underline=None, color=None, background=None, top=None, left=None, bottom=None, right=None, topleft=None,
                bottomleft=None, topright=None, bottomright=None, midtop=None, midleft=None, midbottom=None,
                midright=None, center=None, centerx=None, centery=None, width=None, widthem=None, lineheight=None,
                strip=None, align=None, owidth=None, ocolor=None, shadow=None, scolor=None, gcolor=None, alpha=1.0,
                anchor=None, angle=0, surf=None, cache=True):
    if topleft:
        left, top = topleft
    if bottomleft:
        left, bottom = bottomleft
    if topright:
        right, top = topright
    if bottomright:
        right, bottom = bottomright
    if midtop:
        centerx, top = midtop
    if midleft:
        left, centery = midleft
    if midbottom:
        centerx, bottom = midbottom
    if midright:
        right, centery = midright
    if center:
        centerx, centery = center
    x, y = pos or (None, None)
    hanchor, vanchor = anchor or (None, None)
    if left is not None:
        x, hanchor = left, 0
    if centerx is not None:
        x, hanchor = centerx, 0.5
    if right is not None:
        x, hanchor = right, 1
    if top is not None:
        y, vanchor = top, 0
    if centery is not None:
        y, vanchor = centery, 0.5
    if bottom is not None:
        y, vanchor = bottom, 1
    if x is None:
        raise ValueError("Unable to determine horizontal position")
    if y is None:
        raise ValueError("Unable to determine vertical position")
    if align is None:
        align = hanchor
    if hanchor is None:
        hanchor = 0
    if vanchor is None:
        vanchor = 0
    if align in ("left", "center", "right"):
        align = {"left": 0, "center": 0.5, "right": 1}[align]
    opts = _text_opts(fontname, fontsize, sysfontname, antialias, bold, italic, underline, color, background, width,
                      widthem, lineheight, strip, align, owidth, ocolor, shadow, scolor, gcolor, alpha, angle)
    _cmd("text", (str(text), x, y, hanchor, vanchor, opts))


def _ptext_drawbox(text, rect, fontname=None, sysfontname=None, lineheight=None, anchor=None, bold=None, italic=None,
                   underline=None, strip=None, color=None, background=None, antialias=True, align=None, owidth=None,
                   ocolor=None, shadow=None, scolor=None, gcolor=None, alpha=1.0, angle=0, surf=None, cache=True):
    if lineheight is None:
        lineheight = DEFAULT_LINE_HEIGHT
    hanchor, vanchor = anchor = anchor or (0.5, 0.5)
    r = _rect4(rect)
    if r is None:
        raise TypeError("Argument must be rect style object")
    if align is None:
        align = hanchor
    if align in ("left", "center", "right"):
        align = {"left": 0, "center": 0.5, "right": 1}[align]
    opts = _text_opts(fontname, None, sysfontname, antialias, bold, italic, underline, color, background, r[2], None,
                      lineheight, strip, align, owidth, ocolor, shadow, scolor, gcolor, alpha, angle)
    opts["fontsize"] = None
    _cmd("textbox", (str(text), r[0], r[1], r[2], r[3], hanchor, vanchor, opts))


class SurfacePainter:
    """screen.draw: lines, circles, rectangles, polygons and text."""

    def __init__(self, screen):
        self._screen = screen

    def line(self, start, end, color, width=1):
        """Draw a line from start to end."""
        start = round_pos(start)
        end = round_pos(end)
        _cmd("line", (start[0], start[1], end[0], end[1], _color(color), _width(width)))

    def circle(self, pos, radius, color, width=1):
        """Draw a circle."""
        pos = round_pos(pos)
        _cmd("circle", (pos[0], pos[1], _radius(radius), _color(color), _width(width)))

    def filled_circle(self, pos, radius, color):
        """Draw a filled circle."""
        pos = round_pos(pos)
        _cmd("filled_circle", (pos[0], pos[1], _radius(radius), _color(color)))

    def polygon(self, points, color):
        """Draw a polygon."""
        try:
            iter(points)
        except TypeError:
            raise TypeError("screen.draw.filled_polygon() requires an iterable of points to draw") from None
        points = tuple(round_pos(point) for point in points)
        _cmd("polygon", (points, _color(color)))

    def filled_polygon(self, points, color):
        """Draw a filled polygon."""
        try:
            iter(points)
        except TypeError:
            raise TypeError("screen.draw.filled_polygon() requires an iterable of points to draw") from None
        points = tuple(round_pos(point) for point in points)
        _cmd("filled_polygon", (points, _color(color)))

    def rect(self, rect, color, width=1):
        """Draw a rectangle."""
        if not isinstance(rect, RECT_CLASSES):
            raise TypeError("screen.draw.rect() requires a rect to draw")
        c = _color(color)
        if width <= 1:
            r = _rect4(rect)
            _cmd("rect", (r[0], r[1], r[2], r[3], c, _width(width)))
            return
        hw = width / 2
        l, t, w, h = rect
        l1, l2 = round(l - hw), round(l + hw)
        r1, r2 = round(l + w - hw), round(l + w + hw)
        t1, t2 = round(t - hw), round(t + hw)
        b1, b2 = round(t + h - hw), round(t + h + hw)
        for x1, y1, x2, y2 in ((l1, t1, r2, t2), (l1, t2, l2, b1), (r1, t2, r2, b1), (l1, b1, r2, b2)):
            _cmd("filled_rect", (x1, y1, x2 - x1, y2 - y1, c))

    def filled_rect(self, rect, color):
        """Draw a filled rectangle."""
        if not isinstance(rect, RECT_CLASSES):
            raise TypeError("screen.draw.filled_rect() requires a rect to draw")
        r = _rect4(rect)
        _cmd("filled_rect", (r[0], r[1], r[2], r[3], _color(color)))

    def text(self, *args, **kwargs):
        """Draw text: screen.draw.text("Hi", (10, 10), color="orange", fontsize=40)."""
        _ptext_draw(*args, **kwargs)

    def textbox(self, *args, **kwargs):
        """Draw text, as large as fits into a rectangle."""
        _ptext_drawbox(*args, **kwargs)


class Screen:
    """The game window (pgzero.screen.Screen)."""

    def __init__(self, width=800, height=600):
        self.surface = None
        self.width = width
        self.height = height
        self._painter = SurfacePainter(self)

    def bounds(self):
        """Return a Rect representing the bounds of the screen."""
        return ZRect((0, 0), (self.width, self.height))

    def clear(self):
        """Clear the screen to black."""
        self.fill((0, 0, 0))

    def fill(self, color, gcolor=None):
        """Fill the screen with a colour (and a vertical gradient to gcolor)."""
        if gcolor:
            _cmd("fill", (_color(color), _color(gcolor)))
        else:
            _cmd("fill", (_color(color), None))

    def blit(self, image, pos):
        """Draw an image (a name from images/ or images.name) with its top left corner at pos."""
        img = _image(image)
        x, y = _blit_pos(pos)
        _cmd("blit", (img.name, x, y))

    @property
    def draw(self):
        return self._painter

    def __repr__(self):
        return "<Screen width={} height={}>".format(self.width, self.height)


screen = Screen()
`;
