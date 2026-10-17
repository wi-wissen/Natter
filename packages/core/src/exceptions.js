// The built-in exception classes. They are real classes (see values.js), so `except ValueError`, `isinstance(e, Exception)`,
// `class MyError(Exception)` and `raise` work like in Python. Errors raised by the interpreter itself (ScriptError) are turned
// into instances of these classes when a program catches them (vm.js, toPyException).

import { PyClass, PyBuiltin, OBJECT } from './values.js';

const native = (name) => new PyBuiltin(name);

export const BASE_EXCEPTION = new PyClass('BaseException', [OBJECT], new Map([
  ['__init__', native('BaseException.__init__')],
  ['__str__', native('BaseException.__str__')],
  ['__repr__', native('BaseException.__repr__')],
]), 'exception');

/** Name → class for all built-in exceptions. */
export const EXCEPTION_CLASSES = { BaseException: BASE_EXCEPTION };

// [name, base]: the same hierarchy as in Python (the part that appears in school)
const TREE = [
  ['SystemExit', 'BaseException'], ['KeyboardInterrupt', 'BaseException'], ['GeneratorExit', 'BaseException'],
  ['Exception', 'BaseException'],
  ['ArithmeticError', 'Exception'], ['FloatingPointError', 'ArithmeticError'], ['OverflowError', 'ArithmeticError'], ['ZeroDivisionError', 'ArithmeticError'],
  ['AssertionError', 'Exception'], ['AttributeError', 'Exception'], ['EOFError', 'Exception'],
  ['ImportError', 'Exception'], ['ModuleNotFoundError', 'ImportError'],
  ['LookupError', 'Exception'], ['IndexError', 'LookupError'], ['KeyError', 'LookupError'],
  ['NameError', 'Exception'], ['UnboundLocalError', 'NameError'],
  ['OSError', 'Exception'], ['FileNotFoundError', 'OSError'], ['PermissionError', 'OSError'], ['FileExistsError', 'OSError'],
  ['IsADirectoryError', 'OSError'], ['NotADirectoryError', 'OSError'], ['TimeoutError', 'OSError'], ['ConnectionError', 'OSError'],
  ['RuntimeError', 'Exception'], ['NotImplementedError', 'RuntimeError'], ['RecursionError', 'RuntimeError'],
  ['StopIteration', 'Exception'],
  ['SyntaxError', 'Exception'], ['IndentationError', 'SyntaxError'], ['TabError', 'IndentationError'],
  ['TypeError', 'Exception'], ['ValueError', 'Exception'],
];
for (const [name, base] of TREE) EXCEPTION_CLASSES[name] = new PyClass(name, [EXCEPTION_CLASSES[base]], new Map(), 'exception');
EXCEPTION_CLASSES.IOError = EXCEPTION_CLASSES.OSError;
EXCEPTION_CLASSES.EnvironmentError = EXCEPTION_CLASSES.OSError;
// str(KeyError('k')) shows the repr of the key
EXCEPTION_CLASSES.KeyError.dict.set('__str__', native('KeyError.__str__'));

/** Class for the Python name of an error kind (unknown kinds count as RuntimeError). */
export const exceptionClassFor = (kind) => EXCEPTION_CLASSES[kind] ?? EXCEPTION_CLASSES.RuntimeError;

/** Is this a class that may be raised or caught? */
export const isExceptionClass = (c) => c instanceof PyClass && c.mro.some((x) => x.native === 'exception');
