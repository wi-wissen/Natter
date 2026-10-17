// string: the constants and capwords.
export default String.raw`
ascii_lowercase = "abcdefghijklmnopqrstuvwxyz"
ascii_uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
ascii_letters = ascii_lowercase + ascii_uppercase
digits = "0123456789"
hexdigits = "0123456789abcdefABCDEF"
octdigits = "01234567"
punctuation = "!" + chr(34) + "#$%&'()*+,-./:;<=>?@[" + chr(92) + "]^_" + chr(96) + "{|}~"
whitespace = " " + chr(9) + chr(10) + chr(13) + chr(11) + chr(12)
printable = digits + ascii_letters + punctuation + whitespace


def capwords(s, sep=None):
    return (" " if sep is None else sep).join(w.capitalize() for w in s.split(sep))
`;
