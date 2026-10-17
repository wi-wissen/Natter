# Asset conventions

Game graphics for Natter's Pygame Zero module and for python.jetzt. All files are original work, free to use (CC0). Nothing may copy or closely imitate an existing game, film or brand character.

## Layout

```
packages/assets/<pack>/<name>.svg     one file per image
packages/assets/<pack>/pack.json      the list of the pack (see below)
```

## pack.json

```json
{
  "pack": "platformer",
  "title": { "de": "Plattformspiel", "en": "Platformer" },
  "assets": [
    { "name": "girl_idle", "file": "girl_idle.svg",
      "tags": ["character", "player"],
      "de": "Heldin steht", "en": "Heroine standing" }
  ]
}
```

- `name` is what a student writes: `Actor("girl_idle")`. Lowercase ASCII letters, digits and `_`, starting with a letter, globally unique over all packs. Animation frames: `girl_run_1`, `girl_run_2` ...
- `file` must exist in the pack folder; every SVG in the folder must be listed.
- `de`/`en`: a short description (what is it, which way does it look).

## SVG rules

- Root `<svg xmlns="http://www.w3.org/2000/svg" width="W" height="H" viewBox="0 0 W H">` with integer W, H. W x H is the natural size in game pixels (the size an Actor has). Typical: characters 48 to 96, tiles 64x64, small items 24 to 48, backgrounds 800x600 or 800x480.
- Transparent background (except full backgrounds and tiles that are meant to fill their cell).
- Self-contained: no `<script>`, no `<image>`, no external URLs or fonts, no `<style>` with `@import`, no `<foreignObject>`, no animation (SMIL or CSS) unless the asset is explicitly an animated mascot. Text must be converted to paths.
- File size: under 20 KB each, under 200 KB per pack. Prefer simple paths and basic shapes. Gradients are fine but use them sparingly.
- Anchor: the image is drawn centred on the Actor position, so draw characters standing with feet near the bottom edge and keep the visual centre near the middle. Facing direction: right, unless the name says otherwise (`_left`). Provide `_left` only where a plain horizontal flip is not enough.
- Tiles that repeat (ground, water, wall) must tile seamlessly left-right (and top-bottom where the name says so).

## Look (so that packs work together in one game)

The reference for the look are the Kara drawings in `/tmp/claude-0/-home-user/82af8643-7fd2-511f-b912-5aee8d74fb4e/scratchpad/mockups-v2-src/src/libs.js` (and what they look like in `/tmp/claude-0/-home-user/82af8643-7fd2-511f-b912-5aee8d74fb4e/scratchpad/mockups-v2/desktop.html`): friendly, flat, clean, not childish and not realistic. Look at them and continue in that spirit.

Flat vector shapes, one darker outline of about 3 units in a dark, slightly saturated colour (not pure black) on characters and items, simple highlights, two to three tones per colour. Readable on a light and on a dark background, readable at half size. Friendly, appeals to girls and boys equally, no violence beyond cartoon bumps, no blood, no weapons that look realistic.
