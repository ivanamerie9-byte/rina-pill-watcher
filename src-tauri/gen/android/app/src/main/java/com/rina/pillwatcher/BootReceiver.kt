package com.rina.pillwatcher

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Re-schedules all pending dose alarms after a device reboot.
 * Fires on BOOT_COMPLETED; reads all active schedules from the DB.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return

        val db = PillDatabase.getInstance(context)
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

        // Re-queue any dose logs that are still pending and in the future
        db.readableDatabase.rawQuery(
            """SELECT dl.id, dl.due_at, s.reminder_interval_min
               FROM dose_logs dl
               JOIN schedules s ON s.id = dl.schedule_id
               WHERE dl.status = 'pending'
                 AND dl.due_at > datetime('now')""",
            null
        ).use { c ->
            while (c.moveToNext()) {
                val logId  = c.getLong(0)
                val dueAt  = c.getString(1)

                val epochMs = try {
                    val dt = java.time.LocalDateTime.parse(
                        dueAt,
                        java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")
                    )
                    dt.atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli()
                } catch (e: Exception) { continue }

                val alarmIntent = Intent(context, PillAlarmReceiver::class.java).apply {
                    putExtra(PillAlarmReceiver.EXTRA_LOG_ID, logId)
                }
                val pi = PendingIntent.getBroadcast(
                    context, logId.toInt(), alarmIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, epochMs, pi)
            }
        }
    }
}
