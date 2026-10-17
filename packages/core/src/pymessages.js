// Messages of errors in the wording of CPython (what str(e) shows in `except ValueError as e: print(e)`).
// The friendly texts for learners live in messages.js; these are for programs that look at the exception themselves.

import { message } from './errorText.js';

const plural = (n, one, many) => (n === 1 ? one : many);

/**
 * CPython's text for an interpreter error.
 * @param {{ short?: string, code: string, params?: Record<string, any> }} e
 * @returns {string}
 */
export function pyMessage(e) {
  const p = e.params ?? {};
  const code = e.short ?? e.code.replace('err.script.', '');
  switch (code) {
    case 'zeroDivision':
      if (p.float) return { div: 'float division by zero', floordiv: 'float floor division by zero', mod: 'float modulo by zero', pow: '0.0 cannot be raised to a negative power' }[p.op];
      return { div: 'division by zero', floordiv: 'integer division or modulo by zero', mod: 'integer modulo by zero', pow: '0.0 cannot be raised to a negative power' }[p.op];
    case 'index':
      switch (p.what) {
        case 'listRange': case 'listEmpty': return 'list index out of range';
        case 'strRange': case 'strEmpty': return 'string index out of range';
        case 'tupleRange': case 'tupleEmpty': return 'tuple index out of range';
        case 'rangeRange': case 'rangeEmpty': return 'range object index out of range';
        case 'popEmpty': return 'pop from empty list';
        case 'list': return 'pop index out of range';
        case 'choiceEmpty': return 'Cannot choose from an empty sequence';
        case 'big': return "cannot fit 'int' into an index-sized integer";
        default: break;
      }
      break;
    case 'value':
      switch (p.what) {
        case 'intLiteral': return `invalid literal for int() with base ${p.base}: ${pyStr(p.text)}`;
        case 'floatLiteral': return `could not convert string to float: ${pyStr(p.text)}`;
        case 'notInList': return p.op === 'remove' ? 'list.remove(x): x not in list' : `${p.value} is not in list`;
        case 'notInTuple': return 'tuple.index(x): x not in tuple';
        case 'substringNotFound': return 'substring not found';
        case 'sliceStep': return 'slice step cannot be zero';
        case 'rangeStep': return 'range() arg 3 must not be zero';
        case 'emptySeq': return `${p.name}() iterable argument is empty`;
        case 'negativeShift': return 'negative shift count';
        case 'chrRange': return 'chr() arg not in range(0x110000)';
        case 'emptySeparator': return 'empty separator';
        case 'lenNegative': return '__len__() should return >= 0';
        case 'floatToInt': return 'cannot convert float NaN to integer';
        case 'factorialNegative': return 'factorial() not defined for negative values';
        case 'combNegative': return 'n must be a non-negative integer';
        case 'circular': return 'Circular reference detected';
        case 'sleepNegative': return 'sleep length must be non-negative';
        case 'weightsLength': return 'The number of weights does not match the population';
        case 'weightsTotal': return 'Total of weights must be greater than zero';
        case 'sampleSize': return 'Sample larger than population or is negative';
        case 'randbits': return 'number of bits must be non-negative';
        default: break;
      }
      break;
    case 'unpack':
      if (p.atLeast) return `not enough values to unpack (expected at least ${p.expected}, got ${p.got})`;
      return p.got > p.expected ? `too many values to unpack (expected ${p.expected})` : `not enough values to unpack (expected ${p.expected}, got ${p.got})`;
    case 'operand': return operandMessage(p);
    case 'compare': return `'${p.op}' not supported between instances of '${p.a}' and '${p.b}'`;
    case 'unaryOperand': return `bad operand type for unary ${p.op}: '${p.type}'`;
    case 'notIterable': return `'${p.type}' object is not iterable`;
    case 'notCallable': return `'${p.type}' object is not callable`;
    case 'notSubscriptable': return `'${p.type}' object is not subscriptable`;
    case 'notIndex': return p.container === 'str' ? `string indices must be integers, not '${p.type}'` : `${p.container ?? 'list'} indices must be integers or slices, not ${p.type}`;
    case 'unhashable': return `unhashable type: '${p.type}'`;
    case 'argCount': return `${p.name}() takes ${p.max} positional ${plural(p.max, 'argument', 'arguments')} but ${p.given} ${plural(p.given, 'was', 'were')} given`;
    case 'argMissing': return `${p.name}() missing 1 required positional argument: '${p.arg}'`;
    case 'argUnexpected': return `${p.name}() got an unexpected keyword argument '${p.arg}'`;
    case 'argDuplicate': return `${p.name}() got multiple values for argument '${p.arg}'`;
    case 'attr':
      if (p.what === 'noSetter') return `property '${p.name}' of '${p.type}' object has no setter`;
      if (p.what === 'noGetter') return `property '${p.name}' of '${p.type}' object has no getter`;
      return /^(module|type object) /.test(p.type) ? `${p.type} has no attribute '${p.name}'` : `'${p.type}' object has no attribute '${p.name}'`;
    case 'nameUnbound': case 'nameUnknown': return `name '${p.name}' is not defined`;
    case 'localUnbound': return `cannot access local variable '${p.name}' where it is not associated with a value`;
    case 'assertion': return p.message ?? '';
    case 'recursion': return 'maximum recursion depth exceeded';
    case 'importUnknown': return `No module named '${p.name}'`;
    case 'mathDomain': return 'math domain error';
    case 'mathRange': return 'math range error';
    case 'overflow': return 'integer too large';
    case 'stopIteration': return '';
    case 'eof': return 'EOF when reading a line';
    case 'internal': return p.message ?? 'internal error';
    case 'raised': return p.message ?? '';
    case 'type':
      switch (p.what) {
        case 'noLen': return `object of type '${p.type}' has no len()`;
        case 'noItemAssign': return `'${p.type}' object does not support item assignment`;
        case 'noItemDelete': return `'${p.type}' object doesn't support item deletion`;
        case 'convert': return p.to === 'int'
          ? `int() argument must be a string, a bytes-like object or a real number, not '${p.type}'`
          : `float() argument must be a string or a real number, not '${p.type}'`;
        case 'numberNeeded': return `must be real number, not ${p.type}`;
        case 'intNeeded': return `'${p.type}' object cannot be interpreted as an integer`;
        case 'inStr': return `'in <string>' requires string as left operand, not ${p.type}`;
        case 'joinStr': return `sequence item ${p.i}: expected str instance, ${p.type} found`;
        case 'noContext': return `'${p.type}' object does not support the context manager protocol`;
        case 'noArgsClass': return `${p.name}() takes no arguments`;
        case 'initReturn': return `__init__() should return None, not '${p.type}'`;
        case 'sumStr': return "sum() can't sum strings [use ''.join(seq) instead]";
        case 'jsonType': return `Object of type ${p.type} is not JSON serializable`;
        case 'jsonKey': return `keys must be str, int, float, bool or None, not ${p.type}`;
        case 'jsonText': return `the JSON object must be str, bytes or bytearray, not ${p.type}`;
        case 'notIterator': return `'${p.type}' object is not an iterator`;
        default: break;
      }
      break;
    default: break;
  }
  return message(e.code, p, 'en');
}

const pyStr = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

function operandMessage(p) {
  const seq = ['str', 'list', 'tuple'];
  if (p.op === '+' && seq.includes(p.a)) return `can only concatenate ${p.a} (not "${p.b}") to ${p.a}`;
  if (p.op === '*' && (seq.includes(p.a) || seq.includes(p.b))) return `can't multiply sequence by non-int of type '${seq.includes(p.a) ? p.b : p.a}'`;
  if (p.op === '**') return `unsupported operand type(s) for ** or pow(): '${p.a}' and '${p.b}'`;
  return `unsupported operand type(s) for ${p.op}: '${p.a}' and '${p.b}'`;
}
