# Rina Pill Watcher — Roadmap ♡

A gentle medication reminder app made for Rina. Tauri + Rust + SQLite backend,
vanilla JS frontend, Android target.

## Design direction
- **Light, soft-blue ("goluboy") theme** with royal-blue accents, sampled from `icon.png`.
- Built on the **Video.js v10 Design System** language (Unison Pro caps display headings,
  outline-stroke emphasis, mono labels, calm rhythm) — but recoloured to the blue/light palette.
- Cute personalization for **Rina**: greetings by name, kind words, ASCII hearts (♡ ﾉ◕ヮ◕ﾉ).
- **Bilingual EN / 日本語**, switchable in Settings, persisted.
- A cute **marquee** running band (from the design system motif).

## Icon palette (sampled from icon.png)
- Signal blue (accent): `#2975FD`  • pressed `#155FCE`
- Mid blue: `#4F94FD`
- Light cyan-blue tints: `#C7EFFD`, `#A6E4FD`, `#90DBFD`
- Ground: very light blue-white `#EEF6FF` / surface white
- Ink: deep blue-charcoal `#14233D`, muted `#5B6B86`

## Tasks
- [x] Read app, design system, sample icon palette
- [x] **Backend fixes**
  - [x] `get_today_schedule`: future pending doses now show `upcoming`, not "Due now"
  - [x] Harden invoke arg names (`rename_all = "snake_case"` on commands) — `cargo check` passes
- [x] **Embed icon** into app (favicon + in-app logo) + regenerate `src-tauri/icons/*` + android mipmaps
- [x] **Full redesign**: index.html / styles.css with VJS-blue light theme (Unison Pro display)
- [x] **i18n** EN/JA with toggle in Settings (persisted in localStorage)
- [x] **Personalization** for Rina (greetings, ASCII hearts, kind microcopy)
- [x] **Marquee** cute band on the Today screen
- [x] **UX polish**: greeting + day summary, empty states, pending logic, early-take, take-on-upcoming
- [x] Verify in browser preview (no console errors, theme + EN/JA + flows confirmed)
- [x] Push to **private GitHub repo**, share link

## Phase 2 — turnkey Android build ✅
- [x] Install toolchain: JDK 21, Android SDK platform-36, build-tools 36, NDK 27
- [x] **Wire native Kotlin alarm system turnkey** (exact alarms + boot reschedule +
      notification actions + quiet hours + WorkManager re-notify)
  - [x] **Fix DB path bug**: `PillDatabase` now opens the same file Rust uses
        (`activity.dataDir/pill_rina.db`), not the default `databases/` sub-dir
  - [x] Harden plugin load; disable R8 minify for release (keep native classes)
- [x] Build **signed release APK** (arm64-v8a, Android 8.0+) — `cargo` + Gradle, apksigner
- [x] Publish to GitHub **release v0.1.0** with the APK attached; link in README + repo description

## Notes
- Frontend talks to Rust via `window.__TAURI__.core.invoke`; falls back to localStorage mock in browser.
- On Android the web frontend is embedded inside `libpill_rina_lib.so` (Tauri default).
- Signing keystore (`rina-release.keystore`, pass `rina-pill-2026`) is kept **out of the repo** (gitignored).
- Release: https://github.com/ivanamerie9-byte/rina-pill-watcher/releases/tag/v0.1.0
