// _http: one native call that asks the host to do an HTTP request (the page uses fetch). The program waits;
// the host resumes it with a tuple: ('ok', status, reason, headers, text, url) or ('error', kind, message),
// kind being 'cors', 'network', 'timeout' or 'blocked'. See httpResult() for building that value.

import { PyTuple, PyDict, Suspend } from '../values.js';
import { params, needStr } from '../args.js';

export const HTTP_NATIVES = {
  '_http.request'(ctx, args, kw) {
    const [method, url, headers, body, timeout] = params('request', args, kw, ['method', 'url', 'headers', 'body', 'timeout']);
    const h = {};
    if (headers instanceof PyDict) for (const [k, v] of headers.entries()) h[String(k)] = String(v);
    return new Suspend({
      kind: 'http', method: needStr(method, 'method'), url: needStr(url, 'url'), headers: h,
      body: body === null || body === undefined ? null : String(body), timeout: timeout === null ? null : Number(typeof timeout === 'number' ? timeout : timeout.v),
    });
  },
};
export const HTTP_NAMES = ['request'];

/** For the host: the value to resume a waiting request with. */
export function httpResult(r) {
  if (r.error) return new PyTuple(['error', r.error, r.message ?? '']);
  const headers = new PyDict();
  for (const [k, v] of Object.entries(r.headers ?? {})) headers.set(k, v);
  return new PyTuple(['ok', r.status, r.reason ?? '', headers, r.text ?? '', r.url ?? '']);
}
