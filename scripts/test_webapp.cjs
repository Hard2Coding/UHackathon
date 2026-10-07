// Exercise generated worker behavior: private routes, auth and OAuth must never
// be intercepted, including offline. This is not a browser installation test.
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { allowedStaticFiles, buildWorker } = require('./export_webapp.cjs');
const origin = 'https://scamgraph.test';
const files = allowedStaticFiles([
  'index.html', 'manifest.webmanifest', 'icons/icon-192.png',
  '_expo/static/js/web/index-123.js', 'assets/logo.png',
  'api/history.json', 'auth/me.json', 'uploads/evidence.png',
  'private-result.json', 'service-worker.js', 'client_secret.json',
]);
assert.deepEqual(files, [
  '_expo/static/js/web/index-123.js', 'assets/logo.png', 'icons/icon-192.png',
  'index.html', 'manifest.webmanifest'
]);
const handlers = new Map();
const cacheStores = new Map();
let offline = false;
let skips = 0;
let storageBlocked = false;
const fetched = [];
const cacheKey = 'scamgraph-public-shell-test-version';
const caches = {
  async open(key) {
    if (storageBlocked) throw new Error('Storage unavailable');
    if (!cacheStores.has(key)) cacheStores.set(key, new Map());
    const store = cacheStores.get(key);
    return {
      async put(key, value) { store.set(key, value); },
      async match(key) { return store.get(key); },
    };
  },
  async keys() { return [...cacheStores.keys()]; },
  async delete(key) { return cacheStores.delete(key); },
};
const context = {
  URL, Response,
  Request: class { constructor(url, options) { this.url = origin + url; Object.assign(this, options); } },
  caches,
  fetch: async request => {
    if (offline) throw new Error('Network unavailable');
    fetched.push(request);
    return { ok: true, type: 'basic', publicShell: true, url: request.url };
  },
  self: {
    location: { origin },
    addEventListener: (name, handler) => handlers.set(name, handler),
    clients: { claim: async () => {} },
    skipWaiting: () => { skips++; },
  },
};
vm.runInNewContext(buildWorker('test-version', files), context);
function lifecycle(name) {
  let done;
  handlers.get(name)({ waitUntil: value => { done = value; } });
  return done;
}
function request(path, extra = {}) {
  return { url: origin + path, method: 'GET', mode: 'cors', headers: new Headers(), ...extra };
}
function respond(request) {
  let response;
  handlers.get('fetch')({ request, respondWith: value => { response = value; } });
  return response;
}
(async () => {
  await lifecycle('install');
  assert.equal(cacheStores.get(cacheKey).size, files.length);
  assert.ok(fetched.every(value => value.credentials === 'omit'));
  assert.ok(fetched.every(value => value.redirect === 'error'));
  offline = true;
  for (const path of [
    '/api/analyze', '/api/auth/me', '/api/history', '/api/auth/oauth/exchange',
    '/api/notifications/line', '/uploads/evidence.png', '/results/123',
    '/?exchange_code=one-time-private-code', '/?oauth_error=provider_login_failed',
  ]) assert.equal(respond(request(path, { mode: 'navigate' })), undefined, path);
  assert.equal(respond(request('/assets/logo.png', { method: 'POST' })), undefined);
  assert.equal(respond(request('/assets/logo.png', { headers: new Headers({ Authorization: 'Bearer private' }) })), undefined);
  assert.equal(respond(request('/assets/logo.png?token=private')), undefined);
  assert.equal(respond(request('/assets/logo.png', { url: 'https://other.test/assets/logo.png' })), undefined);
  const shell = await respond(request('/', { mode: 'navigate' }));
  assert.equal(shell.publicShell, true);
  assert.ok((await respond(request('/assets/logo.png'))).publicShell);
  assert.equal(cacheStores.get(cacheKey).size, files.length); // no private/runtime puts
  storageBlocked = true;
  const unavailable = await respond(request('/', { mode: 'navigate' }));
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get('cache-control'), 'no-store');
  assert.ok((await unavailable.text()).includes('requires a connection'));
  storageBlocked = false;
  cacheStores.set('scamgraph-public-shell-old', new Map());
  cacheStores.set('unrelated-cache', new Map());
  await lifecycle('activate');
  assert.ok(!cacheStores.has('scamgraph-public-shell-old'));
  assert.ok(cacheStores.has('unrelated-cache'));
  assert.equal(skips, 0); // no automatic update/reload while a user edits evidence
  handlers.get('message')({ data: { type: 'ACTIVATE_UPDATE' } });
  assert.equal(skips, 1);
  console.log('Webapp worker privacy, offline-shell and user-triggered update checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
