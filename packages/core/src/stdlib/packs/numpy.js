// Pack "numpy": the numpy subset (natives _np and the Python layers).
import { PYMODULES } from '../../pymodules.js';
import { registerNatives } from '../../builtins.js';
import { NP_NATIVES, NP_NAMES, NP_CONSTS } from '../numpy.js';
import { NPRANDOM_NATIVES, NPRANDOM_NAMES, NPRANDOM_CONSTS } from '../nprandom.js';
import { numpy, numpy_random, numpy_linalg } from '../py/numpy.js';

registerNatives({
  natives: { ...NP_NATIVES, ...NPRANDOM_NATIVES },
  modules: { _np: [...NP_NAMES, ...NPRANDOM_NAMES, ...Object.keys(NPRANDOM_CONSTS)] },
  consts: { _np: { ...NP_CONSTS, ...NPRANDOM_CONSTS } },
});
Object.assign(PYMODULES, { numpy, 'numpy.random': numpy_random, 'numpy.linalg': numpy_linalg });
