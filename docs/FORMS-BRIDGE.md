# Host-Schnittstelle: Formulare mit guizero

`import guizero` bildet die API von [guizero 1.6](https://lawsie.github.io/guizero/) nach. Schülerprogramme laufen so, wie die Doku sie zeigt:

```python
from guizero import App, Text, PushButton
app = App(title="Hallo")
text = Text(app, text="0")
PushButton(app, text="+1", command=lambda: setattr(text, "value", int(text.value) + 1))
app.display()
```

Das Modul (`packages/core/src/stdlib/py/guizero.js`, Python-Quelltext, Natives in `stdlib/forms.js`) hält den Widget-Baum und alle Eigenschaften selbst. Getter, Voreinstellungen, Warnungen und Fehlermeldungen entsprechen dem echten guizero unter Linux (Tk 8.6). Es rechnet **keine Pixel**: nur, welche Kinder ein Container in welcher Reihenfolge oder Gitterzelle zeigt. Zeichnen, Pixel-Layout und Eingaben sind Sache des Hosts.

## Befehle: `host.forms(op, data, task)`

`data` ist ein einfaches Objekt (Listen als Arrays, `None` als `null`). Farben kommen immer als `#rrggbb` (oder `null` = Standard). Die Rückgabe wird ignoriert, außer bei `image`.

| op | data | Bedeutung |
|---|---|---|
| `create` | `id, kind, parent, props` | neues Widget mit **allen** Eigenschaften; `parent` ist die id des Containers (bei Fenstern und Menüleisten die des Besitzers, beim App `null`) |
| `set` | `id, props` | geänderte Eigenschaften (nur die genannten) |
| `layout` | `id, layout, children` | was ein Container zeigt, s. u.; kommt nach jeder Änderung neu und vollständig |
| `destroy` | `id` | Widget samt Kindern entfernen; bei der App alle Fenster schließen und alle Zeitgeber stoppen |
| `display` | `id` (App) | `app.display()` beginnt: Fenster zeigen, ab jetzt Ereignisse schicken |
| `after` / `cancel` | `timer, ms` / `timer` | Zeitgeber anlegen (einmalig; `repeat` legt nach jedem Lauf einen neuen an) / löschen |
| `draw` / `undraw` / `clear` | `id, shape` / `id, shape` (Nummer) / `id` | Drawing: Form hinzufügen, löschen, alles löschen |
| `focus` | `id` | Widget bekommt den Tastaturfokus |
| `image` | `path` | Abfrage: `{ width, height }` der Bilddatei im Projekt oder `null` (dann `GUIZeroException` wie im Original) |

**Zeitpunkt:** Neue Widgets und Layouts schickt das Modul gesammelt, sobald das Programm wartet (`display()`, `update()`, Dialog, vor jedem nächsten Ereignis). Was bis dahin geändert wurde, steckt schon in `create`. `set`, `draw` usw. für bereits geschickte Widgets kommen sofort. Ein Widget ist unsichtbar, bis es im `layout` seines Containers steht. Endet ein Programm ohne `display()`, hat der Host nichts bekommen – wie beim echten guizero, wo das Fenster sofort wieder verschwindet.

### Arten (`kind`) und Eigenschaften (`props`)

Alle Widgets: `bg`, `enabled`, `width`, `height`, `events` (s. Maus). Text-Widgets zusätzlich `text_color` und `font` = `{ family, size, bold, italic, underline, overstrike }`.

| kind | weitere props | Einheit von width/height |
|---|---|---|
| `app`, `window` | `title, visible, full_screen, modal, layout, icon` | Pixel |
| `box` | `layout, border, border_color` | Pixel |
| `titlebox` | `layout, text, border` | Pixel |
| `text` | `text` | Zeichen / Zeilen |
| `textbox` | `value, multiline, scrollbar, hide_text` (`""`, `"*"` oder Zeichen), `wrap` | Zeichen / Zeilen |
| `pushbutton` | `text, image, padx, pady` | Zeichen (mit Bild: Pixel) |
| `checkbox` | `text, value` (0/1) | Zeichen |
| `buttongroup` | `value` (gewählter Wert), `horizontal`, `layout` (`grid`) | Pixel |
| `radiobutton` | `text, value` (eigener Wert); Kind einer `buttongroup`, gewählt, wenn er gleich deren `value` ist | Zeichen |
| `combo` | `options, value` | Zeichen |
| `listbox` | `items` (Texte), `selected` (Indizes), `multiselect, scrollbar` | Pixel |
| `slider` | `start, end, step, value, horizontal` | Länge × Dicke in Pixel |
| `picture` | `image` (Pfad im Projekt) | Pixel |
| `waffle` | `dim, pad, pixels` (Zeilen von `[farbe, dotty]`); Änderung eines Feldes als `set` mit `pixel: [x, y, farbe, dotty]` | Felder |
| `drawing` | `shapes` (Liste wie bei `draw`) | Pixel |
| `menubar` | `toplevel` (Menünamen), `options` (Einträge je Menü) | – |

`width`/`height` können `null` (automatisch) oder `"fill"` (Platz füllen) sein. Ein Waffle ist `width·(dim+pad)+pad` Pixel breit, Felder liegen bei `pad + x·(dim+pad)` – der Host muss das so zeichnen, weil das Modul Klicks danach umrechnet. Formen (`shape`): `{ id, type, coords, color, … }` mit `type` `line` (`width`), `oval`/`rectangle`/`polygon` (`outline`, `outline_color`), `text` (`text, font, max_width`), `image` (`image, width, height`); Ursprung oben links.

### Layout

`layout` = `"auto"` oder `"grid"`, `children` = sichtbare Kinder in Reihenfolge: `{ id, align }`, bei `grid` zusätzlich `grid: [spalte, zeile, spalten, zeilen]`.

- **auto** wie Tk `pack`: jedes Kind nimmt sich der Reihe nach einen Streifen vom übrigen Platz, an der Seite `align` (`top` ist Standard, `bottom`, `left`, `right`), zentriert. `width`/`height` `"fill"` dehnt in die Richtung aus.
- **grid** wie Tk `grid`: Das Gitter **wächst mit dem Inhalt**. Jede Spalte ist so breit, jede Zeile so hoch wie ihr größtes Kind; leere Zeilen und Spalten haben Größe 0. `align` klebt das Kind an die Seite der Zelle (sonst zentriert). Ungültige Zellen meldet schon das Modul (wie Tk: `bad column value …`).

## Warten auf Ereignisse

`app.display()` hält das Programm mit `task.wait = { kind: 'forms-event', poll: false, timers: [{ id, ms, due }] }` an (`due` = virtuelle Zeit in ms, nur für Testläufe). `app.update()` wartet genauso mit `poll: true`: der Host antwortet sofort mit dem nächsten anstehenden Ereignis oder `null`.

Der Host setzt mit `vm.resume(task, formsEvent(vm, art, ...))` fort (`formsEvent` aus dem Kern). `vm.resume(task, null)` beendet die Schleife (Stopp-Knopf): das App gilt als zerstört, `display()` kehrt zurück.

| art | Argumente | wirkt wie |
|---|---|---|
| `timer` | timer-id | Zeitgeber ist abgelaufen |
| `command` | id | Klick auf `pushbutton`, `checkbox` (schaltet um), `radiobutton` (wählt aus); ruft `command` |
| `change` | id, wert | `textbox`: neuer Text (kein `command`, das kommt mit `key` `release`); `slider`: Zahl; `combo`: Index; `listbox`: Liste der Indizes |
| `mouse` | id, typ, x, y, display_x, display_y | typ `press1`, `release1`, `press3`, `release3`, `double1`, `motion`, `drag1`, `enter`, `leave`; x/y relativ zum Widget |
| `key` | id, `press`/`release`, char, keysym, keycode | an das Widget mit Fokus (sonst an das Fenster); char wie Tk (`""` bei Pfeiltasten), keysym wie Tk (`a`, `Return`, `Up`, `space`) |
| `menu` | id, menü, eintrag | Menüeintrag gewählt (Indizes ab 0) |
| `close` | id | Schließknopf eines Fensters: ruft `when_closed`, sonst App zerstören bzw. Window verstecken |
| `resize` | id, width, height | neue Größe (Fenster immer melden, Widgets nur mit `configure` in `events`) |

Maus- und Tastenereignisse laufen wie bei Tk erst durch die Bindungen des Widgets, dann durch die seines Fensters (`app.when_clicked` sieht also Klicks auf alle Widgets). `events` nennt, was ein Widget auswertet (`press1`, `motion`, `keypress`, `configure` …). Klicks und Tasten darf der Host immer schicken, `motion`, `drag1`, `enter`, `leave` bitte nur, wenn das Widget oder sein Fenster sie in `events` hat. Ein echter Mausklick auf einen Knopf ist `press1`, `release1`, dann `command`; ein Doppelklick schickt statt des zweiten `press1` ein `double1`. Ereignisse für abgeschaltete Widgets (`enabled: false`) führen kein `command`/`change` aus.

**Dialoge** (`info`, `warn`, `error`, `yesno`, `question`, `select_file`, `select_folder`, `select_color`, auch als Methoden von App/Window) warten mit `{ kind: 'forms-dialog', dialog, title, text, initial }`, `dialog` ist `info`, `warn`, `error`, `yesno`, `question`, `open_file`, `save_file`, `folder` oder `color`. Antwort: `null` für Hinweise und Abbrechen, `true`/`false` bei `yesno`, Text bei `question` und Dateien (Pfad im Projekt), `#rrggbb` bei `color`. Während ein Dialog offen ist, laufen keine Zeitgeber.

## Ende

Schließt der Nutzer das App-Fenster (`close` mit der App-id), zerstört das Modul die App (oder ruft `when_closed`), schickt `destroy` und `display()` kehrt zurück; das Programm läuft danach weiter und endet meist. Weitere Fenster (`Window`) werden beim Schließen nur versteckt. Fehler in Rückruffunktionen beenden das Programm mit der üblichen Fehlermeldung (Tk würde sie nur ausgeben und weiterlaufen).

**Ohne Host** (`runToEnd`, Tests): Zeitgeber laufen auf der virtuellen Uhr in der Reihenfolge ihrer Fälligkeit, ohne Zeitgeber endet `display()`. Dialoge bekommen `null` (`yesno`: `False`).

## Tests

- `packages/core/test/guizero.test.js`: Programme in `test/data/guizero/*.py` gegen die Ausgaben des echten guizero (`*.out`, erzeugt mit `scripts/gen-guizero-golden.sh`, braucht python3.12 mit tkinter, guizero 1.6 und Xvfb). Benutzeraktionen kommen aus `guisim.py`: in CPython über tkinter, in Natter über `guizero._sim`.
- `packages/core/test/forms.test.js`: ein aufzeichnender Host prüft Befehle, Ereignisse, Dialoge und Zeitgeber.
- Farbnamen: `stdlib/tkcolors.js`, erzeugt mit `scripts/gen-tk-colors.py`.
