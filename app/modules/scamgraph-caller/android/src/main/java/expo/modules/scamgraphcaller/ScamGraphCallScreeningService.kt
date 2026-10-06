package expo.modules.scamgraphcaller

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.telecom.Call
import android.telecom.CallScreeningService
import java.util.concurrent.Executors

/** No network, React Native runtime, model inference, or user interaction is on
 * the screening response path. Every call is allowed immediately. */
class ScamGraphCallScreeningService : CallScreeningService() {
  override fun onScreenCall(details: Call.Details) {
    if (Build.VERSION.SDK_INT < 29 || details.callDirection != Call.Details.DIRECTION_INCOMING) return
    // Telecom's deadline is five seconds. This occurs BEFORE cache I/O or work.
    respondToCall(details, CallResponse.Builder()
      .setDisallowCall(false).setRejectCall(false)
      .setSkipCallLog(false).setSkipNotification(false).build())
    if (!CallerCache.enabled(applicationContext)) return
    val rawPhone = details.handle?.schemeSpecificPart
    val context = applicationContext
    worker.execute {
      try {
        val entry = CallerCache.lookup(context, rawPhone)
        if (!CallerCache.enabled(context)) return@execute
        CallerCache.remember(context, rawPhone, entry)
        notifyResult(context, entry?.optString("label"), entry?.optString("source"))
      } catch (_: Exception) {
        // Errors never block a call, generate a verdict, or log the number.
      }
    }
  }

  private fun notifyResult(context: Context, label: String?, source: String?) {
    if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
    val manager = context.getSystemService(NotificationManager::class.java)
    if (!manager.areNotificationsEnabled()) return
    val channel = NotificationChannel(CHANNEL, "ScamGraph · สถานะสายเข้า", NotificationManager.IMPORTANCE_HIGH)
    channel.description = "ข้อมูลจากรายการที่ซิงก์แล้ว ไม่มีการบล็อกสาย / Offline evidence, no call blocking"
    channel.setSound(null, null)
    channel.enableVibration(false)
    channel.lockscreenVisibility = Notification.VISIBILITY_PRIVATE
    manager.createNotificationChannel(channel)
    val known = !label.isNullOrBlank() && !source.isNullOrBlank()
    val title = if (known) "ScamGraph · พบหลักฐานในรายการ" else "ScamGraph · ข้อมูลไม่เพียงพอ"
    val message = if (known) "$label · แหล่งข้อมูล: $source · ไม่ใช่คำตัดสินว่าโกง" else "ไม่พบข้อมูลยืนยันในรายการที่พร้อมใช้ ไม่ได้แปลว่าปลอดภัย"
    val notification = Notification.Builder(context, CHANNEL)
      .setSmallIcon(android.R.drawable.ic_menu_info_details)
      .setContentTitle(title).setContentText(message)
      .setStyle(Notification.BigTextStyle().bigText(message))
      .setVisibility(Notification.VISIBILITY_PRIVATE)
      .setCategory(Notification.CATEGORY_CALL)
      .setAutoCancel(true).setTimeoutAfter(60000)
      .setPublicVersion(Notification.Builder(context, CHANNEL)
        .setSmallIcon(android.R.drawable.ic_menu_info_details)
        .setContentTitle("ScamGraph AI").setContentText("เปิดแอพเพื่อตรวจข้อมูลสายเข้า").build())
    context.packageManager.getLaunchIntentForPackage(context.packageName)?.let { intent ->
      intent.action = Intent.ACTION_VIEW
      intent.data = Uri.parse("scamgraph://caller")
      notification.setContentIntent(PendingIntent.getActivity(context, 7002, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
    }
    // Only one most-recent status is retained. Full phone numbers are never put
    // in notification text, pending-intent extras, or diagnostic logs.
    manager.notify(NOTIFICATION_ID, notification.build())
  }

  companion object {
    internal const val CHANNEL = "scamgraph_caller_evidence"
    internal const val NOTIFICATION_ID = 7001
    private val worker = Executors.newSingleThreadExecutor()
  }
}
