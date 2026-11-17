import csv

with open("songs.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["titel", "kuenstler", "dauer"])
    w.writerow(["Hallo, Welt", 'Sag "Hi"', 215])
    w.writerows([["Zeile\nzwei", "B", 3.5], ["", None, 0]])
    w.writerow([""])

with open("songs.csv", newline="") as f:
    for row in csv.reader(f):
        print(row)

with open("songs.csv", newline="") as f:
    leser = csv.DictReader(f)
    print(leser.fieldnames)
    for row in leser:
        print(row["titel"], "|", row["dauer"])

with open("noten.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=["name", "note"], delimiter=";")
    w.writeheader()
    w.writerow({"name": "Ada", "note": 1})
    w.writerow({"name": "Bob"})
    try:
        w.writerow({"name": "Eve", "alter": 17})
    except ValueError as e:
        print("ValueError", e)

with open("noten.csv", newline="") as f:
    print(list(csv.reader(f, delimiter=";")))

zeilen = ["a, b,c", '"x""y",  "z"', "", "1,2"]
print(list(csv.reader(zeilen)))
print(list(csv.reader(zeilen, skipinitialspace=True)))
print(list(csv.reader(["1,2.5,'a'"], quoting=csv.QUOTE_NONNUMERIC, quotechar="'")))
print(list(csv.reader(["a\tb c"], dialect="excel-tab")))
print(list(csv.DictReader(["x,y", "1,2,3", "4"], restkey="mehr", restval="-")))
