#!/bin/sh
# Regenerates packages/core/test/data/guizero/*.out with the real guizero 1.6 on CPython (needs tkinter and Xvfb).
# Setup once:  python3.12 -m venv /tmp/guizero-venv && /tmp/guizero-venv/bin/pip install guizero==1.6.0
# Run:         GUIZERO_PYTHON=/tmp/guizero-venv/bin/python sh scripts/gen-guizero-golden.sh
# The programs import guisim.py from their folder (events are driven through tkinter there, through guizero._sim in Natter).
set -e
PY=${GUIZERO_PYTHON:-python3.12}
export PYTHONDONTWRITEBYTECODE=1
cd "$(dirname "$0")/../packages/core/test/data/guizero"
for f in *.py; do
  [ "$f" = guisim.py ] && continue
  # a large screen: tk unmaps widgets that do not fit into the window, and those get no events
  xvfb-run -a -s "-screen 0 1600x1200x24" "$PY" -W ignore "$f" > "${f%.py}.out"
  echo "${f%.py}.out"
done
