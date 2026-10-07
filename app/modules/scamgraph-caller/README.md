# Native caller evidence

This local Expo module supports a user-enabled native caller workflow. Web and Expo Go return an explicit unavailable status; they cannot observe incoming telephone calls. A native development or production build is required. No live incoming call, real device permission flow, or system notification was exercised during development verification.

The TypeScript entry point exports `getCallerStatus`, `syncCallerDirectory`, `requestCallerActivation`, `requestCallerNotifications`, `openCallerSettings`, `clearCallerDirectory`, and `disableCallerProtection`. `CallerStatus.enabled` reflects effective activation. Clearing or disabling removes cached data and disables app handling; it does not silently change an Android system role. Users can also remove that role or disable the iOS extension in system settings. None of these permissions are requested at module import or ordinary startup.

The host app fetches `/api/caller-id/directory` on explicit refresh and while enabled on foreground refresh. Native synchronization independently rejects sample records, unreviewed evidence states, malformed international numbers, invalid timestamps, and expired entries. Only `confirmed_source` and `community_reviewed` entries with `is_sample=false` are eligible. The directory TTL is capped at six hours. An empty directory is legitimate; it does not establish that unknown callers are safe. Native code performs no network requests for an incoming number and uploads no incoming call data.

## Android

Android 10+ devices must offer `RoleManager.ROLE_CALL_SCREENING`; activation opens the system consent dialog only after the user taps the enable button. The service uses the required `android.permission.BIND_SCREENING_SERVICE`. For incoming calls, it issues an allow response before cache I/O or asynchronous notification work. It never blocks, rejects, or silences calls. Android requires this response within five seconds; actual timing and OEM behavior still need device testing. See [Android call-screening documentation](https://developer.android.com/develop/connectivity/telecom/dialer-app/screen-calls) and [CallScreeningService reference](https://developer.android.com/reference/android/telecom/CallScreeningService).

Android 13+ notification consent is a separate user action. If granted, a supported incoming call produces a private notification containing the matched evidence label/source, or an insufficient-data message. No full incoming number appears in notifications, pending intents, or logs. Only a masked most-recent lookup summary is retained locally. Notification taps use `scamgraph://caller`. If protection is off, no caller notification is posted. The cache expiry is enforced on each callback. Thai national numbers are normalized using region `TH`; directory entries themselves must be international E.164 numbers.

The config plugin explicitly removes call-log, phone-state, contacts, and overlay permissions, including an optional overlay declaration contributed by the development client. Developer overlay tools may consequently be limited. Contacts and hidden/private/unavailable numbers may not be delivered by Android without additional permissions; this module requests none of those permissions. Absence of a callback or directory match cannot be used as a safety verdict.

## iOS

The plugin creates an embedded `ScamGraphCallerDirectory.appex` target, host dependency, and App Group entitlement. The host and extension share a validated local cache through that App Group. The user must manually enable the extension in Call Blocking & Identification settings; the module can open that system panel. The extension imports deduplicated, numerically sorted international numbers and labels them with evidence status, source, and retrieval date. It never adds blocking entries. See [Apple Call Directory guidance](https://developer.apple.com/documentation/callkit/identifying-and-blocking-calls).

Call Directory does not reveal an incoming number to JavaScript or the host app and does not provide an unknown-call app notification. iOS retains its already imported list until an extension reload. TTL is checked during reload, not on each incoming call; previously loaded labels can remain stale while the app stays offline or closed. Foreground refresh requests a reload. Disabling clears the cache and requests a reload; if that fails, the status tells the user to disable the extension directly in system settings.

Apple's modern [Live Caller ID Lookup](https://developer.apple.com/documentation/identitylookup/understanding-how-live-caller-id-lookup-preserves-privacy) is a distinct capability involving private retrieval and Apple relay/provider validation. It is not configured here. An ordinary REST lookup or JavaScript phone listener is not a substitute.

## Build and checks

The app config includes `./plugins/withScamGraphCaller` with App Group `group.ai.scamgraph.app`, extension name `ScamGraphCallerDirectory`, and URL scheme `scamgraph`. Change the group and bundle identifiers together when using your own Apple team; register/provision the App Group for both targets. EAS extension metadata is generated by the plugin. [Expo extension documentation](https://docs.expo.dev/build-reference/app-extensions/) explains target credential requirements.

The plugin adds an idempotent `post_install` clamp for dependency targets whose numeric iOS deployment setting is below the host's configured `ios.deploymentTarget` (default `15.1`). This addresses resource Pods such as RNSVG that otherwise retain `12.4`, which current Xcode SDKs reject. It leaves higher targets, the host project, the caller extension's `16.4` minimum, and signing settings unchanged. After updating an existing Podfile, run `pod install` in `app/ios/`.

From `app/`, use `npx expo prebuild --no-install`, then `npx expo run:android` or `npx expo run:ios` after installing the required platform tools and development credentials. Use a physical phone for incoming-call checks. Expo exports validate JavaScript bundles and do not compile these native sources.

Repeat prebuild in a disposable copy, then run:

```sh
node plugins/__tests__/verify-prebuild.js /absolute/path/to/prebuilt/app
node node_modules/typescript/bin/tsc --noEmit
xcrun --sdk iphonesimulator swiftc -typecheck \
  -module-cache-path /absolute/path/to/writable/cache \
  -target arm64-apple-ios16.4-simulator \
  -sdk "$(xcrun --sdk iphonesimulator --show-sdk-path)" \
  modules/scamgraph-caller/extension/CallDirectoryHandler.swift
```

Verified locally: Android and Apple Expo autolinking; both-platform prebuild; repeat-prebuild topology/permission assertions; TypeScript checking; Call Directory SDK typechecking; isolated extension compilation; and a full unsigned arm64 iOS Simulator Debug host build with the embedded caller extension on 7 October 2026, using Xcode 27.0 and CocoaPods 1.17.0. The host build used its default deployment settings after the Pod minimum fix. The Debug artifact uses the Metro development server rather than an embedded production JavaScript bundle. Signing, production release packaging, device installation and actual incoming calls remain unverified. Android compilation remains unverified because no working JDK or Android SDK was found. Device tests must still cover consent grant/deny, notification denial, known verified matches, empty/expired cache, unknown/withheld numbers, source revocation, foreground reload, disable/clear, role removal, caller-number spoofing, and platform restrictions. A matched number is evidence about a record, never proof of the caller's identity or intent.
