# Asset generation

The game graphics in `packages/assets` are made with an image model (through OpenRouter, `google/gemini-3.1-flash-image`)
in one style, flat emoji style (`style-emoji.png` is the style and character reference), on a flat magenta background that
`keyslice.py` turns into transparency.

- `gen.py`: `gen(name, prompt, ref_image)` writes `name.png` (needs the OpenRouter key in the environment of `curl`).
- `keyslice.py`: `key()` removes the magenta background; `python3 keyslice.py sheet.png outdir prefix [height]` cuts an animation sheet into aligned frames; `cut_items(sheet, names, long_side, outdir)` cuts a sheet of different objects into named files.

Rules for prompts: one flat pure magenta (#FF00FF) background, no shadows, no ground, no text, the exact same look as the reference, a fixed grid and reading order, a fixed count of objects.
