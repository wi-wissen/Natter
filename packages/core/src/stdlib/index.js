// Standard modules written in Python, by module name. Each is compiled and run when a program first imports it.
import collections from './collections.js';
import functools from './functools.js';
import itertools from './itertools.js';
import statistics from './statistics.js';
import string from './string.js';

/** @type {Record<string, string>} */
export const PYMODULES = { collections, functools, itertools, statistics, string };
