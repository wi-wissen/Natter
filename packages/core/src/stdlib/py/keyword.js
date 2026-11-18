// keyword: the reserved words of Python 3.13, as in CPython's Lib/keyword.py.
export default String.raw`
__all__ = ["iskeyword", "issoftkeyword", "kwlist", "softkwlist"]

kwlist = [
    'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del',
    'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal',
    'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield'
]

softkwlist = ['_', 'case', 'match', 'type']

_kw = frozenset(kwlist)
_soft = frozenset(softkwlist)


def iskeyword(s):
    return s in _kw


def issoftkeyword(s):
    return s in _soft
`;
