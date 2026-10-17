// Example programs of the demo page.
const Q = '"""';

export const EXAMPLES = [
  { id: 'square', title: 'Turtle: Quadrat', code: `import turtle

t = turtle.Turtle()
t.shape("turtle")
t.pensize(4)
t.color("royalblue")
for i in range(4):
    t.forward(150)
    t.left(90)
print("Fertig:", t.pos())
` },
  { id: 'spiral', title: 'Turtle: Spirale', code: `import turtle

turtle.bgcolor("black")
t = turtle.Turtle()
t.speed(0)
t.width(2)
farben = ["red", "orange", "yellow", "lime", "deepskyblue", "violet"]
for i in range(180):
    t.pencolor(farben[i % 6])
    t.forward(i * 2)
    t.left(59)
t.hideturtle()
` },
  { id: 'fill', title: 'Turtle: Füllen und Text', code: `from turtle import *

speed(0)
color("darkred", "gold")
begin_fill()
for i in range(5):
    forward(200)
    right(144)
end_fill()

penup()
goto(-120, -160)
pendown()
fillcolor("skyblue")
begin_fill()
circle(50)
end_fill()
dot(30, "crimson")
penup()
goto(0, 120)
write("Hallo Turtle!", align="center", font=("Arial", 24, "bold"))
hideturtle()
` },
  { id: 'keys', title: 'Turtle: Tasten und Klicks', code: `import turtle

t = turtle.Turtle()
t.shape("turtle")
t.speed(0)
screen = turtle.Screen()
screen.title("Pfeiltasten oder tippen")

def links():
    t.left(30)

def rechts():
    t.right(30)

def vor():
    t.forward(20)

def klick(x, y):
    t.goto(x, y)
    print("Klick bei", x, y)

screen.onkeypress(links, "Left")
screen.onkeypress(rechts, "Right")
screen.onkeypress(vor, "Up")
screen.onscreenclick(klick)
screen.listen()
screen.mainloop()
` },
  { id: 'kara-tree', title: 'Kara: bis zum Baum', code: `world(${Q}
##########
#@       #
#        #
#   .   ##
##########
${Q})
while not treeFront():
    move()
turnRight()
move()
move()
turnLeft()
while not onBerry():
    move()
removeBerry()
print("Beere gefunden!")
` },
  { id: 'kara-mushroom', title: 'Kara: Pilz schieben', code: `world(${Q}
#########
#@  $  .#
#       #
#########
${Q})
while not mushroomFront():
    move()
for i in range(3):
    move()
print("Der Pilz liegt auf der Beere.")
` },
  { id: 'kara-crash', title: 'Kara: gegen den Baum', code: `world(${Q}
#######
#@  # #
#######
${Q})
for i in range(5):
    move()
` },
  { id: 'input', title: 'Konsole: input()', code: `name = input("Wie heißt du? ")
alter = int(input("Wie alt bist du? "))
print("Hallo", name + "!", "In 10 Jahren bist du", alter + 10)
` },
  { id: 'error', title: 'Konsole: Fehler', code: `zahlen = [1, 2, 3]
summe = 0
for z in zahlen:
    summe = summe + z
print("Summe:", summe)
print(sume)
` },
  { id: 'loop', title: 'Konsole: Endlosschleife', code: `i = 0
while True:
    i = i + 1
` },
];
