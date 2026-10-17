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
import turtle from './turtle.js';
import _fileio from './fileio.js';
import os from './os.js';
import requests from './requests.js';
import posixpath from './posixpath.js';
import pgzero_rect from './pgzero_rect.js';
import pgzero_color from './pgzero_color.js';
import pgzero_clock from './pgzero_clock.js';
import pgzero_animation from './pgzero_animation.js';
import pgzero_keys from './pgzero_keys.js';
import pgzero_screen from './pgzero_screen.js';
import pgzero_audio from './pgzero_audio.js';
import pgzero_spellcheck from './pgzero_spellcheck.js';
import pgzero_actor from './pgzero_actor.js';
import pgzero_builtins from './pgzero_builtins.js';
import pgzero_main from './pgzero_main.js';
import pgzrun from './pgzrun.js';
import guizero from './guizero.js';

/** @type {Record<string, string>} */
export const PYMODULES = { collections, functools, itertools, statistics, string, json, sys, time, _calendar, datetime, re, textwrap, pprint, turtle, _fileio, os, posixpath, requests,
  pgzero_rect, pgzero_color, pgzero_clock, pgzero_animation, pgzero_keys, pgzero_screen, pgzero_audio, pgzero_spellcheck, pgzero_actor, pgzero_builtins, pgzero_main, pgzrun,
  guizero };

// numpy subset and matplotlib.pyplot (dotted names are submodules, see vm.importModule)
import { numpy, numpy_random, numpy_linalg } from './numpy.js';
Object.assign(PYMODULES, { numpy, 'numpy.random': numpy_random, 'numpy.linalg': numpy_linalg });
import { matplotlib, pyplot } from './pyplot.js';
Object.assign(PYMODULES, { matplotlib, 'matplotlib.pyplot': pyplot });
