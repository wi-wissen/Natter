# Pygame Zero: Brücke zum Host

Die Spiellogik von Pygame Zero läuft komplett in Python-Modulen von Natter, ohne Zeichnen, Ton und Fenster. Der Host (Browser) zeichnet, spielt Töne ab und sammelt Eingaben. Er ruft nie selbst Funktionen des Schülerprogramms auf: Das macht der Frame-Treiber `pgzero_main.frame` in Python.

| Modul | Inhalt (Vorbild) |
|---|---|
| `pgzero_rect` | `Rect` (pygame.Rect, ganzzahlig), `ZRect` (pgzero, Gleitkomma) |
| `pgzero_actor` | `Actor` (pgzero 1.2, dazu `opacity`, `repr`, `rect()` aus 1.3 und `scale`, `flip_x/y`, `images`, `next_image`, `animate`, `direction_to`, `move_towards`, `move_forward` … aus pgzhelper) |
| `pgzero_clock` | `clock` (Clock, `schedule`, `schedule_interval`, `schedule_unique`, `unschedule`, `each_tick`, `tick`) |
| `pgzero_animation` | `animate`, `Animation`, alle Tween-Funktionen |
| `pgzero_keys` | `keys`, `keymods`, `mouse`, `keyboard` |
| `pgzero_screen` | `screen` (`clear`, `fill`, `blit`, `bounds`, `draw.*`), `images` |
| `pgzero_audio` | `sounds`, `music`, `tone` |
| `pgzero_color` | Farbtabelle von pygame (`THECOLORS`), `Color`, `make_color` |
| `pgzero_spellcheck` | Warnungen bei vertippten Hooks/Konstanten, Fehler bei falschen Hook-Parametern |
| `pgzero_builtins` | alle Namen eines Pygame-Zero-Programms |
| `pgzero_main` | Frame-Treiber (`start`, `frame`) |
| `pgzrun` | `import pgzrun`, `pgzrun.go()` |

## Natives `_pgz`

`packages/core/src/stdlib/pgzero.js` stellt sie bereit (`PGZ_NATIVES`, `PGZ_NAMES`). Solange `builtins.js` das Modul `_pgz` nicht kennt, gibt der Host sie selbst mit:

```js
import { PGZ_NATIVES, pgzHostModules, PGZ_BUILTIN_NAMES, installPgzero, pgzStart, pgzFrame } from '.../stdlib/pgzero.js';
const vm = new VM(compile(src, { known: PGZ_BUILTIN_NAMES }), {
  natives: PGZ_NATIVES,
  host: { ...pgzHostModules(), print, pgz: { resource, cmd } },
});
```

Vom Host zu liefern (`host.pgz`):

| Funktion | Rückgabe |
|---|---|
| `resource(kind, name)` | `'images'` → `[breite, höhe]`, `'sounds'` → Länge in Sekunden, `'music'`/`'fonts'` → `true`; `null`, wenn es die Datei nicht gibt. `name` ohne Endung, Kleinschreibung wie bei pgzero (Unterordner: `name` mit `/`). |
| `cmd(name, args)` | Befehl ausführen (Tabelle unten), `args` als JavaScript-Array. |

Im Kern implementiert: `argnames(fn)` (Parameternamen eines Hooks), `main_get(name)`, `main_vars()` (globale Namen des Hauptprogramms), `install(dict)` (für `import pgzrun`), `go()` (wartet mit `wait.kind === 'pgzero'`).

## Start

- **Mit `import pgzrun`:** Das Modul legt die Pygame-Zero-Namen in die Globalen des Programms (wie `prepare_mod`). `pgzrun.go()` hält das Hauptprogramm an (`task.state === 'waiting'`, `task.wait.kind === 'pgzero'`); daran erkennt der Host auch ohne Spielmodus, dass ein Spiel startet. Code nach `go()` läuft erst, wenn der Host das Programm nach Spielende mit `vm.resume(task)` fortsetzt (wie beim Schließen des Fensters).
- **Ohne `import pgzrun`** (wie `pgzrun spiel.py`): Der Host im Spielmodus kompiliert mit `known: PGZ_BUILTIN_NAMES` und ruft vor `vm.start()` `installPgzero(vm)` auf (Namen als vordefinierte Globale). Läuft das Hauptprogramm durch, beginnt das Spiel.
- Danach einmal `pgzStart(vm)` ausführen (liest `WIDTH`, `HEIGHT`, `TITLE`, sucht die Hooks, Rechtschreibprüfung); sonst macht es der erste Frame.

## Pro Frame

```js
const task = pgzFrame(vm, events, dt);   // dt in Sekunden; fester Wert (z. B. 1/60) macht Läufe reproduzierbar
vm.run(task, budget);                     // Status 'budget' = Endlosschleife im Spiel
// task.result === true  → draw() lief: Leinwand anzeigen
// 'exitCode' in task    → exit() oder Strg+Q: Spiel beenden
// task.state === 'error' → task.error anzeigen, Spiel anhalten
```

Ablauf wie `PGZeroGame.mainloop`: Ereignisse (Tastaturzustand, Hooks), `clock.tick(dt)` mit Animationen, `update(dt)` bzw. `update()`, `draw()` nur, wenn es `update` gibt, die Uhr etwas ausgelöst hat oder ein Ereignis-Hook lief (sonst `False`). Hooks werden wie bei pgzero beim Start einmal gesucht.

Ereignisse (Arrays, in der Reihenfolge des Auftretens):

| Ereignis | Felder |
|---|---|
| `['key_down', key, mod, unicode, scancode?]` | `key`: Tastencode von pygame 2/SDL2 (Buchstaben = ASCII klein, `keys.LEFT` = 1073741904 …, Tabelle in `pgzero_keys`), `mod`: Bits von `keymods` |
| `['key_up', key, mod]` | |
| `['mouse_down', [x, y], button]`, `['mouse_up', [x, y], button]` | `button`: 1 links, 2 Mitte, 3 rechts, 4/5 Rad |
| `['mouse_move', [x, y], [dx, dy], [links, mitte, rechts]]` | gedrückte Tasten als 0/1 |
| `['music_end']` | Musik hat aufgehört (Ende ohne Schleife, nach `fadeout`, `stop`), wie SDL_mixer |
| `['quit']` | Rückgabe `None`, nichts weiter |

Unbekannte Tasten- oder Maustastencodes erreichen den Hook nicht (wie pgzero), zählen aber für `keyboard`.

## Befehle

Farben sind immer `[r, g, b, a]`, Koordinaten schon wie bei pygame gerundet bzw. abgeschnitten. Die Leinwand bleibt zwischen Frames erhalten (kein automatisches Löschen).

| Befehl | args |
|---|---|
| `window` | `w, h, title` (beim Start und bei Änderung) |
| `fill` | `farbe, gfarbe\|null` (mit `gfarbe`: senkrechter Verlauf) |
| `blit` | `bild, x, y` (linke obere Ecke) |
| `actor` | `bild, x, y, w, h, winkel, scale, flip_x, flip_y, opacity`: Bild skalieren, spiegeln, um `winkel` Grad gegen den Uhrzeigersinn drehen und mittig in das Rechteck `x, y, w, h` setzen (`w, h` = Größe wie `pygame.transform.rotate`), Deckkraft 0..1 |
| `line` | `x1, y1, x2, y2, farbe, breite` |
| `circle` / `filled_circle` | `x, y, r, farbe, breite` / `x, y, r, farbe` |
| `rect` / `filled_rect` | `x, y, w, h, farbe, breite` / `x, y, w, h, farbe` (dicke Rahmen kommen als vier `filled_rect`) |
| `polygon` / `filled_polygon` | `[[x, y], …], farbe` |
| `text` | `text, x, y, hanchor, vanchor, opts`: Text messen (Breite `tw`, Höhe `th`), oben links bei `round(x - hanchor·tw), round(y - vanchor·th)` zeichnen (`round` = halbe zur geraden Zahl). `opts`: `fontname, fontsize` (24), `sysfontname, antialias, bold, italic, underline, color, background, width, widthem, lineheight, strip, align` (0/0.5/1 oder `null`), `owidth, ocolor, shadow, scolor, gcolor, alpha` (Stufen 1/16), `angle` (Vielfaches von 3) wie ptext |
| `textbox` | `text, x, y, w, h, hanchor, vanchor, opts`: größte Schrift, mit der der umbrochene Text ins Rechteck passt, dann wie `text` am Punkt `x + hanchor·w, y + vanchor·h` |
| `sound_play` | `name, loops, maxtime, fade_ms, volume` |
| `sound_stop` / `sound_fadeout` / `sound_volume` | `name` / `name, ms` / `name, volume` |
| `music_play` | `name, loops` (-1 = Schleife) |
| `music_queue`, `music_stop`, `music_pause`, `music_unpause`, `music_rewind` | `name` bzw. nichts |
| `music_fadeout` / `music_volume` / `music_set_pos` | `ms` / `volume` / `sekunden` |
| `tone` | `hz, samples, volume`: Sinus mit 22050 Hz, `samples + 2000` Samples, Hüllkurve wie `pgzero.tone` (unter 1000 Samples: 0 → 1 bei 10 % → 0,9 am Ende → 0; sonst 0 → 1 bei 350 → 0,7 bei 1000 → 0,7 bis `samples` → 0) |

## Unterschiede zu Pygame Zero

- `keys`, `keymods`, `mouse` liefern einfache Zahlen statt IntEnum (`print` gleich, `repr` anders).
- Rückrufe von `clock` bleiben am Leben (pgzero hält nur schwache Referenzen: dort feuert ein `lambda` nie); ein Fehler in einem Rückruf hält das Programm an, statt nur ausgegeben zu werden.
- Zuweisungen an unbekannte Attribute von `Rect` legen das Attribut an (Natter kennt kein `__setattr__`/`__slots__`).
- `Actor`: Nach einem Bildwechsel eines gedrehten Actors stimmen Größe und Bild sofort (pgzero 1.2 zeigt bis zum nächsten `angle` das ungedrehte Bild).
- Unterordner nur über `images.load('ordner/name')`, nicht als `images.ordner.name`.
- `get_pos` der Musik, `Sound.get_num_channels` (immer 0), Pixel-, Kreis- und OBB-Kollisionen und Spritesheets von pgzhelper, `screen.surface` (immer `None`) fehlen.

## Tests

`scripts/gen-pgzero-golden.py` (mit pgzero und pygame, z. B. in einem venv) schreibt Testbilder und -töne, die `.out` der Fälle `packages/core/test/cases/pgz_*.py` (erste Zeile `# needs: pygame`; mit `.frames`-Datei Frame für Frame über `scripts/pgzero-frames.py`) und `packages/core/test/data/pgzero-golden.json`. `npx vitest run packages/core/test/pgzero.test.js packages/core/test/cases.test.js` prüft dagegen; mit `NATTER_PGZ_PYTHON=/pfad/zum/venv/bin/python` werden die `.out` zusätzlich mit dem echten pgzero verglichen.
