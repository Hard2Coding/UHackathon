#!/usr/bin/env node
'use strict';

// One Metro process serves the shared React Native source to mobile and web.
// This script uses only Node built-ins; application dependencies stay in app/.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_CONFIG_KEYS = new Set(['API_PORT', 'EXPO_PORT', 'DEV_HOST', 'EXPO_PUBLIC_API_URL', 'CORS_ORIGINS', 'OAUTH_REDIRECT_ALLOWLIST']);

const HELP = `ScamGraph AI: shared mobile + web development

  npm run dev                    API reload + one Expo Metro for web and native
  npm run web                    API reload + open web
  npm run mobile                 API reload + native development client
  npm run dev:go                 Core app in Expo Go (caller protection unavailable)
  npm run api                    Only local demo API, with reload
  npm run dev -- --dry-run        Show public URLs/commands; start no processes

Options:
  --api-port <1..65535>           Local API port (API_PORT; default 8000)
  --expo-port <1..65535>          Metro/web port (EXPO_PORT; default 8081)
  --host <hostname-or-IP>         Reachable API/Metro host (DEV_HOST; detects LAN IPv4)
  --remote-api                   Use EXPO_PUBLIC_API_URL without starting a local API
  --configured-db                Use DATABASE_URL instead of explicit SQLite demo
  --go                           Expo Go instead of native development client
  --web-only | --mobile-only | --api-only
  --dry-run | --help

EXPO_PUBLIC_API_URL in the environment or root .env is honored exactly.
Use your computer's LAN IP for a physical phone on the same network.
The local runner sets development mode and adds its own web origins to CORS.
It never kills existing servers or changes HOME. Ctrl+C stops only its children.
`;

function readPublicConfig(root) {
  const file = path.join(root, '.env');
  if (!fs.existsSync(file)) return {};
  const config = {};
  // Read only runner settings, never print or copy backend secrets into Metro.
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || !PUBLIC_CONFIG_KEYS.has(match[1])) continue;
    let value = match[2];
    if (value.startsWith('"') || value.startsWith("'")) {
      const quote = value[0];
      const end = value.indexOf(quote, 1);
      if (end < 0 || !/^\s*(?:#.*)?$/.test(value.slice(end + 1))) throw new Error(`Invalid quoted ${match[1]} in .env`);
      value = value.slice(1, end);
    } else value = value.replace(/\s+#.*$/, '').trim();
    config[match[1]] = value;
  }
  return config;
}

function parseArgs(argv) {
  const options = { mode: 'both', go: false, remoteApi: false, configuredDb: false, dryRun: false, help: false };
  const values = new Map([['--api-port', 'apiPort'], ['--expo-port', 'expoPort'], ['--host', 'host']]);
  const modes = new Map([['--web-only', 'web'], ['--mobile-only', 'mobile'], ['--api-only', 'api']]);
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (values.has(arg)) {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`${arg} needs a value`);
      options[values.get(arg)] = value;
    } else if (modes.has(arg)) {
      if (options.mode !== 'both') throw new Error('Choose only one of --web-only, --mobile-only and --api-only');
      options.mode = modes.get(arg);
    } else if (arg === '--go') options.go = true;
    else if (arg === '--remote-api') options.remoteApi = true;
    else if (arg === '--configured-db') options.configuredDb = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown option: ${arg}. Use --help.`);
  }
  if (options.remoteApi && options.mode === 'api') throw new Error('--remote-api cannot be used with --api-only');
  return options;
}

function portNumber(value, name) {
  if (!/^\d+$/.test(String(value))) throw new Error(`${name} must be an integer port`);
  const port = Number(value);
  if (port < 1 || port > 65535) throw new Error(`${name} must be between 1 and 65535`);
  return port;
}

function lanAddress(interfaces = os.networkInterfaces()) {
  const candidates = Object.entries(interfaces).flatMap(([name, entries]) => (entries || [])
    .filter(entry => (entry.family === 'IPv4' || entry.family === 4) && !entry.internal && net.isIP(entry.address) === 4)
    .map(entry => ({ name, address: entry.address })));
  const physical = candidates.filter(entry => !/^(docker|veth|br-|virbr|utun|tun|tailscale|vmnet|vbox)/i.test(entry.name));
  return (physical[0] || candidates[0])?.address || 'localhost';
}

function validHost(value) {
  const host = value.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) return host;
  if (!host || host.length > 253 || !/^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(host) || host.includes('..')) {
    throw new Error('DEV_HOST/--host must be a hostname or IP only, without a scheme, port or path');
  }
  return host;
}

function urlHost(host) { return net.isIP(host) === 6 ? `[${host}]` : host; }

function validApiUrl(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('EXPO_PUBLIC_API_URL must be an absolute http(s) URL'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('EXPO_PUBLIC_API_URL must use http(s), without credentials, query or fragment');
  }
  if (!/\/api\/?$/.test(parsed.pathname)) throw new Error('EXPO_PUBLIC_API_URL must end in /api (or /api/)');
  return value;
}

function appendOrigins(configured, additions) {
  return [...new Set([...(configured || '').split(',').map(item => item.trim()).filter(Boolean), ...additions])].join(',');
}

function makePlan(options, environment = process.env, root = ROOT, interfaces) {
  const local = readPublicConfig(root);
  const settings = { ...local, ...environment };
  const apiPort = portNumber(options.apiPort ?? settings.API_PORT ?? '8000', 'API_PORT');
  const expoPort = portNumber(options.expoPort ?? settings.EXPO_PORT ?? '8081', 'EXPO_PORT');
  const host = validHost(options.host ?? settings.DEV_HOST ?? lanAddress(interfaces));
  const useLocalApi = !options.remoteApi;
  const useExpo = options.mode !== 'api';
  if (useLocalApi && useExpo && apiPort === expoPort) throw new Error('API_PORT and EXPO_PORT must be different');
  if (options.remoteApi && !settings.EXPO_PUBLIC_API_URL) throw new Error('--remote-api requires EXPO_PUBLIC_API_URL');
  const apiUrl = validApiUrl(settings.EXPO_PUBLIC_API_URL || `http://${urlHost(host)}:${apiPort}/api`);
  const python = environment.SCAMGRAPH_PYTHON || path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const expoCli = path.join(root, 'app/node_modules/expo/bin/cli');
  const runtime = path.join(root, '.runtime');
  const commonEnv = {
    ...environment,
    EXPO_PUBLIC_API_URL: apiUrl,
    EXPO_NO_TELEMETRY: '1',
    __UNSAFE_EXPO_HOME_DIRECTORY: path.join(runtime, 'expo'),
    NPM_CONFIG_CACHE: path.join(runtime, 'npm-cache'),
  };
  const webOrigins = [`http://localhost:${expoPort}`, `http://127.0.0.1:${expoPort}`, `http://${urlHost(host)}:${expoPort}`];
  const apiEnv = {
    ...commonEnv,
    APP_ENV: 'development',
    API_PORT: String(apiPort),
    PYTHONPATH: [root, environment.PYTHONPATH].filter(Boolean).join(path.delimiter),
    OMP_NUM_THREADS: environment.OMP_NUM_THREADS || '1',
    TOKENIZERS_PARALLELISM: 'false',
    HF_HOME: environment.HF_HOME || path.join(runtime, 'huggingface'),
    PIP_CACHE_DIR: environment.PIP_CACHE_DIR || path.join(runtime, 'pip-cache'),
    CORS_ORIGINS: appendOrigins(settings.CORS_ORIGINS, webOrigins),
    OAUTH_REDIRECT_ALLOWLIST: appendOrigins(settings.OAUTH_REDIRECT_ALLOWLIST, [...webOrigins.map(origin => `${origin}/`), 'scamgraph://oauth']),
  };
  if (process.platform === 'darwin') {
    const torchLib = path.join(root, '.venv/lib/python3.12/site-packages/torch/lib');
    if (fs.existsSync(torchLib)) apiEnv.DYLD_LIBRARY_PATH = [torchLib, environment.DYLD_LIBRARY_PATH].filter(Boolean).join(':');
    if (fs.existsSync(path.join(runtime, 'ocr/bin/tesseract'))) {
      apiEnv.TESSERACT_CMD = path.join(root, 'scripts/tesseract_wrapper.sh');
      apiEnv.TESSDATA_PREFIX = path.join(runtime, 'ocr/share/tessdata');
    }
  }
  // Restrict app dotenv loading to EXPO_PUBLIC_*; backend loads root .env itself.
  // An explicitly provided environment remains intact; no secret values are logged.
  const expoEnv = { ...commonEnv, EXPO_NO_DOTENV: '1', REACT_NATIVE_PACKAGER_HOSTNAME: host };
  const expoArgs = [expoCli, 'start', options.go ? '--go' : '--dev-client', '--lan', '--port', String(expoPort), '--clear'];
  if (options.mode !== 'mobile') expoArgs.push('--web');
  const apiArgs = [path.join(root, 'scripts/start_api.py'), '--reload'];
  if (!options.configuredDb) apiArgs.push('--sqlite-demo');
  const services = [];
  if (useLocalApi) services.push({ name: 'API', file: python, args: apiArgs, cwd: root, env: apiEnv });
  if (useExpo) services.push({ name: 'Expo', file: process.execPath, args: expoArgs, cwd: path.join(root, 'app'), env: expoEnv });
  return { root, apiPort, expoPort, host, apiUrl, python, expoCli, useLocalApi, useExpo, services, options, webUrl: `http://localhost:${expoPort}/` };
}

async function ensurePortAvailable(port, label) {
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', error => reject(new Error(`${label} port ${port} is unavailable (${error.code}). Choose another port; existing servers were left running.`)));
    probe.listen({ port, host: '0.0.0.0', exclusive: true }, () => probe.close(resolve));
  });
}

async function preflight(plan) {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) throw new Error('Node.js 20 or newer is required.');
  if (plan.useLocalApi) {
    if (!fs.existsSync(plan.python)) throw new Error('Python environment is missing. Run bash scripts/bootstrap.sh or set SCAMGRAPH_PYTHON to the installed project Python.');
    const check = spawnSync(plan.python, ['-c', 'import fastapi, uvicorn, sqlalchemy, alembic, dotenv'], { cwd: plan.root, env: plan.services.find(service => service.name === 'API').env, encoding: 'utf8' });
    if (check.error || check.status !== 0) throw new Error('API dependencies are unavailable. Run bash scripts/bootstrap.sh.');
    await ensurePortAvailable(plan.apiPort, 'API');
  }
  if (plan.useExpo) {
    if (!fs.existsSync(plan.expoCli)) throw new Error('Expo dependencies are missing. Run npm ci --prefix app (or bash scripts/bootstrap.sh).');
    await ensurePortAvailable(plan.expoPort, 'Expo');
  }
}

function signalOwnedChild(child, signal) {
  if (!child.pid) return;
  try {
    if (process.platform === 'win32') {
      // Windows has no POSIX process groups; target only this created PID tree.
      spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else process.kill(-child.pid, signal); // detached group created by this runner only
  } catch (error) {
    if (error.code !== 'ESRCH') child.kill(signal);
  }
}

function runServices(services, { log = console.log, graceMs = 5000 } = {}) {
  return new Promise(resolve => {
    const children = [];
    let stopping = false;
    let finalCode = 0;
    let pending = 0;
    let escalation;
    let escalated = false;
    const ownGroupExists = child => {
      if (process.platform === 'win32' || !child.pid) return false;
      try { process.kill(-child.pid, 0); return true; } catch { return false; }
    };
    const finish = () => {
      if (!stopping || pending !== 0) return;
      // A reloader/bundler can leave grandchildren after its direct child exits.
      // Keep the deadline active until its own group has gone, then reap safely.
      if (!escalated && children.some(ownGroupExists)) return;
      clearTimeout(escalation);
      process.removeListener('SIGINT', onInterrupt);
      process.removeListener('SIGTERM', onTerminate);
      resolve(finalCode);
    };
    const stop = code => {
      if (stopping) return;
      stopping = true;
      finalCode = code;
      log('Stopping only the API/Expo processes started by this command...');
      for (const child of children) signalOwnedChild(child, 'SIGTERM');
      escalation = setTimeout(() => {
        escalated = true;
        for (const child of children) signalOwnedChild(child, 'SIGKILL');
        // Reap the direct children after escalation; exit events complete the promise.
        finish();
      }, graceMs);
      finish();
    };
    const onInterrupt = () => stop(130);
    const onTerminate = () => stop(143);
    process.once('SIGINT', onInterrupt);
    process.once('SIGTERM', onTerminate);
    if (!services.length) { stop(0); return; }
    for (const service of services) {
      if (stopping) break;
      const child = spawn(service.file, service.args, { cwd: service.cwd, env: service.env, stdio: 'inherit', detached: process.platform !== 'win32' });
      children.push(child);
      pending++;
      let completed = false;
      const complete = (code, signal, error) => {
        if (completed) return;
        completed = true;
        pending--;
        if (!stopping) {
          log(error ? `${service.name} failed to start: ${error.code || error.message}` : `${service.name} exited (${signal || code}).`);
          stop(error ? 1 : (code || 0));
        }
        finish();
      };
      child.once('error', error => complete(null, null, error));
      child.once('exit', (code, signal) => complete(code, signal));
    }
  });
}

function printPlan(plan) {
  console.log(`Shared API URL: ${plan.apiUrl}`);
  if (plan.useLocalApi) console.log(`API docs: http://localhost:${plan.apiPort}/docs (${plan.options.configuredDb ? 'configured database' : 'explicit SQLite local demo'}; code reload on)`);
  if (plan.useExpo) console.log(`Web: ${plan.webUrl}\nMobile Metro host: ${plan.host}:${plan.expoPort} (${plan.options.go ? 'Expo Go: caller protection unavailable' : 'native development client required'})`);
  if (plan.useExpo && ['localhost', '127.0.0.1', '::1'].includes(new URL(plan.apiUrl).hostname.replace(/^\[|\]$/g, ''))) console.log('Physical phones cannot reach localhost on your computer. Set EXPO_PUBLIC_API_URL to its LAN IP or an HTTPS API.');
  if (plan.useExpo && plan.host === 'localhost') console.log('No LAN IPv4 found. Set DEV_HOST for a physical phone, or use a simulator.');
  if (plan.options.dryRun) for (const service of plan.services) console.log(`${service.name}: ${service.file} ${service.args.map(arg => /\s/.test(arg) ? JSON.stringify(arg) : arg).join(' ')}`);
}

async function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv);
    if (options.help) { console.log(HELP); return 0; }
    const plan = makePlan(options);
    printPlan(plan);
    if (options.dryRun) return 0;
    await preflight(plan);
    fs.mkdirSync(path.join(ROOT, '.runtime'), { recursive: true });
    return await runServices(plan.services);
  } catch (error) {
    console.error(`ScamGraph development: ${error.message}`);
    return 1;
  }
}

module.exports = { parseArgs, makePlan, validApiUrl, ensurePortAvailable, preflight, runServices, main };
if (require.main === module) main().then(code => { process.exitCode = code; });
