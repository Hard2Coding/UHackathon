'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { readDevSession, clearDevSession } = require('./dev.cjs');
const ROOT = path.resolve(__dirname, '..');

function processIsAlive(pid, signal = process.kill) {
  try { signal(pid, 0); return true; }
  catch (error) { return error.code !== 'ESRCH'; }
}

function readSession(root) {
  try { return readDevSession(root); }
  catch { throw Error('Development session metadata could not be read. No processes were stopped.'); }
}

function validateSession(session, root) {
  if (!session || session.schemaVersion !== 1 || !Number.isInteger(session.pid) || session.pid <= 0) {
    throw Error('Development session metadata is invalid. No processes were stopped.');
  }
  const actualRoot = fs.realpathSync(root);
  if (session.root !== actualRoot || session.appRoot !== path.join(actualRoot, 'app')) {
    throw Error('Development session belongs to another checkout. No processes were stopped.');
  }
  return session;
}

function inspectProcess(pid, root, platform = process.platform) {
  if (platform === 'linux') {
    try {
      const argv = fs.readFileSync('/proc/' + pid + '/cmdline', 'utf8').split('\0').filter(Boolean);
      const cwd = fs.readlinkSync('/proc/' + pid + '/cwd');
      return { pid, argv, cwd };
    } catch { return null; }
  }
  if (platform !== 'darwin') throw Error('npm run stop requires macOS, Linux, or WSL. No processes were stopped.');
  const command = spawnSync('/bin/ps', ['-ww', '-p', String(pid), '-o', 'command='], { encoding: 'utf8', timeout: 1000 });
  const location = spawnSync('/usr/sbin/lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], { encoding: 'utf8', timeout: 1000 });
  if (command.status !== 0 || location.status !== 0) return null;
  const cwd = location.stdout.split(/\r?\n/).find(line => line.startsWith('n'))?.slice(1);
  const match = command.stdout.trim().match(/^(\S+)\s+([\s\S]+)$/);
  if (!cwd || !match) return null;
  const executable = match[1], rest = match[2];
  const absoluteScript = path.join(root, 'scripts/dev.cjs');
  // ps cannot delimit unquoted arguments. Match the known absolute script path
  // first (including spaces), then the normal relative first argument.
  let script;
  if (rest === absoluteScript || rest.startsWith(absoluteScript + ' ')) script = absoluteScript;
  else script = rest.split(/\s+/, 1)[0];
  return { pid, argv: [executable, script], cwd };
}

function isOwnedRunner(identity, root, pid) {
  if (!identity || identity.pid !== pid || !Array.isArray(identity.argv) || identity.argv.length < 2) return false;
  if (!/^(?:node|nodejs)(?:\.exe)?$/i.test(path.basename(identity.argv[0]))) return false;
  try {
    if (fs.realpathSync(identity.cwd) !== fs.realpathSync(root)) return false;
    const script = path.resolve(identity.cwd, identity.argv[1]);
    const expected = path.join(fs.realpathSync(root), 'scripts/dev.cjs');
    return script === expected && fs.realpathSync(script) === fs.realpathSync(expected);
  } catch { return false; }
}

function sameOwner(left, right) {
  return !!left && !!right && left.schemaVersion === right.schemaVersion &&
    left.pid === right.pid && left.root === right.root && left.appRoot === right.appRoot;
}

async function stopSession(root = ROOT, {
  timeoutMs = 8000, pollMs = 100,
  inspect = inspectProcess, signal = process.kill,
  now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  log = console.log,
} = {}) {
  const session = readSession(root);
  if (!session) { log('No registered development session is running.'); return 0; }
  validateSession(session, root);
  const unchanged = () => {
    const current = readSession(root);
    if (current && !sameOwner(current, session)) throw Error('The development session changed. Its processes were left running.');
    return current;
  };
  if (!processIsAlive(session.pid, signal)) {
    if (!sameOwner(unchanged(), session)) throw Error('The development session changed. Its metadata was left intact.');
    clearDevSession(root, session.pid);
    log('Removed metadata for an exited development runner.');
    return 0;
  }
  if (!isOwnedRunner(inspect(session.pid, root), root, session.pid)) {
    throw Error('The registered PID is not this checkout’s Node development runner. No processes were stopped.');
  }
  // The PID and metadata can change between the first inspection and signaling.
  if (!sameOwner(unchanged(), session) ||
      !isOwnedRunner(inspect(session.pid, root), root, session.pid)) {
    throw Error('Development runner identity changed. No processes were stopped.');
  }
  try { signal(session.pid, 'SIGTERM'); }
  catch (error) {
    if (error.code !== 'ESRCH') throw Error('The verified development runner could not be stopped.');
  }
  const finishStopped = () => {
    const current = unchanged();
    if (current) clearDevSession(root, session.pid);
    log('Stopped this checkout’s development runner and its API/Metro servers.');
    return 0;
  };
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    unchanged();
    if (!processIsAlive(session.pid, signal)) return finishStopped();
    const observed = inspect(session.pid, root);
    if (!observed) {
      // A runner can exit between the liveness probe and ps/lsof inspection.
      // Zombies may also have no readable argv/cwd until their parent reaps them.
      if (!processIsAlive(session.pid, signal)) return finishStopped();
      // Unknown identity is never a reason to signal again or clear metadata.
      // Wait within the same deadline; a readable replacement is refused below.
      await sleep(pollMs);
      continue;
    }
    if (!isOwnedRunner(observed, root, session.pid)) {
      throw Error('Runner identity changed during shutdown. The replacement process was left running.');
    }
    await sleep(pollMs);
  }
  throw Error('Shutdown timed out. The verified runner received SIGTERM; no other processes were stopped.');
}

async function main(argv = process.argv.slice(2), root = ROOT, dependencies) {
  try {
    if (argv.length) {
      if (argv.length === 1 && ['--help', '-h'].includes(argv[0])) {
        console.log('npm run stop: stop only this checkout’s verified API/Metro development runner.');
        return 0;
      }
      throw Error('Unknown option. Use npm run stop without arguments.');
    }
    return await stopSession(root, dependencies);
  } catch (error) { console.error('ScamGraph stop: ' + error.message); return 1; }
}

module.exports = { processIsAlive, validateSession, inspectProcess, isOwnedRunner, stopSession, main };
if (require.main === module) main().then(code => { process.exitCode = code; });
