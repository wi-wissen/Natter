// pgzero_spellcheck: friendly checks of Pygame Zero (pgzero/spellcheck.py): misspelt hooks such as on_mouse_dwon,
// constants such as WIDHT, unknown hook parameters and unknown Actor keyword arguments.
export default String.raw`
import _pgz


def distance(a, b):
    """Damerau-Levenshtein distance with cheaper edits for '_' and case."""
    d = {}
    la = len(a)
    lb = len(b)
    for i in range(la + 1):
        d[i, 0] = i
    for j in range(1, lb + 1):
        d[0, j] = j
    for i, ca in enumerate(a, start=1):
        for j, cb in enumerate(b, start=1):
            cost = int(ca != cb)
            if ca.lower() == cb.lower():
                subst_cost = 0
            else:
                subst_cost = 1.25 * cost
            insertion_cost = 0.7 if cb == '_' else 1.0
            deletion_cost = 0.7 if ca == '_' else 1.0
            d[i, j] = min(
                d[i - 1, j] + deletion_cost,
                d[i, j - 1] + insertion_cost,
                d[i - 1, j - 1] + subst_cost,
            )
            if i > 1 and j > 1 and ca == b[j - 2] and a[i - 2] == cb:
                d[i, j] = min(d[i, j], d[i - 2, j - 2] + cost)
    return d[la, lb]


def suggest(word, candidates):
    """Good candidates as corrections for word, best first."""
    candidates_with_score = [(c, distance(word, c)) for c in candidates]
    good_candidates = [(c, d) for c, d in candidates_with_score if d < 2.6]
    good_candidates.sort(key=lambda cd: cd[1])
    return [c for c, d in good_candidates]


def compare(have, want):
    """Pairs (name we have, suggested name we want) for names that look misspelt."""
    want = set(want)
    have = set(have)
    matched = want & have
    want -= matched
    have -= matched
    out = []
    for w in sorted(have):
        suggestions = suggest(w, sorted(want))
        if suggestions:
            s = suggestions[0]
            out.append((w, s))
            want.discard(s)
    return out


HOOKS = ['draw', 'update', 'on_mouse_down', 'on_mouse_up', 'on_mouse_move', 'on_key_down', 'on_key_up', 'on_music_end']
CONSTS = ['TITLE', 'WIDTH', 'HEIGHT', 'ICON']
VALID_PARAMS = {
    'on_mouse_down': ['pos', 'button'],
    'on_mouse_up': ['pos', 'button'],
    'on_mouse_move': ['pos', 'buttons', 'rel'],
    'on_key_up': ['key', 'mod'],
    'on_key_down': ['unicode', 'key', 'mod'],
    'draw': [],
    'on_music_end': [],
}


class InvalidParameter(Exception):
    """A parameter to a hook was invalid."""


def spellcheck(namespace):
    """Warn about misspelt hooks and constants, raise InvalidParameter for wrong hook parameters."""
    funcs = {}
    consts = []
    for name, val in namespace.items():
        if callable(val) and _pgz.argnames(val) is not None:
            funcs[name] = val
        elif isinstance(val, (str, int)):
            consts.append(name)
    for found, suggestion in compare(funcs, HOOKS):
        print("Warning: found function named {found}: did you mean {suggestion}?".format(found=found, suggestion=suggestion))
    for found, suggestion in compare(consts, CONSTS):
        print("Warning: found constant named {found}: did you mean {suggestion}?".format(found=found, suggestion=suggestion))
    for name, handler in funcs.items():
        if name not in VALID_PARAMS:
            continue
        valid = VALID_PARAMS[name]
        for param in _pgz.argnames(handler):
            if param in valid:
                continue
            suggestions = suggest(param, valid)
            if suggestions:
                raise InvalidParameter("%s() hook accepts no parameter %s; did you mean %s?" % (name, param, suggestions[0]))
            raise InvalidParameter("%s() hook accepts no parameter %s" % (name, param))
`;
