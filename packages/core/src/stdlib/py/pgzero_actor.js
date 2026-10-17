// pgzero_actor: Actor of Pygame Zero (pgzero/actor.py 1.2: anchors, positions, angle with the size pygame's rotate()
// gives, distance_to, angle_to; from the 1.3 development version: opacity, repr, rect(); and the popular extensions of
// pgzhelper: scale, flip_x, flip_y, images/next_image/animate, direction_to, move_towards, move_forward ...).
// The image size comes from the host (_pgz.resource); draw() records an 'actor' command.
export default String.raw`
import _pgz
from math import radians, sin, cos, atan2, degrees, sqrt, fmod
from pgzero_rect import ZRect, Rect, _rect4, _f32, _NO
from pgzero_screen import images, Surface
from pgzero_spellcheck import compare
import pgzero_clock

_cmd = _pgz.cmd

ANCHORS = {
    'x': {
        'left': 0.0,
        'center': 0.5,
        'middle': 0.5,
        'right': 1.0,
    },
    'y': {
        'top': 0.0,
        'center': 0.5,
        'middle': 0.5,
        'bottom': 1.0,
    }
}


def calculate_anchor(value, dim, total):
    if isinstance(value, str):
        try:
            return total * ANCHORS[dim][value]
        except KeyError:
            raise ValueError(
                '%r is not a valid %s-anchor name' % (value, dim)
            )
    return float(value)


SYMBOLIC_POSITIONS = set((
    "topleft", "bottomleft", "topright", "bottomright",
    "midtop", "midleft", "midbottom", "midright",
    "center",
))

POS_TOPLEFT = None
ANCHOR_CENTER = None
MAX_ALPHA = 255


def transform_anchor(ax, ay, w, h, angle):
    """Transform anchor based upon a rotation of a surface of size w x h."""
    theta = -radians(angle)

    sintheta = sin(theta)
    costheta = cos(theta)

    tw = abs(w * costheta) + abs(h * sintheta)
    th = abs(w * sintheta) + abs(h * costheta)

    cax = ax - w * 0.5
    cay = ay - h * 0.5

    rax = cax * costheta - cay * sintheta
    ray = cax * sintheta + cay * costheta

    return (
        tw * 0.5 + rax,
        th * 0.5 + ray
    )


def rotated_size(w, h, angle):
    """Size of the image that pygame.transform.rotate(surface, angle) makes from a w x h surface."""
    if w < 1 or h < 1:
        return w, h
    a = _f32(float(angle))
    if not fmod(a, 90.0):
        turns = int(a / 90) % 4 if int(a / 90) >= 0 else -((-int(a / 90)) % 4)
        if turns < 0:
            turns += 4
        return (w, h) if turns % 2 == 0 else (h, w)
    rad = a * .01745329251994329
    s = sin(rad)
    c = cos(rad)
    cx = c * w
    cy = c * h
    sx = s * w
    sy = s * h
    nx = int(max(abs(cx + sy), abs(cx - sy), abs(-cx + sy), abs(-cx - sy)))
    ny = int(max(abs(sx + cy), abs(sx - cy), abs(-sx + cy), abs(-sx - cy)))
    return nx, ny


def _direction_to(from_x, from_y, to_x, to_y):
    dx = to_x - from_x
    dy = from_y - to_y
    angle = degrees(atan2(dy, dx))
    if angle > 0:
        return angle
    return 360 + angle


def _move(x, y, direction, distance):
    angle = radians(direction)
    return (x + distance * cos(angle), y + -distance * sin(angle))


class Actor:
    """A sprite: an image with a position (Pygame Zero's Actor)."""

    EXPECTED_INIT_KWARGS = SYMBOLIC_POSITIONS

    _anchor = _anchor_value = (0, 0)
    _angle = 0.0
    _opacity = 1.0
    _scale = 1
    _flip_x = False
    _flip_y = False
    _images = None
    _image_idx = 0
    _animate_counter = 0
    fps = 5
    direction = 0

    def __init__(self, image, pos=POS_TOPLEFT, anchor=ANCHOR_CENTER, **kwargs):
        self._handle_unexpected_kwargs(kwargs)
        self._rect = ZRect((0, 0), (0, 0))
        self.image = image
        self._init_position(pos, anchor, **kwargs)

    def __iter__(self):
        return iter(self._rect)

    def __repr__(self):
        return '<{} {!r} pos={!r}>'.format(
            type(self).__name__,
            self._image_name,
            self.pos
        )

    def _handle_unexpected_kwargs(self, kwargs):
        unexpected_kwargs = set(kwargs.keys()) - self.EXPECTED_INIT_KWARGS
        if not unexpected_kwargs:
            return
        for found, suggested in compare(unexpected_kwargs, self.EXPECTED_INIT_KWARGS):
            raise TypeError(
                "Unexpected keyword argument '{}' (did you mean '{}'?)".format(
                    found, suggested))

    def _init_position(self, pos, anchor, **kwargs):
        if anchor is None:
            anchor = ("center", "center")
        self.anchor = anchor

        symbolic_pos_args = {
            k: kwargs[k] for k in kwargs if k in SYMBOLIC_POSITIONS}

        if not pos and not symbolic_pos_args:
            self.topleft = (0, 0)
        elif pos and symbolic_pos_args:
            raise TypeError("'pos' argument cannot be mixed with 'topleft', 'topright' etc. argument.")
        elif pos:
            self.pos = pos
        else:
            self._set_symbolic_pos(symbolic_pos_args)

    def _set_symbolic_pos(self, symbolic_pos_dict):
        if len(symbolic_pos_dict) == 0:
            raise TypeError("No position-setting keyword arguments ('topleft', 'topright' etc) found.")
        if len(symbolic_pos_dict) > 1:
            raise TypeError("Only one 'topleft', 'topright' etc. argument is allowed.")
        for setter_name in symbolic_pos_dict:
            setattr(self, setter_name, symbolic_pos_dict[setter_name])

    # ----- anchor, angle, image -----

    @property
    def anchor(self):
        return self._anchor_value

    @anchor.setter
    def anchor(self, val):
        self._anchor_value = val
        self._calc_anchor()

    def _calc_anchor(self):
        ax, ay = self._anchor_value
        ow, oh = self._orig_surf.get_size()
        ax = calculate_anchor(ax, 'x', ow)
        ay = calculate_anchor(ay, 'y', oh)
        self._untransformed_anchor = ax, ay
        if self._angle == 0.0 and self._scale == 1:
            self._anchor = self._untransformed_anchor
        else:
            self._anchor = self._transformed_anchor()

    def _transformed_anchor(self):
        ax, ay = self._untransformed_anchor
        w, h = self._orig_surf.get_size()
        anchor = transform_anchor(ax, ay, w, h, self._angle)
        if self._scale != 1:
            anchor = (anchor[0] * self._scale, anchor[1] * self._scale)
        return anchor

    def _surf_size(self):
        w, h = self._orig_surf.get_size()
        if self._scale != 1:
            w = int(w * self._scale)
            h = int(h * self._scale)
            if w < 0 or h < 0:
                raise ValueError("Cannot scale to negative size")
        return rotated_size(w, h, self._angle)

    def _transform(self):
        p = self.pos
        r = self._rect
        r.w, r.h = self._surf_size()
        self._anchor = self._transformed_anchor()
        self.pos = p

    @property
    def angle(self):
        return self._angle

    @angle.setter
    def angle(self, angle):
        self._angle = angle
        self._transform()

    @property
    def scale(self):
        return self._scale

    @scale.setter
    def scale(self, scale):
        self._scale = scale
        self._transform()

    @property
    def flip_x(self):
        return self._flip_x

    @flip_x.setter
    def flip_x(self, flip_x):
        self._flip_x = flip_x

    @property
    def flip_y(self):
        return self._flip_y

    @flip_y.setter
    def flip_y(self, flip_y):
        self._flip_y = flip_y

    @property
    def opacity(self):
        """Opacity between 0.0 (invisible) and 1.0 (opaque)."""
        return self._opacity

    @opacity.setter
    def opacity(self, opacity):
        self._opacity = min(1.0, max(0.0, opacity))

    @property
    def image(self):
        return self._image_name

    @image.setter
    def image(self, image):
        if isinstance(image, Surface):
            surf = image
            image = image.name
        else:
            surf = images.load(image)
        self._image_name = image
        self._orig_surf = surf
        self._update_pos()

    def _update_pos(self):
        p = self.pos
        r = self._rect
        if self._angle == 0.0 and self._scale == 1:
            r.w, r.h = self._orig_surf.get_size()
        else:
            r.w, r.h = self._surf_size()
        self._calc_anchor()
        self.pos = p

    # ----- positions -----

    @property
    def pos(self):
        r = self._rect
        ax, ay = self._anchor
        return r.x + ax, r.y + ay

    @pos.setter
    def pos(self, pos):
        px, py = pos
        ax, ay = self._anchor
        r = self._rect
        r.x, r.y = px - ax, py - ay

    @property
    def x(self):
        return self._rect.x + self._anchor[0]

    @x.setter
    def x(self, px):
        self._rect.x = px - self._anchor[0]

    @property
    def y(self):
        return self._rect.y + self._anchor[1]

    @y.setter
    def y(self, py):
        self._rect.y = py - self._anchor[1]

    def rect(self):
        """A copy of the actor's rectangle (so that Actors work where rects are expected)."""
        return self._rect.copy()

    # rectangle attributes, delegated to the ZRect
    @property
    def left(self):
        return self._rect.x

    @left.setter
    def left(self, v):
        self._rect.x = v

    @property
    def top(self):
        return self._rect.y

    @top.setter
    def top(self, v):
        self._rect.y = v

    @property
    def width(self):
        return self._rect.w

    @width.setter
    def width(self, v):
        self._rect.w = v

    @property
    def height(self):
        return self._rect.h

    @height.setter
    def height(self, v):
        self._rect.h = v

    @property
    def right(self):
        r = self._rect
        return r.x + r.w

    @right.setter
    def right(self, v):
        self._rect.right = v

    @property
    def bottom(self):
        r = self._rect
        return r.y + r.h

    @bottom.setter
    def bottom(self, v):
        self._rect.bottom = v

    @property
    def topleft(self):
        r = self._rect
        return r.x, r.y

    @topleft.setter
    def topleft(self, v):
        self._rect.topleft = v

    @property
    def center(self):
        return self._rect.center

    @center.setter
    def center(self, v):
        self._rect.center = v

    @property
    def centerx(self):
        return self._rect.centerx

    @centerx.setter
    def centerx(self, v):
        self._rect.centerx = v

    @property
    def centery(self):
        return self._rect.centery

    @centery.setter
    def centery(self, v):
        self._rect.centery = v

    @property
    def size(self):
        return self._rect.size

    @size.setter
    def size(self, v):
        self._rect.size = v

    def colliderect(self, a=_NO, b=_NO, c=_NO, d=_NO):
        r = self._rect
        if b is _NO and a is not _NO:
            o = a._rect if a.__class__ is Actor else a
            if o.__class__ is ZRect:
                return r.x < o.x + o.w and r.y < o.y + o.h and r.x + r.w > o.x and r.y + r.h > o.y
        return r.colliderect(*[v for v in (a, b, c, d) if v is not _NO])

    def collidepoint(self, a=_NO, b=_NO):
        r = self._rect
        if b is _NO:
            x, y = a
        else:
            x = a
            y = b
        return r.x <= x < r.x + r.w and r.y <= y < r.y + r.h

    def collidelist(self, others):
        for n, other in enumerate(others):
            if self.colliderect(other):
                return n
        return -1

    def collidelistall(self, others):
        return [n for n, other in enumerate(others) if self.colliderect(other)]

    def contains(self, *other):
        return self._rect.contains(*other)

    def draw(self):
        r = self._rect
        _cmd("actor", (self._orig_surf.name, int(r.x), int(r.y), int(r.w), int(r.h), self._angle, self._scale,
                       bool(self._flip_x), bool(self._flip_y), self._opacity))

    def angle_to(self, target):
        """Return the angle from this actors position to target, in degrees."""
        if isinstance(target, Actor):
            tx, ty = target.pos
        else:
            tx, ty = target
        myx, myy = self.pos
        dx = tx - myx
        dy = myy - ty
        return degrees(atan2(dy, dx))

    def distance_to(self, target):
        """Return the distance from this actor's pos to target, in pixels."""
        if isinstance(target, Actor):
            tx, ty = target.pos
        else:
            tx, ty = target
        myx, myy = self.pos
        dx = tx - myx
        dy = ty - myy
        return sqrt(dx * dx + dy * dy)

    # ----- pgzhelper extensions -----

    def direction_to(self, target):
        """Direction to target in degrees (0 = right, 90 = up), between 0 and 360."""
        if isinstance(target, Actor):
            x, y = target.pos
        else:
            x, y = target
        return _direction_to(self.x, self.y, x, y)

    def move_towards(self, target, dist, stop_on_target=True):
        """Move dist pixels towards target (an Actor, a position or a direction in degrees)."""
        if isinstance(target, (int, float)):
            direction = target
        else:
            direction = self.direction_to(target)
            if stop_on_target:
                target_distance = self.distance_to(target)
                if (target_distance < dist) and dist > 0:
                    dist = target_distance
        self.x, self.y = _move(self.x, self.y, direction, dist)

    def point_towards(self, target):
        """Turn the actor (angle) to point at target."""
        self.angle = self.direction_to(target)

    def move_in_direction(self, dist):
        self.x, self.y = _move(self.x, self.y, self.direction, dist)

    def move_forward(self, dist):
        self.x, self.y = _move(self.x, self.y, self.angle, dist)

    def move_back(self, dist):
        self.x, self.y = _move(self.x, self.y, self.angle, -dist)

    def move_left(self, dist):
        self.x, self.y = _move(self.x, self.y, self.angle + 90, dist)

    def move_right(self, dist):
        self.x, self.y = _move(self.x, self.y, self.angle - 90, dist)

    @property
    def images(self):
        return self._images

    @images.setter
    def images(self, images):
        self._images = images
        if len(self._images) != 0:
            self.image = self._images[0]

    def next_image(self):
        """Show the next image of images; returns its index."""
        if self._images is not None:
            if self.image in self._images:
                self._image_idx = (self._images.index(self.image) + 1) % len(self._images)
                self.image = self._images[self._image_idx]
            else:
                self._image_idx = 0
                self.image = self._images[0]
        else:
            self._image_idx = 0
        return self._image_idx

    def sel_image(self, newimage):
        """Show images[newimage] (an index) or the image of that name; False if that is not possible."""
        if isinstance(newimage, int):
            if self._images is None or not -len(self._images) <= newimage < len(self._images):
                return False
            self.image = self._images[newimage]
            self._image_idx = newimage
            return True
        if self._images is None or newimage not in self._images:
            return False
        self._image_idx = self._images.index(newimage)
        self.image = newimage
        return True

    def animate(self):
        """Switch to the next image fps times per second of game time; returns the index or -1."""
        now = int(pgzero_clock.clock.t * self.fps)
        if self._animate_counter == 0:
            self._animate_counter = now
        if now != self._animate_counter:
            self._animate_counter = now
            return self.next_image()
        return -1


def _delegate(name):
    return property(lambda self: getattr(self._rect, name), lambda self, v: setattr(self._rect, name, v))


def _delegate_method(name):
    def method(self, *args, **kwargs):
        return getattr(self._rect, name)(*args, **kwargs)
    return method


for _name in ("topright", "bottomleft", "bottomright", "midtop", "midleft", "midbottom", "midright"):
    setattr(Actor, _name, _delegate(_name))
for _name in ("clamp", "clamp_ip", "clip", "clip_ip", "collidedict", "collidedictall", "copy", "fit", "inflate",
              "inflate_ip", "move", "move_ip", "normalize", "union", "union_ip", "unionall", "unionall_ip"):
    setattr(Actor, _name, _delegate_method(_name))

DELEGATED_ATTRIBUTES = sorted(a for a in ("bottom", "bottomleft", "bottomright", "center", "centerx", "centery",
                                          "clamp", "clamp_ip", "clip", "clip_ip", "collidedict", "collidedictall",
                                          "collidelist", "collidelistall", "collidepoint", "colliderect", "contains",
                                          "copy", "fit", "height", "inflate", "inflate_ip", "left", "midbottom",
                                          "midleft", "midright", "midtop", "move", "move_ip", "normalize", "right",
                                          "size", "top", "topleft", "topright", "union", "union_ip", "unionall",
                                          "unionall_ip", "width"))
Actor.DELEGATED_ATTRIBUTES = DELEGATED_ATTRIBUTES
`;
