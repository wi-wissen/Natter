name = input("Name? ")
print("Hello,", name)
age = int(input("Age: "))
print(age + 1)
words = input().split()
print(len(words), words)
total = 0
while True:
    line = input("number (empty to stop): ")
    if line == "":
        break
    try:
        total += int(line)
    except ValueError:
        print("not a number:", line)
print("total", total)
try:
    input("more? ")
except EOFError as e:
    print()
    print("EOF:", e)
