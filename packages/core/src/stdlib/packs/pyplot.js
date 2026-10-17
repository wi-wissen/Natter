// Pack "pyplot": matplotlib.pyplot (needs the numpy pack).
import { PYMODULES, HOOKS } from '../../pymodules.js';
import { registerNatives } from '../../builtins.js';
import { PLOT_NATIVES, PLOT_NAMES, PLOT_CONSTS, renderOpenFigures } from '../plot.js';
import { matplotlib, pyplot } from '../py/pyplot.js';

registerNatives({ natives: PLOT_NATIVES, modules: { _plot: PLOT_NAMES }, consts: { _plot: PLOT_CONSTS } });
HOOKS.renderOpenFigures = renderOpenFigures;
Object.assign(PYMODULES, { matplotlib, 'matplotlib.pyplot': pyplot });
