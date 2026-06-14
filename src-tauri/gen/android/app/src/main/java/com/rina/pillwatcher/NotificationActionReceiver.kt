package com.rina.pillwatcher

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationManagerCompat
import androidx.work.WorkManager

/**
 * Handles "Took It" and "Skip" taps on notifications.
 * Updates the database and cancels all pending reminders.
 * Works even when the main app process is not running.
 */
class NotificationActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val logId = intent.getLongExtra(PillAlarmReceiver.EXTRA_LOG_ID, -1L)
        if (logId < 0) return

        val db = PillDatabase.getInstance(context)

        when (intent.action) {
            PillAlarmReceiver.ACTION_TAKE -> {
                db.confirmDose(logId)
                // Cancel the notification
                NotificationManagerCompat.from(context)
                    .cancel(PillAlarmReceiver.notifId(logId))
                // Cancel ongoing WorkManager reminders
                WorkManager.getInstance(context).cancelUniqueWork("reminder_$logId")
            }
            PillAlarmReceiver.ACTION_SKIP -> {
                db.skipDose(logId)
                NotificationManagerCompat.from(context)
                    .cancel(PillAlarmReceiver.notifId(logId))
                WorkManager.getInstance(context).cancelUniqueWork("reminder_$logId")
            }
        }
    }
}
