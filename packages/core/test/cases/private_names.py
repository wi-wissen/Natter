# Private names: __x inside a class becomes _Class__x (name mangling)
class Konto:
    __anzahl = 0

    def __init__(self, inhaber, stand):
        self.inhaber = inhaber
        self.__stand = stand
        Konto.__anzahl += 1

    def __pruefen(self, betrag):
        return 0 < betrag <= self.__stand

    def abheben(self, betrag):
        if self.__pruefen(betrag):
            self.__stand -= betrag
        return self.__stand

    @classmethod
    def anzahl(cls):
        return cls.__anzahl


k = Konto("Ada", 100)
print(k.abheben(30), k.abheben(500))
print(k._Konto__stand, Konto.anzahl(), Konto._Konto__anzahl)
print(sorted(n for n in vars(k)))
print(Konto._Konto__pruefen.__name__)
try:
    print(k.__stand)
except AttributeError as e:
    print("AttributeError", e)
k.__stand = 1          # outside a class: no mangling, a new attribute
print(k.__stand, k._Konto__stand)


class _Intern:
    def __init__(self):
        self.__x = 1
        self.__dunder__ = 2


print(sorted(vars(_Intern())))


class Sparkonto(Konto):
    def __init__(self):
        super().__init__("Bob", 10)
        self.__stand = 99    # its own name: _Sparkonto__stand


s = Sparkonto()
print(s._Konto__stand, s._Sparkonto__stand)


class Rechner:
    def rechne(self, __a, *, __b=2):
        return __a * __b

    def aufruf(self):
        try:
            return self.rechne(3, __b=5)     # keyword names in calls are not mangled
        except TypeError:
            return "TypeError"


print(Rechner().rechne(4), Rechner().aufruf())


def außen(__y):
    return __y + 1


print(außen(1))
