# License of the images and sounds

This applies to the images (`*/*.png`, `turtle/*.svg`), the sounds (`sounds/*.wav`) and the lists (`*/pack.json`,
`sounds/sounds.json`, `catalog.json`, `gametypes.json`) in this package. The small JavaScript file `index.js` is
code and falls under the MIT license in `LICENSE`.

## Intended license: CC0 1.0

The library is meant to be **CC0 1.0 Universal** (public domain dedication,
<https://creativecommons.org/publicdomain/zero/1.0/>): free to use, change and pass on, also commercially and
without attribution. This is how `README.md` („Gedacht als CC0“) and `CONVENTIONS.md` of this package describe it.

## Origin

- **Images (PNG):** drawn for this project by an image model (`google/gemini-3.1-flash-image` through OpenRouter)
  from the project's own prompts, with `scripts/asset-gen/style-emoji.png` as style reference, then cut and keyed
  with `scripts/asset-gen/keyslice.py`. The prompts of each pack are in `<pack>/make.py` in the repository. Every
  result was checked so that none imitates an existing game, film or brand character.
- **Turtle shapes (SVG):** `turtle/turtle.svg` and `turtle/turtle_side.svg`, simple shapes written as SVG code
  directly in this repository (added in commit `def8b41`); no external source is recorded for them.
- **Sounds (WAV):** synthesised by `scripts/gen-sounds.py` (deterministic, no recordings or samples).

## Third-party material

None. The repository records no image or sound from a third-party source (no external sprite or sound packs), so
no attribution is required.

Source: <https://github.com/wi-wissen/Natter/tree/main/packages/assets>
