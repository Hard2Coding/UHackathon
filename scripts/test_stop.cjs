'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { writeDevSession, readDevSession } = require('./dev.cjs');
const { isOwnedRunner, stopSession, main } = require('./stop.cjs');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'scamgraph-stop-test-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

function fixture(name) {
  const root = path.join(scratch, name);
  fs.mkdirSync(path.join(root, 'app'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'scripts/dev.cjs'), '// Fixture runner');
  return fs.realpathSync(root);
}
function metadata(root, changes = {}) {
  return {
    schemaVersion: 1, pid: process.pid, root, appRoot: path.join(root, 'app'),
    apiPort: 8015, expoPort: 8095, host: 'old-unreachable-lan',
    apiUrl: 'http://old-unreachable-lan:8015/api', useLocalApi: true,
    useExpo: true, go: false, ...changes,
  };
}
function saveSession(root, session = metadata(root)) {
  fs.mkdirSync(path.join(root, '.runtime'), { recursive: true });
  fs.writeFileSync(path.join(root, '.runtime/dev-session.json'), JSON.stringify(session));
}
function identity(root, pid = process.pid) {
  return { pid, argv: [process.execPath, path.join(root, 'scripts/dev.cjs')], cwd: root };
}
function mockedStop(root, { running = true, keepRunning = false, inspector, afterSignal } = {}) {
  const signals = [], output = [];
  let live = running, clock = 0;
  const dependencies = {
    inspect: inspector || (pid => identity(root, pid)),
    signal: (pid, signal) => {
      signals.push({ pid, signal });
      if (signal === 0) {
        if (!live) { const error = Error('No such process'); error.code = 'ESRCH'; throw error; }
      } else {
        assert.equal(signal, 'SIGTERM', 'Shutdown must never escalate to SIGKILL');
        if (!keepRunning) live = false;
        if (afterSignal) afterSignal();
      }
    },
    log: line => output.push(line),
    now: () => clock, sleep: async ms => { clock += ms; },
    timeoutMs: 40, pollMs: 10,
  };
  return { dependencies, signals, output, setRunning: value => { live = value; } };
}
async function until(check, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (!check()) {
    if (Date.now() >= deadline) throw Error('Timed out waiting for isolated fixture runner');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }

test('missing session is a successful no-op without inspecting or signaling any process', async () => {
  const root = fixture('missing');
  const calls = [];
  const code = await stopSession(root, {
    inspect: () => { throw Error('Must not inspect'); },
    signal: () => { throw Error('Must not signal'); },
    log: line => calls.push(line),
  });
  assert.equal(code, 0);
  assert.match(calls[0], /No registered development session/);
});

test('stale session metadata is removed without signaling a process or using API health', async () => {
  const root = fixture('stale');
  saveSession(root, metadata(root, { pid: 2147483647 }));
  const mock = mockedStop(root, { running: false, inspector: () => { throw Error('Exited PID needs no identity inspection'); } });
  assert.equal(await stopSession(root, mock.dependencies), 0);
  assert.equal(readDevSession(root), null);
  assert.ok(mock.signals.every(call => call.signal === 0));
  assert.match(mock.output[0], /Removed metadata/);
});

test('foreign checkout or invalid schema/PID metadata is preserved and cannot trigger a signal', async () => {
  const root = fixture('invalid');
  const foreign = fixture('foreign');
  const cases = [
    metadata(root, { root: foreign }),
    metadata(root, { appRoot: path.join(foreign, 'app') }),
    metadata(root, { schemaVersion: 2 }),
    metadata(root, { pid: -1 }),
    metadata(root, { pid: String(process.pid) }),
  ];
  for (const session of cases) {
    saveSession(root, session);
    const mock = mockedStop(root);
    await assert.rejects(stopSession(root, mock.dependencies), /another checkout|invalid/);
    assert.equal(mock.signals.length, 0);
    assert.deepEqual(readDevSession(root), session);
  }
});

test('process identity accepts only Node running this checkout’s direct dev runner with its correct cwd', () => {
  const root = fixture('identity');
  const foreign = fixture('identity-foreign');
  assert.equal(isOwnedRunner(identity(root), root, process.pid), true);
  assert.equal(isOwnedRunner({ ...identity(root), argv: [process.execPath, './scripts/dev.cjs'] }, root, process.pid), true);
  assert.equal(isOwnedRunner({ ...identity(root), argv: ['node', 'scripts/dev.cjs'] }, root, process.pid), true);
  for (const invalid of [
    null,
    { ...identity(root), pid: process.pid + 1 },
    { ...identity(root), cwd: foreign },
    { ...identity(root), argv: ['python3', path.join(root, 'scripts/dev.cjs')] },
    { ...identity(root), argv: [process.execPath, path.join(foreign, 'scripts/dev.cjs')] },
    { ...identity(root), argv: [process.execPath, path.join(root, 'scripts/dev.cjs-untrusted')] },
    { ...identity(root), argv: [process.execPath, '-e', path.join(root, 'scripts/dev.cjs')] },
  ]) assert.equal(isOwnedRunner(invalid, root, process.pid), false);
});

test('a live unrelated PID recorded in valid-looking metadata is refused without stopping it', async () => {
  const root = fixture('outsider-metadata');
  saveSession(root);
  const mock = mockedStop(root, { inspector: pid => ({
    pid, argv: [process.execPath, '-e', 'setInterval(()=>{},1000)'], cwd: root,
  }) });
  await assert.rejects(stopSession(root, mock.dependencies), /not this checkout’s Node development runner/);
  assert.ok(mock.signals.every(call => call.signal === 0));
  assert.equal(readDevSession(root).pid, process.pid);
});

test('identity is checked again immediately before SIGTERM and changed identity is refused', async () => {
  const root = fixture('identity-race');
  saveSession(root);
  let checks = 0;
  const mock = mockedStop(root, { inspector: pid => ++checks === 1 ? identity(root, pid) : {
    pid, argv: [process.execPath, '-e', 'unrelated'], cwd: root,
  } });
  await assert.rejects(stopSession(root, mock.dependencies), /identity changed/);
  assert.equal(checks, 2);
  assert.ok(mock.signals.every(call => call.signal === 0));
  assert.ok(readDevSession(root));
});

test('a replaced session during shutdown is preserved and never signaled', async () => {
  const root = fixture('metadata-race');
  const replacement = metadata(root, { pid: process.pid + 1 });
  saveSession(root);
  const mock = mockedStop(root, { keepRunning: true, afterSignal: () => saveSession(root, replacement) });
  await assert.rejects(stopSession(root, mock.dependencies), /session changed/);
  assert.deepEqual(readDevSession(root), replacement);
  assert.deepEqual(mock.signals.filter(call => call.signal !== 0), [{ pid: process.pid, signal: 'SIGTERM' }]);
});

test('PID reuse while waiting causes refusal without escalation or clearing replacement metadata', async () => {
  const root = fixture('pid-reuse');
  saveSession(root);
  let inspections = 0;
  const mock = mockedStop(root, { keepRunning: true, inspector: pid => ++inspections <= 2 ? identity(root, pid) : {
    pid, argv: [process.execPath, '-e', 'replacement'], cwd: root,
  } });
  await assert.rejects(stopSession(root, mock.dependencies), /replacement process was left running/);
  assert.deepEqual(mock.signals.filter(call => call.signal !== 0), [{ pid: process.pid, signal: 'SIGTERM' }]);
  assert.ok(readDevSession(root));
});

test('a runner exiting between the liveness probe and null inspection completes shutdown safely', async () => {
  const root = fixture('inspection-exit-race');
  saveSession(root);
  let checks = 0, mock;
  mock = mockedStop(root, { keepRunning: true, inspector: pid => {
    if (++checks <= 2) return identity(root, pid);
    mock.setRunning(false);
    return null;
  } });
  assert.equal(await stopSession(root, mock.dependencies), 0);
  assert.equal(checks, 3);
  assert.equal(readDevSession(root), null);
  assert.deepEqual(mock.signals.filter(call => call.signal !== 0), [{ pid: process.pid, signal: 'SIGTERM' }]);
});

test('a temporarily unreadable or zombie runner is awaited without signaling again', async () => {
  const root = fixture('temporary-null-identity');
  saveSession(root);
  let checks = 0, sleeps = 0;
  const mock = mockedStop(root, { keepRunning: true, inspector: pid => {
    checks++;
    return checks === 3 ? null : identity(root, pid);
  } });
  const advance = mock.dependencies.sleep;
  mock.dependencies.sleep = async ms => {
    await advance(ms);
    if (++sleeps === 2) mock.setRunning(false);
  };
  assert.equal(await stopSession(root, mock.dependencies), 0);
  assert.equal(checks, 4, 'Inspection resumes after temporary identity unavailability');
  assert.equal(sleeps, 2);
  assert.equal(readDevSession(root), null);
  assert.deepEqual(mock.signals.filter(call => call.signal !== 0), [{ pid: process.pid, signal: 'SIGTERM' }]);
});

test('persistently unreadable live identity times out without clearing metadata or sending another signal', async () => {
  const root = fixture('persistent-null-identity');
  saveSession(root);
  let checks = 0;
  const mock = mockedStop(root, { keepRunning: true, inspector: pid => ++checks <= 2 ? identity(root, pid) : null });
  await assert.rejects(stopSession(root, mock.dependencies), /Shutdown timed out/);
  assert.ok(readDevSession(root));
  assert.deepEqual(mock.signals.filter(call => call.signal !== 0), [{ pid: process.pid, signal: 'SIGTERM' }]);
});

test('a verified runner gets one SIGTERM and successful shutdown clears only its metadata', async () => {
  const root = fixture('success');
  saveSession(root);
  const mock = mockedStop(root);
  assert.equal(await stopSession(root, mock.dependencies), 0);
  assert.equal(readDevSession(root), null);
  assert.deepEqual(mock.signals.filter(call => call.signal !== 0), [{ pid: process.pid, signal: 'SIGTERM' }]);
  assert.match(mock.output[0], /Stopped this checkout’s development runner/);
});

test('shutdown timeout returns a nonzero CLI result and does not SIGKILL or discard live metadata', async () => {
  const root = fixture('timeout');
  saveSession(root);
  const mock = mockedStop(root, { keepRunning: true });
  const oldError = console.error, errors = [];
  console.error = line => errors.push(line);
  try {
    assert.equal(await main([], root, mock.dependencies), 1);
    assert.match(errors[0], /Shutdown timed out/);
    assert.deepEqual(mock.signals.filter(call => call.signal !== 0), [{ pid: process.pid, signal: 'SIGTERM' }]);
    assert.ok(readDevSession(root));
  } finally { console.error = oldError; }
});

test('malformed metadata diagnostics do not echo configuration secrets', async () => {
  const root = fixture('private-diagnostics');
  saveSession(root);
  fs.writeFileSync(path.join(root, '.runtime/dev-session.json'), 'private-access-token-must-not-be-logged');
  const oldError = console.error, output = [];
  console.error = line => output.push(line);
  try {
    assert.equal(await main([], root), 1);
    assert.ok(!output.join('\n').includes('private-access-token'));
    assert.match(output[0], /metadata could not be read/);
  } finally { console.error = oldError; }
});

test('real isolated runner shuts down its owned companions and preserves an unrelated process', {
  skip: !['darwin', 'linux'].includes(process.platform),
}, async () => {
  const root = fixture('real-runner');
  const childProgram = path.join(root, 'fixture-child.cjs');
  const apiPid = path.join(root, 'api.pid'), metroPid = path.join(root, 'metro.pid');
  fs.writeFileSync(childProgram, 'require("node:fs").writeFileSync(process.argv[2],String(process.pid));setInterval(()=>{},1000);\n');
  const plan = { ...metadata(root), options: { go: false, configuredDb: false } };
  const services = [apiPid, metroPid].map((ready, index) => ({
    name: index ? 'Metro' : 'API', file: process.execPath, args: [childProgram, ready], cwd: root, env: { PATH: process.env.PATH },
  }));
  const runner = path.join(root, 'scripts/dev.cjs');
  fs.writeFileSync(runner,
    'const {writeDevSession,clearDevSession,runServices}=require(' + JSON.stringify(path.join(__dirname, 'dev.cjs')) + ');' +
    'writeDevSession(' + JSON.stringify(plan) + ');' +
    'runServices(' + JSON.stringify(services) + ',{log:()=>{},graceMs:300}).finally(()=>clearDevSession(' + JSON.stringify(root) +
    ')).then(code=>process.exitCode=code);\n');
  const supervisor = spawn(process.execPath, [runner, '--mobile-only'], { cwd: root, stdio: 'ignore' });
  const exited = new Promise(resolve => supervisor.once('exit', (code, signal) => resolve({ code, signal })));
  const outsider = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
  const outsiderExit = new Promise(resolve => outsider.once('exit', resolve));
  try {
    await until(() => fs.existsSync(apiPid) && fs.existsSync(metroPid));
    assert.equal(readDevSession(root).pid, supervisor.pid);
    const output = [];
    assert.equal(await stopSession(root, { log: line => output.push(line), timeoutMs: 5000 }), 0);
    await exited;
    await until(() => !alive(Number(fs.readFileSync(apiPid, 'utf8'))) && !alive(Number(fs.readFileSync(metroPid, 'utf8'))));
    assert.equal(readDevSession(root), null);
    assert.ok(alive(outsider.pid), 'An unrelated Node process must remain running');
    assert.match(output.join('\n'), /Stopped this checkout’s development runner/);
  } finally {
    if (alive(supervisor.pid)) { supervisor.kill('SIGTERM'); await exited; }
    outsider.kill('SIGTERM'); await outsiderExit;
  }
});
