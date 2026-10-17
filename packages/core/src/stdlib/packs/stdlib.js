// Pack "stdlib": the small standard modules written in Python.
import { PYMODULES } from '../../pymodules.js';
import collections from '../py/collections.js';
import functools from '../py/functools.js';
import itertools from '../py/itertools.js';
import statistics from '../py/statistics.js';
import string from '../py/string.js';
import json from '../py/json.js';
import sys from '../py/sys.js';
import time from '../py/time.js';
import _calendar from '../py/_calendar.js';
import datetime from '../py/datetime.js';
import re from '../py/re.js';
import textwrap from '../py/textwrap.js';
import pprint from '../py/pprint.js';
import turtle from '../py/turtle.js';
import _fileio from '../py/fileio.js';
import os from '../py/os.js';
import posixpath from '../py/posixpath.js';
import requests from '../py/requests.js';

Object.assign(PYMODULES, { collections, functools, itertools, statistics, string, json, sys, time, _calendar, datetime, re, textwrap, pprint, turtle, _fileio, os, posixpath, requests });
