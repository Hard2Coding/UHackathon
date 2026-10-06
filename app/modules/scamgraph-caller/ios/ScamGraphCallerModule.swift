import CallKit
import ExpoModulesCore
import Foundation
import UIKit

public final class ScamGraphCallerModule: Module {
  private var lastReloadError: String?
  private var group: String { Bundle.main.object(forInfoDictionaryKey: "ScamGraphCallerAppGroup") as? String ?? "" }
  private var extensionIdentifier: String { Bundle.main.object(forInfoDictionaryKey: "ScamGraphCallerExtensionBundleIdentifier") as? String ?? "" }
  private var defaults: UserDefaults? {
    guard !group.isEmpty, FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) != nil else { return nil }
    return UserDefaults(suiteName: group)
  }

  public func definition() -> ModuleDefinition {
    Name("ScamGraphCaller")
    AsyncFunction("getStatus") { (promise: Promise) in self.resolveStatus(promise) }
    AsyncFunction("syncDirectory") { (json: String, promise: Promise) in
      do { try self.store(json); self.reload(promise) }
      catch { promise.reject("E_DIRECTORY", "Caller directory validation or storage failed") }
    }
    AsyncFunction("clearDirectory") { (promise: Promise) in self.disable(promise) }
    AsyncFunction("disableProtection") { (promise: Promise) in self.disable(promise) }
    AsyncFunction("requestNotifications") { ["granted": false, "status": "not_applicable"] }
    AsyncFunction("requestActivation") { (promise: Promise) in
      guard let defaults = self.defaults else { self.resolveStatus(promise); return }
      // This function is invoked only by the user's enable button. iOS still
      // requires the user to turn on the extension in the system settings.
      defaults.set(true, forKey: "enabled")
      self.openSettings(promise)
    }.runOnQueue(.main)
    AsyncFunction("openSettings") { (promise: Promise) in
      CXCallDirectoryManager.sharedInstance.openSettings { error in
        if error != nil { promise.reject("E_CALLER_SETTINGS", "Unable to open caller-identification settings") }
        else { promise.resolve(nil) }
      }
    }.runOnQueue(.main)
  }

  private func openSettings(_ promise: Promise) {
    CXCallDirectoryManager.sharedInstance.openSettings { error in
      if let error = error { self.lastReloadError = error.localizedDescription }
      self.resolveStatus(promise)
    }
  }

  private func date(_ value: String) -> Date? {
    let format = ISO8601DateFormatter()
    format.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let result = format.date(from: value) { return result }
    format.formatOptions = [.withInternetDateTime]
    return format.date(from: value)
  }

  private func store(_ json: String) throws {
    guard let defaults = defaults, let data = json.data(using: .utf8), data.count <= 3 * 1024 * 1024,
          let input = try JSONSerialization.jsonObject(with: data) as? [String: Any],
          let entries = input["entries"] as? [[String: Any]], entries.count <= 10000,
          let generatedText = input["generated_at"] as? String, let generated = date(generatedText),
          generated <= Date().addingTimeInterval(300),
          let expiryText = input["expires_at"] as? String, let expiry = date(expiryText) else {
      throw NSError(domain: "ScamGraphCaller", code: 1)
    }
    let now = Date()
    let boundedExpiry = min(expiry, now.addingTimeInterval(6 * 3600))
    var seen = Set<String>()
    let clean = entries.compactMap { entry -> [String: Any]? in
      guard entry["is_sample"] as? Bool == false,
            let status = entry["evidence_status"] as? String, ["confirmed_source", "community_reviewed"].contains(status),
            let phone = entry["phone"] as? String, phone.range(of: "^\\+[1-9][0-9]{7,14}$", options: .regularExpression) != nil,
            seen.insert(phone).inserted,
            let label = entry["label"] as? String, !label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            let source = entry["source"] as? String, !source.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            let retrieved = entry["retrieved_at"] as? String, date(retrieved) != nil,
            let entryExpiry = date(entry["expires_at"] as? String ?? expiryText), entryExpiry > now else { return nil }
      return ["phone": phone, "label": String(label.prefix(100)), "source": String(source.prefix(120)),
              "evidence_status": status, "retrieved_at": retrieved, "expires_at": ISO8601DateFormatter().string(from: entryExpiry), "is_sample": false]
    }
    let stored: [String: Any] = ["entries": clean, "generated_at": generatedText,
      "expires_at": ISO8601DateFormatter().string(from: boundedExpiry), "version": input["version"] as? String ?? "unknown"]
    defaults.set(try JSONSerialization.data(withJSONObject: stored), forKey: "directory")
  }

  private func disable(_ promise: Promise) {
    defaults?.set(false, forKey: "enabled")
    defaults?.removeObject(forKey: "directory")
    reload(promise)
  }

  private func reload(_ promise: Promise) {
    guard !extensionIdentifier.isEmpty else { resolveStatus(promise); return }
    CXCallDirectoryManager.sharedInstance.reloadExtension(withIdentifier: extensionIdentifier) { error in
      self.lastReloadError = error?.localizedDescription
      self.resolveStatus(promise)
    }
  }

  private func resolveStatus(_ promise: Promise) {
    guard !extensionIdentifier.isEmpty, defaults != nil else {
      promise.resolve(status(extensionStatus: "unavailable")); return
    }
    CXCallDirectoryManager.sharedInstance.getEnabledStatusForExtension(withIdentifier: extensionIdentifier) { state, error in
      let status = error != nil ? "unavailable" : state == .enabled ? "enabled" : state == .disabled ? "disabled" : "unknown"
      promise.resolve(self.status(extensionStatus: status))
    }
  }

  private func status(extensionStatus: String) -> [String: Any] {
    let stored: [String: Any]? = defaults?.data(forKey: "directory").flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
    let expiryText = stored?["expires_at"] as? String
    let current = expiryText.flatMap(date).map { $0 > Date() } ?? false
    let enabled = defaults?.bool(forKey: "enabled") == true && extensionStatus == "enabled"
    return ["available": extensionStatus != "unavailable", "enabled": enabled, "platform": "ios",
      "roleAvailable": false, "roleHeld": false, "notificationsGranted": false,
      "cacheCount": (stored?["entries"] as? [[String: Any]])?.count ?? 0,
      "cacheExpiresAt": expiryText as Any? ?? NSNull(), "cacheCurrent": current,
      "extensionStatus": extensionStatus,
      "message": lastReloadError.map { "Call Directory reload/settings failed: \($0). Disable the extension in iOS Settings if old labels remain." } ??
        (extensionStatus == "unavailable" ? "Call Directory extension or App Group provisioning is unavailable in this build" : enabled ? "Local identification list enabled; iOS displays source and retrieval date for matching numbers" : "Enable the Call Directory extension explicitly in iOS Settings"),
      "limitations": ["No incoming call number is exposed to JavaScript or this host app on iOS", "Unknown calls do not trigger app notifications or risk classification", "iOS retains its imported system list until the next extension reload; cache TTL is checked when reloading, not on each call", "Refresh in the foreground to apply removals and source updates; offline labels may be stale", "Source/review evidence does not establish caller identity or a fraud verdict", "Live Caller ID Lookup requires a separate Apple-validated relay/PIR/Privacy Pass provider and is not configured"]]
  }
}
