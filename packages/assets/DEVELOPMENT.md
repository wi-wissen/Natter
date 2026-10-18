# @natterjs/assets – Entwicklerdokumentation der Bildbibliothek

Bilder und Klänge für Pygame-Zero-Spiele in Natter und in [CodeNatter](https://codenatter.de), alle zu sehen in der [Sprite-Galerie](https://natter.wi7.net/sprites/): rund 920 PNG-Sprites in einem einheitlichen flachen Emoji-Stil, zwei SVG-Schildkröten und 14 kurze Klänge. Schülerinnen und Schüler schreiben nur den Namen, ohne Dateien hochzuladen:

```python
heldin = Actor("heroine_run_1")
screen.blit("pf_grass_mid", (0, 416))
sounds.coin.play()
```

## Inhalt

| Paket | Titel | Dateien | Größe | Beispiele |
|---|---|---|---|---|
| `adventure` | Abenteuer | 82 | 369 KB | `hero_girl_down_1`, `tile_grass`, `adv_chest_closed`, `mon_slime_1` |
| `animals` | Tiere | 46 | 330 KB | `an_bear`, `an_cat_walk_1`, `pet_cat_happy` |
| `arcade` | Spielhalle | 71 | 312 KB | `snake_head_right`, `brick_red`, `memory_cat`, `dice_1`, `car_red` |
| `book` | Teich-Spiel aus dem Buch | 18 | 79 KB | `ente`, `kueken`, `boot`, `seerose`, `teich_hintergrund` |
| `characters` | Figuren | 38 | 326 KB | `heroine_run_1` … `_8`, `heroine_idle_1`, `boy_run_1`, `enemy_walk_1` |
| `flyer` | Flieger und Fallendes | 39 | 401 KB | `fl_bird_1`, `fl_pillar_top`, `fall_apple`, `fl_bg_day` |
| `grid_action` | Raster-Action | 98 | 381 KB | `bomb_1`, `bomb_blast_center`, `td_tower_arrow_1`, `td_road_h`, `farm_carrot_1` … `_4`, `cross_frog_up`, `gem_blue` |
| `grid_chars` | Rasterfiguren (von oben) | 96 | 274 KB | `robo_down_1`, `fuchs_down_1`, `maus_happy`, `pinguin_idle_1` |
| `grid_puzzle` | Raster-Rätsel und Brettspiele | 81 | 209 KB | `gp_crate`, `ms_flag`, `pipe_corner_ne`, `chess_king_w`, `num_tile_2048` |
| `grid_tiles` | Rasterkacheln | 50 | 125 KB | `gt_ice`, `gt_key_red`, `gt_conveyor_up`, `gt_goal` |
| `kara` | Kara der Marienkäfer | 17 | 75 KB | `kara`, `kara_tree`, `kara_mushroom`, `turtle_top` |
| `nature` | Natur und Wetter | 51 | 237 KB | `nat_oak`, `nat_cloud_1`, `fruit_apple` |
| `platformer` | Jump and Run | 89 | 531 KB | `pf_grass_mid`, `pf_coin_1`, `pf_gem_blue_1`, `slug_walk_1`, `pf_bg_day` |
| `sea` | Meer | 36 | 417 KB | `sea_sailboat`, `sea_fish_1`, `sea_bg` |
| `space` | Weltraum | 41 | 293 KB | `sp_ship`, `sp_enemy_1`, `sp_explosion_1`, `sp_bg_space` |
| `turtle` | Turtle (SVG) | 2 | 3 KB | `turtle`, `turtle_side` |
| `ui` | Spieloberfläche | 81 | 291 KB | `ui_0` … `ui_9`, `ui_heart_full`, `ui_button_blue` |
| `sounds` | Klänge (WAV) | 14 | 213 KB | `platsch`, `coin`, `jump`, `hit`, `explosion`, `laser`, `win` |

Zusammen etwa 4,5 MB. Jedes Paket hat eine `pack.json` (Name, Datei, Schlagwörter, deutsche und englische Beschreibung), die Klänge eine `sounds/sounds.json`.

## Katalog

`catalog.json` fasst alles in einer Datei zusammen: alle Bilder (Name, Paket, Pfad, Breite × Höhe aus dem PNG-Kopf bzw. dem SVG, Bytes, Schlagwörter, de/en), alle Klänge (mit Länge in Sekunden) und die Bildgruppen, erkannt an der Endung `_<n>`: `animation`, wenn die Beschreibungen von Bildern einer Animation sprechen (`heroine_run`, 8 Bilder), sonst `series` (Varianten wie `dice_1` … `dice_6`).

```bash
npm run assets:catalog    # catalog.json neu schreiben (nach jeder Änderung an einem Paket)
```

Ein Test (`test/catalog.test.js`) schlägt fehl, wenn die eingecheckte Datei nicht mehr stimmt. Der Pygame-Zero-Host liest den Katalog mit einer Anfrage (`assets: { baseUrl, catalog: 'catalog.json' }`, siehe `packages/web/DEVELOPMENT.md`) und lädt danach nur die Bilder, die ein Programm nennt; die [Sprite-Galerie](https://natter.wi7.net/sprites/) (`npm run sprites`) und CodeNatter bauen darauf auf.

## Spielarten

`gametypes.json` ordnet die Bibliothek nach Spielart, so zeigt sie die [Sprite-Galerie](https://natter.wi7.net/sprites/) (`docs/sprites/`, `npm run sprites`): zuerst je Spielart eine kleine, von Hand ausgesuchte **Startauswahl** (8 bis 16 Bilder), darunter „Mehr aus den Paketen“ mit allem Übrigen. Jede Spielart hat `id`, `de`, `en`, `hint` (ein Satz de/en), `packs` (die Pakete dahinter, ein Paket darf in mehreren stehen) und `starter` (Bildnamen; ein Animationsbild wie `heroine_run_1` steht für die ganze Animation).

| `id` | Spielart | Pakete |
|---|---|---|
| `platformer` | Plattformspiel | `platformer`, `characters` |
| `space` | Weltraum | `space` |
| `sea` | Meer | `sea` |
| `nature` | Natur & Garten | `nature` |
| `animals` | Tiere | `animals` |
| `flyer` | Flieger & Fallendes | `flyer` |
| `arcade` | Arcade | `arcade` |
| `puzzle` | Rätsel & Brettspiele | `grid_puzzle`, `arcade` |
| `grid` | Von oben & im Gitter (Kisten schieben, Bomben, Turmverteidigung, Farm, Frosch, Minen, Rohre) | `grid_chars`, `grid_tiles`, `grid_action`, `grid_puzzle` |
| `adventure` | Abenteuer | `adventure` |
| `book` | Ente, Kara & Turtle | `book`, `kara`, `turtle` |
| `ui` | Oberfläche | `ui` |

`npm run assets:catalog` übernimmt die Spielarten als `gametypes` in `catalog.json`. `test/gametypes.test.js` prüft: jeder Startname existiert und liegt in einem Paket der Spielart, 8 bis 16 je Spielart, jedes Bildpaket gehört zu mindestens einer Spielart.

## Wie die Bilder entstanden sind

- Gezeichnet von einem Bildmodell (`google/gemini-3.1-flash-image` über OpenRouter) nach eigenen Texten, mit `scripts/asset-gen/style-emoji.png` als Stil- und Figurenvorlage, damit alle Pakete zusammenpassen.
- Jedes Blatt entsteht auf einer einfarbigen Magenta-Fläche (`#FF00FF`) ohne Schatten, Boden und Text; `scripts/asset-gen/keyslice.py` stanzt das Magenta zu Transparenz aus, schneidet das Blatt in einzelne, benannte Dateien und richtet Animationsbilder auf eine gemeinsame Leinwand aus (Füße auf gleicher Höhe). Hintergründe (`background`) entstehen ohne Magenta und werden auf 800 × 480 gebracht.
- Die Texte und Namen jedes Pakets stehen in `<paket>/make.py`, damit es sich neu zeichnen lässt. Jedes Ergebnis wurde auf hellem und dunklem Grund angesehen (Ränder, Stil, Ähnlichkeit zu bekannten Figuren).
- Die Klänge sind synthetisch (`scripts/gen-sounds.py`, deterministisch).

## Lizenz

Gedacht als **CC0** (gemeinfrei): frei verwendbar, veränderbar und weitergebbar, auch ohne Namensnennung. Alle Bilder sind eigene Erzeugnisse aus eigenen Texten; keines soll eine bestehende Spiel-, Film- oder Markenfigur nachahmen.

## Namen

- Klein, ASCII, Ziffern und `_`, mit einem Buchstaben vorn (`^[a-z][a-z0-9_]*$`), **eindeutig über alle Pakete**.
- Animationsbilder: `<ding>_<aktion>_<n>`, ab 1 gezählt (`heroine_run_1` … `heroine_run_8`), alle Bilder einer Animation gleich groß.
- Allgemeine Wörter bekommen ein Paketwort davor (`pf_coin_1`, `sea_cloud`, `nat_oak`), damit Pakete sich nicht in die Quere kommen.
- Figuren schauen nach rechts, außer der Name sagt `_left`/`_links`. Im Buch-Paket sind die Namen deutsch (`ente`, `kueken`, `boot`), weil das Buch sie so nennt.

## Ein Paket hinzufügen

1. `CONVENTIONS.md` und `BRIEF.md` lesen (Stil, Größen, Grenzen: höchstens 80 KB je Bild, 300 KB je Hintergrund, 3 MB je Paket, längste Seite 1024).
2. Ordner `packages/assets/<paket>/` anlegen, Bilder mit `scripts/asset-gen` erzeugen (siehe dessen README), Prompts in `make.py` festhalten.
3. `pack.json` schreiben (`pack`, `title.de/en`, `format: "png"`, `assets` mit `name`, `file`, `tags`, `de`, `en`).
4. Das Paket in `gametypes.json` einer Spielart zuordnen (oder eine neue anlegen, mit Startauswahl).
5. `npm run assets:catalog`, dann `npx vitest run packages/assets` (prüft Namen, Dateien, Größen, Alphakanal, Katalog, Spielarten).
6. `npm run sprites` ausführen: das Paket erscheint in der Sprite-Galerie (`docs/sprites/index.html`). CodeNatter übernimmt es mit der nächsten Version von `@natterjs/assets`.
