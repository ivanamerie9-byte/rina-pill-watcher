# 💊 Rina Pill Watcher

A gentle, bilingual medication-reminder app made with love for **Rina** ♡

Soft "goluboy" light theme with royal-blue accents (palette sampled from the app
icon), built in the **Video.js v10** design language — Unison Pro caps display type,
outline-stroke emphasis, mono labels, and a calm, rounded layout.

```
   ໒꒰ྀི｡• ᵕ •｡꒱ྀི১   tiny habits, big love
```

## 📥 Download

**[➜ Get the latest Android APK](https://github.com/ivanamerie9-byte/rina-pill-watcher/releases/latest)**
· signed · arm64-v8a · Android 8.0+ (`v0.1.0`, ~11 MB)

Enable "install from unknown sources", then open the `.apk` to install. ♡

## Features

- **Today** — daily dose timeline with a friendly greeting, a quick day summary
  (taken / due / left), and "due now" reminders. Take an upcoming dose early or
  log a missed one.
- **Medications** — add/edit meds with a colour tag, notes, and multiple reminder
  times (per-day-of-week, custom re-notify interval).
- **History** — a 30-day adherence heatmap plus a detailed log.
- **Settings** — language, quiet hours, and default reminder interval.
- **Bilingual** — English / 日本語, switchable in Settings (remembered between launches).
- A cute marquee band, ASCII hearts, and Rina's name sprinkled throughout.

## Tech

- **Backend:** Rust + [Tauri 2](https://tauri.app) with a SQLite store (`rusqlite`).
- **Frontend:** vanilla HTML/CSS/JS (no framework, no runtime deps).
- **Target:** Android (also runs on desktop). Notifications via `tauri-plugin-notification`;
  a native Android alarm scheduler lives in `android-src/`.

## Project layout

```
src/            frontend (index.html, styles.css, app.js, i18n.js, icon, fonts)
src-tauri/      Rust backend (commands, db, models, scheduler) + Tauri config
android-src/    native Kotlin alarm/notification helpers
icon.png        source app icon (blue pill with a bow)
ROADMAP.md      plan & progress
```

## Develop

```bash
# preview the frontend in a browser (uses a localStorage mock backend)
npx serve src

# type-check the Rust backend
cd src-tauri && cargo check

# run on a connected Android device (requires Android SDK + JDK 17)
npm run tauri android dev
```

---

Made with love for Rina ♡
