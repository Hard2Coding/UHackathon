// Usage: node plugins/__tests__/verify-prebuild.js /absolute/path/to/prebuilt/app
// Execute after prebuild twice to also verify idempotence. No calls or system
// notifications are simulated, permissions granted, or devices contacted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const xcode = require('xcode');

const root = path.resolve(process.argv[2] || '.');
const ios = path.join(root, 'ios');
const projectFolder = fs.readdirSync(ios).find(name => name.endsWith('.xcodeproj'));
assert(projectFolder, 'Generated iOS project must exist');
const project = xcode.project(path.join(ios, projectFolder, 'project.pbxproj'));
project.parseSync();
const targets = project.pbxNativeTargetSection();
const extensions = Object.keys(targets).filter(id => !id.endsWith('_comment') && String(targets[id].name).replace(/"/g, '') === 'ScamGraphCallerDirectory');
assert.equal(extensions.length, 1, 'Exactly one caller extension must exist');
const extension = extensions[0];
const host = project.getFirstTarget().uuid;
const dependencies = project.hash.project.objects.PBXTargetDependency;
assert.equal(targets[host].dependencies.filter(reference => dependencies[reference.value]?.target === extension).length, 1, 'Host must depend on the extension exactly once');
const phases = project.hash.project.objects.PBXCopyFilesBuildPhase;
const buildFiles = project.hash.project.objects.PBXBuildFile;
const embedded = targets[host].buildPhases.flatMap(reference => phases?.[reference.value]?.files || [])
  .filter(reference => String(buildFiles[reference.value]?.fileRef_comment).includes('ScamGraphCallerDirectory.appex'));
assert.equal(embedded.length, 1, 'Host must embed the .appex exactly once');
assert.equal(project.pbxGroupByName('ScamGraphCallerDirectory').path, '"."', 'Extension source paths must resolve relative to ios');
const list = project.pbxXCConfigurationList()[targets[extension].buildConfigurationList];
for (const reference of list.buildConfigurations) {
  const settings = project.pbxXCBuildConfigurationSection()[reference.value].buildSettings;
  assert.equal(settings.APPLICATION_EXTENSION_API_ONLY, 'YES');
  assert.equal(settings.CODE_SIGN_ENTITLEMENTS, '"ScamGraphCallerDirectory/ScamGraphCallerDirectory.entitlements"');
}
const manifest = fs.readFileSync(path.join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
assert.equal((manifest.match(/ScamGraphCallScreeningService/g) || []).length, 1);
assert(manifest.includes('android.permission.BIND_SCREENING_SERVICE'));
assert(manifest.includes('android.telecom.CallScreeningService'));
for (const forbidden of ['READ_CALL_LOG', 'READ_PHONE_STATE', 'READ_CONTACTS', 'SYSTEM_ALERT_WINDOW']) {
  const declarations = [...manifest.matchAll(/<uses-permission\b[^>]*>/g)].map(match => match[0]);
  assert(!declarations.some(value => value.includes(`android.permission.${forbidden}`) && !value.includes('tools:node="remove"')), `Unrequested ${forbidden} permission must be absent or explicitly removed`);
}
const info = fs.readFileSync(path.join(ios, 'ScamGraphCallerDirectory/Info.plist'), 'utf8');
const entitlements = fs.readFileSync(path.join(ios, 'ScamGraphCallerDirectory/ScamGraphCallerDirectory.entitlements'), 'utf8');
assert(info.includes('com.apple.callkit.call-directory'));
assert(info.includes('$(PRODUCT_MODULE_NAME).CallDirectoryHandler'));
assert(entitlements.includes('group.ai.scamgraph.app'));
console.log('PASS: caller extension topology, embedding, dependency, native permission scope, and repeat-prebuild idempotence');
