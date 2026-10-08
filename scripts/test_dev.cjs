'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { parseArgs, makePlan, ensurePortAvailable, runServices, readDevSession, writeDevSession, clearDevSession, verifyDevSession, findReusableSession } = require('./dev.cjs');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'scamgraph-dev-test-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));
const interfaces = { en0: [{ family: 'IPv4', internal: false, address: '192.168.50.8' }] };
const environment = { PATH: process.env.PATH };

function fixture(name, source) {
  const file = path.join(scratch, `${name}.cjs`);
  fs.writeFileSync(file, source);
  return file;
}
function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
async function until(check, timeout = 3000) {
  const deadline = Date.now() + timeout;
  while (!check()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for child lifecycle');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

test('one Metro gives both clients the same reachable LAN API URL', () => {
  const plan = makePlan(parseArgs([]), environment, scratch, interfaces);
  assert.equal(plan.apiUrl, 'http://192.168.50.8:8000/api');
  assert.equal(plan.services.length, 2);
  assert.equal(plan.services.filter(service => service.name === 'Expo').length, 1);
  assert.equal(plan.services[0].env.EXPO_PUBLIC_API_URL, plan.services[1].env.EXPO_PUBLIC_API_URL);
  assert.equal(plan.services[1].env.REACT_NATIVE_PACKAGER_HOSTNAME, '192.168.50.8');
  assert.ok(plan.services[1].args.includes('--web'));
  assert.ok(plan.services[1].args.includes('--dev-client'));
  assert.ok(plan.services[0].args.includes('--reload'));
  assert.ok(plan.services[0].args.includes('--sqlite-demo'));
  assert.ok(plan.services[0].env.CORS_ORIGINS.includes('http://localhost:8081'));
});

test('explicit public API URL is honored exactly; private .env settings stay out of Metro', () => {
  fs.writeFileSync(path.join(scratch, '.env'), 'EXPO_PUBLIC_API_URL="https://api.test.example/api/" # chosen API\nGOOGLE_CLIENT_SECRET=secret-must-not-be-copied\nAPI_PORT=8011\nEXPO_PORT=8091\n');
  try {
    const local = makePlan(parseArgs([]), environment, scratch, interfaces);
    assert.equal(local.apiUrl, 'https://api.test.example/api/');
    assert.equal(local.apiPort, 8011);
    assert.equal(local.expoPort, 8091);
    assert.equal(local.services[1].env.GOOGLE_CLIENT_SECRET, undefined);
    assert.equal(local.services[1].env.EXPO_NO_DOTENV, '1');
    const overridden = makePlan(parseArgs(['--remote-api', '--mobile-only']), { ...environment, EXPO_PUBLIC_API_URL: 'https://remote.example/api' }, scratch, interfaces);
    assert.equal(overridden.apiUrl, 'https://remote.example/api');
    assert.equal(overridden.services.length, 1);
    assert.ok(!overridden.services[0].args.includes('--web'));
  } finally { fs.unlinkSync(path.join(scratch, '.env')); }
});

test('unsafe or ambiguous configuration fails before starting processes', () => {
  for (const url of ['https://user:secret@example.com/api', 'https://example.com/api?token=secret', 'ftp://example.com/api', '/api']) {
    assert.throws(() => makePlan(parseArgs([]), { ...environment, EXPO_PUBLIC_API_URL: url }, scratch, interfaces), /EXPO_PUBLIC_API_URL/);
  }
  assert.throws(() => makePlan(parseArgs(['--api-port', '8091', '--expo-port', '8091']), environment, scratch, interfaces), /must be different/);
  assert.throws(() => makePlan(parseArgs(['--host', 'http://192.168.1.3']), environment, scratch, interfaces), /hostname or IP only/);
  assert.throws(() => parseArgs(['--web-only', '--mobile-only']), /Choose only one/);
  assert.throws(() => makePlan(parseArgs(['--remote-api']), environment, scratch, interfaces), /requires EXPO_PUBLIC_API_URL/);
});

test('the active session contains public paired URLs, has private file permissions, and cleans up', () => {
  const root = fs.mkdtempSync(path.join(scratch, 'public-session-'));
  const plan = makePlan(parseArgs(['--api-port', '8015', '--expo-port', '8095', '--mobile-only']), {
    ...environment,
    GOOGLE_CLIENT_SECRET: 'private-backend-secret',
    LINE_CHANNEL_ACCESS_TOKEN: 'private-line-token',
  }, root, interfaces);
  assert.equal(readDevSession(root), null);
  const session = writeDevSession(plan);
  assert.equal(session.root, fs.realpathSync(root));
  assert.equal(session.appRoot, path.join(fs.realpathSync(root), 'app'));
  assert.equal(session.pid, process.pid);
  assert.equal(session.apiUrl, 'http://192.168.50.8:8015/api');
  assert.equal(session.apiPort, 8015);
  assert.equal(session.expoPort, 8095);
  assert.equal(session.go, false);
  assert.equal(session.useLocalApi, true);
  assert.equal(session.useExpo, true);
  assert.equal(session.configuredDb, false);
  const file = path.join(root, '.runtime/dev-session.json');
  assert.deepEqual(readDevSession(root), session);
  assert.ok(!fs.readFileSync(file, 'utf8').includes('private-'));
  assert.ok(!('services' in session));
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(fs.readdirSync(path.dirname(file)).length, 1, 'Atomic writes must not leave temporary files');
  assert.equal(clearDevSession(root), true);
  assert.equal(readDevSession(root), null);
  assert.equal(clearDevSession(root), false);
});

test('an active foreign runner is preserved and only its owner can remove its session', async () => {
  const root = fs.mkdtempSync(path.join(scratch, 'owned-session-'));
  const plan = makePlan(parseArgs([]), environment, root, interfaces);
  const owner = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
  const exited = new Promise(resolve => owner.once('exit', resolve));
  try {
    const original = writeDevSession(plan, owner.pid);
    assert.throws(() => writeDevSession(plan), /Another development runner is already active/);
    assert.deepEqual(readDevSession(root), original);
    assert.equal(clearDevSession(root), false, 'An older runner must preserve the newer owner');
    assert.deepEqual(readDevSession(root), original);
    assert.ok(alive(owner.pid), 'Metadata handling must not stop another runner');
  } finally { owner.kill('SIGTERM'); await exited; }
  const replacement = writeDevSession(plan);
  assert.equal(replacement.pid, process.pid, 'A session from an exited process can be replaced');
  assert.equal(clearDevSession(root), true);
});

test('remote API and Expo Go session flags survive without leaking configuration', () => {
  const root = fs.mkdtempSync(path.join(scratch, 'remote-session-'));
  const plan = makePlan(parseArgs(['--remote-api', '--go']), {
    ...environment, EXPO_PUBLIC_API_URL: 'https://api.test.example/api',
  }, root, interfaces);
  const session = writeDevSession(plan);
  assert.equal(session.apiUrl, 'https://api.test.example/api');
  assert.equal(session.useLocalApi, false);
  assert.equal(session.go, true);
  assert.equal(clearDevSession(root), true);
});

test('the CLI removes session metadata when a service fails', { skip: process.platform === 'win32' }, async () => {
  const root = fs.mkdtempSync(path.join(scratch, 'failing-session-'));
  const runner = path.join(root, 'scripts/dev.cjs');
  const expo = path.join(root, 'app/node_modules/expo/bin/cli');
  const python = path.join(root, 'fake-python');
  const ready = path.join(root, 'api.pid');
  fs.mkdirSync(path.dirname(runner), { recursive: true });
  fs.mkdirSync(path.dirname(expo), { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'dev.cjs'), runner);
  fs.writeFileSync(python, `#!${process.execPath}\nif(process.argv[2]==='-c')process.exit(0);require('node:http').createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({status:'ok'}));}).listen(Number(process.env.API_PORT),'127.0.0.1',()=>require('node:fs').writeFileSync(${JSON.stringify(ready)},String(process.pid)));\n`, { mode: 0o700 });
  fs.writeFileSync(expo, `setTimeout(()=>process.exit(7),250);\n`);
  const ports = [net.createServer(), net.createServer()];
  await Promise.all(ports.map(server => new Promise(resolve => server.listen(0, '0.0.0.0', resolve))));
  const [apiPort, expoPort] = ports.map(server => server.address().port);
  await Promise.all(ports.map(server => new Promise(resolve => server.close(resolve))));
  const supervisor = spawn(process.execPath, [runner, '--mobile-only'], {
    env: { ...environment, SCAMGRAPH_PYTHON: python, API_PORT: String(apiPort), EXPO_PORT: String(expoPort) },
    stdio: 'ignore',
  });
  const exited = new Promise(resolve => supervisor.once('exit', (code, signal) => resolve({ code, signal })));
  try {
    await until(() => fs.existsSync(ready));
    const session = readDevSession(root);
    assert.equal(session.pid, supervisor.pid);
    assert.equal(session.apiPort, apiPort);
    assert.equal((await exited).code, 7);
    assert.equal(readDevSession(root), null, 'Failed startup must not leave a reusable session');
    await until(() => !alive(Number(fs.readFileSync(ready, 'utf8'))));
  } finally {
    if (alive(supervisor.pid)) { supervisor.kill('SIGTERM'); await exited; }
  }
});

test('occupied ports are reported and the existing listener remains usable', async () => {
  const server = net.createServer(socket => socket.end('existing-server'));
  await new Promise(resolve => server.listen(0, '0.0.0.0', resolve));
  try {
    const port = server.address().port;
    await assert.rejects(ensurePortAvailable(port, 'Expo'), /existing servers were left running/);
    const response = await new Promise((resolve, reject) => {
      const socket = net.connect(port, '127.0.0.1');
      let output = '';
      socket.on('data', chunk => { output += chunk; });
      socket.on('end', () => resolve(output));
      socket.on('error', reject);
    });
    assert.equal(response, 'existing-server');
  } finally { await new Promise(resolve => server.close(resolve)); }
});

function sessionFixture() {
  const root = fs.mkdtempSync(path.join(scratch, 'reuse-session-'));
  fs.mkdirSync(path.join(root, 'app'));
  const plan = makePlan(parseArgs(['--api-port', '8015', '--expo-port', '8095', '--mobile-only']), environment, root, interfaces);
  return { root, plan, session: writeDevSession(plan) };
}
function sessionFetcher(appRoot, requests = [], status = 'ok') {
  return async (url, options) => {
    requests.push({ url, headers: options.headers });
    if (url.endsWith('/status')) return { ok: true, text: async () => 'packager-status:running' };
    if (url.endsWith('/api/health')) return { ok: true, json: async () => ({ status }) };
    assert.equal(options.headers['expo-platform'], 'ios', 'Checkout identity must use a native Expo manifest');
    return { ok: true, json: async () => ({ extra: { expoClient: { _internal: { projectRoot: appRoot } } } }) };
  };
}

test('a same-checkout healthy session is reused on its custom ports without creating children', async () => {
  const { root, session } = sessionFixture();
  const requests = [];
  const reused = await findReusableSession(parseArgs(['--web-only']), environment, root, {
    fetcher: sessionFetcher(session.appRoot, requests),
  });
  assert.deepEqual(reused, session);
  assert.deepEqual(requests.map(item => item.url), ['http://localhost:8095/status', 'http://localhost:8095/', 'http://127.0.0.1:8015/api/health']);
  assert.deepEqual(readDevSession(root), session, 'Reuse must preserve the existing runner owner');
  clearDevSession(root);
});

test('session reuse preserves explicit URL, port, provider, and database configuration choices', async () => {
  const { root, session } = sessionFixture();
  let requests = 0;
  const fetcher = async () => { requests++; throw Error('A conflicting request must not reach the server'); };
  for (const argv of [['--expo-port', '8096'], ['--api-port', '8016'], ['--host', '192.168.1.1'], ['--go'], ['--configured-db'], ['--remote-api']]) {
    await assert.rejects(findReusableSession(parseArgs(argv), environment, root, { fetcher }), /running session has different/);
  }
  await assert.rejects(findReusableSession(parseArgs([]), { ...environment, EXPO_PUBLIC_API_URL: 'https://different.test.example/api' }, root, { fetcher }), /EXPO_PUBLIC_API_URL/);
  fs.writeFileSync(path.join(root, '.env'), 'EXPO_PUBLIC_API_URL=https://configured.test.example/api\n');
  await assert.rejects(findReusableSession(parseArgs([]), environment, root, { fetcher }), /EXPO_PUBLIC_API_URL/);
  assert.equal(requests, 0);
  assert.deepEqual(readDevSession(root), session);
  clearDevSession(root);
});

test('foreign Metro checkouts and unready APIs cannot be reused', async () => {
  const { root, session } = sessionFixture();
  const foreign = fs.mkdtempSync(path.join(scratch, 'foreign-app-'));
  await assert.rejects(verifyDevSession(session, root, { fetcher: sessionFetcher(foreign) }), /Metro belongs to another checkout/);
  assert.equal(await verifyDevSession(session, root, { fetcher: sessionFetcher(session.appRoot, [], 'loading') }), false);
  await assert.rejects(findReusableSession(parseArgs([]), environment, root, { fetcher: sessionFetcher(session.appRoot, [], 'loading') }), /still starting or is unavailable/);
  assert.deepEqual(readDevSession(root), session, 'Unready/foreign listeners must be left alone');
  clearDevSession(root);
});

async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

test('Expo starts only after the delayed local API health check is ready', async () => {
  const port = await freePort();
  const apiPidFile = path.join(scratch, 'delayed-api.pid');
  const apiReadyFile = path.join(scratch, 'delayed-api.ready');
  const expoFile = path.join(scratch, 'delayed-expo.json');
  const api = fixture('delayed-api', `const fs=require('node:fs');let ready=false;require('node:http').createServer((req,res)=>{res.statusCode=ready?200:503;res.end(JSON.stringify({status:ready?'ok':'loading'}));}).listen(${port},'127.0.0.1',()=>{fs.writeFileSync(${JSON.stringify(apiPidFile)},String(process.pid));setTimeout(()=>{ready=true;fs.writeFileSync(${JSON.stringify(apiReadyFile)},'ready');},180);});`);
  const expo = fixture('delayed-expo', `require('node:fs').writeFileSync(${JSON.stringify(expoFile)},JSON.stringify({apiReady:require('node:fs').existsSync(${JSON.stringify(apiReadyFile)})}));process.exit(7);`);
  const log = [];
  const finished = runServices([
    { name: 'API', file: process.execPath, args: [api], cwd: scratch, env: environment, ready: { url: `http://127.0.0.1:${port}/api/health`, intervalMs: 20, logEveryMs: 30 } },
    { name: 'Expo', file: process.execPath, args: [expo], cwd: scratch, env: environment },
  ], { log: message => log.push(message), graceMs: 300 });
  await until(() => fs.existsSync(apiPidFile));
  assert.equal(fs.existsSync(expoFile), false, 'Expo must not open against the loading API');
  assert.equal(await finished, 7);
  assert.equal(JSON.parse(fs.readFileSync(expoFile, 'utf8')).apiReady, true);
  assert.ok(log.some(message => message.includes('Preparing API/models')), 'Long startup waits must print progress');
  await until(() => !alive(Number(fs.readFileSync(apiPidFile, 'utf8'))));
});

test('a readiness timeout stops the API and never opens Expo', async () => {
  const port = await freePort();
  const apiPidFile = path.join(scratch, 'timeout-api.pid');
  const expoFile = path.join(scratch, 'timeout-expo.pid');
  const api = fixture('timeout-api', `require('node:fs').writeFileSync(${JSON.stringify(apiPidFile)},String(process.pid));setInterval(()=>{},1000);`);
  const expo = fixture('timeout-expo', `require('node:fs').writeFileSync(${JSON.stringify(expoFile)},String(process.pid));setInterval(()=>{},1000);`);
  const result = await runServices([
    { name: 'API', file: process.execPath, args: [api], cwd: scratch, env: environment, ready: { url: `http://127.0.0.1:${port}/api/health`, timeoutMs: 150, intervalMs: 20 } },
    { name: 'Expo', file: process.execPath, args: [expo], cwd: scratch, env: environment },
  ], { log: () => {}, graceMs: 300 });
  assert.equal(result, 1);
  assert.equal(fs.existsSync(expoFile), false);
  await until(() => !alive(Number(fs.readFileSync(apiPidFile, 'utf8'))));
});

test('Ctrl+C cancels a waiting health gate and never starts its deferred Expo child', { skip: process.platform === 'win32' }, async () => {
  const port = await freePort();
  const apiPidFile = path.join(scratch, 'cancel-api.pid');
  const expoFile = path.join(scratch, 'cancel-expo.pid');
  const api = fixture('cancel-api', `require('node:fs').writeFileSync(${JSON.stringify(apiPidFile)},String(process.pid));setInterval(()=>{},1000);`);
  const expo = fixture('cancel-expo', `require('node:fs').writeFileSync(${JSON.stringify(expoFile)},String(process.pid));setInterval(()=>{},1000);`);
  const services = [
    { name: 'API', file: process.execPath, args: [api], cwd: scratch, env: environment, ready: { url: `http://127.0.0.1:${port}/api/health` } },
    { name: 'Expo', file: process.execPath, args: [expo], cwd: scratch, env: environment },
  ];
  const supervisorFile = fixture('cancel-supervisor', `require(${JSON.stringify(path.join(__dirname, 'dev.cjs'))}).runServices(${JSON.stringify(services)},{log:()=>{},graceMs:300}).then(code=>process.exitCode=code);`);
  const supervisor = spawn(process.execPath, [supervisorFile], { stdio: 'ignore' });
  const exited = new Promise(resolve => supervisor.once('exit', code => resolve(code)));
  try {
    await until(() => fs.existsSync(apiPidFile));
    supervisor.kill('SIGINT');
    assert.equal(await exited, 130);
    assert.equal(fs.existsSync(expoFile), false);
    await until(() => !alive(Number(fs.readFileSync(apiPidFile, 'utf8'))));
  } finally { if (alive(supervisor.pid)) { supervisor.kill('SIGTERM'); await exited; } }
});

test('a failed service stops its runner-owned companion and preserves unrelated processes', async () => {
  const ready = path.join(scratch, 'companion.pid');
  const companion = fixture('companion', `const fs=require('node:fs'); fs.writeFileSync(process.argv[2],String(process.pid)); setInterval(()=>{},1000);`);
  const failure = fixture('failure', `const fs=require('node:fs'); const timer=setInterval(()=>{if(fs.existsSync(process.argv[2])){clearInterval(timer);process.exit(7);}},10);`);
  const outsider = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
  const outsiderExit = new Promise(resolve => outsider.once('exit', resolve));
  try {
    const code = await runServices([
      { name: 'Companion', file: process.execPath, args: [companion, ready], cwd: scratch, env: environment },
      { name: 'Failure', file: process.execPath, args: [failure, ready], cwd: scratch, env: environment },
    ], { log: () => {}, graceMs: 300 });
    const companionPid = Number(fs.readFileSync(ready, 'utf8'));
    await until(() => !alive(companionPid));
    assert.equal(code, 7);
    assert.ok(alive(outsider.pid), 'An unrelated process must not be stopped');
  } finally { outsider.kill('SIGTERM'); await outsiderExit; }
});

test('Ctrl+C on the supervisor stops only its own service tree', { skip: process.platform === 'win32' }, async () => {
  const ready = path.join(scratch, 'signal-child.pid');
  const childFixture = fixture('signal-child', `require('node:fs').writeFileSync(process.argv[2],String(process.pid));setInterval(()=>{},1000);`);
  const supervisorFixture = fixture('supervisor', `const {runServices}=require(${JSON.stringify(path.join(__dirname, 'dev.cjs'))});runServices([{name:'Child',file:process.execPath,args:[${JSON.stringify(childFixture)},${JSON.stringify(ready)}],cwd:${JSON.stringify(scratch)},env:process.env}],{log:()=>{},graceMs:300}).then(code=>process.exitCode=code);`);
  const supervisor = spawn(process.execPath, [supervisorFixture], { stdio: 'ignore' });
  const exited = new Promise(resolve => supervisor.once('exit', (code, signal) => resolve({ code, signal })));
  try {
    await until(() => fs.existsSync(ready));
    const pid = Number(fs.readFileSync(ready, 'utf8'));
    supervisor.kill('SIGINT');
    assert.equal((await exited).code, 130);
    await until(() => !alive(pid));
  } finally { if (alive(supervisor.pid)) { supervisor.kill('SIGTERM'); await exited; } }
});
