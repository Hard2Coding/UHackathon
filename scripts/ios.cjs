'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const {
  makePlan,
  parseArgs,
  readPublicConfig,
  readDevSession,
  clearDevSession,
  validApiUrl,
} = require('./dev.cjs');

const ROOT = path.resolve(__dirname, '..');

function parseIosArgs(argv) {
  const runner = ['--mobile-only'];
  const native = [];
  let help = false;
  let dryRun = false;
  let explicitConnection = false;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];

    if (['--api-port', '--expo-port', '--port', '--host'].includes(arg)) {
      const value = argv[++index];

      if (!value || value.startsWith('--')) {
        throw Error(arg + ' needs a value');
      }

      runner.push(arg === '--port' ? '--expo-port' : arg, value);
      explicitConnection = true;
    } else if (['--remote-api', '--configured-db'].includes(arg)) {
      runner.push(arg);
      explicitConnection = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg !== '--no-bundler') {
      native.push(arg);
    }
  }

  return {
    runner,
    native,
    help,
    dryRun,
    explicitConnection,
  };
}

function iosRunnerArgs(
  options,
  root = ROOT,
  environment = process.env
) {
  const requested = parseArgs(options.runner);
  const settings = {
    ...readPublicConfig(root),
    ...environment,
  };
  const deviceSelection = options.native.some(arg =>
    arg === '--device' || arg === '-d' ||
    arg.startsWith('--device=') || arg.startsWith('-d=')
  );

  if (
    requested.host !== undefined ||
    settings.DEV_HOST !== undefined ||
    deviceSelection
  ) {
    return [...options.runner];
  }

  // Expo's no-device default is a simulator on this Mac.
  return [...options.runner, '--host', 'localhost'];
}

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== 'ESRCH';
  }
}

function validateSession(session, root) {
  if (!session || session.schemaVersion !== 1 || !alive(session.pid)) {
    return null;
  }

  if (
    session.root !== fs.realpathSync(root) ||
    session.appRoot !== path.join(fs.realpathSync(root), 'app')
  ) {
    return null;
  }

  if (!session.useExpo || session.go) {
    throw Error('The existing session uses Expo Go or has no Metro. Stop that session, then run npm run ios.');
  }

  for (const key of ['apiPort', 'expoPort']) {
    if (
      !Number.isInteger(session[key]) ||
      session[key] < 1 ||
      session[key] > 65535
    ) {
      throw Error('Invalid shared development port');
    }
  }

  validApiUrl(session.apiUrl);
  return session;
}

async function request(url, headers = {}, fetcher = fetch, signal) {
  const timeout = AbortSignal.timeout(3000);

  return fetcher(url, {
    headers,
    signal: signal
      ? AbortSignal.any([signal, timeout])
      : timeout,
  });
}

async function verifyReady(session, fetcher = fetch, signal) {
  const base = 'http://localhost:' + session.expoPort;

  const status = await request(
    base + '/status',
    {},
    fetcher,
    signal
  );

  if (
    !status.ok ||
    (await status.text()).trim() !== 'packager-status:running'
  ) {
    return false;
  }

  const response = await request(
    base + '/',
    {
      'expo-platform': 'ios',
      accept: 'application/expo+json',
    },
    fetcher,
    signal
  );

  if (!response.ok) return false;

  const manifest = await response.json();
  const projectRoot = manifest.extra?.expoClient?._internal?.projectRoot;

  if (
    !projectRoot ||
    fs.realpathSync(projectRoot) !== session.appRoot
  ) {
    throw Error(
      'Metro belongs to another checkout; it was left running.'
    );
  }

  if (session.useLocalApi) {
    const configured = new URL(session.apiUrl);
    const healthUrl = session.apiUrl.replace(/\/$/, '') + '/health';
    const localHealthUrl =
      `http://localhost:${session.apiPort}/api/health`;
    const loopback =
      ['localhost', '127.0.0.1', '::1', '[::1]']
        .includes(configured.hostname) &&
      configured.protocol === 'http:' &&
      Number(configured.port || 80) === session.apiPort &&
      configured.pathname.replace(/\/$/, '') === '/api';

    try {
      const health = await request(
        healthUrl,
        {},
        fetcher,
        signal
      );

      if (health.ok) {
        return (await health.json()).status === 'ok';
      }
    } catch (error) {
      if (signal?.aborted) {
        throw signal.reason;
      }
    }

    // Distinguish a stale LAN/configured address from models still starting.
    if (!loopback) {
      let localReady = false;

      try {
        const local = await request(
          localHealthUrl,
          {},
          fetcher,
          signal
        );
        localReady = local.ok &&
          (await local.json()).status === 'ok';
      } catch (error) {
        if (signal?.aborted) {
          throw signal.reason;
        }
      }

      if (localReady) {
        const error = Error(
          `Configured API URL ${session.apiUrl} is unreachable, ` +
          'although the local API is ready. Run npm run stop, ' +
          'then npm run ios to start a new simulator session. ' +
          'If EXPO_PUBLIC_API_URL is explicitly set, correct that URL first.'
        );
        error.code = 'UNREACHABLE_CONFIGURED_API';
        throw error;
      }
    }

    return false;
  }

  return true;
}

function nativeCommand(session, nativeArgs, root = ROOT) {
  return {
    file: process.execPath,

    args: [
      '--require',
      path.join(root, 'scripts/ios-viewer.cjs'),
      path.join(root, 'app/node_modules/expo/bin/cli'),
      'run:ios',
      '--port',
      String(session.expoPort),
      ...nativeArgs,
    ],

    cwd: path.join(root, 'app'),

    env: {
      ...process.env,
      EXPO_PUBLIC_API_URL: session.apiUrl,
      REACT_NATIVE_PACKAGER_HOSTNAME: session.host,
      RCT_METRO_PORT: String(session.expoPort),
      EXPO_NO_DOTENV: '1',
      EXPO_NO_TELEMETRY: '1',
      __UNSAFE_EXPO_HOME_DIRECTORY: path.join(
        root,
        '.runtime/expo'
      ),
    },
  };
}

async function waitReady(
  root,
  pid,
  logFile,
  timeoutMs = 180000,
  signal
) {
  const deadline = Date.now() + timeoutMs;
  let nextMessage = Date.now() + 10000;

  while (Date.now() < deadline) {
    if (signal?.aborted) {
      throw signal.reason;
    }

    if (!alive(pid)) {
      const tail = fs.existsSync(logFile)
        ? fs
            .readFileSync(logFile, 'utf8')
            .split(/\r?\n/)
            .slice(-18)
            .join('\n')
        : '';

      throw Error(
        'Development servers stopped before becoming ready.\n' +
          tail
      );
    }

    const session = validateSession(
      readDevSession(root),
      root
    );

    if (session) {
      try {
        if (
          await verifyReady(
            session,
            fetch,
            signal
          )
        ) {
          return session;
        }
      } catch (error) {
        if (signal?.aborted) {
          throw signal.reason;
        }

        if (
          error.message.includes('another checkout') ||
          error.code === 'UNREACHABLE_CONFIGURED_API'
        ) {
          throw error;
        }
      }
    }

    if (Date.now() >= nextMessage) {
      console.log(
        'Preparing the API/models and Metro... Details: ' +
          logFile
      );

      nextMessage = Date.now() + 10000;
    }

    try {
      await delay(500, undefined, { signal });
    } catch (error) {
      throw signal?.aborted
        ? signal.reason
        : error;
    }
  }

  throw Error(
    'Startup timed out. Check ' + logFile
  );
}

function checkOverrides(existing, options, root) {
  if (!existing) return;

  const settings = {
    API_PORT: String(existing.apiPort),
    EXPO_PORT: String(existing.expoPort),
    DEV_HOST: existing.host,
    EXPO_PUBLIC_API_URL: existing.apiUrl,

    // Actual supplied values win; defaults alone inherit
    // the running connection.
    ...readPublicConfig(root),
    ...process.env,
  };

  const requested = makePlan(
    parseArgs(options.runner),
    settings,
    root
  );

  const conflicts = [];

  if (requested.expoPort !== existing.expoPort) {
    conflicts.push('EXPO_PORT');
  }

  if (requested.apiPort !== existing.apiPort) {
    conflicts.push('API_PORT');
  }

  if (requested.host !== existing.host) {
    conflicts.push('DEV_HOST');
  }

  if (requested.apiUrl !== existing.apiUrl) {
    conflicts.push('EXPO_PUBLIC_API_URL');
  }

  if (
    options.runner.includes('--remote-api') &&
    existing.useLocalApi
  ) {
    conflicts.push('local/remote API mode');
  }

  if (
    options.runner.includes('--configured-db') &&
    !existing.configuredDb
  ) {
    conflicts.push('database mode');
  }

  if (conflicts.length) {
    throw Error(
      'A shared session already runs on Metro ' +
        existing.expoPort +
        ' / API ' +
        existing.apiPort +
        '. Conflicting settings: ' +
        conflicts.join(', ') +
        '. Run npm run ios without conflicting overrides, or stop that session first.'
    );
  }
}

function cancelledStartup(signal) {
  const error = Error(
    `iOS startup cancelled (${signal}); its newly started servers were stopped.`
  );

  error.exitCode =
    signal === 'SIGINT' ? 130 : 143;

  return error;
}

async function ensureServers(options, root = ROOT) {
  const previous = readDevSession(root);
  const existing = validateSession(
    previous,
    root
  );

  if (existing) {
    checkOverrides(
      existing,
      options,
      root
    );

    return waitReady(
      root,
      existing.pid,
      path.join(
        root,
        '.runtime/dev-ios.log'
      )
    );
  }

  if (
    previous &&
    !alive(previous.pid)
  ) {
    clearDevSession(
      root,
      previous.pid
    );
  }

  const directory = path.join(
    root,
    '.runtime'
  );

  fs.mkdirSync(directory, {
    recursive: true,
  });

  const logFile = path.join(
    directory,
    'dev-ios.log'
  );

  const output = fs.openSync(
    logFile,
    'a',
    0o600
  );

  let child;
  let finished;
  let exited = false;

  const startup =
    new AbortController();

  const onInterrupt = () =>
    startup.abort(
      cancelledStartup('SIGINT')
    );

  const onTerminate = () =>
    startup.abort(
      cancelledStartup('SIGTERM')
    );

  process.once(
    'SIGINT',
    onInterrupt
  );

  process.once(
    'SIGTERM',
    onTerminate
  );

  try {
    try {
      child = spawn(
        process.execPath,
        [
          path.join(
            root,
            'scripts/dev.cjs'
          ),
          ...iosRunnerArgs(options, root),
        ],
        {
          cwd: root,
          env: process.env,
          detached: true,
          stdio: [
            'ignore',
            output,
            output,
          ],
        }
      );
    } finally {
      fs.closeSync(output);
    }

    let spawnError;

    finished = new Promise(resolve => {
      child.once(
        'error',
        error => {
          spawnError = error;
          exited = true;
          resolve();
        }
      );

      child.once(
        'exit',
        () => {
          exited = true;
          resolve();
        }
      );
    });

    child.unref();

    await new Promise(resolve =>
      setImmediate(resolve)
    );

    if (startup.signal.aborted) {
      throw startup.signal.reason;
    }

    if (spawnError) {
      throw spawnError;
    }

    console.log(
      'Starting shared API + Metro. They stay running after the iOS app opens.'
    );

    return await waitReady(
      root,
      child.pid,
      logFile,
      180000,
      startup.signal
    );
  } catch (error) {
    if (child && !exited) {
      // This runner owns the companion groups
      // and performs their shutdown itself.
      child.kill('SIGTERM');

      await new Promise(resolve => {
        const timeout = setTimeout(
          resolve,
          6500
        );

        finished.then(() => {
          clearTimeout(timeout);
          resolve();
        });
      });

      if (!exited) {
        child.kill('SIGKILL');
      }
    }

    throw startup.signal.aborted
      ? startup.signal.reason
      : error;
  } finally {
    process.removeListener(
      'SIGINT',
      onInterrupt
    );

    process.removeListener(
      'SIGTERM',
      onTerminate
    );
  }
}

async function main(
  argv = process.argv.slice(2),
  root = ROOT
) {
  try {
    const options = parseIosArgs(argv);

    if (options.help) {
      console.log(
        'npm run ios: start/reuse the shared API and Metro, build/install and open iOS.\n' +
          'Options: --device <name-or-UDID>, --port <Metro-port>, --api-port <port>, --host <host>, --dry-run.\n' +
          'The installed Expo CLI in app/ is used; no npx download is needed.'
      );

      return 0;
    }

    if (process.platform !== 'darwin') {
      throw Error(
        'iOS requires macOS and Xcode. Use npm run dev for the web app.'
      );
    }

    const existing = validateSession(
      readDevSession(root),
      root
    );

    if (options.dryRun) {
      checkOverrides(
        existing,
        options,
        root
      );

      const plan =
        existing ||
        (() => {
          const p = makePlan(
            parseArgs(iosRunnerArgs(options, root)),
            process.env,
            root
          );

          return {
            ...p,
            appRoot: path.join(
              root,
              'app'
            ),
          };
        })();

      console.log(
        JSON.stringify(
          {
            apiUrl: plan.apiUrl,
            expoPort: plan.expoPort,
            native: nativeCommand(
              plan,
              options.native,
              root
            ).args,
          },
          null,
          2
        )
      );

      return 0;
    }

    if (
      !fs.existsSync(
        path.join(
          root,
          'app/node_modules/expo/bin/cli'
        )
      )
    ) {
      throw Error(
        'Dependencies are missing. Run npm install in the repository root.'
      );
    }

    const session =
      await ensureServers(
        options,
        root
      );

    console.log(
      'Using shared Metro ' +
        session.expoPort +
        ' and API ' +
        session.apiUrl
    );

    const command =
      nativeCommand(
        session,
        options.native,
        root
      );

    const child = spawn(
      command.file,
      command.args,
      {
        cwd: command.cwd,
        env: command.env,
        stdio: 'inherit',
      }
    );

    return await new Promise(
      (resolve, reject) => {
        child.once(
          'error',
          reject
        );

        child.once(
          'exit',
          (code, signal) =>
            resolve(
              signal
                ? 1
                : (code ?? 1)
            )
        );
      }
    );
  } catch (error) {
    console.error(
      'ScamGraph iOS: ' +
        error.message
    );

    return (
      error.exitCode || 1
    );
  }
}

module.exports = {
  parseIosArgs,
  iosRunnerArgs,
  validateSession,
  verifyReady,
  nativeCommand,
  ensureServers,
  main,
};

if (require.main === module) {
  main().then(code => {
    process.exitCode = code;
  });
}
