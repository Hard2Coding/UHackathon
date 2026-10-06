import CallKit
import Foundation

final class CallDirectoryHandler: CXCallDirectoryProvider, CXCallDirectoryExtensionContextDelegate {
  override func beginRequest(with context: CXCallDirectoryExtensionContext) {
    context.delegate = self
    // Replace identification entries even for an incremental reload. This
    // extension never adds or changes blocking entries.
    if context.isIncremental { context.removeAllIdentificationEntries() }
    guard let group = Bundle.main.object(forInfoDictionaryKey: "ScamGraphCallerAppGroup") as? String,
          FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) != nil,
          let defaults = UserDefaults(suiteName: group), defaults.bool(forKey: "enabled"),
          let data = defaults.data(forKey: "directory"),
          let directory = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let expiresText = directory["expires_at"] as? String, let expires = date(expiresText), expires > Date(),
          let entries = directory["entries"] as? [[String: Any]], entries.count <= 10000 else {
      context.completeRequest(); return
    }
    var numbers: [Int64: String] = [:]
    for entry in entries {
      guard entry["is_sample"] as? Bool == false,
            let evidenceStatus = entry["evidence_status"] as? String, ["confirmed_source", "community_reviewed"].contains(evidenceStatus),
            let number = entry["phone"] as? String, number.range(of: "^\\+[1-9][0-9]{7,14}$", options: .regularExpression) != nil,
            let integer = Int64(number.dropFirst()), integer > 0,
            let source = entry["source"] as? String, !source.isEmpty,
            let retrieved = entry["retrieved_at"] as? String, let retrievalDate = date(retrieved),
            let expiryText = entry["expires_at"] as? String, let expiry = date(expiryText), expiry > Date() else { continue }
      let formatter = DateFormatter()
      formatter.locale = Locale(identifier: "en_US_POSIX")
      formatter.timeZone = TimeZone(secondsFromGMT: 0)
      formatter.dateFormat = "yyyy-MM-dd"
      let dateLabel = formatter.string(from: retrievalDate)
      let evidenceLabel = evidenceStatus == "confirmed_source" ? "Source-confirmed record" : "Reviewed report"
      // The label states evidence and date; it never labels a person a scammer.
      numbers[integer] = String("\(evidenceLabel) · \(source) · \(dateLabel)".prefix(200))
    }
    // CallKit requires strictly increasing numbers, including country code.
    for number in numbers.keys.sorted() {
      context.addIdentificationEntry(withNextSequentialPhoneNumber: number, label: numbers[number]!)
    }
    context.completeRequest()
  }

  private func date(_ value: String) -> Date? {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let result = formatter.date(from: value) { return result }
    formatter.formatOptions = [.withInternetDateTime]
    return formatter.date(from: value)
  }

  func requestFailed(for extensionContext: CXCallDirectoryExtensionContext, withError error: Error) {
    // Do not log the directory or phone numbers. The host can inspect whether
    // a reload succeeds through CXCallDirectoryManager's completion callback.
  }
}
