// pgzrun: `import pgzrun` puts the Pygame Zero names into the program (like pgzero's prepare_mod); go() runs the game
// loop (pgzero_main.go) in the main program until the window closes.
export default String.raw`
import _pgz
import pgzero_builtins
import pgzero_main

_pgz.install(pgzero_builtins._names())


def go():
    """Run the program as a Pygame Zero game."""
    pgzero_main.go()
`;
