'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const appRoot = path.resolve(__dirname, '../app');
const fromExpo = createRequire(path.join(appRoot, 'node_modules/expo/package.json'));
const plist = fromExpo('@expo/plist').default;
const withScamGraphScenes = require('../app/plugins/withScamGraphScenes');
const { migrateAppDelegate, applySceneManifest } = withScamGraphScenes;

// Unmodified Swift startup supplied by the Expo SDK 55 prebuild template.
// Keep this fixture independent of the migration implementation.
const ORIGINAL = `internal import Expo
import React
import ReactAppDependencyProvider

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  // Extension point for config-plugins

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // needed to return the correct URL for expo-dev-client.
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
`;
const nativeDelegate = path.join(appRoot, 'ios/ScamGraphAI/AppDelegate.swift');
const nativePlist = path.join(appRoot, 'ios/ScamGraphAI/Info.plist');
const ROLE = 'UIWindowSceneSessionRoleApplication';
const count = (source, text) => source.split(text).length - 1;

test('Expo SDK 55 migration generates the same scene implementation as the checked-in native app', () => {
  const expected = fs.readFileSync(nativeDelegate, 'utf8');
  const result = migrateAppDelegate(ORIGINAL, 'swift');
  assert.equal(result, expected, 'Prebuild must reproduce the native implementation actually built and tested');
  assert.equal(migrateAppDelegate(expected, 'swift'), expected);
});

test('React Native starts once in a connected window scene after factory setup', () => {
  const result = migrateAppDelegate(ORIGINAL);
  assert.equal(count(result, 'factory.startReactNative('), 1);
  assert.ok(!result.includes('UIWindow(frame: UIScreen.main.bounds)'));
  const scene = result.indexOf('class ScamGraphSceneDelegate:');
  const start = result.indexOf('factory.startReactNative(');
  assert.ok(start > scene, 'didFinishLaunching must not start the legacy UIWindow');
  assert.ok(result.includes('let sceneWindow = UIWindow(windowScene: windowScene)'));
  assert.ok(result.includes('appDelegate.window = sceneWindow'), 'Expo modules/dev launcher still need the host window');
  assert.ok(result.indexOf('initialLaunchOptions = launchOptions') < result.indexOf('let delegate = ReactNativeDelegate()'));
  assert.ok(result.includes('configuration.delegateClass = ScamGraphSceneDelegate.self'));
});

test('cold URLs and user activities are merged into launch options then delivered after factory startup', () => {
  const result = migrateAppDelegate(ORIGINAL);
  for (const token of [
    'launchOptions[.url] = context.url',
    'launchOptions[.sourceApplication] = context.options.sourceApplication',
    'launchOptions[.annotation] = context.options.annotation',
    'launchOptions[.userActivityDictionary]',
    '"UIApplicationLaunchOptionsUserActivityKey": activity',
  ]) assert.ok(result.includes(token), token);
  const start = result.indexOf('factory.startReactNative(');
  assert.ok(result.indexOf('self.scene(scene, openURLContexts: connectionOptions.urlContexts)') > start);
  assert.ok(result.indexOf('self.scene(scene, continue: activity)') > start);
  assert.ok(result.includes('appDelegate.application(UIApplication.shared, open: context.url, options: options)'));
  assert.ok(result.includes('appDelegate?.application(UIApplication.shared, continue: userActivity'));
});

test('scene lifecycle forwards active, inactive, background, and foreground events to Expo', () => {
  const result = migrateAppDelegate(ORIGINAL);
  for (const callback of [
    'applicationDidBecomeActive', 'applicationWillResignActive',
    'applicationDidEnterBackground', 'applicationWillEnterForeground',
  ]) assert.equal(count(result, callback + '(UIApplication.shared)'), 1, callback);
});

test('unrelated AppDelegate linking/customizations and ReactNativeDelegate remain intact', () => {
  const originalLinking = ORIGINAL.slice(ORIGINAL.indexOf('  // Linking API'), ORIGINAL.indexOf('class ReactNativeDelegate:'));
  const originalReact = ORIGINAL.slice(ORIGINAL.indexOf('class ReactNativeDelegate:')).trimEnd();
  const customization = '  func callerExtensionHook() { print("Keep caller protection") }\n\n';
  const customized = ORIGINAL.replace('  // Linking API', customization + '  // Linking API');
  const result = migrateAppDelegate(customized);
  assert.ok(result.includes(customization));
  assert.ok(result.includes(originalLinking));
  assert.ok(result.includes(originalReact));
  assert.ok(result.includes('bridge.bundleURL ?? bundleURL()'));
  assert.ok(result.includes('return Bundle.main.url(forResource: "main", withExtension: "jsbundle")'));
});

test('repeated prebuild does not duplicate startup, stored launch options, or scene delegates', () => {
  const once = migrateAppDelegate(ORIGINAL);
  const twice = migrateAppDelegate(once);
  assert.equal(twice, once);
  assert.equal(count(twice, 'class ScamGraphSceneDelegate:'), 1);
  assert.equal(count(twice, '// @generated begin scamgraph-scenes'), 1);
  assert.equal(count(twice, 'configurationForConnecting connectingSceneSession:'), 1);
  assert.equal(count(twice, 'var initialLaunchOptions:'), 1);
});

test('CRLF AppDelegate files retain their newline convention through migration and repeated prebuild', () => {
  const crlf = ORIGINAL.replace(/\n/g, '\r\n');
  const migrated = migrateAppDelegate(crlf);
  assert.equal(migrated.replace(/\r\n/g, '\n'), migrateAppDelegate(ORIGINAL));
  assert.ok(!/(^|[^\r])\n/.test(migrated));
  assert.equal(migrateAppDelegate(migrated), migrated);
});

test('unsupported languages, changed startup templates, and partial migrations fail explicitly', () => {
  for (const language of ['objc', 'objcpp']) {
    assert.throws(() => migrateAppDelegate(ORIGINAL, language), /Objective-C.*unsupported/);
  }
  for (const source of [
    ORIGINAL.replace('window = UIWindow(frame: UIScreen.main.bounds)', 'window = UIWindow()'),
    ORIGINAL.replace('let delegate = ReactNativeDelegate()', 'let delegate = CustomDelegate()'),
    ORIGINAL.replace('// Linking API', '// Other linking style'),
    ORIGINAL.replace('class AppDelegate: ExpoAppDelegate', 'class AppDelegate: UIResponder'),
    ORIGINAL.replace('var window: UIWindow?', 'var window: UIWindow?\n  var initialLaunchOptions: [UIApplication.LaunchOptionsKey: Any]?'),
    ORIGINAL + '\nclass ScamGraphSceneDelegate: UIResponder {}\n',
  ]) {
    assert.throws(() => migrateAppDelegate(source), /ScamGraph scene migration requires/);
  }
});

test('scene manifest preserves caller protection, URL schemes, permissions, extra roles and configuration metadata', () => {
  const otherScene = { UISceneConfigurationName: 'Auxiliary Scene', UISceneDelegateClassName: 'OtherDelegate' };
  const external = [{ UISceneConfigurationName: 'External display' }];
  const info = {
    ScamGraphCallerAppGroup: 'group.ai.scamgraph.app',
    ScamGraphCallerExtensionBundleIdentifier: 'ai.scamgraph.app.ScamGraphCallerDirectory',
    CFBundleURLTypes: [{ CFBundleURLSchemes: ['scamgraph', 'exp+scamgraph-ai'] }],
    NSCameraUsageDescription: 'Original camera permission',
    UIApplicationSceneManifest: {
      ExistingManifestMetadata: 'keep',
      UIApplicationSupportsMultipleScenes: true,
      UISceneConfigurations: {
        [ROLE]: [{
          UISceneConfigurationName: 'Default Configuration', CustomMetadata: 'keep config',
          UISceneStoryboardFile: 'LegacyStoryboard',
        }, otherScene],
        UIWindowSceneSessionRoleExternalDisplay: external,
      },
    },
  };
  const original = structuredClone(info);
  const result = applySceneManifest(info);
  for (const key of ['ScamGraphCallerAppGroup', 'ScamGraphCallerExtensionBundleIdentifier', 'CFBundleURLTypes', 'NSCameraUsageDescription']) {
    assert.deepEqual(result[key], original[key], key);
  }
  const manifest = result.UIApplicationSceneManifest;
  assert.equal(manifest.UIApplicationSupportsMultipleScenes, false);
  assert.equal(manifest.ExistingManifestMetadata, 'keep');
  assert.deepEqual(manifest.UISceneConfigurations.UIWindowSceneSessionRoleExternalDisplay, external);
  assert.deepEqual(manifest.UISceneConfigurations[ROLE][1], otherScene);
  const main = manifest.UISceneConfigurations[ROLE][0];
  assert.equal(main.UISceneClassName, 'UIWindowScene');
  assert.equal(main.UISceneDelegateClassName, '$(PRODUCT_MODULE_NAME).ScamGraphSceneDelegate');
  assert.equal(main.CustomMetadata, 'keep config');
  assert.ok(!('UISceneStoryboardFile' in main), 'Programmatic scene window must not get an extra storyboard window');
});

test('scene manifest is idempotent and matches the native plist configuration', () => {
  const generated = applySceneManifest({});
  const once = structuredClone(generated);
  assert.deepEqual(applySceneManifest(generated), once);
  assert.equal(generated.UIApplicationSceneManifest.UISceneConfigurations[ROLE].length, 1);
  const native = plist.parse(fs.readFileSync(nativePlist, 'utf8'));
  assert.deepEqual(JSON.parse(JSON.stringify(native.UIApplicationSceneManifest)), once.UIApplicationSceneManifest);
  assert.throws(() => applySceneManifest({
    UIApplicationSceneManifest: { UISceneConfigurations: { [ROLE]: { invalid: true } } },
  }), /requires an array/);
});

test('registered Expo mods migrate Swift, synchronize ios.infoPlist, and retain caller mod effects', async () => {
  const config = withScamGraphScenes({
    name: 'ScamGraph AI', slug: 'scamgraph-ai',
    mods: { ios: { infoPlist: async mod => {
      mod.modResults.ScamGraphCallerAppGroup = 'group.ai.scamgraph.app';
      return mod;
    } } },
  });
  const delegate = await config.mods.ios.appDelegate({
    ...config, modRequest: { projectRoot: appRoot },
    modResults: { language: 'swift', path: nativeDelegate, contents: ORIGINAL, customField: 'preserve' },
  });
  assert.equal(delegate.modResults.contents, migrateAppDelegate(ORIGINAL));
  assert.equal(delegate.modResults.path, nativeDelegate);
  assert.equal(delegate.modResults.customField, 'preserve');
  const info = await config.mods.ios.infoPlist({
    ...config, modRequest: { projectRoot: appRoot },
    modResults: { CFBundleURLTypes: [{ CFBundleURLSchemes: ['scamgraph'] }] },
  });
  assert.equal(info.ios.infoPlist, info.modResults);
  assert.equal(info.modResults.ScamGraphCallerAppGroup, 'group.ai.scamgraph.app');
  assert.deepEqual(info.modResults.CFBundleURLTypes, [{ CFBundleURLSchemes: ['scamgraph'] }]);
  await assert.rejects(config.mods.ios.appDelegate({
    ...config, modRequest: { projectRoot: appRoot },
    modResults: { language: 'objc', contents: ORIGINAL },
  }), /Objective-C.*unsupported/);
});

test('app config registers the scene migration once without replacing the caller extension plugin', () => {
  const plugins = JSON.parse(fs.readFileSync(path.join(appRoot, 'app.json'), 'utf8')).expo.plugins;
  assert.equal(plugins.filter(plugin => plugin === './plugins/withScamGraphScenes').length, 1);
  const caller = plugins.find(plugin => Array.isArray(plugin) && plugin[0] === './plugins/withScamGraphCaller');
  assert.deepEqual(caller[1], { appGroup: 'group.ai.scamgraph.app', extensionName: 'ScamGraphCallerDirectory' });
});
