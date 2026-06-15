package com.rina.pillwatcher

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import java.io.File

/**
 * Read/write access to the *same* SQLite file Rust uses.
 *
 * Tauri's `app_data_dir()` resolves to `activity.dataDir` on Android
 * (`PathPlugin.getDataDir` -> `/data/data/<pkg>`), and the Rust side opens
 * `app_data_dir/pill_rina.db`. We pass that absolute path as the helper "name"
 * so SQLiteOpenHelper opens the exact same file (an absolute name bypasses the
 * default `databases/` sub-directory). minSdk 26 guarantees Context.dataDir.
 */
class PillDatabase private constructor(context: Context) :
    SQLiteOpenHelper(context, dbPath(context), null, DB_VERSION) {

    companion object {
        private const val DB_VERSION = 1
        const val DB_NAME = "pill_rina.db"

        private fun dbPath(context: Context): String =
            File(context.applicationContext.dataDir, DB_NAME).absolutePath

        @Volatile private var instance: PillDatabase? = null

        fun getInstance(context: Context): PillDatabase =
            instance ?: synchronized(this) {
                instance ?: PillDatabase(context.applicationContext).also { instance = it }
            }
    }

    override fun onCreate(db: SQLiteDatabase) { /* Rust creates the schema */ }
    override fun onUpgrade(db: SQLiteDatabase, old: Int, new: Int) {}

    override fun onOpen(db: SQLiteDatabase) {
        super.onOpen(db)
        db.execSQL("PRAGMA foreign_keys=ON;")
        db.execSQL("PRAGMA journal_mode=WAL;")
    }

    data class DoseInfo(
        val id: Long,
        val medName: String,
        val medColor: String,
        val dueAt: String,
        val notes: String,
        val reminderIntervalMin: Int,
        val status: String,
    )

    fun getDoseLog(logId: Long): DoseInfo? {
        val db = readableDatabase
        db.rawQuery(
            """SELECT dl.id, m.name, m.color, dl.due_at, m.notes,
                      s.reminder_interval_min, dl.status
               FROM dose_logs dl
               JOIN medications m ON m.id = dl.med_id
               JOIN schedules   s ON s.id = dl.schedule_id
               WHERE dl.id = ?""",
            arrayOf(logId.toString())
        ).use { c ->
            if (!c.moveToFirst()) return null
            return DoseInfo(
                id = c.getLong(0),
                medName = c.getString(1),
                medColor = c.getString(2),
                dueAt = c.getString(3),
                notes = c.getString(4) ?: "",
                reminderIntervalMin = c.getInt(5),
                status = c.getString(6),
            )
        }
    }

    fun confirmDose(logId: Long) {
        val now = java.time.LocalDateTime.now()
            .format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss"))
        writableDatabase.update(
            "dose_logs",
            ContentValues().apply {
                put("status", "taken")
                put("taken_at", now)
            },
            "id = ? AND status = 'pending'",
            arrayOf(logId.toString())
        )
    }

    fun skipDose(logId: Long) {
        writableDatabase.update(
            "dose_logs",
            ContentValues().apply { put("status", "skipped") },
            "id = ? AND status = 'pending'",
            arrayOf(logId.toString())
        )
    }

    /** True if this dose is still pending. */
    fun isPending(logId: Long): Boolean {
        readableDatabase.rawQuery(
            "SELECT 1 FROM dose_logs WHERE id=? AND status='pending'",
            arrayOf(logId.toString())
        ).use { c -> return c.moveToFirst() }
    }

    fun getQuietHours(): Pair<String, String> {
        val db = readableDatabase
        fun get(key: String, def: String): String {
            db.rawQuery("SELECT value FROM settings WHERE key=?", arrayOf(key))
                .use { c -> return if (c.moveToFirst()) c.getString(0) else def }
        }
        return get("quiet_start", "23:00") to get("quiet_end", "07:00")
    }
}
