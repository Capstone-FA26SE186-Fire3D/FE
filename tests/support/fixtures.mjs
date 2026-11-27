import assert from 'node:assert/strict';

export function replace(t, target, key, value) {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, { configurable: true, writable: true, value });
  t.after(() => descriptor ? Object.defineProperty(target, key, descriptor) : delete target[key]);
}

export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

export function mockFetch(t, handler = () => json({ ok: true })) {
  const calls = [];
  replace(t, globalThis, 'fetch', async (url, options = {}) => {
    const call = { url: new URL(url, 'https://test.invalid'), ...options, headers: new Headers(options.headers) };
    calls.push(call);
    return handler(call);
  });
  return calls;
}

export const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', ...headers },
});

function storage() {
  const values = new Map();
  return {
    fault: null,
    getItem(key) { if (this.fault) throw this.fault; return values.get(key) ?? null; },
    setItem(key, value) { if (this.fault) throw this.fault; values.set(key, String(value)); },
    removeItem(key) { if (this.fault) throw this.fault; values.delete(key); },
    clear() { values.clear(); },
  };
}

/** Only the browser boundary is fake; real session/idempotency modules remain under test. */
export function browser(t) {
  const localStorage = storage(), sessionStorage = storage(), cookies = new Map(), channels = new Set();
  const state = { localStorage, sessionStorage, blockedCookies: false, writes: [], locks: [] };
  const document = {};
  Object.defineProperty(document, 'cookie', {
    get: () => [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
    set(value) {
      state.writes.push(value);
      if (state.blockedCookies) return;
      const [pair] = value.split(';'), index = pair.indexOf('=');
      const key = pair.slice(0, index), body = pair.slice(index + 1);
      if (/Max-Age=0(?:;|$)/i.test(value)) cookies.delete(key);
      else cookies.set(key, body);
    },
  });
  replace(t, globalThis, 'document', document);
  replace(t, globalThis, 'window', { localStorage, sessionStorage, location: { protocol: 'https:', origin: 'https://test.invalid' } });
  let tail = Promise.resolve();
  replace(t, globalThis, 'navigator', { locks: { request(name, task) {
    state.locks.push(name);
    const result = tail.then(task);
    tail = result.catch(() => {});
    return result;
  } } });
  replace(t, globalThis, 'BroadcastChannel', class {
    constructor(name) { this.name = name; channels.add(this); }
    postMessage(data) { for (const other of channels) if (other !== this && other.name === this.name) other.onmessage?.({ data: structuredClone(data) }); }
    close() { channels.delete(this); }
  });
  state.channelCount = () => channels.size;
  t.after(() => { assert.equal(channels.size, 0, 'session channels must be closed'); cookies.clear(); });
  return state;
}
