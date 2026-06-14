package com.rina.pillwatcher

import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.*
import java.util.concurrent.TimeUnit

/**
 * Fires when an alarm set by PillSchedulerPlugin goes off.
 * Shows the initial "time to take" notification and starts WorkManager reminders.
 */
class PillAlarmReceiver : BroadcastReceiver() {

    companion object {
        const val CHANNEL_ID = "pill_reminders"
        const val CHANNEL_NAME = "Pill Reminders"
        const val EXTRA_LOG_ID = "dose_log_id"
        const val ACTION_TAKE = "com.rina.pillwatcher.TAKE"
        const val ACTION_SKIP = "com.rina.pillwatcher.SKIP"

        fun createChannel(context: Context) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(
                    CHANNEL_ID, CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "Medication reminders"
                    enableVibration(true)
                }
                context.getSystemService(NotificationManager::class.java)
                    .createNotificationChannel(channel)
            }
        }

        fun notifId(logId: Long): Int = (logId % Int.MAX_VALUE).toInt()
    }

    @SuppressLint("MissingPermission")
    override fun onReceive(context: Context, intent: Intent) {
        val logId = intent.getLongExtra(EXTRA_LOG_ID, -1L)
        if (logId < 0) return

        val db = PillDatabase.getInstance(context)
        val dose = db.getDoseLog(logId) ?: return
        if (dose.status != "pending") return

        if (isQuietHours(context, db)) {
            // reschedule for quiet-end instead of notifying now
            scheduleForEndOfQuiet(context, db, logId, dose)
            return
        }

        createChannel(context)
        showNotification(context, logId, dose, isFirst = true)

        // Start WorkManager periodic reminder chain
        val workData = workDataOf(ReminderWorker.EXTRA_LOG_ID to logId)
        val workRequest = OneTimeWorkRequestBuilder<ReminderWorker>()
            .setInitialDelay(dose.reminderIntervalMin.toLong(), TimeUnit.MINUTES)
            .setInputData(workData)
            .addTag("reminder_$logId")
            .setConstraints(Constraints.Builder()
                .setRequiresBatteryNotLow(false)
                .build())
            .build()

        WorkManager.getInstance(context)
            .enqueueUniqueWork(
                "reminder_$logId",
                ExistingWorkPolicy.KEEP,
                workRequest
            )
    }

    private fun isQuietHours(context: Context, db: PillDatabase): Boolean {
        val (start, end) = db.getQuietHours()
        val now = java.time.LocalTime.now()
        val s = java.time.LocalTime.parse(start)
        val e = java.time.LocalTime.parse(end)
        return if (s < e) now in s..e else now >= s || now <= e
    }

    private fun scheduleForEndOfQuiet(
        context: Context,
        db: PillDatabase,
        logId: Long,
        dose: PillDatabase.DoseInfo,
    ) {
        val (_, endStr) = db.getQuietHours()
        val endTime = java.time.LocalTime.parse(endStr)
        val now = java.time.LocalDateTime.now()
        var fireAt = now.with(endTime)
        if (!fireAt.isAfter(now)) fireAt = fireAt.plusDays(1)

        val epochMs = fireAt.atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli()
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pi = buildAlarmIntent(context, logId)
        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, epochMs, pi)
    }

    private fun buildAlarmIntent(context: Context, logId: Long): PendingIntent {
        val intent = Intent(context, PillAlarmReceiver::class.java).apply {
            putExtra(EXTRA_LOG_ID, logId)
        }
        return PendingIntent.getBroadcast(
            context, logId.toInt(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    @SuppressLint("MissingPermission")
    internal fun showNotification(
        context: Context, logId: Long,
        dose: PillDatabase.DoseInfo, isFirst: Boolean,
    ) {
        val takeIntent = Intent(context, NotificationActionReceiver::class.java).apply {
            action = ACTION_TAKE
            putExtra(EXTRA_LOG_ID, logId)
        }
        val skipIntent = Intent(context, NotificationActionReceiver::class.java).apply {
            action = ACTION_SKIP
            putExtra(EXTRA_LOG_ID, logId)
        }

        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val takePi = PendingIntent.getBroadcast(context, (logId * 10).toInt(), takeIntent, flags)
        val skipPi = PendingIntent.getBroadcast(context, (logId * 10 + 1).toInt(), skipIntent, flags)

        val title = if (isFirst) "💊 Time for ${dose.medName}" else "⏰ Still waiting — ${dose.medName}"
        val body  = if (dose.notes.isNotEmpty()) dose.notes else
            if (isFirst) "Tap 'Took It' to confirm" else "Did you take it?"

        val notif = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_notification_overlay)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(false)
            .setOngoing(false)
            .addAction(0, "✓ Took It", takePi)
            .addAction(0, "Skip", skipPi)
            .build()

        NotificationManagerCompat.from(context).notify(notifId(logId), notif)
    }
}
