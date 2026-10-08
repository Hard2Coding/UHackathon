'use strict';
// Expo SDK 55 assumes the older Simulator application. Xcode 27 uses DeviceHub.
// Adapt window activation without changing node_modules or using AppleScript.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { spawn, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const fromExpo = createRequire(path.join(root, 'app/node_modules/expo/package.json'));
const managerPath = fromExpo.resolve('@expo/cli/build/src/start/platforms/ios/AppleDeviceManager.js');
const { AppleDeviceManager } = require(managerPath);
const developer = spawnSync('xcode-select', ['-p'], { encoding: 'utf8' });
if (developer.status !== 0) throw Error('Select an installed Xcode before running the iOS app.');
const selected = developer.stdout.trim();
const choices = [path.resolve(selected, '../Applications/DeviceHub.app'), path.join(selected, 'Applications/Simulator.app')];
const viewer = choices.find(file => fs.existsSync(file));
if (!viewer) throw Error('The selected Xcode has no Simulator or DeviceHub application.');
const { SimulatorAppPrerequisite } = require(fromExpo.resolve('@expo/cli/build/src/start/doctor/apple/SimulatorAppPrerequisite.js'));
SimulatorAppPrerequisite.prototype.assertImplementation = async function () {
  const info = path.join(viewer, 'Contents/Info.plist');
  const identity = spawnSync('plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', info], { encoding: 'utf8' });
  if (identity.status !== 0 || !['com.apple.dt.Devices', 'com.apple.iphonesimulator', 'com.apple.CoreSimulator.SimulatorTrampoline'].includes(identity.stdout.trim())) {
    throw Error('The selected Xcode device application could not be validated.');
  }
  const toolchain = spawnSync('xcrun', ['simctl', 'help'], { encoding: 'utf8' });
  if (toolchain.status !== 0) throw Error('The selected Xcode simulator toolchain is unavailable.');
};
SimulatorAppPrerequisite.instance.resetAssertion();
AppleDeviceManager.prototype.activateWindowAsync = async function () {
  if (process.env.SCAMGRAPH_IOS_HEADLESS === '1') return;
  const isDeviceHub = path.basename(viewer) === 'DeviceHub.app';
  const args = ['-a', viewer];
  // DeviceHub has no documented Simulator-style device-selection argument.
  if (!isDeviceHub && this.device.udid) args.push('--args', '-CurrentDeviceUDID', this.device.udid);
  await new Promise((resolve, reject) => {
    const child = spawn('open', args, { stdio: 'ignore' });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(Error('Could not open ' + path.basename(viewer))));
  });
  if (isDeviceHub) {
    const device = this.device.name || this.device.udid || 'the booted device';
    console.log('DeviceHub: select ' + device + ' in the sidebar to view the running simulator.');
  }
};
