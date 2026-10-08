'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const filename = path.join(__dirname, 'ios-viewer.cjs');
const source = fs.readFileSync(filename, 'utf8');
const selected = '/Applications/Xcode.app/Contents/Developer';
const deviceHub = path.resolve(selected, '../Applications/DeviceHub.app');
const simulator = path.join(selected, 'Applications/Simulator.app');

function harness(config = {}) {
  const syncCalls = [], openCalls = [], resolutionCalls = [], instructions = [];
  let oldAssertionCalls = 0, resetCalls = 0;
  // Expo SDK 55 creates its singleton before this preload runs. The constructor
  // memoizes a BOUND method, so replacing only the prototype leaves stale code.
  class SimulatorAppPrerequisite {
    constructor() { this._bindAssertion(); }
    _bindAssertion() {
      const bound = this.assertImplementation.bind(this);
      let pending;
      this._assertAsync = () => pending || (pending = Promise.resolve().then(bound));
    }
    resetAssertion() { resetCalls++; this.cachedError = undefined; this._bindAssertion(); }
    async assertAsync() {
      if (this.cachedError) throw this.cachedError;
      return this._assertAsync();
    }
    async assertImplementation() {
      oldAssertionCalls++;
      throw Error('Legacy Simulator app unavailable');
    }
  }
  SimulatorAppPrerequisite.instance = new SimulatorAppPrerequisite();
  if (config.cachedError) SimulatorAppPrerequisite.instance.cachedError = Error('Cached legacy Simulator failure');
  class AppleDeviceManager {
    constructor(udid, name) { this.device = { udid, name }; }
    async activateWindowAsync() { throw Error('Legacy viewer activation used'); }
  }
  const allowed = new Set(config.viewers ?? [deviceHub]);
  const mockRequire = name => {
    if (name === 'node:fs') return { existsSync: file => allowed.has(file) };
    if (name === 'node:path') return path;
    if (name === 'node:module') return {
      createRequire: file => {
        resolutionCalls.push(file);
        return { resolve: request => request.endsWith('/AppleDeviceManager.js') ? 'mock:manager' : 'mock:prerequisite' };
      },
    };
    if (name === 'mock:manager') return { AppleDeviceManager };
    if (name === 'mock:prerequisite') return { SimulatorAppPrerequisite };
    if (name === 'node:child_process') return {
      spawnSync: (file, args, options) => {
        syncCalls.push({ file, args: Array.from(args), options });
        if (file === 'xcode-select') return { status: config.xcodeStatus ?? 0, stdout: selected + '\n' };
        if (file === 'plutil') return { status: config.identityStatus ?? 0, stdout: (config.bundleId ?? 'com.apple.dt.Devices') + '\n' };
        if (file === 'xcrun') return { status: config.simctlStatus ?? 0, stdout: 'simctl help' };
        throw Error('Unexpected synchronous command: ' + file);
      },
      spawn: (file, args, options) => {
        openCalls.push({ file, args: Array.from(args), options });
        const child = new EventEmitter();
        queueMicrotask(() => config.openError ? child.emit('error', config.openError) : child.emit('exit', config.openCode ?? 0));
        return child;
      },
    };
    throw Error('Unexpected preload import: ' + name);
  };
  const context = {
    require: mockRequire, __dirname, module: { exports: {} },
    process: { env: config.headless ? { SCAMGRAPH_IOS_HEADLESS: '1' } : {} },
    console: { log: value => instructions.push(value) },
  };
  const execute = () => vm.runInNewContext(source, context, { filename });
  return {
    execute, syncCalls, openCalls, resolutionCalls, instructions, AppleDeviceManager, SimulatorAppPrerequisite,
    oldAssertionCalls: () => oldAssertionCalls, resetCalls: () => resetCalls,
  };
}

test('preload resets the singleton bound assertion and clears an earlier cached Simulator failure', async () => {
  const h = harness({ cachedError: true });
  h.execute();
  assert.equal(h.resetCalls(), 1);
  await h.SimulatorAppPrerequisite.instance.assertAsync();
  await h.SimulatorAppPrerequisite.instance.assertAsync();
  assert.equal(h.oldAssertionCalls(), 0, 'The singleton must never invoke its constructor-bound legacy method');
  assert.equal(h.syncCalls.filter(call => call.file === 'plutil').length, 1, 'The replacement assertion still memoizes successful validation');
  assert.equal(h.syncCalls.filter(call => call.file === 'xcrun').length, 1);
});

test('DeviceHub validates its bundle identity and simctl before native launch', async () => {
  const h = harness();
  h.execute();
  await h.SimulatorAppPrerequisite.instance.assertAsync();
  assert.deepEqual(h.syncCalls.map(call => [call.file, call.args]), [
    ['xcode-select', ['-p']],
    ['plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', path.join(deviceHub, 'Contents/Info.plist')]],
    ['xcrun', ['simctl', 'help']],
  ]);
  assert.equal(h.resolutionCalls[0], path.resolve(__dirname, '../app/node_modules/expo/package.json'));
  assert.equal(h.openCalls.length, 0, 'Validation must not activate a window');
});

test('an unrecognized or unreadable viewer bundle fails before invoking simctl or GUI', async () => {
  for (const config of [{ bundleId: 'com.example.untrusted-viewer' }, { identityStatus: 1 }]) {
    const h = harness(config);
    h.execute();
    await assert.rejects(h.SimulatorAppPrerequisite.instance.assertAsync(), /could not be validated/);
    assert.equal(h.syncCalls.filter(call => call.file === 'xcrun').length, 0);
    assert.equal(h.openCalls.length, 0);
  }
});

test('an unavailable selected simulator toolchain is reported before GUI activation', async () => {
  const h = harness({ simctlStatus: 1 });
  h.execute();
  await assert.rejects(h.SimulatorAppPrerequisite.instance.assertAsync(), /simulator toolchain is unavailable/);
  assert.equal(h.syncCalls.filter(call => call.file === 'xcrun').length, 1);
  assert.equal(h.openCalls.length, 0);
});

test('older Xcode selects Simulator.app and accepts both supported legacy bundle identities', async () => {
  for (const bundleId of ['com.apple.iphonesimulator', 'com.apple.CoreSimulator.SimulatorTrampoline']) {
    const h = harness({ viewers: [simulator], bundleId });
    h.execute();
    await h.SimulatorAppPrerequisite.instance.assertAsync();
    const identity = h.syncCalls.find(call => call.file === 'plutil');
    assert.equal(identity.args.at(-1), path.join(simulator, 'Contents/Info.plist'));
    await new h.AppleDeviceManager('legacy-udid').activateWindowAsync();
    assert.deepEqual(h.openCalls[0].args, ['-a', simulator, '--args', '-CurrentDeviceUDID', 'legacy-udid']);
    assert.equal(h.instructions.length, 0);
  }
});

test('DeviceHub activation opens the verified viewer plainly and identifies the running device in the sidebar instruction', async () => {
  const h = harness({ viewers: [deviceHub, simulator] });
  h.execute();
  await new h.AppleDeviceManager('requested-device-udid', 'iPhone 17').activateWindowAsync();
  assert.equal(h.openCalls[0].file, 'open');
  assert.deepEqual(h.openCalls[0].args, ['-a', deviceHub]);
  assert.equal(h.openCalls[0].options.stdio, 'ignore');
  assert.equal(h.instructions[0], 'DeviceHub: select iPhone 17 in the sidebar to view the running simulator.');
  await new h.AppleDeviceManager('fallback-device-udid').activateWindowAsync();
  assert.deepEqual(h.openCalls[1].args, ['-a', deviceHub]);
  assert.equal(h.instructions[1], 'DeviceHub: select fallback-device-udid in the sidebar to view the running simulator.');
  await new h.AppleDeviceManager(undefined).activateWindowAsync();
  assert.deepEqual(h.openCalls[2].args, ['-a', deviceHub]);
  assert.equal(h.instructions[2], 'DeviceHub: select the booted device in the sidebar to view the running simulator.');
});

test('headless native builds never invoke a GUI activation command', async () => {
  const h = harness({ headless: true });
  h.execute();
  await h.SimulatorAppPrerequisite.instance.assertAsync();
  await new h.AppleDeviceManager('headless-udid', 'iPhone 17').activateWindowAsync();
  assert.equal(h.openCalls.length, 0);
  assert.equal(h.instructions.length, 0);
});

test('viewer activation errors propagate instead of reporting the app as opened', async () => {
  for (const config of [{ openCode: 1 }, { openError: Error('Mock spawn unavailable') }]) {
    const h = harness(config);
    h.execute();
    await assert.rejects(new h.AppleDeviceManager('udid').activateWindowAsync(),
      config.openError ? /Mock spawn unavailable/ : /Could not open DeviceHub.app/);
    assert.equal(h.instructions.length, 0);
  }
});

test('missing Xcode selection or missing viewer stops the preload with a useful diagnostic', () => {
  const unselected = harness({ xcodeStatus: 1 });
  assert.throws(unselected.execute, /Select an installed Xcode/);
  assert.equal(unselected.syncCalls.length, 1);
  const missing = harness({ viewers: [] });
  assert.throws(missing.execute, /no Simulator or DeviceHub/);
  assert.equal(missing.syncCalls.length, 1);
  assert.equal(missing.openCalls.length, 0);
});
