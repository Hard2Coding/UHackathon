'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { parseArgs, makePlan, ensurePortAvailable, runServices } = require('./dev.cjs');
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
