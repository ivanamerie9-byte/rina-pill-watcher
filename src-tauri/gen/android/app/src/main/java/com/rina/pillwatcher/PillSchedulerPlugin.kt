package com.rina.pillwatcher

import android.app.Activity
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.webkit.WebView
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import androidx.work.WorkManager

/**
 * Tauri plugin registered in MainActivity.
 * On load: reads all pending dose logs from DB and registers AlarmManager alarms.
 * Also exposes Tauri commands for scheduling/cancelling individual alarms.
 */
@TauriPlugin
class PillSchedulerPlugin(private val activity: Activity) : Plugin(activity) {

    private val alarmManager: AlarmManager
        get() = activity.getSystemService(Context.ALARM_SERVICE) as AlarmManager

    /** Called by Tauri when WebView is ready (app start / resume). */
    override fun load(webView: WebView) {
        super.load(webView)
        PillAlarmReceiver.createChannel(activity)
        // The Rust side creates the DB + schema on startup; if the plugin loads
        // before that (or the DB is briefly locked) just skip — we reschedule on
        // every resume anyway.
        try { rescheduleAll() } catch (e: Exception) { /* will retry on next load */ }
    }

    /** Schedule all future pending dose logs from DB. */
    private fun rescheduleAll() {
        val db = PillDatabase.getInstance(activity)
        db.readableDatabase.rawQuery(
            """SELECT dl.id, dl.due_at
               FROM dose_logs dl
               WHERE dl.status = 'pending'
                 AND dl.due_at > datetime('now')
               ORDER BY dl.due_at""",
            null
        ).use { c ->
            while (c.moveToNext()) {
                val logId = c.getLong(0)
                val dueAt = c.getString(1)
                val epochMs = try {
                    val dt = java.time.LocalDateTime.parse(
                        dueAt,
                        java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")
                    )
                    dt.atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli()
                } catch (e: Exception) { continue }
                scheduleAlarmInternal(logId, epochMs)
            }
        }
    }

    private fun scheduleAlarmInternal(logId: Long, timeMs: Long) {
        val intent = Intent(activity, PillAlarmReceiver::class.java).apply {
            putExtra(PillAlarmReceiver.EXTRA_LOG_ID, logId)
        }
        val pi = PendingIntent.getBroadcast(
            activity, logId.toInt(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, timeMs, pi)
    }

    /** scheduleAlarm({ dose_log_id: Long, time_ms: Long }) */
    @Command
    fun scheduleAlarm(invoke: Invoke) {
        val args = invoke.getArgs()
        val logId  = args.optLong("dose_log_id", -1L)
        val timeMs = args.optLong("time_ms", -1L)
        if (logId == -1L) { invoke.reject("missing dose_log_id"); return }
        if (timeMs == -1L) { invoke.reject("missing time_ms"); return }

        val intent = Intent(activity, PillAlarmReceiver::class.java).apply {
            putExtra(PillAlarmReceiver.EXTRA_LOG_ID, logId)
        }
        val pi = PendingIntent.getBroadcast(
            activity, logId.toInt(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, timeMs, pi)
        invoke.resolve()
    }

    /** cancelDoseAlarms({ dose_log_id: Long }) */
    @Command
    fun cancelDoseAlarms(invoke: Invoke) {
        val logId = invoke.getArgs().optLong("dose_log_id", -1L)
        if (logId == -1L) { invoke.reject("missing dose_log_id"); return }

        // Cancel AlarmManager
        val intent = Intent(activity, PillAlarmReceiver::class.java)
        val pi = PendingIntent.getBroadcast(
            activity, logId.toInt(), intent,
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
        )
        pi?.let { alarmManager.cancel(it); it.cancel() }

        // Cancel WorkManager reminders
        WorkManager.getInstance(activity).cancelUniqueWork("reminder_$logId")

        // Dismiss notification if visible
        androidx.core.app.NotificationManagerCompat.from(activity)
            .cancel(PillAlarmReceiver.notifId(logId))

        invoke.resolve()
    }
}
