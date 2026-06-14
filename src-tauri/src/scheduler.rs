#![allow(dead_code)]
use chrono::{Local, NaiveDate, NaiveDateTime, NaiveTime, TimeZone};

use crate::models::Schedule;

/// Returns the next N due datetimes (as "YYYY-MM-DDTHH:MM:00") for a schedule.
pub fn next_occurrences(schedule: &Schedule, limit: usize) -> Vec<String> {
    let time = match NaiveTime::parse_from_str(&schedule.time_hhmm, "%H:%M") {
        Ok(t) => t,
        Err(_) => return vec![],
    };

    let now = Local::now();
    let mut date: NaiveDate = now.date_naive();
    let mut result = Vec::new();

    for _ in 0..14 {
        if result.len() >= limit {
            break;
        }
        use chrono::Datelike;
        let weekday_idx = date.weekday().num_days_from_monday() as usize;
        if schedule.days.chars().nth(weekday_idx).unwrap_or('0') == '1' {
            let naive_dt = NaiveDateTime::new(date, time);
            if let Some(local_dt) = Local.from_local_datetime(&naive_dt).single() {
                if local_dt > now {
                    result.push(naive_dt.format("%Y-%m-%dT%H:%M:00").to_string());
                }
            }
        }
        date = date.succ_opt().unwrap_or(date);
    }

    result
}

/// Returns the epoch-millisecond timestamp for a "YYYY-MM-DDTHH:MM:SS" string.
pub fn due_at_to_epoch_ms(due_at: &str) -> Option<i64> {
    let naive = NaiveDateTime::parse_from_str(due_at, "%Y-%m-%dT%H:%M:%S").ok()?;
    let local = Local.from_local_datetime(&naive).single()?;
    Some(local.timestamp_millis())
}
