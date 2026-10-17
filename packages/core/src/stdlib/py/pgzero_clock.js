// pgzero_clock: the clock of Pygame Zero (pgzero/clock.py), available to programs as `clock`. Events wait in a binary
// heap like heapq does, so callbacks due at the same time fire in the same order as in pgzero.
// Differences: callbacks are kept alive (pgzero only holds weak references, so a lambda never fires there), and an
// exception in a callback stops the program instead of being printed and swallowed.
export default String.raw`
__all__ = ["Clock", "schedule", "schedule_interval", "unschedule"]


def _siftdown(heap, startpos, pos):
    newitem = heap[pos]
    while pos > startpos:
        parentpos = (pos - 1) >> 1
        parent = heap[parentpos]
        if newitem.time < parent.time:
            heap[pos] = parent
            pos = parentpos
            continue
        break
    heap[pos] = newitem


def _siftup(heap, pos):
    endpos = len(heap)
    startpos = pos
    newitem = heap[pos]
    childpos = 2 * pos + 1
    while childpos < endpos:
        rightpos = childpos + 1
        if rightpos < endpos and not heap[childpos].time < heap[rightpos].time:
            childpos = rightpos
        heap[pos] = heap[childpos]
        pos = childpos
        childpos = 2 * pos + 1
    heap[pos] = newitem
    _siftdown(heap, startpos, pos)


def _heappush(heap, item):
    heap.append(item)
    _siftdown(heap, 0, len(heap) - 1)


def _heappop(heap):
    lastelt = heap.pop()
    if heap:
        returnitem = heap[0]
        heap[0] = lastelt
        _siftup(heap, 0)
        return returnitem
    return lastelt


def _heapify(x):
    n = len(x)
    for i in reversed(range(n // 2)):
        _siftup(x, i)


def _same(a, b):
    # a == b for callbacks; bound methods are equal when they bind the same function to the same object
    if a is b:
        return True
    if hasattr(a, "__self__") and hasattr(a, "__func__") and hasattr(b, "__self__") and hasattr(b, "__func__"):
        return a.__self__ is b.__self__ and a.__func__ is b.__func__
    return a == b


class Event:
    """An event scheduled for a future time."""

    def __init__(self, time, cb, repeat=None):
        self.time = time
        self.repeat = repeat
        self.cb = cb

    def __lt__(self, ano):
        return self.time < ano.time

    def __eq__(self, ano):
        return self.time == ano.time

    @property
    def callback(self):
        return self.cb


class Clock:
    """A clock used for event scheduling: tick(dt) calls everything that is due."""

    def __init__(self):
        self.t = 0
        self.fired = False
        self.events = []
        self._each_tick = []

    def clear(self):
        """Remove all handlers from this clock."""
        self.events.clear()
        self._each_tick.clear()

    def schedule(self, callback, delay):
        """Schedule callback to be called once, at delay seconds from now."""
        _heappush(self.events, Event(self.t + delay, callback, None))

    def schedule_unique(self, callback, delay):
        """Schedule callback to be called once, at delay seconds from now; postpone it if it was already scheduled."""
        self.unschedule(callback)
        self.schedule(callback, delay)

    def schedule_interval(self, callback, delay):
        """Schedule callback to be called every delay seconds, the first time after delay seconds."""
        _heappush(self.events, Event(self.t + delay, callback, delay))

    def unschedule(self, callback):
        """Unschedule the given callback (all its scheduled calls)."""
        self.events = [e for e in self.events if not _same(e.callback, callback) and e.callback is not None]
        _heapify(self.events)
        self._each_tick = [e for e in self._each_tick if not _same(e, callback)]

    def each_tick(self, callback):
        """Schedule callback to be called every tick with the elapsed time."""
        self._each_tick.append(callback)

    def _fire_each_tick(self, dt):
        for cb in self._each_tick:
            self.fired = True
            cb(dt)

    def tick(self, dt):
        """Update the clock time and fire all scheduled events."""
        self.fired = False
        self.t += float(dt)
        self._fire_each_tick(dt)
        while self.events and self.events[0].time <= self.t:
            ev = _heappop(self.events)
            cb = ev.callback
            if not cb:
                continue
            if ev.repeat is not None:
                self.schedule_interval(cb, ev.repeat)
            self.fired = True
            cb()


clock = Clock()
tick = clock.tick
schedule = clock.schedule
schedule_interval = clock.schedule_interval
schedule_unique = clock.schedule_unique
unschedule = clock.unschedule
each_tick = clock.each_tick
`;
