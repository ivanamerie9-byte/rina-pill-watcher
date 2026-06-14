'use strict';

/* ============================================================================
   i18n + Rina's cute microcopy  ♡
   English / 日本語. Language is stored in localStorage and applied to any
   element carrying data-i18n (text) or data-i18n-ph (placeholder).
   ========================================================================== */

const I18N = (() => {
  const NAME = 'Rina';

  const strings = {
    en: {
      // nav
      nav_today: 'Today', nav_meds: 'Meds', nav_history: 'History', nav_settings: 'Settings',
      // today
      today_eyebrow: "Today's care", today_title: 'Today',
      // meds
      meds_eyebrow: "Rina's shelf", meds_title: 'Medications', add_btn: '+ Add',
      // edit
      new_med: 'New Medication', edit_med: 'Edit Medication',
      med_name: 'Medication Name', med_name_ph: 'e.g. Vitamin D',
      notes_label: 'Notes (optional)', notes_ph: 'e.g. Take with food',
      color_label: 'Color', reminders_label: 'Reminders',
      add_time_label: 'Add reminder time', add_short: 'Add',
      days_label: 'Days', remind_every: 'Remind every', save: 'Save',
      // history
      history_eyebrow: 'Last 30 days', history_title: 'History',
      legend_all: 'All taken', legend_partial: 'Partial', legend_missed: 'Missed', legend_none: 'None',
      no_history: 'No history yet, Rina.',
      // settings
      settings_eyebrow: 'For Rina', settings_title: 'Settings',
      language: 'Language', quiet_hours: 'Quiet Hours',
      quiet_desc: "No notifications during your quiet hours, Rina.",
      start: 'Start', end: 'End',
      default_interval: 'Default Reminder Interval',
      interval_desc: 'How often to re-notify until a dose is confirmed.',
      save_settings: 'Save Settings', about: 'About',
      // modal
      delete_title: 'Delete Medication?',
      delete_desc: 'This will remove all schedules and logs for this medication.',
      cancel: 'Cancel', delete: 'Delete',
      // statuses
      st_taken: '✓ Taken', st_skipped: '↷ Skipped', st_missed: '✕ Missed',
      st_due: '⏰ Due now!', st_upcoming: 'Upcoming',
      took_it: '✓ Took it', skip: 'Skip', log_taken: 'Log as taken',
      // banners / dynamic
      due_at: 'Due at {t} — still waiting',
      no_meds_today: 'Nothing scheduled today.',
      no_meds_today_sub: 'Enjoy your day, Rina ♡',
      no_meds: 'No medications yet.',
      no_meds_sub: 'Tap "+ Add" to get started.',
      tap_add: 'Tap + to add a medication.',
      no_notes: 'No notes',
      // summary chips
      sum_taken: 'Taken', sum_pending: 'Due', sum_left: 'Left',
      // toasts
      t_confirmed: 'Dose confirmed ♡', t_skipped: 'Dose skipped',
      t_saved: 'Saved ♡', t_added: 'Medication added ♡', t_deleted: 'Medication deleted',
      t_settings_saved: 'Settings saved ♡',
      t_name_first: 'Please enter a name first',
      t_pick_time: 'Pick a time first', t_pick_day: 'Select at least one day',
      t_reminder_added: 'Reminder at {t} added',
      t_lang_set: 'Language set to English ♡',
      love: 'Made with love for Rina ♡',
      every_day: 'Every day', weekdays: 'Weekdays', weekends: 'Weekends',
      every_min: 'every {n} min',
    },
    ja: {
      nav_today: 'きょう', nav_meds: 'おくすり', nav_history: 'りれき', nav_settings: 'せってい',
      today_eyebrow: 'きょうのケア', today_title: 'きょう',
      meds_eyebrow: 'リナのたな', meds_title: 'おくすり', add_btn: '+ ついか',
      new_med: 'あたらしいおくすり', edit_med: 'おくすりをへんしゅう',
      med_name: 'おくすりのなまえ', med_name_ph: 'れい：ビタミンD',
      notes_label: 'メモ（にんい）', notes_ph: 'れい：しょくごにのむ',
      color_label: 'いろ', reminders_label: 'リマインダー',
      add_time_label: 'じかんをついか', add_short: 'ついか',
      days_label: 'ようび', remind_every: 'くりかえし', save: 'ほぞん',
      history_eyebrow: 'さいきん30にち', history_title: 'りれき',
      legend_all: 'ぜんぶのんだ', legend_partial: 'いちぶ', legend_missed: 'のみわすれ', legend_none: 'なし',
      no_history: 'まだりれきはないよ、リナ。',
      settings_eyebrow: 'リナのために', settings_title: 'せってい',
      language: 'げんご', quiet_hours: 'おやすみじかん',
      quiet_desc: 'おやすみじかんはつうちしないよ、リナ。',
      start: 'かいし', end: 'しゅうりょう',
      default_interval: 'リマインダーのかんかく',
      interval_desc: 'のんだとかくにんするまで、なんぷんおきにつうちするか。',
      save_settings: 'せっていをほぞん', about: 'このアプリ',
      delete_title: 'おくすりをけす？',
      delete_desc: 'このおくすりのスケジュールときろくがぜんぶけされます。',
      cancel: 'キャンセル', delete: 'けす',
      st_taken: '✓ のんだ', st_skipped: '↷ スキップ', st_missed: '✕ のみわすれ',
      st_due: '⏰ じかんだよ！', st_upcoming: 'これから',
      took_it: '✓ のんだよ', skip: 'スキップ', log_taken: 'のんだときろく',
      due_at: '{t} のよてい — まってるよ',
      no_meds_today: 'きょうのよていはないよ。',
      no_meds_today_sub: 'ゆっくりしてね、リナ ♡',
      no_meds: 'まだおくすりがないよ。',
      no_meds_sub: '「+ ついか」ではじめてね。',
      tap_add: '+ をおしておくすりをついか。',
      no_notes: 'メモなし',
      sum_taken: 'のんだ', sum_pending: 'じかん', sum_left: 'のこり',
      t_confirmed: 'のんだね ♡', t_skipped: 'スキップしたよ',
      t_saved: 'ほぞんしたよ ♡', t_added: 'おくすりをついかしたよ ♡', t_deleted: 'おくすりをけしたよ',
      t_settings_saved: 'せっていをほぞんしたよ ♡',
      t_name_first: 'さきになまえをいれてね',
      t_pick_time: 'さきにじかんをえらんでね', t_pick_day: 'ようびをひとつえらんでね',
      t_reminder_added: '{t} のリマインダーをついかしたよ',
      t_lang_set: 'にほんごにしたよ ♡',
      love: 'リナのために あいをこめて ♡',
      every_day: 'まいにち', weekdays: 'へいじつ', weekends: 'しゅうまつ',
      every_min: '{n}ぷんおき',
    },
  };

  // ── Rina's cute lines (rotated) ──────────────────────────────────────────
  const greetings = {
    en: [
      'Hi, Rina ♡', 'Hey Rina ♡', 'Good to see you, Rina!', 'Hello, sweet Rina ♡',
    ],
    ja: [
      'やっほー、リナ ♡', 'おかえり、リナ ♡', 'こんにちは、リナ！', 'リナ、げんき？ ♡',
    ],
  };
  const greetSubs = {
    en: [
      "Let's take care of you today.  ૮ ・ﻌ・ ა",
      "Tiny habits, big love.  ♡",
      "You've got this, Rina!  ٩(◕‿◕)۶",
      "One dose at a time.  ໒꒰ྀི｡• ᵕ •｡꒱ྀི১",
    ],
    ja: [
      'きょうもいっしょにがんばろ。 ૮ ・ﻌ・ ა',
      'ちいさなしゅうかん、おおきなあい。 ♡',
      'リナならだいじょうぶ！ ٩(◕‿◕)۶',
      'ひとつずつ、ゆっくりね。 ໒꒰ྀི｡• ᵕ •｡꒱ྀི১',
    ],
  };
  const marquee = {
    en: [
      'Take care of yourself, Rina', 'Stay hydrated', "You're doing great",
      'Tiny habits, big love', 'Health looks good on you',
    ],
    ja: [
      'むりしないでね、リナ', 'おみずのんでね', 'よくがんばってるよ',
      'ちいさなしゅうかん、おおきなあい', 'けんこうがいちばん',
    ],
  };
  const emptyFace = { en: '(｡•́︿•̀｡)', ja: '(｡•́︿•̀｡)' };
  const happyFace = { en: '٩(ˊᗜˋ*)و', ja: '٩(ˊᗜˋ*)و' };

  let lang = localStorage.getItem('rina_lang') || 'en';

  function t(key, vars) {
    let s = (strings[lang] && strings[lang][key]) || (strings.en[key] ?? key);
    if (vars) for (const k in vars) s = s.replace(`{${k}}`, vars[k]);
    return s;
  }

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function apply() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
      el.placeholder = t(el.dataset.i18nPh);
    });
  }

  function setLang(l) {
    if (!strings[l]) return;
    lang = l;
    localStorage.setItem('rina_lang', l);
    apply();
    document.dispatchEvent(new CustomEvent('langchange', { detail: l }));
  }

  return {
    NAME,
    get lang() { return lang; },
    t, apply, setLang,
    greet: () => pick(greetings[lang]),
    greetSub: () => pick(greetSubs[lang]),
    marquee: () => marquee[lang],
    emptyFace: () => emptyFace[lang],
    happyFace: () => happyFace[lang],
    // locale for date formatting
    locale: () => (lang === 'ja' ? 'ja-JP' : 'en-US'),
  };
})();
