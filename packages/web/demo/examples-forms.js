// Example programs of the demo page for forms (guizero) and plots (numpy + matplotlib).

export const FORMS_EXAMPLES = [
  { id: 'forms-counter', title: 'Formular: Zähler', code: `from guizero import App, Text, PushButton, Box

app = App(title="Zähler", width=300, height=200)
anzeige = Text(app, text="0", size=40)

def plus():
    anzeige.value = int(anzeige.value) + 1

def minus():
    anzeige.value = int(anzeige.value) - 1

knoepfe = Box(app)
PushButton(knoepfe, text="−", command=minus, align="left", width=4)
PushButton(knoepfe, text="+", command=plus, align="left", width=4)
PushButton(app, text="Zurücksetzen", command=lambda: setattr(anzeige, "value", 0))
app.display()
` },
  { id: 'forms-temp', title: 'Formular: Temperatur umrechnen', code: `from guizero import App, Text, TextBox, Combo, PushButton, Box

app = App(title="Temperatur", width=360, height=260, layout="grid")

Text(app, text="Temperatur:", grid=[0, 0], align="left")
eingabe = TextBox(app, text="20", width=8, grid=[1, 0], align="left")
Text(app, text="Richtung:", grid=[0, 1], align="left")
richtung = Combo(app, options=["°C → °F", "°F → °C"], grid=[1, 1], align="left")
ergebnis = Text(app, text="", size=18, color="darkgreen", grid=[0, 3, 2, 1])

def rechnen():
    try:
        wert = float(eingabe.value.replace(",", "."))
    except ValueError:
        ergebnis.text_color = "red"
        ergebnis.value = "Bitte eine Zahl eingeben"
        return
    ergebnis.text_color = "darkgreen"
    if richtung.value == "°C → °F":
        ergebnis.value = f"{wert:.1f} °C = {wert * 9 / 5 + 32:.1f} °F"
    else:
        ergebnis.value = f"{wert:.1f} °F = {(wert - 32) * 5 / 9:.1f} °C"

PushButton(app, text="Umrechnen", command=rechnen, grid=[0, 2, 2, 1])
eingabe.when_key_released = lambda e: rechnen() if e.key == "\\r" else None
rechnen()
app.display()
` },
  { id: 'forms-quiz', title: 'Formular: Quiz', code: `from guizero import App, Text, ButtonGroup, PushButton, info, yesno

fragen = [
    ("Wie viele Bits hat ein Byte?", ["4", "8", "16"], "8"),
    ("Welche Zahl ist eine Primzahl?", ["21", "27", "29"], "29"),
    ("Was gibt len('Natter') aus?", ["5", "6", "7"], "6"),
]
stand = {"nr": 0, "punkte": 0}

app = App(title="Quiz", width=380, height=260)
kopf = Text(app, text="", size=11, color="gray")
frage = Text(app, text="", size=15)
wahl = ButtonGroup(app, options=["-"])
knopf = PushButton(app, text="Antworten")

def zeigen():
    f, optionen, _ = fragen[stand["nr"]]
    kopf.value = f"Frage {stand['nr'] + 1} von {len(fragen)}"
    frage.value = f
    wahl.clear()
    for o in optionen:
        wahl.append(o)
    wahl.value = None

def antworten():
    if not wahl.value:
        app.warn("Quiz", "Bitte wähle eine Antwort.")
        return
    if wahl.value == fragen[stand["nr"]][2]:
        stand["punkte"] += 1
        info("Richtig!", "Gut gemacht.")
    else:
        info("Leider falsch", "Richtig ist " + fragen[stand["nr"]][2] + ".")
    stand["nr"] += 1
    if stand["nr"] < len(fragen):
        zeigen()
    elif yesno("Fertig", f"{stand['punkte']} von {len(fragen)} Punkten. Nochmal?"):
        stand["nr"] = 0
        stand["punkte"] = 0
        zeigen()
    else:
        app.destroy()

knopf.update_command(antworten)
zeigen()
app.display()
print("Quiz beendet:", stand["punkte"], "Punkte")
` },
  { id: 'forms-todo', title: 'Formular: To-do-Liste', code: `from guizero import App, Box, TextBox, PushButton, ListBox, Text

app = App(title="To-do", width=360, height=380)
Text(app, text="Meine Aufgaben", size=16)
zeile = Box(app, width="fill")
neu = TextBox(zeile, width="fill", align="left")
liste = ListBox(app, items=["Hausaufgaben", "Fahrrad flicken"], width="fill", height="fill", scrollbar=True)
status = Text(app, text="", color="gray")

def zaehlen():
    status.value = f"{len(liste.items)} Aufgaben"

def hinzu():
    if neu.value.strip():
        liste.append(neu.value.strip())
        neu.value = ""
        zaehlen()
    neu.focus()

def erledigt():
    if liste.value is not None:
        liste.remove(liste.value)
        zaehlen()

PushButton(zeile, text="Hinzufügen", command=hinzu, align="right")
PushButton(app, text="Erledigt", command=erledigt, align="bottom")
neu.when_key_released = lambda e: hinzu() if e.key == "\\r" else None
zaehlen()
app.display()
` },
  { id: 'forms-clock', title: 'Formular: Uhr mit Zeitgeber', code: `from guizero import App, Text, PushButton
from datetime import datetime

app = App(title="Uhr", width=320, height=180, bg="#1e293b")
uhr = Text(app, text="", size=36, color="white", font="Courier")
sekunden = Text(app, text="0 s gelaufen", color="#94a3b8")
gelaufen = [0]

def ticken():
    uhr.value = datetime.now().strftime("%H:%M:%S")

def zaehlen():
    gelaufen[0] += 1
    sekunden.value = f"{gelaufen[0]} s gelaufen"

ticken()
uhr.repeat(250, ticken)
sekunden.repeat(1000, zaehlen)
PushButton(app, text="Stopp", command=app.destroy)
app.display()
` },
  { id: 'forms-grid', title: 'Formular: Raster und Fenster', code: `from guizero import App, Window, Box, TitleBox, Text, TextBox, CheckBox, Slider, PushButton, Drawing, Waffle, MenuBar

app = App(title="Anmeldung", width=460, height=420)
MenuBar(app, toplevel=["Datei", "Hilfe"], options=[
    [["Neues Fenster", lambda: fenster.show()], ["Beenden", app.destroy]],
    [["Über", lambda: app.info("Über", "Natter + guizero")]],
])
form = TitleBox(app, text="Daten", layout="grid")
Text(form, text="Name:", grid=[0, 0], align="left")
name = TextBox(form, width=20, grid=[1, 0, 2, 1], align="left")
Text(form, text="Alter:", grid=[0, 1], align="left")
alter = Slider(form, start=10, end=20, grid=[1, 1], align="left")
news = CheckBox(form, text="Newsletter", grid=[1, 2], align="left")
ausgabe = Text(app, text="")

def senden():
    ausgabe.value = f"{name.value or '?'}, {alter.value} Jahre, Newsletter: {'ja' if news.value else 'nein'}"

PushButton(app, text="Senden", command=senden)

bild = Drawing(app, width=200, height=80)
bild.rectangle(10, 10, 190, 70, color="lightyellow", outline=2, outline_color="orange")
bild.oval(20, 20, 60, 60, color="tomato")
bild.text(75, 30, "Malen!", size=14)
bild.when_clicked = lambda e: bild.oval(e.x - 4, e.y - 4, e.x + 4, e.y + 4, color="royalblue")

fenster = Window(app, title="Waffel", width=260, height=200)
fenster.hide()
waffel = Waffle(fenster, width=6, height=4, command=lambda x, y: waffel.set_pixel(x, y, "seagreen"))
app.display()
` },
  { id: 'plot-sincos', title: 'Plot: Sinus und Kosinus (numpy)', code: `import numpy as np
import matplotlib.pyplot as plt

x = np.linspace(0, 2 * np.pi, 200)
plt.plot(x, np.sin(x), label="sin(x)")
plt.plot(x, np.cos(x), "--", label="cos(x)")
plt.axhline(0, color="gray", linewidth=0.8)
plt.title("Sinus und Kosinus")
plt.xlabel("x")
plt.legend()
plt.grid(True)
plt.show()
` },
  { id: 'plot-bars', title: 'Plot: Balken und Histogramm', code: `import numpy as np
import matplotlib.pyplot as plt

faecher = ["Mathe", "Deutsch", "Info", "Bio"]
noten = [2.3, 1.7, 1.3, 2.0]
plt.bar(faecher, noten, color=["C0", "C1", "C2", "C3"])
plt.title("Notenschnitt")
plt.show()

rng = np.random.default_rng(1)
werte = rng.normal(170, 8, 500)
plt.hist(werte, bins=20, edgecolor="white")
plt.title("Körpergröße (cm)")
plt.savefig("groesse.png")
plt.show()
` },
];
