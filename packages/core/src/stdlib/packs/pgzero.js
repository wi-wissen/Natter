// Pack "pgzero": the Pygame Zero engine.
import { PYMODULES } from '../../pymodules.js';
import { registerNatives } from '../../builtins.js';
import { PGZ_NATIVES, PGZ_NAMES } from '../pgzero.js';
import pgzero_rect from '../py/pgzero_rect.js';
import pgzero_color from '../py/pgzero_color.js';
import pgzero_clock from '../py/pgzero_clock.js';
import pgzero_animation from '../py/pgzero_animation.js';
import pgzero_keys from '../py/pgzero_keys.js';
import pgzero_screen from '../py/pgzero_screen.js';
import pgzero_audio from '../py/pgzero_audio.js';
import pgzero_spellcheck from '../py/pgzero_spellcheck.js';
import pgzero_actor from '../py/pgzero_actor.js';
import pgzero_builtins from '../py/pgzero_builtins.js';
import pgzero_main from '../py/pgzero_main.js';
import pgzrun from '../py/pgzrun.js';

registerNatives({ natives: PGZ_NATIVES, modules: { _pgz: PGZ_NAMES } });
Object.assign(PYMODULES, { pgzero_rect, pgzero_color, pgzero_clock, pgzero_animation, pgzero_keys, pgzero_screen, pgzero_audio, pgzero_spellcheck, pgzero_actor, pgzero_builtins, pgzero_main, pgzrun });
