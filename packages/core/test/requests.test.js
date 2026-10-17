import { describe, it, expect } from 'vitest';
import { runToEnd } from '../src/index.js';

const ok = (text, status = 200, reason = 'OK') => ({ status, reason, text, headers: { 'content-type': 'application/json' }, url: 'https://api.example.org/x' });

describe('requests', () => {
  it('get with params, json and status', () => {
    const calls = [];
    const r = runToEnd('import requests\nr = requests.get("https://api.example.org/x", params={"q": "ä b", "n": 2})\nprint(r.status_code, r.ok, r.json()["name"], r.headers["content-type"], r)\nr.raise_for_status()\n', { http: (w) => { calls.push(w); return ok('{"name": "Ada"}'); } });
    expect(r.error).toBeNull();
    expect(r.output).toBe('200 True Ada application/json <Response [200]>\n');
    expect(calls[0]).toMatchObject({ method: 'GET', url: 'https://api.example.org/x?q=%C3%A4%20b&n=2' });
  });
  it('post sends json with a header', () => {
    let seen;
    runToEnd('import requests\nrequests.post("https://a.org/p", json={"a": [1, 2]}, headers={"X-Key": "k"}, timeout=5)\n', { http: (w) => { seen = w; return ok('{}'); } });
    expect(seen).toMatchObject({ method: 'POST', body: '{"a": [1, 2]}', timeout: 5, headers: { 'Content-Type': 'application/json', 'X-Key': 'k' } });
  });
  it('HTTP errors are raised by raise_for_status', () => {
    const r = runToEnd('import requests\ntry:\n    requests.get("https://a.org/x").raise_for_status()\nexcept requests.exceptions.HTTPError as e:\n    print(e)\n', { http: () => ok('', 404, 'Not Found') });
    expect(r.output).toBe('404 Client Error: Not Found for url: https://api.example.org/x\n');
  });
  it('a blocked answer explains CORS and can be caught as RequestException', () => {
    const r = runToEnd('import requests\ntry:\n    requests.get("https://a.org/x")\nexcept requests.exceptions.RequestException as e:\n    print(type(e).__name__, "CORS" in str(e))\n', { http: () => ({ error: 'cors' }) });
    expect(r.output).toBe('ConnectionError True\n');
  });
  it('bad json and bad urls', () => {
    const r = runToEnd('import requests\ntry:\n    requests.get("https://a.org/x").json()\nexcept ValueError as e:\n    print(type(e).__name__)\ntry:\n    requests.get("a.org")\nexcept requests.exceptions.MissingSchema as e:\n    print("schema")\n', { http: () => ok('<html>') });
    expect(r.output).toBe('JSONDecodeError\nschema\n');
  });
  it('without a host there is no network', () => {
    const r = runToEnd('import requests\nrequests.get("https://a.org/")\n');
    expect(r.error.kind).toBe('ConnectionError');
  });
});
