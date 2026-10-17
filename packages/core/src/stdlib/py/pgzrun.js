// pgzrun: `import pgzrun` puts the Pygame Zero names into the program (like pgzero's prepare_mod); go() hands over to
// the host, which then runs the game frame by frame (the program waits in go() until the game ends).
export default String.raw`
import _pgz
import pgzero_builtins

_pgz.install(pgzero_builtins._names())


def go():
    """Run the program as a Pygame Zero game."""
    _pgz.go()
`;
