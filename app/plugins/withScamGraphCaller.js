const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withEntitlementsPlist, withInfoPlist, withPodfile, withXcodeProject } = require('expo/config-plugins');

function unquote(value) { return String(value || '').replace(/^"|"$/g, ''); }
function escapeXml(value) { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function xmlPlist(body) { return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>${body}</dict></plist>\n`; }

// Some dependency resource targets retain an older minimum than the Expo host.
// Keep them compatible with current SDKs without changing host/extension support.
function ensurePodMinimumDeploymentTarget(contents) {
  const tag = 'scamgraph-pod-minimum';
  const prior = new RegExp(`^[ \\t]*# @generated begin ${tag}\\r?\\n[\\s\\S]*?^[ \\t]*# @generated end ${tag}\\r?\\n?`, 'gm');
  const clean = contents.replace(prior, '');
  const anchor = /^([ \t]*)react_native_post_install\([\s\S]*?^\1\)\r?$/m;
  if (!anchor.test(clean)) throw new Error('Caller plugin requires the Expo react_native_post_install hook in Podfile');
  return clean.replace(anchor, (call, indent) => `${call}
${indent}# @generated begin ${tag}
${indent}scamgraph_ios_minimum = Gem::Version.new(podfile_properties['ios.deploymentTarget'] || '15.1')
${indent}installer.pods_project.targets.each do |pod_target|
${indent}  pod_target.build_configurations.each do |configuration|
${indent}    current = configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_s
${indent}    next unless current.match?(/\\A\\d+(?:\\.\\d+)*\\z/)
${indent}    if Gem::Version.new(current) < scamgraph_ios_minimum
${indent}      configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = scamgraph_ios_minimum.to_s
${indent}    end
${indent}  end
${indent}end
${indent}# @generated end ${tag}`);
}

function withScamGraphCaller(config, options = {}) {
  const extensionName = options.extensionName || 'ScamGraphCallerDirectory';
  const bundle = config.ios?.bundleIdentifier || 'ai.scamgraph.app';
  const appGroup = options.appGroup || `group.${bundle}`;
  const extensionBundle = `${bundle}.${extensionName}`;
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(extensionName)) throw new Error('Caller extensionName must contain letters and digits');
  if (!/^group\.[A-Za-z0-9.-]+$/.test(appGroup) || !/^[A-Za-z0-9.-]+$/.test(bundle)) throw new Error('Invalid caller App Group or bundle identifier');
  const blocked = ['android.permission.READ_CALL_LOG', 'android.permission.READ_PHONE_STATE', 'android.permission.READ_CONTACTS', 'android.permission.SYSTEM_ALERT_WINDOW'];
  config.android = config.android || {};
  config.android.blockedPermissions = [...new Set([...(config.android.blockedPermissions || []), ...blocked])];

  config = withAndroidManifest(config, mod => {
    const manifest = mod.modResults.manifest;
    manifest['uses-permission'] = manifest['uses-permission'] || [];
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    manifest['uses-permission'] = manifest['uses-permission'].filter(item => !blocked.includes(item.$?.['android:name']));
    // Removal markers also exclude permissions contributed by dependency
    // manifests (including the development client's optional overlay).
    for (const permission of blocked) manifest['uses-permission'].push({ $: { 'android:name': permission, 'tools:node': 'remove' } });
    if (!manifest['uses-permission'].some(item => item.$?.['android:name'] === 'android.permission.POST_NOTIFICATIONS')) {
      manifest['uses-permission'].push({ $: { 'android:name': 'android.permission.POST_NOTIFICATIONS' } });
    }
    const application = manifest.application?.[0];
    if (!application) throw new Error('Caller plugin requires an Android application element');
    application.service = application.service || [];
    const serviceName = 'expo.modules.scamgraphcaller.ScamGraphCallScreeningService';
    // The module also declares this service for manifest merging. Keep one
    // identical app-level entry so generated native projects are reviewable.
    if (!application.service.some(item => item.$?.['android:name'] === serviceName)) {
      application.service.push({ $: { 'android:name': serviceName, 'android:exported': 'true', 'android:permission': 'android.permission.BIND_SCREENING_SERVICE' },
        'intent-filter': [{ action: [{ $: { 'android:name': 'android.telecom.CallScreeningService' } }] }] });
    }
    return mod;
  });

  config = withInfoPlist(config, mod => {
    mod.modResults.ScamGraphCallerAppGroup = appGroup;
    mod.modResults.ScamGraphCallerExtensionBundleIdentifier = extensionBundle;
    return mod;
  });
  config = withEntitlementsPlist(config, mod => {
    const key = 'com.apple.security.application-groups';
    mod.modResults[key] = [...new Set([...(mod.modResults[key] || []), appGroup])];
    return mod;
  });

  config = withPodfile(config, mod => {
    mod.modResults.contents = ensurePodMinimumDeploymentTarget(mod.modResults.contents);
    return mod;
  });

  config = withXcodeProject(config, mod => {
    const project = mod.modResults;
    const projectRoot = mod.modRequest.projectRoot;
    const nativeRoot = mod.modRequest.platformProjectRoot;
    const folder = path.join(nativeRoot, extensionName);
    fs.mkdirSync(folder, { recursive: true });
    fs.copyFileSync(path.join(projectRoot, 'modules/scamgraph-caller/extension/CallDirectoryHandler.swift'), path.join(folder, 'CallDirectoryHandler.swift'));
    fs.writeFileSync(path.join(folder, 'Info.plist'), xmlPlist(`
      <key>CFBundleDisplayName</key><string>ScamGraph Caller Evidence</string>
      <key>CFBundleIdentifier</key><string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
      <key>CFBundleName</key><string>$(PRODUCT_NAME)</string>
      <key>CFBundleExecutable</key><string>$(EXECUTABLE_NAME)</string>
      <key>CFBundlePackageType</key><string>XPC!</string>
      <key>CFBundleShortVersionString</key><string>${escapeXml(config.version || '1.0.0')}</string>
      <key>CFBundleVersion</key><string>${escapeXml(config.ios?.buildNumber || '1')}</string>
      <key>ScamGraphCallerAppGroup</key><string>${escapeXml(appGroup)}</string>
      <key>NSExtension</key><dict>
        <key>NSExtensionPointIdentifier</key><string>com.apple.callkit.call-directory</string>
        <key>NSExtensionPrincipalClass</key><string>$(PRODUCT_MODULE_NAME).CallDirectoryHandler</string>
      </dict>`));
    fs.writeFileSync(path.join(folder, `${extensionName}.entitlements`), xmlPlist(`<key>com.apple.security.application-groups</key><array><string>${escapeXml(appGroup)}</string></array>`));

    const targets = project.pbxNativeTargetSection();
    // node-xcode's addTargetDependency silently skips absent sections in a
    // single-target Expo template. Initialize them before creating a target.
    project.hash.project.objects.PBXTargetDependency = project.hash.project.objects.PBXTargetDependency || {};
    project.hash.project.objects.PBXContainerItemProxy = project.hash.project.objects.PBXContainerItemProxy || {};
    let targetId = Object.keys(targets).find(id => !id.endsWith('_comment') && unquote(targets[id].name) === extensionName);
    if (!targetId) {
      const target = project.addTarget(extensionName, 'app_extension', extensionName, extensionBundle);
      targetId = target.uuid;
      project.addBuildPhase([`${extensionName}/CallDirectoryHandler.swift`], 'PBXSourcesBuildPhase', 'Sources', targetId);
      project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', targetId);
      project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', targetId);
      project.addFramework('CallKit.framework', { target: targetId });
      project.addFramework('Foundation.framework', { target: targetId });
      const group = project.addPbxGroup([`${extensionName}/CallDirectoryHandler.swift`, `${extensionName}/Info.plist`, `${extensionName}/${extensionName}.entitlements`], extensionName, '"."');
      const mainGroup = project.getFirstProject().firstProject.mainGroup;
      project.addToPbxGroup(group.uuid, mainGroup);
    }
    const ownedGroup = project.pbxGroupByName(extensionName);
    if (ownedGroup) ownedGroup.path = '"."';
    const hostId = project.getFirstTarget().uuid;
    const dependencies = project.hash.project.objects.PBXTargetDependency;
    if (!project.pbxNativeTargetSection()[hostId].dependencies.some(reference => dependencies[reference.value]?.target === targetId)) {
      project.addTargetDependency(hostId, [targetId]);
    }
    for (const reference of Object.values(project.pbxFileReferenceSection())) {
      if (!reference || typeof reference !== 'object') continue;
      for (const key of Object.keys(reference)) if (reference[key] === undefined || reference[key] === 'undefined') delete reference[key];
    }
    const target = project.pbxNativeTargetSection()[targetId];
    const list = project.pbxXCConfigurationList()[target.buildConfigurationList];
    const settings = project.pbxXCBuildConfigurationSection();
    for (const reference of list.buildConfigurations) {
      Object.assign(settings[reference.value].buildSettings, {
        PRODUCT_BUNDLE_IDENTIFIER: `"${extensionBundle}"`,
        INFOPLIST_FILE: `"${extensionName}/Info.plist"`,
        CODE_SIGN_ENTITLEMENTS: `"${extensionName}/${extensionName}.entitlements"`,
        PRODUCT_NAME: `"${extensionName}"`,
        PRODUCT_MODULE_NAME: extensionName,
        SWIFT_VERSION: '5.0',
        IPHONEOS_DEPLOYMENT_TARGET: '16.4',
        TARGETED_DEVICE_FAMILY: '"1,2"',
        APPLICATION_EXTENSION_API_ONLY: 'YES',
        SKIP_INSTALL: 'YES',
        CODE_SIGN_STYLE: 'Automatic',
        GENERATE_INFOPLIST_FILE: 'NO',
        CURRENT_PROJECT_VERSION: String(config.ios?.buildNumber || '1'),
        MARKETING_VERSION: `"${config.version || '1.0.0'}"`,
      });
    }
    project.addTargetAttribute('SystemCapabilities', { 'com.apple.ApplicationGroups.iOS': { enabled: 1 } }, { uuid: targetId });
    return mod;
  });

  // Declare the target before prebuild so EAS can provision its bundle/AppGroup.
  config.extra = config.extra || {};
  config.extra.eas = config.extra.eas || {};
  config.extra.eas.build = config.extra.eas.build || {};
  config.extra.eas.build.experimental = config.extra.eas.build.experimental || {};
  config.extra.eas.build.experimental.ios = config.extra.eas.build.experimental.ios || {};
  const ios = config.extra.eas.build.experimental.ios;
  ios.appExtensions = (ios.appExtensions || []).filter(item => item.targetName !== extensionName);
  ios.appExtensions.push({ targetName: extensionName, bundleIdentifier: extensionBundle, entitlements: { 'com.apple.security.application-groups': [appGroup] } });
  return config;
}

module.exports = withScamGraphCaller;
module.exports.ensurePodMinimumDeploymentTarget = ensurePodMinimumDeploymentTarget;
