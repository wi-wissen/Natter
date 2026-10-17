# Host-Schnittstelle: turtle und kara

Die Module `turtle` und `kara` rechnen im Interpreter. Gezeichnet wird vom Host (Browser). Der Kern kennt kein DOM.

## Gemeinsam

- Der Host gibt beim Erzeugen der VM ein Objekt `host` mit. Seine Rückgabe ist jeweils die **Wartezeit in Sekunden** für die Animation (Zahl > 0) oder nichts. Das Programm schläft so lange (virtuelle Uhr, `vm.virtualMs`). Ohne Host-Funktion läuft alles sofort.
- Zahlen kommen als normale JavaScript-Zahlen an, Tupel und Listen als Arrays.

## turtle: `host.turtle(kind, args, task)`

Jede Schildkröte hat eine Nummer `id` (ab 1). Ereignisse, in der Reihenfolge, in der das Programm sie auslöst:

| kind | args |
|---|---|
| `new` | id, shape, pencolor, fillcolor |
| `move` | id, x0, y0, x1, y1, pendown, pencolor, pensize, speed (0 = sofort) |
| `turn` | id, heading_alt, heading_neu, speed |
| `dot` | id, x, y, size, color |
| `begin_fill` / `fill` | id / id, [[x, y], …], color |
| `write` | id, x, y, text, align, [font, size, style], color |
| `stamp` / `clearstamp(s)` | id, … |
| `pen` | id, pencolor, fillcolor, pensize |
| `visible`, `shape`, `shapesize`, `speed` | id, Wert … |
| `clear`, `reset` | id |
| `bgcolor`, `title`, `setup(width, height)`, `tracer(n, delay)`, `update`, `mode`, `world`, `bye`, `clearscreen`, `bgpic` | Bildschirm |

Farben kommen als CSS-Name oder `#rrggbb`. Koordinaten sind die der Turtle (Ursprung Mitte, y nach oben); die Umrechnung macht der Host.

Ereignisse (Tasten, Klicks, Zeitgeber): `mainloop()`/`done()`/`exitonclick()` warten mit `task.wait = { kind: 'turtle-event', timers: [{ id, ms }] }`. Der Host setzt das Programm mit `vm.resume(task, turtleEvent(vm, 'key', 'Left'))` fort, ebenso `'keyrelease'`, `'click', x, y` und `'timer', id`. `vm.resume(task, null)` beendet die Schleife. `textinput`/`numinput` warten wie `input()` (`wait.dialog` nennt die Art).

## kara: `host.kara(kind, args, task)`

| kind | args |
|---|---|
| `world` | Bild der Wiese als Text (eine Zeile je Reihe) |
| `move` | x, y (neu), Richtung (0 rechts, 1 oben, 2 links, 3 unten) |
| `push` | x, y (Kara), x2, y2 (Pilz), Richtung |
| `turn` | Richtung, `'left'`/`'right'` |
| `put`, `remove` | x, y |
| `crash` | `'tree'`, `'edge'`, `'mushroom'`, `'berryThere'`, `'noBerry'` (kurz vor dem Fehler) |

Der Zustand liegt in `vm.kara`; `worldText(vm.kara)` (aus `stdlib/kara.js`) liefert das aktuelle Bild. Die Befehle gibt es als Modul (`import kara`) und als vorbelegte Namen: `karaGlobals()` an `runToEnd` oder die VM (`globals`) übergeben, dann laufen Programme wie im Buch ohne Import. Fehler heißen `err.script.kara.<was>` (Deutsch und Englisch in `messages.js`).

## requests: `task.wait.kind === 'http'`

`requests.get(...)` und Verwandte halten das Programm mit `task.wait = { kind: 'http', method, url, headers, body, timeout }` an. Der Host führt die Anfrage mit `fetch` aus und setzt mit `vm.resume(task, httpResult(r))` fort (`httpResult` kommt aus dem Kern). `r` ist `{ status, reason, headers, text, url }` oder bei einem Fehler `{ error: 'cors' | 'network' | 'timeout' | 'blocked', message }`. Ein `fetch`, das mit `TypeError` scheitert, ist im Browser meist ein CORS-Fehler (Server erlaubt keinen Zugriff von Webseiten): dann `error: 'cors'`, und die Fehlermeldung erklärt das.
