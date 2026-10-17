// Pack "guizero": forms.
import { PYMODULES, HOOKS } from '../../pymodules.js';
import { registerNatives } from '../../builtins.js';
import { FORMS_NATIVES, FORMS_NAMES, formsEvent, formsHeadless } from '../forms.js';
import guizero from '../py/guizero.js';

registerNatives({ natives: FORMS_NATIVES, modules: { _forms_host: FORMS_NAMES } });
HOOKS.formsEvent = formsEvent;
HOOKS.formsHeadless = formsHeadless;
Object.assign(PYMODULES, { guizero });
