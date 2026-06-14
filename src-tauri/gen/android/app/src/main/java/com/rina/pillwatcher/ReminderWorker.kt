package com.rina.pillwatcher

import android.content.Context
import androidx.work.*
import java.util.concurrent.TimeUnit

/**
 * WorkManager worker that re-notifies every [reminderIntervalMin] minutes
 * until the dose is confirmed, skipped, or 2 hours have elapsed.
 */
class ReminderWorker(ctx: Context, params: WorkerParameters) :
    Worker(ctx, params) {

    companion object {
        const val EXTRA_LOG_ID = "dose_log_id"
    }

    override fun doWork(): Result {
        val logId = inputData.getLong(EXTRA_LOG_ID, -1L)
        if (logId < 0) return Result.success()

        val db = PillDatabase.getInstance(applicationContext)
        val dose = db.getDoseLog(logId) ?: return Result.success()

        // Stop if confirmed/skipped
        if (!db.isPending(logId)) return Result.success()

        // Stop after 2 hours
        val dueMs = try {
            val due = java.time.LocalDateTime.parse(
                dose.dueAt, java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")
            )
            due.atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli()
        } catch (e: Exception) { return Result.success() }

        if (System.currentTimeMillis() - dueMs > 2 * 60 * 60 * 1000) {
            // Mark missed
            db.writableDatabase.execSQL(
                "UPDATE dose_logs SET status='missed' WHERE id=? AND status='pending'",
                arrayOf(logId)
            )
            return Result.success()
        }

        // Show reminder notification
        PillAlarmReceiver.createChannel(applicationContext)
        PillAlarmReceiver().showNotification(applicationContext, logId, dose, isFirst = false)

        // Schedule next check
        val next = OneTimeWorkRequestBuilder<ReminderWorker>()
            .setInitialDelay(dose.reminderIntervalMin.toLong(), TimeUnit.MINUTES)
            .setInputData(inputData)
            .addTag("reminder_$logId")
            .build()

        WorkManager.getInstance(applicationContext)
            .enqueueUniqueWork(
                "reminder_$logId",
                ExistingWorkPolicy.REPLACE,
                next
            )

        return Result.success()
    }
}
