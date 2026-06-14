use std::sync::Arc;
use tauri::{Manager, State};

mod db;
mod models;
mod scheduler;

use db::Database;
use models::*;

pub struct AppState {
    pub db: Arc<Database>,
}

type Db<'a> = State<'a, AppState>;

// ── Medication commands ───────────────────────────────────────────────────────

#[tauri::command(rename_all = "snake_case")]
async fn get_medications(state: Db<'_>) -> Result<Vec<Medication>, String> {
    state.db.get_medications().map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
async fn add_medication(
    name: String,
    color: String,
    notes: String,
    state: Db<'_>,
) -> Result<Medication, String> {
    state
        .db
        .add_medication(&name, &color, &notes)
        .map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
async fn update_medication(
    id: i64,
    name: String,
    color: String,
    notes: String,
    state: Db<'_>,
) -> Result<(), String> {
    state
        .db
        .update_medication(id, &name, &color, &notes)
        .map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
async fn delete_medication(id: i64, state: Db<'_>) -> Result<(), String> {
    state.db.delete_medication(id).map_err(|e| e.to_string())
}

// ── Schedule commands ─────────────────────────────────────────────────────────

#[tauri::command(rename_all = "snake_case")]
async fn get_schedules(med_id: i64, state: Db<'_>) -> Result<Vec<Schedule>, String> {
    state.db.get_schedules(med_id).map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
async fn add_schedule(
    med_id: i64,
    time_hhmm: String,
    days: String,
    interval: i64,
    state: Db<'_>,
) -> Result<Schedule, String> {
    let schedule = state
        .db
        .add_schedule(med_id, &time_hhmm, &days, interval)
        .map_err(|e| e.to_string())?;

    // Eagerly create today's dose log if schedule applies today
    state.db.create_todays_logs();

    Ok(schedule)
}

#[tauri::command(rename_all = "snake_case")]
async fn delete_schedule(id: i64, state: Db<'_>) -> Result<(), String> {
    state.db.delete_schedule(id).map_err(|e| e.to_string())
}

// ── Dose log commands ─────────────────────────────────────────────────────────

#[tauri::command(rename_all = "snake_case")]
async fn confirm_dose(log_id: i64, state: Db<'_>) -> Result<(), String> {
    state.db.confirm_dose(log_id).map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
async fn skip_dose(log_id: i64, state: Db<'_>) -> Result<(), String> {
    state.db.skip_dose(log_id).map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
async fn get_today_schedule(state: Db<'_>) -> Result<Vec<TodayScheduleItem>, String> {
    state.db.create_todays_logs();
    state.db.get_today_schedule().map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
async fn get_pending_doses(state: Db<'_>) -> Result<Vec<PendingDose>, String> {
    state.db.get_pending_doses().map_err(|e| e.to_string())
}

// ── History ───────────────────────────────────────────────────────────────────

#[tauri::command(rename_all = "snake_case")]
async fn get_history(days: i64, state: Db<'_>) -> Result<Vec<DoseLog>, String> {
    state.db.get_history(days).map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
async fn get_history_summary(days: i64, state: Db<'_>) -> Result<Vec<HistoryDay>, String> {
    state.db.get_history_summary(days).map_err(|e| e.to_string())
}

// ── Settings ──────────────────────────────────────────────────────────────────

#[tauri::command(rename_all = "snake_case")]
async fn get_settings(state: Db<'_>) -> Result<Settings, String> {
    state.db.get_settings().map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
async fn update_settings(
    quiet_start: String,
    quiet_end: String,
    default_interval: i64,
    state: Db<'_>,
) -> Result<(), String> {
    state
        .db
        .update_settings(&quiet_start, &quiet_end, default_interval)
        .map_err(|e| e.to_string())
}

// ── Tauri entry point ─────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            std::fs::create_dir_all(&data_dir).ok();

            let db = Arc::new(
                Database::new(data_dir.join("pill_rina.db"))
                    .expect("failed to open database"),
            );

            db.create_todays_logs();
            app.manage(AppState { db });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_medications,
            add_medication,
            update_medication,
            delete_medication,
            get_schedules,
            add_schedule,
            delete_schedule,
            confirm_dose,
            skip_dose,
            get_today_schedule,
            get_pending_doses,
            get_history,
            get_history_summary,
            get_settings,
            update_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
