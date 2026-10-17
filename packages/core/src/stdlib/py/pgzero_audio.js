// pgzero_audio: sounds, music and tone of Pygame Zero (pgzero/loaders.py, music.py, tone.py). The game logic keeps
// the state it can know (volume, playing, paused); playing is done by the host through _pgz.cmd.
export default String.raw`
import _pgz
from math import pow
from pgzero_screen import ResourceLoader
from pgzero_rect import _f32

_cmd = _pgz.cmd


def _volume(v):
    # SDL_mixer volume: 0..128 steps, negative values are ignored
    if not isinstance(v, (int, float)):
        raise TypeError("must be real number, not " + type(v).__name__)
    return int(v * 128)


class Sound:
    """A sound from sounds/ (pygame.mixer.Sound)."""

    def __init__(self, name, length):
        self.name = name
        self._length = length
        self._volume = 128

    def play(self, loops=0, maxtime=0, fade_ms=0):
        _cmd("sound_play", (self.name, loops, maxtime, fade_ms, self._volume / 128.0))

    def stop(self):
        _cmd("sound_stop", (self.name,))

    def fadeout(self, time):
        _cmd("sound_fadeout", (self.name, int(time)))

    def set_volume(self, value):
        v = _volume(value)
        if v >= 0:
            self._volume = min(v, 128)
            _cmd("sound_volume", (self.name, self._volume / 128.0))

    def get_volume(self):
        return self._volume / 128.0

    def get_length(self):
        return _f32(self._length)

    def get_num_channels(self):
        return 0

    def __repr__(self):
        return "<Sound '" + self.name + "'>"


class SoundLoader(ResourceLoader):
    KIND = "sounds"
    TYPE = "sound"

    def _make(self, name, info):
        return Sound(name, info)


sounds = SoundLoader()


class _MusicLoader(ResourceLoader):
    KIND = "music"
    TYPE = "music"

    def _make(self, name, info):
        return name


class _Music:
    """music: one streamed track at a time from music/ (pgzero.music)."""

    def __init__(self):
        self._loader = _MusicLoader()
        self._playing = False
        self._paused = False
        self._queued = None
        self._volume = 128

    def _play(self, name, loop):
        path = self._loader.load(name)
        _cmd("music_play", (path, loop))
        self._playing = True
        self._paused = False
        self._queued = None

    def play(self, name):
        """Play a music track from music/ in a loop."""
        self._play(name, -1)

    def play_once(self, name):
        """Play a music track from music/ once."""
        self._play(name, 0)

    def queue(self, name):
        """Play this track when the current one ends."""
        path = self._loader.load(name)
        _cmd("music_queue", (path,))
        self._queued = path

    def is_playing(self, name=None):
        """True if music is playing and not paused."""
        return self._playing and not self._paused

    def pause(self):
        _cmd("music_pause", ())
        self._paused = True

    def unpause(self):
        _cmd("music_unpause", ())
        self._paused = False

    def fadeout(self, seconds):
        """Fade out over the given number of seconds, then stop."""
        _cmd("music_fadeout", (int(seconds * 1000),))

    def stop(self):
        _cmd("music_stop", ())
        self._playing = False
        self._queued = None

    def rewind(self):
        _cmd("music_rewind", ())

    def set_pos(self, pos):
        _cmd("music_set_pos", (pos,))

    def set_volume(self, value):
        v = _volume(value)
        if v >= 0:
            self._volume = min(v, 128)
            _cmd("music_volume", (self._volume / 128.0,))

    def get_volume(self):
        return self._volume / 128.0

    def _ended(self):
        # the host reported the end of a track (event 'music_end')
        if self._queued is not None:
            self._queued = None
        else:
            self._playing = False

    def __repr__(self):
        return "<module 'pgzero.music'>"


music = _Music()


# ----- tone -----

SAMPLE_RATE = 22050
NOTE_VALUE = dict(C=-9, D=-7, E=-5, F=-4, G=-2, A=0, B=2)
A4 = 440.0
TWELTH_ROOT = pow(2, (1 / 12))
DECAY = 2000
MAX_DURATION = 4


class InvalidNote(Exception):
    """The parameters passed were invalid."""


def validate_note(note):
    if len(note) == 3 and note[1] in "b#":
        name, accidental, octave = note[0], note[1], note[2]
    elif len(note) == 2:
        name, accidental, octave = note[0], "", note[1]
    else:
        name = None
    if name is None or name not in "ABCDEFG" or octave not in "012345678":
        raise InvalidNote(
            '%s is not a valid note. '
            'notes are A-F, are either normal, flat (b) or sharp (#) '
            'and of octave 0-8' % note
        )
    return name, accidental, int(octave)


def note_value(note, accidental, octave):
    value = NOTE_VALUE[note]
    if accidental:
        value += 1 if accidental == '#' else -1
    return (4 - octave) * -12 + value


def note_to_hertz(note):
    note, accidental, octave = validate_note(note)
    value = note_value(note, accidental, octave)
    return A4 * pow(TWELTH_ROOT, value)


def _convert_args(hz, duration):
    if isinstance(hz, str):
        hz = note_to_hertz(hz)
    samples = int(duration * SAMPLE_RATE)
    if not samples:
        raise InvalidNote("Note has zero duration")
    return hz, samples


class _ToneSound(Sound):
    def __init__(self, hz, samples):
        Sound.__init__(self, "", (samples + DECAY) / SAMPLE_RATE)
        self.hz = hz
        self.samples = samples

    def play(self, loops=0, maxtime=0, fade_ms=0):
        _cmd("tone", (self.hz, self.samples, self._volume / 128.0))

    def stop(self):
        pass

    def __repr__(self):
        return "<Sound tone %r Hz>" % (self.hz,)


class _Tone:
    """tone.play(pitch, duration): a note such as 'A4', 'C#5', 'Eb3' or a frequency in Hz."""

    InvalidNote = InvalidNote

    def create(self, pitch, duration):
        """A sound of the given pitch and duration, to play later."""
        return _ToneSound(*_convert_args(pitch, duration))

    def play(self, pitch, duration):
        """Play a tone of a certain length from a note or frequency in hertz (at most 4 seconds)."""
        if duration > MAX_DURATION:
            raise InvalidNote(
                'Note duration %ss is too long: notes may be at most %ss long' %
                (duration, MAX_DURATION)
            )
        hz, samples = _convert_args(pitch, duration)
        _cmd("tone", (hz, samples, 1.0))

    def note_to_hertz(self, note):
        return note_to_hertz(note)

    def __repr__(self):
        return "<module 'pgzero.tone'>"


tone = _Tone()
`;
