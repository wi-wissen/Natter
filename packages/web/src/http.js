// requests in the browser: the wait { kind: 'http', method, url, headers, body, timeout } done with fetch.
// A fetch that fails with TypeError is in a browser almost always CORS (the server does not allow web pages to read it).

import { httpResult } from '@natter/core';

/**
 * Do the request and return the plain result object (see docs/HOST-TURTLE-KARA.md, requests).
 * @param {{ method: string, url: string, headers?: Record<string,string>, body?: string|null, timeout?: number|null }} wait
 * @param {{ fetch?: typeof fetch, signal?: AbortSignal, abort?: () => void, timeout?: number }} [opts]
 * @returns {Promise<{ status?: number, reason?: string, headers?: Record<string,string>, text?: string, url?: string, error?: string, message?: string }>}
 */
export async function doHttp(wait, opts = {}) {
  const f = opts.fetch ?? (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
  if (!f) return { error: 'network', message: 'No network in this page.' };
  let url;
  try { url = new URL(wait.url, typeof location !== 'undefined' ? location.href : undefined); } catch {
    return { error: 'network', message: `Invalid URL: ${wait.url}` };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { error: 'blocked', message: `Only http and https addresses are allowed: ${wait.url}` };
  const seconds = wait.timeout ?? opts.timeout ?? 30;
  let timedOut = false;
  const timer = seconds > 0 ? setTimeout(() => { timedOut = true; opts.abort?.(); }, seconds * 1000) : null;
  try {
    const method = (wait.method || 'GET').toUpperCase();
    const res = await f(url.href, {
      method, headers: wait.headers ?? {}, signal: opts.signal,
      body: method === 'GET' || method === 'HEAD' || wait.body === null || wait.body === undefined ? undefined : wait.body,
    });
    const text = await res.text();
    const headers = {};
    res.headers.forEach((v, k) => { headers[k] = v; });
    return { status: res.status, reason: res.statusText || REASONS[res.status] || '', headers, text, url: res.url || url.href };
  } catch (e) {
    if (timedOut) return { error: 'timeout', message: `No answer after ${seconds} s` };
    if (e?.name === 'AbortError') return { error: 'network', message: 'Request cancelled' };
    if (e instanceof TypeError) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return { error: 'network', message: 'No internet connection' };
      return { error: 'cors', message: String(e.message ?? e) };
    }
    return { error: 'network', message: String(e?.message ?? e) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** The value to resume a waiting request with (a Python tuple, see httpResult in the core). */
export async function httpWait(wait, opts) {
  return httpResult(await doHttp(wait, opts));
}

const REASONS = { 200: 'OK', 201: 'Created', 204: 'No Content', 301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 429: 'Too Many Requests', 500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable' };
