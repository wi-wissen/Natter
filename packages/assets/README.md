# @natterjs/assets

Images and sounds for Python games in [Natter](https://natter.wi7.net/) and [CodeNatter](https://codenatter.de): more than 900 PNG sprites in one consistent flat emoji style, two SVG turtle shapes and 14 short sounds, sorted into packs (platformer, space, sea, animals, puzzles, adventure, user interface …) and described in one `catalog.json`. Students write only a name, without uploading files:

```python
heroine = Actor("heroine_run_1")
screen.blit("pf_grass_mid", (0, 416))
sounds.coin.play()
```

Browse every image and sound in the [sprite gallery](https://natter.wi7.net/sprites/).

## Install

```bash
npm install @natterjs/assets
```

## Usage

The package is meant to be served as it is (from jsDelivr, unpkg or a copy of the folder on your own server). `index.js` gives the URLs relative to itself:

```js
import { assetsOption, baseUrl, catalogUrl, gametypesUrl } from '@natterjs/assets';

assetsOption();          // { baseUrl, catalog: 'catalog.json' }: the whole library
assetsOption(['space']); // { baseUrl, catalog: 'catalog.json', packs: ['space'] }: only these packs
baseUrl;                 // folder of the library, ends with '/'; an image is at baseUrl + 'space/sp_ship.png'
```

Pass `assetsOption()` as the `assets` option of `createPgzero` or `createKara` from [`@natterjs/web`](https://www.npmjs.com/package/@natterjs/web):

```js
import { createRunner, createPgzero } from 'https://cdn.jsdelivr.net/npm/@natterjs/web@0.1.0/dist/natter-web.js';
import { assetsOption } from 'https://cdn.jsdelivr.net/npm/@natterjs/assets@0.1.0/index.js';

const runner = createRunner();
const pgz = createPgzero(document.querySelector('#game'), { assets: assetsOption(), lang: 'en' });
runner.use(pgz);
await pgz.run(runner, 'ship = Actor("sp_ship", (400, 300))\n\ndef draw():\n    screen.clear()\n    ship.draw()');
```

When a bundler copies the package files elsewhere, serve the folder yourself and pass its address instead: `{ baseUrl: 'https://example.org/assets/', catalog: 'catalog.json' }`. Without a bundler or npm, use the jsDelivr folder directly as `baseUrl`: `https://cdn.jsdelivr.net/npm/@natterjs/assets@0.1.0/` (always pin a version).

### How names map to files

- Every image and sound has a unique name across all packs (`^[a-z][a-z0-9_]*$`). The catalog lists it with its pack and file: `heroine_run_1` → `characters/heroine_run_1.png`, `coin` → `sounds/coin.wav`.
- **Pygame Zero:** `Actor("name")`, `screen.blit("name", …)`, `images.name` and `sounds.name` look the name up in the catalog. The host reads the catalog once and then loads only the files a program names; a string like `"heroine_run_" + str(i)` loads all names starting with `heroine_run_`. A file of the same name in the project's `images/` or `sounds/` folder always wins.
- **Kara:** the world is drawn with the images of the `kara` pack (`kara`, `kara_up`, `kara_left`, `kara_down`, `kara_tree`, `kara_blueberry`, `kara_mushroom`, `kara_grass` …). Replacing an image of that name in the catalog changes Kara's look; without assets Kara draws vector shapes.
- **Animations:** frames end in `_<n>`, counted from 1 (`heroine_run_1` … `heroine_run_8`), all frames of one animation have the same size. Characters face right unless the name says `_left`.

### Files

| File | Content |
|---|---|
| `catalog.json` | All images (name, pack, path, width × height, bytes, tags, English and German description), all sounds (with length in seconds), the animation groups and the game types |
| `gametypes.json` | The library sorted by kind of game, with a hand-picked starter set for each |
| `<pack>/pack.json` | One pack: title, files, tags, descriptions |
| `<pack>/*.png`, `turtle/*.svg`, `sounds/*.wav` | The images and sounds (about 4.5 MB in total) |

Packs: `adventure`, `animals`, `arcade`, `book` (pond game with German names such as `ente`, `kueken`), `characters`, `flyer`, `grid_action`, `grid_chars`, `grid_puzzle`, `grid_tiles`, `kara`, `nature`, `platformer`, `sea`, `space`, `turtle`, `ui`, `sounds`.

## Features

- One style for everything, so packs fit together in one game.
- Animation frames of the same size and aligned (feet at the same height).
- Every image is listed with size, tags and an English and German description, ready for search and pickers.
- Loads lazily: hosts fetch the catalog once and only the files a program uses.

## Links

- Sprite gallery: <https://natter.wi7.net/sprites/>
- Website: <https://natter.wi7.net/>, command reference: <https://natter.wi7.net/reference/>
- Source and issues: <https://github.com/wi-wissen/Natter>
- [CodeNatter](https://codenatter.de): a browser IDE for learning Python in school, built on Natter.

## License

Images, sounds and the JSON lists are intended as **CC0 1.0** (public domain dedication): free to use, change and share, also commercially and without attribution. They are original work drawn from the project's own prompts and do not imitate existing game, film or brand characters; the sounds are synthesised. Details and origin: `LICENSE-ASSETS.md`. The small `index.js` is code under the MIT license (`LICENSE`).
