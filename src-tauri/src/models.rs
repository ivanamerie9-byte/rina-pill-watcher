use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Medication {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub notes: String,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Schedule {
    pub id: i64,
    pub med_id: i64,
    pub time_hhmm: String,
    pub days: String,
    pub reminder_interval_min: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DoseLog {
    pub id: i64,
    pub med_id: i64,
    pub med_name: String,
    pub schedule_id: i64,
    pub due_at: String,
    pub taken_at: Option<String>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingDose {
    pub log_id: i64,
    pub med_id: i64,
    pub med_name: String,
    pub med_color: String,
    pub due_at: String,
    pub notes: String,
    pub reminder_interval_min: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TodayScheduleItem {
    pub log_id: Option<i64>,
    pub med_id: i64,
    pub med_name: String,
    pub med_color: String,
    pub schedule_id: i64,
    pub time_hhmm: String,
    /// "upcoming" | "pending" | "taken" | "skipped" | "missed"
    pub status: String,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryDay {
    pub date: String,
    pub total: i64,
    pub taken: i64,
    pub skipped: i64,
    pub missed: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub quiet_start: String,
    pub quiet_end: String,
    pub default_interval: i64,
}
