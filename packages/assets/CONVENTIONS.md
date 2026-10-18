# Asset conventions

Game graphics for Natter's Pygame Zero module and for [CodeNatter](https://codenatter.de). All files are original work, free to use (CC0): drawn by an image model from our own prompts, in one style. Nothing may copy or closely imitate an existing game, film or brand character.

## Look

**Flat emoji style** (reference: `scripts/asset-gen/style-emoji.png`, which also fixes the main characters): clear flat shapes without outlines, very few colours per object, rounded friendly forms, instantly readable, appealing to girls and boys. Light comes from nowhere: no hard shading, no gradients beyond a hint. Characters face right unless the name says `_left`.

## Layout

```
packages/assets/<pack>/<name>.png     one file per image, transparent background
packages/assets/<pack>/pack.json      the list of the pack
packages/assets/sounds/               wav effects (sounds.json)
```

## pack.json

```json
{
  "pack": "characters",
  "title": { "de": "Figuren", "en": "Characters" },
  "format": "png",
  "assets": [
    { "name": "heroine_idle_1", "file": "heroine_idle_1.png", "tags": ["character", "player"],
      "de": "Heldin steht, Bild 1 von 4", "en": "Heroine standing, frame 1 of 4" }
  ]
}
```

- `name` is what a student writes: `Actor("heroine_idle_1")`. Lowercase ASCII letters, digits and `_`, starting with a letter, unique over all packs. Animation frames: `<thing>_<action>_<n>` starting at 1. Generic words that other packs may use (tree, cloud, coin, star, heart, bush, rock, fish, sun, flower, key, chest ...) carry a pack-specific word (`meadow_tree`, `sea_cloud`).
- `tags` include `background` for opaque backdrops (they need no alpha channel); every other image has an alpha channel.
- `de`/`en`: a short description (what it is, which way it looks).

## PNG rules

- Transparent background (RGBA), tightly cropped plus a 2 px margin; animation frames of one character share one canvas size, with the feet at the same height and the body centred, so that swapping frames does not jump.
- Sizes (pixels, natural size in a game): characters about 96 high, enemies and animals 48 to 96, tiles 64x64, items 32 to 48, big objects (houses, ships, trees) up to 160, backgrounds 800x480. At most 1024 on the long side, at most 80 KB per file (backgrounds 300 KB) and 3 MB per pack.
- Edges clean: no magenta fringe (check on a dark and a light background).
- Readable at half size.

## Making images

`scripts/asset-gen` (see its README): `gen.py` asks the image model for a sheet on a flat magenta background, with the style reference image attached; `keyslice.py` keys the background out and cuts the sheet into the named files. Prompts and the list of names of every pack are kept in `packages/assets/<pack>/make.py` so that a pack can be redrawn.
