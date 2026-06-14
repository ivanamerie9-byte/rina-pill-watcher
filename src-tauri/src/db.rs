use rusqlite::{params, Connection, Result};
use std::path::PathBuf;
use std::sync::Mutex;

use chrono::{Datelike, Local};

use crate::models::*;

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(path: PathBuf) -> Result<Self> {
        let conn = Connection::open(&path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
        let db = Database {
            conn: Mutex::new(conn),
        };
        db.init()?;
        Ok(db)
    }

    fn init(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS medications (
                id      INTEGER PRIMARY KEY AUTOINCREMENT,
                name    TEXT NOT NULL,
                color   TEXT NOT NULL DEFAULT '#7C6AF7',
                notes   TEXT NOT NULL DEFAULT '',
                active  INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS schedules (
                id                    INTEGER PRIMARY KEY AUTOINCREMENT,
                med_id                INTEGER NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
                time_hhmm             TEXT NOT NULL,
                days                  TEXT NOT NULL DEFAULT '1111111',
                reminder_interval_min INTEGER NOT NULL DEFAULT 10
            );

            CREATE TABLE IF NOT EXISTS dose_logs (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                med_id      INTEGER NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
                schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
                due_at      TEXT NOT NULL,
                taken_at    TEXT,
                status      TEXT NOT NULL DEFAULT 'pending'
            );

            CREATE UNIQUE INDEX IF NOT EXISTS idx_dose_logs_unique
                ON dose_logs(schedule_id, due_at);

            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            INSERT OR IGNORE INTO settings VALUES ('quiet_start', '23:00');
            INSERT OR IGNORE INTO settings VALUES ('quiet_end',   '07:00');
            INSERT OR IGNORE INTO settings VALUES ('default_interval', '10');
            ",
        )?;
        Ok(())
    }

    // ── Medications ──────────────────────────────────────────────────────────

    pub fn get_medications(&self) -> Result<Vec<Medication>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, color, notes, active
             FROM medications WHERE active = 1 ORDER BY name",
        )?;
        let items: Vec<Medication> = stmt
            .query_map([], |row| {
                Ok(Medication {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    color: row.get(2)?,
                    notes: row.get(3)?,
                    active: row.get::<_, i32>(4)? != 0,
                })
            })?
            .collect::<Result<Vec<_>>>()?;
        Ok(items)
    }

    pub fn add_medication(&self, name: &str, color: &str, notes: &str) -> Result<Medication> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO medications (name, color, notes) VALUES (?1, ?2, ?3)",
            params![name, color, notes],
        )?;
        let id = conn.last_insert_rowid();
        Ok(Medication {
            id,
            name: name.to_string(),
            color: color.to_string(),
            notes: notes.to_string(),
            active: true,
        })
    }

    pub fn update_medication(&self, id: i64, name: &str, color: &str, notes: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE medications SET name=?1, color=?2, notes=?3 WHERE id=?4",
            params![name, color, notes, id],
        )?;
        Ok(())
    }

    pub fn delete_medication(&self, id: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE medications SET active=0 WHERE id=?1",
            params![id],
        )?;
        Ok(())
    }

    // ── Schedules ────────────────────────────────────────────────────────────

    pub fn get_schedules(&self, med_id: i64) -> Result<Vec<Schedule>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, med_id, time_hhmm, days, reminder_interval_min
             FROM schedules WHERE med_id=?1 ORDER BY time_hhmm",
        )?;
        let items: Vec<Schedule> = stmt
            .query_map(params![med_id], |row| {
                Ok(Schedule {
                    id: row.get(0)?,
                    med_id: row.get(1)?,
                    time_hhmm: row.get(2)?,
                    days: row.get(3)?,
                    reminder_interval_min: row.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;
        Ok(items)
    }

    pub fn get_all_active_schedules(&self) -> Result<Vec<Schedule>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT s.id, s.med_id, s.time_hhmm, s.days, s.reminder_interval_min
             FROM schedules s JOIN medications m ON m.id = s.med_id
             WHERE m.active = 1 ORDER BY s.time_hhmm",
        )?;
        let items: Vec<Schedule> = stmt
            .query_map([], |row| {
                Ok(Schedule {
                    id: row.get(0)?,
                    med_id: row.get(1)?,
                    time_hhmm: row.get(2)?,
                    days: row.get(3)?,
                    reminder_interval_min: row.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;
        Ok(items)
    }

    pub fn add_schedule(
        &self,
        med_id: i64,
        time_hhmm: &str,
        days: &str,
        interval: i64,
    ) -> Result<Schedule> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO schedules (med_id, time_hhmm, days, reminder_interval_min)
             VALUES (?1, ?2, ?3, ?4)",
            params![med_id, time_hhmm, days, interval],
        )?;
        let id = conn.last_insert_rowid();
        Ok(Schedule {
            id,
            med_id,
            time_hhmm: time_hhmm.to_string(),
            days: days.to_string(),
            reminder_interval_min: interval,
        })
    }

    pub fn delete_schedule(&self, id: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM schedules WHERE id=?1", params![id])?;
        Ok(())
    }

    // ── Dose Logs ─────────────────────────────────────────────────────────────

    pub fn get_or_create_dose_log(
        &self,
        schedule_id: i64,
        med_id: i64,
        due_at: &str,
    ) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        match conn.query_row(
            "SELECT id FROM dose_logs WHERE schedule_id=?1 AND due_at=?2",
            params![schedule_id, due_at],
            |row| row.get::<_, i64>(0),
        ) {
            Ok(id) => Ok(id),
            Err(_) => {
                conn.execute(
                    "INSERT OR IGNORE INTO dose_logs (med_id, schedule_id, due_at, status)
                     VALUES (?1, ?2, ?3, 'pending')",
                    params![med_id, schedule_id, due_at],
                )?;
                Ok(conn.last_insert_rowid())
            }
        }
    }

    pub fn confirm_dose(&self, log_id: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Local::now().format("%Y-%m-%dT%H:%M:%S").to_string();
        conn.execute(
            "UPDATE dose_logs SET status='taken', taken_at=?1
             WHERE id=?2 AND status='pending'",
            params![now, log_id],
        )?;
        Ok(())
    }

    pub fn skip_dose(&self, log_id: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE dose_logs SET status='skipped'
             WHERE id=?1 AND status='pending'",
            params![log_id],
        )?;
        Ok(())
    }

    pub fn get_pending_doses(&self) -> Result<Vec<PendingDose>> {
        let conn = self.conn.lock().unwrap();
        let now = Local::now().format("%Y-%m-%dT%H:%M:%S").to_string();
        let cutoff = (Local::now() - chrono::Duration::hours(2))
            .format("%Y-%m-%dT%H:%M:%S")
            .to_string();

        let mut stmt = conn.prepare(
            "SELECT dl.id, dl.med_id, m.name, m.color, dl.due_at, m.notes,
                    s.reminder_interval_min
             FROM dose_logs dl
             JOIN medications m ON m.id = dl.med_id
             JOIN schedules s ON s.id = dl.schedule_id
             WHERE dl.status = 'pending' AND dl.due_at <= ?1 AND dl.due_at > ?2
             ORDER BY dl.due_at",
        )?;
        let items: Vec<PendingDose> = stmt
            .query_map(params![now, cutoff], |row| {
                Ok(PendingDose {
                    log_id: row.get(0)?,
                    med_id: row.get(1)?,
                    med_name: row.get(2)?,
                    med_color: row.get(3)?,
                    due_at: row.get(4)?,
                    notes: row.get(5)?,
                    reminder_interval_min: row.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;
        Ok(items)
    }

    pub fn get_today_schedule(&self) -> Result<Vec<TodayScheduleItem>> {
        let conn = self.conn.lock().unwrap();
        let now = Local::now();
        let today = now.format("%Y-%m-%d").to_string();
        let current_hhmm = now.format("%H:%M").to_string();
        let weekday_idx = now.weekday().num_days_from_monday() as usize;

        let mut stmt = conn.prepare(
            "SELECT s.id, m.id, m.name, m.color, s.time_hhmm, m.notes,
                    dl.id, dl.status, s.days
             FROM schedules s
             JOIN medications m ON m.id = s.med_id
             LEFT JOIN dose_logs dl
               ON dl.schedule_id = s.id AND substr(dl.due_at, 1, 10) = ?1
             WHERE m.active = 1
             ORDER BY s.time_hhmm",
        )?;

        let cur = current_hhmm.clone();
        let raw: Vec<(TodayScheduleItem, String)> = stmt
            .query_map(params![today], |row| {
                let time_hhmm: String = row.get(4)?;
                let log_status: Option<String> = row.get(7)?;
                let log_id: Option<i64> = row.get(6)?;
                let days: String = row.get(8)?;

                let status = match log_status.as_deref() {
                    // A 'pending' log is eagerly created for every dose today,
                    // including ones still in the future — surface those as
                    // 'upcoming' so they don't read as "Due now!".
                    Some("pending") => {
                        if time_hhmm.as_str() <= cur.as_str() {
                            "pending".to_string()
                        } else {
                            "upcoming".to_string()
                        }
                    }
                    Some(s) => s.to_string(),
                    None => {
                        if time_hhmm.as_str() <= cur.as_str() {
                            "missed".to_string()
                        } else {
                            "upcoming".to_string()
                        }
                    }
                };

                Ok((
                    TodayScheduleItem {
                        log_id,
                        med_id: row.get(1)?,
                        med_name: row.get(2)?,
                        med_color: row.get(3)?,
                        schedule_id: row.get(0)?,
                        time_hhmm,
                        status,
                        notes: row.get(5)?,
                    },
                    days,
                ))
            })?
            .collect::<Result<Vec<_>>>()?;

        let items: Vec<TodayScheduleItem> = raw
            .into_iter()
            .filter(|(_, days)| days.chars().nth(weekday_idx).unwrap_or('0') == '1')
            .map(|(item, _)| item)
            .collect();
        Ok(items)
    }

    pub fn get_history(&self, days: i64) -> Result<Vec<DoseLog>> {
        let conn = self.conn.lock().unwrap();
        let since = (Local::now() - chrono::Duration::days(days))
            .format("%Y-%m-%d")
            .to_string();

        let mut stmt = conn.prepare(
            "SELECT dl.id, dl.med_id, m.name, dl.schedule_id,
                    dl.due_at, dl.taken_at, dl.status
             FROM dose_logs dl JOIN medications m ON m.id = dl.med_id
             WHERE dl.due_at >= ?1
             ORDER BY dl.due_at DESC",
        )?;
        let items: Vec<DoseLog> = stmt
            .query_map(params![since], |row| {
                Ok(DoseLog {
                    id: row.get(0)?,
                    med_id: row.get(1)?,
                    med_name: row.get(2)?,
                    schedule_id: row.get(3)?,
                    due_at: row.get(4)?,
                    taken_at: row.get(5)?,
                    status: row.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;
        Ok(items)
    }

    pub fn get_history_summary(&self, days: i64) -> Result<Vec<HistoryDay>> {
        let conn = self.conn.lock().unwrap();
        let since = (Local::now() - chrono::Duration::days(days))
            .format("%Y-%m-%d")
            .to_string();

        let mut stmt = conn.prepare(
            "SELECT substr(due_at, 1, 10) as day,
                    COUNT(*) as total,
                    SUM(CASE WHEN status='taken'   THEN 1 ELSE 0 END),
                    SUM(CASE WHEN status='skipped' THEN 1 ELSE 0 END),
                    SUM(CASE WHEN status='missed'  THEN 1 ELSE 0 END)
             FROM dose_logs
             WHERE due_at >= ?1
             GROUP BY day ORDER BY day DESC",
        )?;
        let items: Vec<HistoryDay> = stmt
            .query_map(params![since], |row| {
                Ok(HistoryDay {
                    date: row.get(0)?,
                    total: row.get(1)?,
                    taken: row.get(2)?,
                    skipped: row.get(3)?,
                    missed: row.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;
        Ok(items)
    }

    pub fn get_settings(&self) -> Result<Settings> {
        let conn = self.conn.lock().unwrap();

        let quiet_start: String = conn
            .query_row(
                "SELECT value FROM settings WHERE key='quiet_start'",
                [],
                |r| r.get(0),
            )
            .unwrap_or_else(|_| "23:00".to_string());
        let quiet_end: String = conn
            .query_row(
                "SELECT value FROM settings WHERE key='quiet_end'",
                [],
                |r| r.get(0),
            )
            .unwrap_or_else(|_| "07:00".to_string());
        let default_interval: i64 = conn
            .query_row(
                "SELECT value FROM settings WHERE key='default_interval'",
                [],
                |r| r.get::<_, String>(0),
            )
            .unwrap_or_else(|_| "10".to_string())
            .parse()
            .unwrap_or(10);

        Ok(Settings {
            quiet_start,
            quiet_end,
            default_interval,
        })
    }

    pub fn update_settings(
        &self,
        quiet_start: &str,
        quiet_end: &str,
        default_interval: i64,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO settings VALUES ('quiet_start', ?1)",
            params![quiet_start],
        )?;
        conn.execute(
            "INSERT OR REPLACE INTO settings VALUES ('quiet_end', ?1)",
            params![quiet_end],
        )?;
        conn.execute(
            "INSERT OR REPLACE INTO settings VALUES ('default_interval', ?1)",
            params![default_interval.to_string()],
        )?;
        Ok(())
    }

    pub fn mark_overdue_as_missed(&self) -> Result<usize> {
        let conn = self.conn.lock().unwrap();
        let cutoff = (Local::now() - chrono::Duration::hours(2))
            .format("%Y-%m-%dT%H:%M:%S")
            .to_string();
        conn.execute(
            "UPDATE dose_logs SET status='missed'
             WHERE status='pending' AND due_at < ?1",
            params![cutoff],
        )
    }

    pub fn create_todays_logs(&self) {
        let now = Local::now();
        let today = now.format("%Y-%m-%d").to_string();
        let weekday_idx = now.weekday().num_days_from_monday() as usize;

        if let Ok(schedules) = self.get_all_active_schedules() {
            for s in schedules {
                if s.days.chars().nth(weekday_idx).unwrap_or('0') != '1' {
                    continue;
                }
                let due_at = format!("{}T{}:00", today, s.time_hhmm);
                let _ = self.get_or_create_dose_log(s.id, s.med_id, &due_at);
            }
        }
        let _ = self.mark_overdue_as_missed();
    }
}
