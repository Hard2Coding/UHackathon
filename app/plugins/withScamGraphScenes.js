'use strict';
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');
const SCENE_ROLE = 'UIWindowSceneSessionRoleApplication';
const SCENE_NAME = 'Default Configuration';
const SCENE_CLASS = '$(PRODUCT_MODULE_NAME).ScamGraphSceneDelegate';
const SCENE_CONFIGURATION = String.raw`  public func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    let configuration = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    configuration.sceneClass = UIWindowScene.self
    configuration.delegateClass = ScamGraphSceneDelegate.self
    return configuration
  }`;
const SCENE_DELEGATE = String.raw`// @generated begin scamgraph-scenes
// Expo SDK 55 needs this adapter for the scene lifecycle required by iOS 27.
class ScamGraphSceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  private var appDelegate: AppDelegate? {
    UIApplication.shared.delegate as? AppDelegate
  }

  func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    guard let windowScene = scene as? UIWindowScene,
      let appDelegate,
      let factory = appDelegate.reactNativeFactory else { return }

    let sceneWindow = UIWindow(windowScene: windowScene)
    window = sceneWindow
    // Expo modules and the development launcher also look up this window.
    appDelegate.window = sceneWindow

    var launchOptions = appDelegate.initialLaunchOptions ?? [:]
    if let context = connectionOptions.urlContexts.first {
      launchOptions[.url] = context.url
      launchOptions[.sourceApplication] = context.options.sourceApplication
      launchOptions[.annotation] = context.options.annotation
    }
    if let activity = connectionOptions.userActivities.first {
      launchOptions[.userActivityDictionary] = [
        "UIApplicationLaunchOptionsUserActivityTypeKey": activity.activityType,
        "UIApplicationLaunchOptionsUserActivityKey": activity
      ]
    }
    factory.startReactNative(withModuleName: "main", in: sceneWindow, launchOptions: launchOptions)

    // The development launcher must exist before receiving its cold-start URL.
    self.scene(scene, openURLContexts: connectionOptions.urlContexts)
    for activity in connectionOptions.userActivities {
      self.scene(scene, continue: activity)
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let appDelegate else { return }
    for context in URLContexts {
      var options: [UIApplication.OpenURLOptionsKey: Any] = [.openInPlace: context.options.openInPlace]
      if let source = context.options.sourceApplication { options[.sourceApplication] = source }
      if let annotation = context.options.annotation { options[.annotation] = annotation }
      _ = appDelegate.application(UIApplication.shared, open: context.url, options: options)
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    _ = appDelegate?.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }

  func sceneDidBecomeActive(_ scene: UIScene) {
    appDelegate?.applicationDidBecomeActive(UIApplication.shared)
  }

  func sceneWillResignActive(_ scene: UIScene) {
    appDelegate?.applicationWillResignActive(UIApplication.shared)
  }

  func sceneDidEnterBackground(_ scene: UIScene) {
    appDelegate?.applicationDidEnterBackground(UIApplication.shared)
  }

  func sceneWillEnterForeground(_ scene: UIScene) {
    appDelegate?.applicationWillEnterForeground(UIApplication.shared)
  }
}
// @generated end scamgraph-scenes`;


function unsupported(detail) {
  throw new Error('ScamGraph scene migration requires the Expo SDK 55 Swift AppDelegate: ' + detail);
}
function migrateAppDelegate(contents, language = 'swift') {
  if (language !== 'swift') unsupported('Objective-C and other AppDelegate languages are unsupported');
  if (typeof contents !== 'string') unsupported('AppDelegate source is missing');
  const newline = contents.includes('\r\n') ? '\r\n' : '\n';
  const source = contents.replace(/\r\n/g, '\n');
  if (!/class AppDelegate: ExpoAppDelegate\s*\{/.test(source)) unsupported('expected AppDelegate class was not found');
  if (/class ScamGraphSceneDelegate\b/.test(source)) {
    const generated = source.match(/\/\/ @generated begin scamgraph-scenes\n[\s\S]*?\/\/ @generated end scamgraph-scenes/g);
    if (generated?.length !== 1 || generated[0] !== SCENE_DELEGATE ||
        !source.includes(SCENE_CONFIGURATION) ||
        !source.includes('var initialLaunchOptions: [UIApplication.LaunchOptionsKey: Any]?') ||
        !source.includes('initialLaunchOptions = launchOptions') ||
        source.includes('UIWindow(frame: UIScreen.main.bounds)')) {
      unsupported('an incomplete or customized scene migration was found; review it before prebuild');
    }
    return contents;
  }
  if (/initialLaunchOptions|configurationForConnecting|@generated (?:begin|end) scamgraph-scenes/.test(source)) {
    unsupported('a partial scene migration was found');
  }
  const windowProperty = /^  var window: UIWindow\?$/gm;
  const startup = /^#if os\(iOS\) \|\| os\(tvOS\)\n    window = UIWindow\(frame: UIScreen\.main\.bounds\)\n    factory\.startReactNative\(\n      withModuleName: "main",\n      in: window,\n      launchOptions: launchOptions\)\n#endif$/gm;
  const creation = /^    let delegate = ReactNativeDelegate\(\)$/gm;
  const linking = /^  \/\/ Linking API$/gm;
  for (const [pattern, name] of [[windowProperty, 'window property'], [startup, 'legacy React Native startup'], [creation, 'factory initialization'], [linking, 'linking extension point']]) {
    if ([...source.matchAll(pattern)].length !== 1) unsupported('expected exactly one ' + name);
  }
  if (!source.includes('didFinishLaunchingWithOptions launchOptions:') || !source.includes('class ReactNativeDelegate: ExpoReactNativeFactoryDelegate')) {
    unsupported('expected Expo React Native delegate/launch method was not found');
  }
  let output = source.replace(windowProperty, '  var window: UIWindow?\n  var initialLaunchOptions: [UIApplication.LaunchOptionsKey: Any]?');
  output = output.replace(creation, '    initialLaunchOptions = launchOptions\n    let delegate = ReactNativeDelegate()');
  output = output.replace(startup, '    // UIKit connects the window scene before React Native starts.');
  output = output.replace(linking, SCENE_CONFIGURATION + '\n\n  // Linking API');
  output = output.replace(/\n*$/, '\n\n') + SCENE_DELEGATE + '\n';
  return newline === '\r\n' ? output.replace(/\n/g, '\r\n') : output;
}

function applySceneManifest(plist) {
  const manifest = plist.UIApplicationSceneManifest || {};
  const configurations = manifest.UISceneConfigurations || {};
  const previous = configurations[SCENE_ROLE] || [];
  if (!Array.isArray(previous)) throw new Error('ScamGraph scenes requires an array of application scene configurations');
  const own = previous.find(item => item.UISceneDelegateClassName === SCENE_CLASS || item.UISceneConfigurationName === SCENE_NAME) || {};
  const main = { ...own, UISceneClassName: 'UIWindowScene', UISceneConfigurationName: SCENE_NAME, UISceneDelegateClassName: SCENE_CLASS };
  // The scene creates its own window/root view; a generated storyboard must not create another one.
  delete main.UISceneStoryboardFile;
  const others = previous.filter(item => item.UISceneDelegateClassName !== SCENE_CLASS && item.UISceneConfigurationName !== SCENE_NAME);
  plist.UIApplicationSceneManifest = {
    ...manifest,
    UIApplicationSupportsMultipleScenes: false,
    UISceneConfigurations: { ...configurations, [SCENE_ROLE]: [main, ...others] },
  };
  return plist;
}

function withScamGraphScenes(config) {
  config = withAppDelegate(config, mod => {
    mod.modResults.contents = migrateAppDelegate(mod.modResults.contents, mod.modResults.language);
    return mod;
  });
  return withInfoPlist(config, mod => {
    mod.modResults = applySceneManifest(mod.modResults);
    return mod;
  });
}
module.exports = withScamGraphScenes;
module.exports.migrateAppDelegate = migrateAppDelegate;
module.exports.applySceneManifest = applySceneManifest;
module.exports.SCENE_DELEGATE = SCENE_DELEGATE;
module.exports.SCENE_CONFIGURATION = SCENE_CONFIGURATION;
