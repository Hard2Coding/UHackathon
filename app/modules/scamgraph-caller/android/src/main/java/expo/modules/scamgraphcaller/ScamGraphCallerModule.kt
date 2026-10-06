package expo.modules.scamgraphcaller

import android.Manifest
import android.app.Activity
import android.app.NotificationManager
import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import expo.modules.interfaces.permissions.Permissions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ScamGraphCallerModule : Module() {
  private var rolePromise: Promise? = null
  private val context: Context get() = requireNotNull(appContext.reactContext)

  override fun definition() = ModuleDefinition {
    Name("ScamGraphCaller")

    AsyncFunction("getStatus") { status() }
    AsyncFunction("syncDirectory") { json: String -> if (Build.VERSION.SDK_INT >= 29) CallerCache.sync(context, json); status() }
    AsyncFunction("clearDirectory") { disable(); status() }
    AsyncFunction("disableProtection") { disable(); status() }

    AsyncFunction("requestActivation") { promise: Promise ->
      if (Build.VERSION.SDK_INT < 29) {
        promise.resolve(status()); return@AsyncFunction
      }
      val manager = context.getSystemService(RoleManager::class.java)
      if (!manager.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING)) {
        promise.resolve(status()); return@AsyncFunction
      }
      if (manager.isRoleHeld(RoleManager.ROLE_CALL_SCREENING)) {
        CallerCache.setEnabled(context, true)
        promise.resolve(status()); return@AsyncFunction
      }
      if (rolePromise != null) { promise.reject("E_ROLE_PENDING", "A role request is already open", null); return@AsyncFunction }
      val activity = appContext.currentActivity
      if (activity == null) { promise.reject("E_NO_ACTIVITY", "Open the app before requesting activation", null); return@AsyncFunction }
      rolePromise = promise
      try { activity.startActivityForResult(manager.createRequestRoleIntent(RoleManager.ROLE_CALL_SCREENING), ROLE_REQUEST) }
      catch (_: Exception) { rolePromise = null; promise.reject("E_ROLE_REQUEST", "This device could not open the call-screening role request", null) }
    }.runOnQueue(Queues.MAIN)

    OnActivityResult { _: Activity, result ->
      if (result.requestCode == ROLE_REQUEST) {
        val manager = if (Build.VERSION.SDK_INT >= 29) context.getSystemService(RoleManager::class.java) else null
        CallerCache.setEnabled(context, manager?.isRoleHeld(RoleManager.ROLE_CALL_SCREENING) == true)
        rolePromise?.resolve(status())
        rolePromise = null
      }
    }

    AsyncFunction("requestNotifications") { promise: Promise ->
      if (Build.VERSION.SDK_INT >= 33) Permissions.askForPermissionsWithPermissionsManager(appContext.permissions, promise, Manifest.permission.POST_NOTIFICATIONS)
      else promise.resolve(mapOf("granted" to true, "status" to "granted"))
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("openSettings") {
      val activity = appContext.currentActivity ?: error("Open the app before opening settings")
      activity.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.parse("package:" + context.packageName)))
    }.runOnQueue(Queues.MAIN)

    OnDestroy { rolePromise?.reject("E_MODULE_DESTROYED", "Module closed during role request", null); rolePromise = null }
  }

  private fun disable() {
    CallerCache.clear(context)
    context.getSystemService(NotificationManager::class.java).cancel(ScamGraphCallScreeningService.NOTIFICATION_ID)
  }

  private fun status(): Map<String, Any?> {
    val manager = if (Build.VERSION.SDK_INT >= 29) context.getSystemService(RoleManager::class.java) else null
    val roleAvailable = manager?.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING) == true
    val roleHeld = manager?.isRoleHeld(RoleManager.ROLE_CALL_SCREENING) == true
    val enabled = CallerCache.enabled(context) && roleHeld
    val directory = CallerCache.directory(context)
    val permission = Build.VERSION.SDK_INT < 33 || context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    val notifications = permission && context.getSystemService(NotificationManager::class.java).areNotificationsEnabled()
    return mapOf("available" to roleAvailable, "enabled" to enabled, "platform" to "android", "roleAvailable" to roleAvailable,
      "roleHeld" to roleHeld, "notificationsGranted" to notifications, "cacheCount" to (directory?.optJSONArray("entries")?.length() ?: 0),
      "cacheExpiresAt" to directory?.optString("expires_at"), "cacheCurrent" to CallerCache.current(directory),
      "extensionStatus" to "not_applicable", "lastLookup" to CallerCache.lastLookup(context),
      "message" to if (!roleAvailable) "Call-screening role requires Android 10+ and a supported device" else if (!enabled) "Caller protection is off; activate explicitly in this app" else if (!notifications) "Role active; notifications unavailable until you grant notification permission" else "Offline caller evidence is active; all calls are allowed",
      "limitations" to listOf("No automatic call blocking", "Unknown or stale-cache callers have insufficient data", "Contacts and hidden/private numbers may not be delivered by Android without additional permissions; none are requested", "Only source-confirmed or moderated verified evidence is cached", "Incoming numbers are not uploaded or written to diagnostic logs"))
  }

  companion object { private const val ROLE_REQUEST = 7801 }
}
