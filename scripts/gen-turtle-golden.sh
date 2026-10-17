#!/bin/sh
# Regenerates packages/core/test/data/turtle_nav.out with the real turtle module (needs python3.12 with tkinter; no display is used).
cd "$(dirname "$0")/.." && python3.12 -I packages/core/test/data/turtle_nav.py > packages/core/test/data/turtle_nav.out
