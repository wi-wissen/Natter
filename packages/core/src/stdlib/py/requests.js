// requests: the usual get/post calls of the requests package, done by the host (fetch in the browser).
// A browser only lets a page read answers from servers that allow it (CORS); when the host reports that, the error says so.
export default String.raw`
import _http
import json as _json


class RequestException(IOError):
    def __init__(self, *args, **kwargs):
        self.response = kwargs.pop("response", None)
        self.request = kwargs.pop("request", None)
        IOError.__init__(self, *args)


class ConnectionError(RequestException):
    pass


class Timeout(RequestException):
    pass


class ConnectTimeout(ConnectionError, Timeout):
    pass


class ReadTimeout(Timeout):
    pass


class HTTPError(RequestException):
    pass


class InvalidURL(RequestException, ValueError):
    pass


class MissingSchema(RequestException, ValueError):
    pass


class JSONDecodeError(RequestException, _json.JSONDecodeError):
    def __init__(self, msg, doc, pos):
        _json.JSONDecodeError.__init__(self, msg, doc, pos)


class _Exceptions:
    RequestException = RequestException
    ConnectionError = ConnectionError
    Timeout = Timeout
    ConnectTimeout = ConnectTimeout
    ReadTimeout = ReadTimeout
    HTTPError = HTTPError
    InvalidURL = InvalidURL
    MissingSchema = MissingSchema
    JSONDecodeError = JSONDecodeError


exceptions = _Exceptions


class _Codes:
    ok = 200
    created = 201
    accepted = 202
    no_content = 204
    moved_permanently = 301
    found = 302
    not_modified = 304
    bad_request = 400
    unauthorized = 401
    forbidden = 403
    not_found = 404
    too_many_requests = 429
    internal_server_error = 500
    bad_gateway = 502
    service_unavailable = 503


codes = _Codes


def _quote(s, safe=""):
    out = []
    for ch in str(s):
        if ch.isalnum() and ord(ch) < 128 or ch in "-._~" or ch in safe:
            out.append(ch)
        else:
            for b in _utf8(ch):
                out.append("%" + "0123456789ABCDEF"[b // 16] + "0123456789ABCDEF"[b % 16])
    return "".join(out)


def _utf8(ch):
    c = ord(ch)
    if c < 0x80:
        return [c]
    if c < 0x800:
        return [0xC0 | (c >> 6), 0x80 | (c & 0x3F)]
    if c < 0x10000:
        return [0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F)]
    return [0xF0 | (c >> 18), 0x80 | ((c >> 12) & 0x3F), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F)]


def _urlencode(data):
    items = data.items() if isinstance(data, dict) else data
    parts = []
    for k, v in items:
        if isinstance(v, (list, tuple)):
            for x in v:
                parts.append(_quote(k) + "=" + _quote(x))
        else:
            parts.append(_quote(k) + "=" + _quote(v))
    return "&".join(parts)


class Response:
    def __init__(self, status, reason, headers, text, url):
        self.status_code = status
        self.reason = reason
        self.headers = headers
        self.text = text
        self.url = url
        self.encoding = "utf-8"
        self.history = []

    @property
    def ok(self):
        return self.status_code < 400

    @property
    def content(self):
        raise NotImplementedError("binary content is not available here, use .text")

    def json(self, **kw):
        try:
            return _json.loads(self.text, **kw)
        except _json.JSONDecodeError as e:
            raise JSONDecodeError(e.msg, e.doc, e.pos)

    def raise_for_status(self):
        if 400 <= self.status_code < 500:
            raise HTTPError(str(self.status_code) + " Client Error: " + self.reason + " for url: " + self.url, response=self)
        if 500 <= self.status_code < 600:
            raise HTTPError(str(self.status_code) + " Server Error: " + self.reason + " for url: " + self.url, response=self)

    def iter_lines(self):
        return iter(self.text.splitlines())

    def __bool__(self):
        return self.ok

    def __repr__(self):
        return "<Response [" + str(self.status_code) + "]>"


def request(method, url, params=None, data=None, headers=None, json=None, timeout=None, auth=None, allow_redirects=True, **kw):
    if not isinstance(url, str):
        raise InvalidURL("Invalid URL " + repr(url))
    if not (url.startswith("http://") or url.startswith("https://")):
        raise MissingSchema("Invalid URL " + repr(url) + ": No scheme supplied. Perhaps you meant https://" + url + "?")
    h = {}
    if headers:
        h.update(headers)
    if params:
        url += ("&" if "?" in url else "?") + _urlencode(params)
    body = None
    if json is not None:
        body = _json.dumps(json)
        h.setdefault("Content-Type", "application/json")
    elif data is not None:
        if isinstance(data, (dict, list, tuple)):
            body = _urlencode(data)
            h.setdefault("Content-Type", "application/x-www-form-urlencoded")
        else:
            body = str(data)
    if auth is not None:
        h["Authorization"] = "Basic " + _b64(auth[0] + ":" + auth[1])
    r = _http.request(method.upper(), url, h, body, timeout)
    if r[0] == "error":
        kind = r[1]
        if kind == "cors":
            raise ConnectionError("The browser blocked the answer of " + url + ". Web pages may only read answers from servers that allow it (CORS), and this server does not. Use a source that allows access from web pages, or run the program on your own computer.")
        if kind == "timeout":
            raise Timeout("The request to " + url + " took longer than " + str(timeout) + " seconds.")
        if kind == "blocked":
            raise ConnectionError("Requests to " + url + " are not allowed here.")
        raise ConnectionError("Could not reach " + url + ". " + r[2])
    return Response(r[1], r[2], r[3], r[4], r[5] or url)


def _b64(s):
    table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    data = []
    for ch in s:
        data.extend(_utf8(ch))
    out = []
    for i in range(0, len(data), 3):
        chunk = data[i:i + 3]
        n = (chunk[0] << 16) | ((chunk[1] if len(chunk) > 1 else 0) << 8) | (chunk[2] if len(chunk) > 2 else 0)
        out.append(table[(n >> 18) & 63] + table[(n >> 12) & 63] + (table[(n >> 6) & 63] if len(chunk) > 1 else "=") + (table[n & 63] if len(chunk) > 2 else "="))
    return "".join(out)


def get(url, params=None, **kw):
    return request("GET", url, params=params, **kw)


def post(url, data=None, json=None, **kw):
    return request("POST", url, data=data, json=json, **kw)


def put(url, data=None, **kw):
    return request("PUT", url, data=data, **kw)


def patch(url, data=None, **kw):
    return request("PATCH", url, data=data, **kw)


def delete(url, **kw):
    return request("DELETE", url, **kw)


def head(url, **kw):
    return request("HEAD", url, **kw)


class Session:
    def __init__(self):
        self.headers = {}
        self.params = {}

    def request(self, method, url, **kw):
        h = dict(self.headers)
        h.update(kw.pop("headers", None) or {})
        p = dict(self.params)
        p.update(kw.pop("params", None) or {})
        return request(method, url, params=p, headers=h, **kw)

    def get(self, url, **kw):
        return self.request("GET", url, **kw)

    def post(self, url, **kw):
        return self.request("POST", url, **kw)

    def close(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False
`;
