'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { parseIosArgs, iosRunnerArgs, validateSession, verifyReady, nativeCommand, ensureServers, main } = require('./ios.cjs');
const { makePlan, parseArgs, writeDevSession, clearDevSession } = require('./dev.cjs');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'scamgraph-ios-test-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));
function rootFixture(name) {
  const root = path.join(scratch, name);
  fs.mkdirSync(path.join(root, 'app'), { recursive: true });
  return fs.realpathSync(root);
}
function sessionFixture(root, changes = {}) {
  return {
    schemaVersion: 1, pid: process.pid,
    root, appRoot: path.join(root, 'app'),
    apiPort: 8015, expoPort: 8095, host: '192.168.50.8',
    apiUrl: 'http://192.168.50.8:8015/api',
    useLocalApi: true, useExpo: true, go: false, ...changes,
  };
}
function response({ ok = true, text = '', json = {} } = {}) {
  return { ok, text: async () => text, json: async () => json };
}
function readyFetch(session, calls = []) {
  return async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/status')) return response({ text: 'packager-status:running\n' });
    if (url === 'http://localhost:' + session.expoPort + '/') {
      return response({ json: { extra: { expoClient: { _internal: { projectRoot: session.appRoot } } } } });
    }
    if (url === session.apiUrl.replace(/\/$/, '') + '/health') return response({ json: { status: 'ok' } });
    throw Error('Unexpected network request: ' + url);
  };
}

test('default iOS launch uses native development mode and forwards Expo build flags', () => {
  const options = parseIosArgs(['--device', 'iPhone 17', '--configuration', 'Release', '--no-build-cache']);
  assert.deepEqual(options.runner, ['--mobile-only']);
  assert.deepEqual(options.native, ['--device', 'iPhone 17', '--configuration', 'Release', '--no-build-cache']);
  assert.equal(options.explicitConnection, false);
  const root = rootFixture('defaults');
  const plan = makePlan(parseArgs(options.runner), {}, root, {
    en0: [{ family: 'IPv4', address: '192.168.50.8', internal: false }],
  });
  assert.equal(plan.apiPort, 8000);
  assert.equal(plan.expoPort, 8081);
  assert.equal(plan.services.length, 2);
  assert.ok(plan.services[1].args.includes('--dev-client'));
  assert.ok(plan.services[1].args.includes('--clear'));
  assert.ok(!plan.services[1].args.includes('--web'));
});

test('a fresh no-device simulator uses localhost while explicit hosts and device selection remain unchanged', () => {
  const root = rootFixture('simulator-host');
  const defaults = parseIosArgs([]);
  assert.deepEqual(iosRunnerArgs(defaults, root, {}), ['--mobile-only', '--host', 'localhost']);
  assert.deepEqual(defaults.runner, ['--mobile-only'], 'Default selection must not alter reuse configuration');
  const plan = makePlan(parseArgs(iosRunnerArgs(defaults, root, {})), {}, root);
  assert.equal(plan.host, 'localhost');
  assert.equal(plan.apiUrl, 'http://localhost:8000/api');

  const chosen = parseIosArgs(['--host', '192.168.50.8']);
  assert.deepEqual(iosRunnerArgs(chosen, root, {}), chosen.runner);
  assert.deepEqual(iosRunnerArgs(defaults, root, { DEV_HOST: '192.168.50.8' }), defaults.runner);
  for (const argv of [['--device'], ['--device', 'device-udid'], ['-d', 'device-udid']]) {
    const device = parseIosArgs(argv);
    assert.deepEqual(iosRunnerArgs(device, root, {}), device.runner, 'Device selection may target a physical phone');
  }
  fs.writeFileSync(path.join(root, '.env'), 'DEV_HOST=192.168.50.9\n');
  assert.deepEqual(iosRunnerArgs(defaults, root, {}), defaults.runner);
});

test('localhost simulator defaults preserve an explicitly configured API URL', () => {
  const root = rootFixture('simulator-explicit-api');
  const environment = { EXPO_PUBLIC_API_URL: 'https://api.test.example/api' };
  const runner = iosRunnerArgs(parseIosArgs([]), root, environment);
  const plan = makePlan(parseArgs(runner), environment, root);
  assert.equal(plan.host, 'localhost');
  assert.equal(plan.apiUrl, environment.EXPO_PUBLIC_API_URL);
});

test('legacy no-bundler plus port becomes a legal SDK 55 run:ios command', () => {
  const options = parseIosArgs(['--no-bundler', '--port', '8095', '--device', 'iPhone 17']);
  assert.deepEqual(options.runner, ['--mobile-only', '--expo-port', '8095']);
  assert.deepEqual(options.native, ['--device', 'iPhone 17']);
  assert.equal(options.explicitConnection, true);
  const root = rootFixture('legacy');
  const command = nativeCommand(sessionFixture(root), options.native, root);
  const index = command.args.indexOf('run:ios');
  assert.deepEqual(command.args.slice(index), ['run:ios', '--port', '8095', '--device', 'iPhone 17']);
  assert.ok(!command.args.includes('--no-bundler'));
  assert.equal(command.args.filter(item => item === '--port').length, 1);
});

test('runner options are consumed while device and Expo options keep their order', () => {
  const options = parseIosArgs([
    '--api-port', '8015', '--expo-port', '8095', '--host', '192.168.50.8',
    '--remote-api', '--configured-db', '--device', 'device-udid', '--scheme', 'ScamGraphAI',
    '--dry-run',
  ]);
  assert.deepEqual(options.runner, [
    '--mobile-only', '--api-port', '8015', '--expo-port', '8095', '--host', '192.168.50.8',
    '--remote-api', '--configured-db',
  ]);
  assert.deepEqual(options.native, ['--device', 'device-udid', '--scheme', 'ScamGraphAI']);
  assert.equal(options.dryRun, true);
  assert.equal(options.explicitConnection, true);
  assert.equal(parseIosArgs(['-h']).help, true);
  for (const arg of ['--api-port', '--expo-port', '--port', '--host']) {
    assert.throws(() => parseIosArgs([arg]), /needs a value/);
    assert.throws(() => parseIosArgs([arg, '--device']), /needs a value/);
  }
});

test('a valid live session keeps its registered custom ports and project root', () => {
  const root = rootFixture('valid-session');
  const session = sessionFixture(root);
  assert.equal(validateSession(session, root), session);
  assert.equal(validateSession(null, root), null);
  assert.equal(validateSession({ ...session, schemaVersion: 2 }, root), null);
  assert.equal(validateSession({ ...session, pid: 2147483647 }, root), null);
  assert.equal(validateSession({ ...session, pid: '123' }, root), null);
  const foreign = rootFixture('foreign-session');
  assert.equal(validateSession({ ...session, root: foreign }, root), null);
  assert.equal(validateSession({ ...session, appRoot: path.join(foreign, 'app') }, root), null);
});

test('invalid session transport, API URLs, and Expo Go cannot be reused', () => {
  const root = rootFixture('invalid-session');
  const session = sessionFixture(root);
  for (const changes of [{ useExpo: false }, { go: true }]) {
    assert.throws(() => validateSession({ ...session, ...changes }, root), /Expo Go or has no Metro/);
  }
  for (const key of ['apiPort', 'expoPort']) {
    for (const value of [0, 65536, '8095', 80.5]) {
      assert.throws(() => validateSession({ ...session, [key]: value }, root), /Invalid shared development port/);
    }
  }
  for (const apiUrl of [
    'ftp://example.com/api', 'https://user:secret@example.com/api',
    'https://example.com/api?token=secret', 'https://example.com/api#secret',
    'https://example.com/', '/api',
  ]) {
    assert.throws(() => validateSession({ ...session, apiUrl }, root), /EXPO_PUBLIC_API_URL/);
  }
});

test('native launch uses the checkout-local CLI and registered API instead of defaults', () => {
  const root = rootFixture('native-command');
  const session = sessionFixture(root);
  const command = nativeCommand(session, ['--device', 'iPhone 18 Pro'], root);
  assert.equal(command.file, process.execPath);
  assert.equal(command.cwd, session.appRoot);
  assert.deepEqual(command.args.slice(0, 3), [
    '--require', path.join(root, 'scripts/ios-viewer.cjs'), path.join(root, 'app/node_modules/expo/bin/cli'),
  ]);
  assert.equal(command.env.EXPO_PUBLIC_API_URL, 'http://192.168.50.8:8015/api');
  assert.equal(command.env.RCT_METRO_PORT, '8095');
  assert.equal(command.env.REACT_NATIVE_PACKAGER_HOSTNAME, '192.168.50.8');
  assert.equal(command.env.EXPO_NO_DOTENV, '1');
  assert.equal(command.env.__UNSAFE_EXPO_HOME_DIRECTORY, path.join(root, '.runtime/expo'));
});

test('readiness verifies Metro identity and the local API before allowing native launch', async () => {
  const root = rootFixture('ready');
  const session = sessionFixture(root);
  const calls = [];
  assert.equal(await verifyReady(session, readyFetch(session, calls)), true);
  assert.deepEqual(calls.map(call => call.url), [
    'http://localhost:8095/status', 'http://localhost:8095/', 'http://192.168.50.8:8015/api/health',
  ]);
  assert.equal(calls[1].options.headers['expo-platform'], 'ios');
  assert.equal(calls[1].options.headers.accept, 'application/expo+json');
  assert.ok(calls.every(call => call.options.signal instanceof AbortSignal));
});

test('a foreign or unidentified Metro project is rejected even if the packager is running', async () => {
  const root = rootFixture('metro-owner');
  const session = sessionFixture(root);
  const foreign = rootFixture('metro-foreign');
  for (const manifest of [
    { extra: { expoClient: { _internal: { projectRoot: path.join(foreign, 'app') } } } },
    {},
  ]) {
    const fetcher = async url => url.endsWith('/status')
      ? response({ text: 'packager-status:running' }) : response({ json: manifest });
    await assert.rejects(verifyReady(session, fetcher), /another checkout/);
  }
});

test('startup can move from unready to ready; an HTTP error never counts as readiness', async () => {
  const root = rootFixture('startup');
  const session = sessionFixture(root);
  let starting = true;
  const ready = readyFetch(session);
  const fetcher = async (url, options) => {
    if (starting) { starting = false; return response({ ok: false }); }
    return ready(url, options);
  };
  assert.equal(await verifyReady(session, fetcher), false);
  assert.equal(await verifyReady(session, fetcher), true);
  for (const badStage of ['status-text', 'manifest-http', 'health-http', 'health-status']) {
    const badFetcher = async (url, options) => {
      if (badStage === 'status-text' && url.endsWith('/status')) return response({ text: 'unrecognized-server' });
      if (badStage === 'manifest-http' && url.endsWith('/')) return response({ ok: false });
      if (badStage === 'health-http' && url.endsWith('/health')) return response({ ok: false });
      if (badStage === 'health-status' && url.endsWith('/health')) return response({ json: { status: 'initializing' } });
      return ready(url, options);
    };
    assert.equal(await verifyReady(session, badFetcher), false, badStage);
  }
});

test('a stale LAN API URL fails within one readiness check when the local API is ready', async () => {
  const root = rootFixture('stale-lan');
  const session = sessionFixture(root);
  const calls = [];
  const localUrl = `http://localhost:${session.apiPort}/api/health`;
  const ready = readyFetch(session, calls);
  const fetcher = async (url, options) => {
    if (url === session.apiUrl + '/health') {
      calls.push({ url, options });
      throw Error('Old LAN address timed out');
    }
    if (url === localUrl) {
      calls.push({ url, options });
      return response({ json: { status: 'ok' } });
    }
    return ready(url, options);
  };
  await assert.rejects(verifyReady(session, fetcher), error =>
    error.code === 'UNREACHABLE_CONFIGURED_API' &&
    error.message.includes('npm run stop') &&
    error.message.includes('npm run ios')
  );
  assert.equal(calls.length, 4, 'Only one Metro/manifest/configured/local health check is needed');
  assert.equal(calls[3].url, localUrl);

  writeDevSession({ ...session, options: { go: false } });
  const originalFetch = global.fetch;
  global.fetch = fetcher;
  const started = Date.now();
  try {
    await assert.rejects(ensureServers(parseIosArgs([]), root), /Configured API URL .* is unreachable/);
    assert.ok(Date.now() - started < 1000, 'An existing ready local API must not cause a 180-second model wait');
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, '.runtime/dev-session.json'), 'utf8')).pid, process.pid);
  } finally { global.fetch = originalFetch; clearDevSession(root); }
});

test('local API initialization still waits and does not produce a stale-address error', async () => {
  const root = rootFixture('initializing-local');
  const session = sessionFixture(root);
  const ready = readyFetch(session);
  const initializing = async (url, options) => url.endsWith('/api/health')
    ? response({ ok: false }) : ready(url, options);
  assert.equal(await verifyReady(session, initializing), false);
  const loadingStatus = async (url, options) => url === session.apiUrl + '/health'
    ? response({ json: { status: 'initializing' } }) : ready(url, options);
  assert.equal(await verifyReady(session, loadingStatus), false);
  assert.equal(await verifyReady(session, ready), true);
});

test('remote API sessions verify the local Metro and do not call a remote health endpoint', async () => {
  const root = rootFixture('remote-ready');
  const session = sessionFixture(root, { apiUrl: 'https://api.example.test/api', useLocalApi: false });
  const calls = [];
  assert.equal(await verifyReady(session, readyFetch(session, calls)), true);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.url.startsWith('http://localhost:8095/')));
});

test('ios reuses a ready shared session without spawning replacement servers', async () => {
  const root = rootFixture('reuse');
  const session = sessionFixture(root);
  const plan = { ...session, options: { go: false } };
  writeDevSession(plan);
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = readyFetch(session, calls);
  try {
    const actual = await ensureServers(parseIosArgs([]), root);
    assert.equal(actual.pid, process.pid);
    assert.equal(actual.expoPort, 8095);
    assert.equal(actual.apiPort, 8015);
    assert.equal(actual.apiUrl, session.apiUrl);
    assert.equal(calls.length, 3);
    assert.ok(!fs.existsSync(path.join(root, '.runtime/dev-ios.log')), 'Reusing servers must not spawn/log a new runner');
  } finally { global.fetch = originalFetch; clearDevSession(root); }
});

test('conflicting explicit ports preserve the existing shared session', async () => {
  const root = rootFixture('conflict');
  const session = sessionFixture(root);
  writeDevSession({ ...session, options: { go: false } });
  const originalFetch = global.fetch;
  global.fetch = () => { throw Error('Conflicting launch must fail before any request'); };
  try {
    await assert.rejects(ensureServers(parseIosArgs(['--port', '8096']), root), /already runs on Metro 8095 \/ API 8015/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, '.runtime/dev-session.json'), 'utf8')).pid, process.pid);
  } finally { global.fetch = originalFetch; clearDevSession(root); }
});

test('dry-run output includes public paired URLs and native command but no configuration secrets', { skip: process.platform !== 'darwin' }, async () => {
  const root = rootFixture('dry-run');
  const session = sessionFixture(root);
  writeDevSession({ ...session, options: { go: false } });
  const key = 'SCAMGRAPH_TEST_PRIVATE_SENTINEL';
  const previous = process.env[key];
  process.env[key] = 'private-secret-not-for-command-output';
  const originalLog = console.log;
  const output = [];
  console.log = value => output.push(String(value));
  try {
    assert.equal(await main(['--dry-run', '--device', 'iPhone 17'], root), 0);
    const raw = output.join('\n');
    assert.ok(!raw.includes('private-secret-not-for-command-output'));
    const publicPlan = JSON.parse(raw);
    assert.deepEqual(Object.keys(publicPlan).sort(), ['apiUrl', 'expoPort', 'native']);
    assert.equal(publicPlan.apiUrl, session.apiUrl);
    assert.equal(publicPlan.expoPort, 8095);
    assert.ok(publicPlan.native.includes(path.join(root, 'app/node_modules/expo/bin/cli')));
    assert.ok(publicPlan.native.includes('iPhone 17'));
  } finally {
    console.log = originalLog;
    if (previous === undefined) delete process.env[key]; else process.env[key] = previous;
    clearDevSession(root);
  }
});


test('a matching explicit Metro port reuses the custom API session without resetting unspecified settings', async () => {
  const root = rootFixture('matching-explicit-port');
  const session = sessionFixture(root);
  writeDevSession({ ...session, options: { go: false } });
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = readyFetch(session, calls);
  try {
    const actual = await ensureServers(parseIosArgs(['--port', '8095']), root);
    assert.equal(actual.apiPort, 8015);
    assert.equal(actual.expoPort, 8095);
    assert.equal(actual.host, '192.168.50.8');
    assert.equal(actual.apiUrl, 'http://192.168.50.8:8015/api');
    assert.equal(calls.length, 3);
  } finally { global.fetch = originalFetch; clearDevSession(root); }
});

test('a valid trailing slash on the local API URL yields one slash in the health endpoint', async () => {
  const root = rootFixture('api-trailing-slash');
  const session = sessionFixture(root, { apiUrl: 'http://192.168.50.8:8015/api/' });
  const calls = [];
  assert.equal(validateSession(session, root), session);
  assert.equal(await verifyReady(session, readyFetch(session, calls)), true);
  assert.equal(calls[2].url, 'http://192.168.50.8:8015/api/health');
});

test('dry-run rejects a conflicting explicit port using the same diagnostic as a real launch', { skip: process.platform !== 'darwin' }, async () => {
  const root = rootFixture('dry-run-conflict');
  const session = sessionFixture(root);
  writeDevSession({ ...session, options: { go: false } });
  const originalLog = console.log;
  const originalError = console.error;
  const originalFetch = global.fetch;
  const output = [], errors = [];
  console.log = value => output.push(String(value));
  console.error = value => errors.push(String(value));
  global.fetch = () => { throw Error('Dry-run must not make network requests'); };
  try {
    assert.equal(await main(['--dry-run', '--port', '8096'], root), 1);
    assert.equal(output.length, 0, 'Conflicts must not print a misleading launch plan');
    assert.match(errors.join('\n'), /already runs on Metro 8095 \/ API 8015/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, '.runtime/dev-session.json'), 'utf8')).expoPort, 8095);
  } finally {
    console.log = originalLog;
    console.error = originalError;
    global.fetch = originalFetch;
    clearDevSession(root);
  }
});

test('environment and root dotenv overrides are checked before reusing iOS servers', async () => {
  const root = rootFixture('supplied-settings');
  const session = sessionFixture(root);
  writeDevSession({ ...session, options: { go: false } });
  const originalFetch = global.fetch;
  global.fetch = () => { throw Error('Conflicting settings must fail before any request'); };
  const conflicts = { API_PORT: '8016', EXPO_PORT: '8096', DEV_HOST: '192.168.50.9', EXPO_PUBLIC_API_URL: 'https://changed.test.example/api' };
  try {
    for (const [key, value] of Object.entries(conflicts)) {
      const previous = process.env[key];
      process.env[key] = value;
      try { await assert.rejects(ensureServers(parseIosArgs([]), root), new RegExp('Conflicting settings:.*' + key)); }
      finally { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; }
    }
    for (const [key, value] of Object.entries(conflicts)) {
      fs.writeFileSync(path.join(root, '.env'), `${key}=${value}\nGOOGLE_CLIENT_SECRET=private-root-setting\n`);
      await assert.rejects(ensureServers(parseIosArgs([]), root), new RegExp('Conflicting settings:.*' + key));
    }
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, '.runtime/dev-session.json'), 'utf8')).pid, process.pid);
    assert.ok(!fs.existsSync(path.join(root, '.runtime/dev-ios.log')));
  } finally { global.fetch = originalFetch; clearDevSession(root); }
});

test('default iOS reuse preserves configured database and remote API sessions without adding signal ownership', async () => {
  const root = rootFixture('configured-remote');
  const session = sessionFixture(root, { configuredDb: true, useLocalApi: false, apiUrl: 'https://remote.test.example/api' });
  writeDevSession({ ...session, options: { go: false, configuredDb: true } });
  const counts = ['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal));
  const originalFetch = global.fetch;
  global.fetch = readyFetch(session);
  try {
    const actual = await ensureServers(parseIosArgs([]), root);
    assert.equal(actual.configuredDb, true);
    assert.equal(actual.useLocalApi, false);
    assert.equal(actual.apiUrl, session.apiUrl);
    assert.deepEqual(['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal)), counts);
  } finally { global.fetch = originalFetch; clearDevSession(root); }
});

function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
async function until(check, timeout = 4000) {
  const deadline = Date.now() + timeout;
  while (!check()) {
    if (Date.now() >= deadline) throw Error('Timed out waiting for the isolated iOS runner fixture');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
  test(`${signal} during iOS startup promptly stops only its new detached runner and companion`, { skip: process.platform !== 'darwin' }, async () => {
    const root = rootFixture('cancel-' + signal);
    const apiPort = await freePort(), expoPort = await freePort();
    const apiFile = path.join(root, 'api.cjs'), apiPidFile = path.join(root, 'api.pid');
    const pending = path.join(root, 'pending-fetch');
    const scripts = path.join(root, 'scripts');
    fs.mkdirSync(scripts);
    const cli = path.join(root, 'app/node_modules/expo/bin/cli');
    fs.mkdirSync(path.dirname(cli), { recursive: true });
    fs.writeFileSync(cli, '// This fixture must never reach native launch.\n');
    fs.writeFileSync(apiFile, `require('node:fs').writeFileSync(${JSON.stringify(apiPidFile)},String(process.pid));setInterval(()=>{},1000);`);
    fs.writeFileSync(path.join(scripts, 'dev.cjs'), `
      const {makePlan,parseArgs,writeDevSession,clearDevSession,runServices}=require(${JSON.stringify(path.join(__dirname, 'dev.cjs'))});
      const plan=makePlan(parseArgs(process.argv.slice(2)),process.env,process.cwd());
      writeDevSession(plan);
      runServices([{name:'API fixture',file:process.execPath,args:[${JSON.stringify(apiFile)}],cwd:process.cwd(),env:process.env,ready:{url:'http://127.0.0.1:${apiPort}/api/health'}}],{log:()=>{},graceMs:200})
        .then(code=>{clearDevSession(process.cwd());process.exitCode=code;});
    `);
    const launcherFile = path.join(root, 'launcher.cjs');
    fs.writeFileSync(launcherFile, `
      global.fetch=(url,options)=>new Promise((resolve,reject)=>{
        const connection=setInterval(()=>{},1000);
        require('node:fs').writeFileSync(${JSON.stringify(pending)},'pending');
        options.signal.addEventListener('abort',()=>{clearInterval(connection);reject(options.signal.reason);},{once:true});
      });
      require(${JSON.stringify(path.join(__dirname, 'ios.cjs'))}).main(['--api-port','${apiPort}','--port','${expoPort}'],${JSON.stringify(root)}).then(code=>process.exitCode=code);
    `);
    const outsider = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
    const outsiderExit = new Promise(resolve => outsider.once('exit', resolve));
    const launcher = spawn(process.execPath, [launcherFile], { stdio: 'ignore' });
    const exited = new Promise(resolve => launcher.once('exit', (code, signal) => resolve({ code, signal })));
    let ownedPid, apiPid;
    try {
      await until(() => fs.existsSync(apiPidFile) && fs.existsSync(pending));
      ownedPid = JSON.parse(fs.readFileSync(path.join(root, '.runtime/dev-session.json'), 'utf8')).pid;
      apiPid = Number(fs.readFileSync(apiPidFile, 'utf8'));
      const started = Date.now();
      launcher.kill(signal);
      assert.equal((await exited).code, code);
      assert.ok(Date.now() - started < 2000, 'Cancellation must not wait for the 180-second startup deadline');
      await until(() => !alive(ownedPid) && !alive(apiPid));
      assert.equal(fs.existsSync(path.join(root, '.runtime/dev-session.json')), false);
      assert.ok(alive(outsider.pid), 'Unrelated processes must remain running');
    } finally {
      if (alive(launcher.pid)) { launcher.kill('SIGTERM'); await exited; }
      if (ownedPid && alive(ownedPid)) { process.kill(ownedPid, 'SIGTERM'); await until(() => !alive(ownedPid)); }
      outsider.kill('SIGTERM'); await outsiderExit;
    }
  });
}
