// Standard modules written in Python, by module name. Each is compiled and run when a program first imports it.
import collections from './collections.js';
import functools from './functools.js';
import itertools from './itertools.js';
import statistics from './statistics.js';
import string from './string.js';
import json from './json.js';
import sys from './sys.js';
import time from './time.js';
import _calendar from './_calendar.js';
import datetime from './datetime.js';
import re from './re.js';
import textwrap from './textwrap.js';
import pprint from './pprint.js';

/** @type {Record<string, string>} */
export const PYMODULES = { collections, functools, itertools, statistics, string, json, sys, time, _calendar, datetime, re, textwrap, pprint };
