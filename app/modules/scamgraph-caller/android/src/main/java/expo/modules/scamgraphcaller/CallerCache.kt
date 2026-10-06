package expo.modules.scamgraphcaller

import android.content.Context
import android.telephony.PhoneNumberUtils
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

internal object CallerCache {
  private const val PREFS = "scamgraph_verified_callers"
  private const val DIRECTORY = "directory"
  private const val MAX_ENTRIES = 10000
  private const val MAX_TTL_SECONDS = 6 * 60 * 60L
  private val e164 = Regex("^\\+[1-9][0-9]{7,14}$")

  fun normalize(raw: String): String? {
    val international = PhoneNumberUtils.formatNumberToE164(raw, "TH")
    if (international != null && e164.matches(international)) return international
    val stripped = raw.replace(Regex("[\\s().-]"), "")
    return stripped.takeIf { e164.matches(it) }
  }

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  fun enabled(context: Context): Boolean = prefs(context).getBoolean("enabled", false)
  fun setEnabled(context: Context, enabled: Boolean) { prefs(context).edit().putBoolean("enabled", enabled).commit() }
  private fun timestamp(value: String): Instant? = try { Instant.parse(value) } catch (_: Exception) { null }

  fun sync(context: Context, raw: String) {
    require(raw.toByteArray(Charsets.UTF_8).size <= 3 * 1024 * 1024) { "Directory exceeds 3 MB" }
    val input = JSONObject(raw)
    val now = Instant.now()
    val generated = timestamp(input.getString("generated_at")) ?: error("Invalid generated_at")
    require(!generated.isAfter(now.plusSeconds(300))) { "Directory timestamp is in the future" }
    val expiry = timestamp(input.getString("expires_at")) ?: error("Invalid expires_at")
    val boundedExpiry = if (expiry.isAfter(now.plusSeconds(MAX_TTL_SECONDS))) now.plusSeconds(MAX_TTL_SECONDS) else expiry
    val entries = input.getJSONArray("entries")
    require(entries.length() <= MAX_ENTRIES) { "Too many caller entries" }
    val clean = JSONArray()
    val seen = mutableSetOf<String>()
    for (index in 0 until entries.length()) {
      val item = entries.getJSONObject(index)
      val phone = item.optString("phone")
      val status = item.optString("evidence_status")
      val sample = item.opt("is_sample")
      if (sample != false || status !in setOf("confirmed_source", "community_reviewed") || !e164.matches(phone)) continue
      if (!seen.add(phone)) continue
      val source = item.optString("source").trim().take(120)
      val label = item.optString("label").trim().take(100)
      val entryExpiry = timestamp(item.optString("expires_at", boundedExpiry.toString())) ?: continue
      val retrieved = timestamp(item.optString("retrieved_at")) ?: continue
      if (retrieved.isAfter(now.plusSeconds(300))) continue
      if (source.isEmpty() || label.isEmpty() || !entryExpiry.isAfter(now)) continue
      clean.put(JSONObject().put("phone", phone).put("label", label).put("source", source)
        .put("evidence_status", status).put("retrieved_at", retrieved.toString())
        .put("expires_at", entryExpiry.toString()).put("is_sample", false))
    }
    val stored = JSONObject().put("entries", clean).put("generated_at", generated.toString())
      .put("expires_at", boundedExpiry.toString()).put("version", input.optString("version"))
    require(prefs(context).edit().putString(DIRECTORY, stored.toString()).remove("last_lookup").commit()) { "Unable to write directory" }
  }

  fun directory(context: Context): JSONObject? = try {
    prefs(context).getString(DIRECTORY, null)?.let { JSONObject(it) }
  } catch (_: Exception) { null }

  fun current(directory: JSONObject?): Boolean = directory != null &&
    timestamp(directory.optString("expires_at"))?.isAfter(Instant.now()) == true

  fun lookup(context: Context, rawPhone: String?): JSONObject? {
    if (!enabled(context)) return null
    val phone = rawPhone?.let(::normalize) ?: return null
    val directory = directory(context)
    if (!current(directory)) return null
    val entries = directory!!.optJSONArray("entries") ?: return null
    for (index in 0 until entries.length()) {
      val entry = entries.getJSONObject(index)
      if (entry.optString("phone") == phone && timestamp(entry.optString("expires_at"))?.isAfter(Instant.now()) == true) return entry
    }
    return null
  }

  fun clear(context: Context) { prefs(context).edit().clear().putBoolean("enabled", false).commit() }
  fun masked(raw: String?): String {
    val phone = raw?.let(::normalize) ?: return "[private or unavailable]"
    return phone.take(3) + "••••••" + phone.takeLast(2)
  }
  fun remember(context: Context, raw: String?, entry: JSONObject?) {
    val summary = JSONObject().put("status", if (entry == null) "insufficient_data" else "known_verified_evidence")
      .put("maskedPhone", masked(raw)).put("source", entry?.optString("source") ?: JSONObject.NULL)
      .put("checkedAt", Instant.now().toString())
    prefs(context).edit().putString("last_lookup", summary.toString()).apply()
  }
  fun lastLookup(context: Context): Map<String, Any?>? = try {
    prefs(context).getString("last_lookup", null)?.let {
      val value = JSONObject(it)
      mapOf("status" to value.getString("status"), "maskedPhone" to value.getString("maskedPhone"),
        "source" to if (value.isNull("source")) null else value.getString("source"), "checkedAt" to value.getString("checkedAt"))
    }
  } catch (_: Exception) { null }
}
