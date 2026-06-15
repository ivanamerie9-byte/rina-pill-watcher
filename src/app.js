'use strict';

/* ============================================================================
   Rina Pill Watcher — app logic ♡
   Talks to the Rust backend via Tauri; falls back to a localStorage mock in
   a plain browser so the UI can be previewed during development.
   ========================================================================== */

// ── Tauri bridge ────────────────────────────────────────────────────────────
// Resolve the real invoke defensively: with `withGlobalTauri` it lives at
// window.__TAURI__.core.invoke, but fall back to the internals binding so a
// missing namespace never throws at load time and blanks the whole app.
const G = window;
const realInvoke =
  (G.__TAURI__ && G.__TAURI__.core && G.__TAURI__.core.invoke) ||
  (G.__TAURI_INTERNALS__ && G.__TAURI_INTERNALS__.invoke) ||
  null;
const isTauri = !!realInvoke;
const invoke = isTauri
  ? (cmd, args) => realInvoke(cmd, args)
  : async (cmd, args) => { console.log('[mock invoke]', cmd, args); return mockData(cmd, args); };

function mockData(cmd) {
  if (cmd === 'get_medications') return JSON.parse(localStorage.getItem('mock_meds') || '[]');
  if (cmd === 'get_today_schedule') return [];
  if (cmd === 'get_history_summary') return [];
  if (cmd === 'get_history') return [];
  if (cmd === 'get_schedules') return [];
  if (cmd === 'get_pending_doses') return [];
  if (cmd === 'get_settings') return { quiet_start: '23:00', quiet_end: '07:00', default_interval: 10 };
  return null;
}

// ── Notifications ───────────────────────────────────────────────────────────
const Notif = (G.__TAURI__ && G.__TAURI__.notification) || null;
let notifPermission = false;

async function requestNotifPermission() {
  if (!Notif) return;
  try {
    if (await Notif.isPermissionGranted()) { notifPermission = true; return; }
    notifPermission = (await Notif.requestPermission()) === 'granted';
  } catch (e) { /* ignore */ }
}
function sendNotif(title, body) {
  if (!Notif || !notifPermission) return;
  Notif.sendNotification({ title, body });
}

// ── State ───────────────────────────────────────────────────────────────────
let currentScreen = 'home';
let editingMedId  = null;
let deleteTargetId = null;

// Soft, friendly palette (blue family first to match the icon)
const COLORS = [
  '#2975FD', '#4F94FD', '#5AC8E8', '#34C77B',
  '#F2A93B', '#EC6B8A', '#9B6BF0', '#E0745C',
];
let selectedColor = COLORS[0];
let selectedInterval = 10;

// ── DOM helpers ─────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const t = (k, v) => I18N.t(k, v);
const make = (tag, cls, html) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  return el;
};
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Toast ───────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, ms = 2200) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// ── Marquee ─────────────────────────────────────────────────────────────────
function buildMarquee() {
  const track = $('marquee-track');
  const phrases = I18N.marquee();
  // build one set, then duplicate for a seamless -50% loop
  const oneSet = () => {
    const frag = document.createDocumentFragment();
    const item = make('div', 'marquee-item');
    phrases.forEach(p => {
      const s = make('span', null, esc(p));
      const sep = make('span', 'sep', '✦');
      item.appendChild(s);
      item.appendChild(sep);
    });
    frag.appendChild(item);
    return frag;
  };
  track.innerHTML = '';
  track.appendChild(oneSet());
  track.appendChild(oneSet());
}

// ── Navigation ──────────────────────────────────────────────────────────────
function navigate(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));

  const el = $(`screen-${screen}`);
  if (!el) return;
  el.classList.add('active');
  currentScreen = screen;

  const navBtn = document.querySelector(`.nav-item[data-screen="${screen}"]`);
  if (navBtn) navBtn.classList.add('active');

  if (screen === 'home')     loadHome();
  if (screen === 'meds')     loadMeds();
  if (screen === 'history')  loadHistory();
  if (screen === 'settings') loadSettings();
}

// ── HOME ────────────────────────────────────────────────────────────────────
async function loadHome() {
  const now = new Date();
  $('home-date').textContent = now.toLocaleDateString(I18N.locale(), {
    weekday: 'long', month: 'long', day: 'numeric'
  });
  $('greet-hi').textContent = I18N.greet();
  $('greet-sub').textContent = I18N.greetSub();

  let items;
  try { items = await invoke('get_today_schedule'); }
  catch (e) { items = []; }

  renderDaySummary(items);
  renderPendingAlerts(items);
  renderTodayList(items);
}

function renderDaySummary(items) {
  const cont = $('day-summary');
  cont.innerHTML = '';
  if (!items.length) return;

  const taken   = items.filter(i => i.status === 'taken').length;
  const due     = items.filter(i => i.status === 'pending' || i.status === 'missed').length;
  const left    = items.filter(i => i.status === 'upcoming').length;

  const chip = (cls, n, label) =>
    `<div class="chip ${cls}"><div class="n">${n}</div><div class="l">${label}</div></div>`;
  cont.innerHTML =
    chip('taken', taken, t('sum_taken')) +
    chip('pending', due, t('sum_pending')) +
    chip('left', left, t('sum_left'));
}

function renderPendingAlerts(items) {
  const pending = items.filter(i => i.status === 'pending');
  const cont = $('pending-alerts');
  cont.innerHTML = '';
  pending.forEach(p => {
    const banner = make('div', 'pending-banner');
    banner.innerHTML = `
      <div class="icon">⏰</div>
      <div class="info">
        <div class="title">${esc(p.med_name)}</div>
        <div class="desc">${t('due_at', { t: p.time_hhmm })}</div>
      </div>
      <button class="btn btn-take btn-sm" style="flex:0;white-space:nowrap" data-log="${p.log_id}">${t('took_it')}</button>
    `;
    banner.querySelector('button').addEventListener('click', () => takeDose(p.log_id));
    cont.appendChild(banner);
  });
}

function renderTodayList(items) {
  const cont = $('today-list');
  cont.innerHTML = '';

  if (!items.length) {
    cont.innerHTML = `
      <div class="empty">
        <div class="face">${esc(I18N.happyFace())}</div>
        <p>${t('no_meds_today')}</p>
        <p class="text-secondary text-sm">${t('no_meds_today_sub')}</p>
      </div>`;
    return;
  }

  const badge = {
    taken: ['badge-taken', t('st_taken')],
    skipped: ['badge-skipped', t('st_skipped')],
    missed: ['badge-missed', t('st_missed')],
    pending: ['badge-pending', t('st_due')],
    upcoming: ['badge-upcoming', t('st_upcoming')],
  };

  items.forEach(item => {
    const wrapper = make('div', 'dose-item');
    const timeEl = make('div', 'dose-time', item.time_hhmm);

    const card = make('div', 'dose-card' + (item.status === 'taken' || item.status === 'skipped' ? ' is-taken' : ''));
    card.style.setProperty('--color', item.med_color);

    const [badgeClass, badgeText] = badge[item.status] || badge.upcoming;

    let actions = '';
    if ((item.status === 'pending' || item.status === 'upcoming') && item.log_id) {
      actions = `
        <div class="dose-actions">
          <button class="btn btn-take" data-action="take" data-log="${item.log_id}">${t('took_it')}</button>
          <button class="btn btn-skip" data-action="skip" data-log="${item.log_id}">${t('skip')}</button>
        </div>`;
    } else if (item.status === 'missed' && item.log_id) {
      actions = `
        <div class="dose-actions">
          <button class="btn btn-take btn-sm" data-action="take" data-log="${item.log_id}">${t('log_taken')}</button>
        </div>`;
    }

    card.innerHTML = `
      <div class="dose-card-name">${esc(item.med_name)}</div>
      <div class="dose-card-notes">${esc(item.notes)}</div>
      <div class="status-row"><span class="status-badge ${badgeClass}">${badgeText}</span></div>
      ${actions}`;

    card.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const logId = parseInt(btn.dataset.log);
        if (btn.dataset.action === 'take') await takeDose(logId);
        else await skipDose(logId);
      });
    });

    wrapper.appendChild(timeEl);
    wrapper.appendChild(card);
    cont.appendChild(wrapper);
  });
}

async function takeDose(logId) {
  try {
    await invoke('confirm_dose', { log_id: logId });
    showToast(t('t_confirmed'));
    loadHome();
  } catch (e) { showToast('Error: ' + e); }
}
async function skipDose(logId) {
  try {
    await invoke('skip_dose', { log_id: logId });
    showToast(t('t_skipped'));
    loadHome();
  } catch (e) { showToast('Error: ' + e); }
}

// ── MEDS ────────────────────────────────────────────────────────────────────
async function loadMeds() {
  let meds;
  try { meds = await invoke('get_medications'); }
  catch (e) { meds = []; }

  const cont = $('meds-list');
  cont.innerHTML = '';

  if (!meds.length) {
    cont.innerHTML = `
      <div class="empty">
        <div class="face">${esc(I18N.emptyFace())}</div>
        <p>${t('no_meds')}</p>
        <p class="text-secondary text-sm">${t('no_meds_sub')}</p>
      </div>`;
    return;
  }

  meds.forEach(med => {
    const card = make('div', 'med-card');
    card.innerHTML = `
      <div class="med-dot" style="--color:${esc(med.color)}">💊</div>
      <div class="med-info">
        <div class="med-name">${esc(med.name)}</div>
        <div class="med-next">${esc(med.notes) || t('no_notes')}</div>
      </div>
      <span class="chev">›</span>`;
    card.addEventListener('click', () => openEditMed(med.id));
    cont.appendChild(card);
  });
}

// ── EDIT MED ────────────────────────────────────────────────────────────────
function buildColorPicker() {
  const picker = $('color-picker');
  picker.innerHTML = '';
  COLORS.forEach(c => {
    const sw = make('div', 'color-swatch' + (c === selectedColor ? ' selected' : ''));
    sw.style.background = c;
    sw.dataset.color = c;
    sw.addEventListener('click', () => {
      selectedColor = c;
      picker.querySelectorAll('.color-swatch').forEach(s =>
        s.classList.toggle('selected', s.dataset.color === c));
    });
    picker.appendChild(sw);
  });
}

function buildIntervalButtons(containerId, initial = 10) {
  selectedInterval = initial;
  const cont = $(containerId);
  cont.querySelectorAll('.interval-btn').forEach(btn => {
    const val = parseInt(btn.dataset.val);
    btn.classList.toggle('active', val === initial);
    btn.onclick = () => {
      selectedInterval = val;
      cont.querySelectorAll('.interval-btn').forEach(b =>
        b.classList.toggle('active', parseInt(b.dataset.val) === val));
    };
  });
}

async function openEditMed(medId) {
  editingMedId = medId || null;
  $('edit-title').textContent = medId ? t('edit_med') : t('new_med');
  $('edit-delete-btn').style.display = medId ? '' : 'none';
  $('edit-name').value = '';
  $('edit-notes').value = '';
  selectedColor = COLORS[0];
  buildColorPicker();
  buildIntervalButtons('new-interval-opts', 10);
  resetDayChips();
  $('edit-schedules').innerHTML = '';

  if (medId) {
    try {
      const med = await invoke('get_medications').then(list => list.find(m => m.id === medId));
      if (med) {
        $('edit-name').value = med.name;
        $('edit-notes').value = med.notes;
        selectedColor = med.color || COLORS[0];
        buildColorPicker();
      }
      await loadEditSchedules(medId);
    } catch (e) { /* new */ }
  }
  navigateToEditScreen();
}

function navigateToEditScreen() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  $('screen-edit-med').classList.add('active');
  currentScreen = 'edit-med';
}

async function loadEditSchedules(medId) {
  let schedules;
  try { schedules = await invoke('get_schedules', { med_id: medId }); }
  catch (e) { schedules = []; }
  renderEditSchedules(schedules);
}

function renderEditSchedules(schedules) {
  const cont = $('edit-schedules');
  cont.innerHTML = '';
  schedules.forEach(s => {
    const item = make('div', 'schedule-item');
    item.innerHTML = `
      <div>
        <div class="schedule-item-time">${s.time_hhmm}</div>
        <div class="schedule-item-days">${decodeDays(s.days)} · ${t('every_min', { n: s.reminder_interval_min })}</div>
      </div>
      <button class="schedule-item-del" data-id="${s.id}">×</button>`;
    item.querySelector('button').addEventListener('click', async () => {
      await invoke('delete_schedule', { id: s.id });
      await loadEditSchedules(editingMedId);
    });
    cont.appendChild(item);
  });
}

function decodeDays(days) {
  if (days === '1111111') return t('every_day');
  if (days === '1111100') return t('weekdays');
  if (days === '0000011') return t('weekends');
  const names = I18N.lang === 'ja'
    ? ['月','火','水','木','金','土','日']
    : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  return names.filter((_, i) => days[i] === '1').join(I18N.lang === 'ja' ? '' : ', ');
}

function resetDayChips() {
  $('new-day-chips').querySelectorAll('.day-chip').forEach(c => c.classList.add('active'));
}
function getDaysString() {
  return Array.from($('new-day-chips').querySelectorAll('.day-chip'))
    .map(c => c.classList.contains('active') ? '1' : '0').join('');
}

async function saveMed() {
  const name = $('edit-name').value.trim();
  if (!name) { showToast(t('t_name_first')); return; }
  try {
    if (editingMedId) {
      await invoke('update_medication', {
        id: editingMedId, name, color: selectedColor, notes: $('edit-notes').value.trim(),
      });
      showToast(t('t_saved'));
    } else {
      const med = await invoke('add_medication', {
        name, color: selectedColor, notes: $('edit-notes').value.trim(),
      });
      editingMedId = med.id;
      showToast(t('t_added'));
    }
    navigate('meds');
  } catch (e) { showToast('Error: ' + e); }
}

// ── HISTORY ─────────────────────────────────────────────────────────────────
async function loadHistory() {
  let summary, logs;
  try {
    [summary, logs] = await Promise.all([
      invoke('get_history_summary', { days: 30 }),
      invoke('get_history', { days: 14 }),
    ]);
  } catch (e) { summary = []; logs = []; }
  renderHeatmap(summary);
  renderHistoryLog(logs);
}

function renderHeatmap(summary) {
  const map = {};
  summary.forEach(d => { map[d.date] = d; });
  const cont = $('heatmap');
  cont.innerHTML = '';
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const data = map[key];
    const cell = make('div', 'heatmap-cell');
    if (data) {
      if (data.taken === data.total && data.total > 0) cell.classList.add('green');
      else if (data.taken > 0) cell.classList.add('yellow');
      else if (data.missed > 0) cell.classList.add('red');
    } else cell.classList.add('empty');
    cell.title = key;
    cont.appendChild(cell);
  }
}

function renderHistoryLog(logs) {
  const cont = $('history-log');
  cont.innerHTML = '';
  if (!logs.length) {
    cont.innerHTML = `<div class="empty"><div class="face">${esc(I18N.emptyFace())}</div><p class="text-secondary text-sm">${t('no_history')}</p></div>`;
    return;
  }
  let lastDay = '';
  logs.forEach(log => {
    const day = log.due_at.slice(0, 10);
    if (day !== lastDay) {
      lastDay = day;
      cont.appendChild(make('div', 'log-day-header',
        new Date(day + 'T12:00:00').toLocaleDateString(I18N.locale(),
          { weekday: 'short', month: 'short', day: 'numeric' })));
    }
    const item = make('div', `log-item ${log.status}`);
    const time = log.due_at.slice(11, 16);
    const takenAt = log.taken_at ? ' · ' + log.taken_at.slice(11, 16) : '';
    const statusTxt = log.status === 'taken' ? '✓' : log.status === 'skipped' ? t('skip') : '✕';
    item.innerHTML = `
      <div class="log-dot"></div>
      <div class="log-info">
        <div class="log-name">${esc(log.med_name)}</div>
        <div class="log-time">${time}${takenAt}</div>
      </div>
      <div class="log-status">${statusTxt}</div>`;
    cont.appendChild(item);
  });
}

// ── SETTINGS ────────────────────────────────────────────────────────────────
async function loadSettings() {
  let s;
  try { s = await invoke('get_settings'); }
  catch (e) { s = { quiet_start: '23:00', quiet_end: '07:00', default_interval: 10 }; }

  $('settings-quiet-start').value = s.quiet_start;
  $('settings-quiet-end').value   = s.quiet_end;

  $('settings-interval-opts').querySelectorAll('.interval-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.val) === s.default_interval);
    btn.onclick = () => {
      $('settings-interval-opts').querySelectorAll('.interval-btn').forEach(b =>
        b.classList.toggle('active', b === btn));
    };
  });

  // reflect language selection
  $('lang-toggle').querySelectorAll('.lang-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.lang === I18N.lang));
}

async function saveSettings() {
  const active = $('settings-interval-opts').querySelector('.interval-btn.active');
  try {
    await invoke('update_settings', {
      quiet_start: $('settings-quiet-start').value,
      quiet_end: $('settings-quiet-end').value,
      default_interval: active ? parseInt(active.dataset.val) : 10,
    });
    showToast(t('t_settings_saved'));
  } catch (e) { showToast('Error: ' + e); }
}

// ── Background notification loop ─────────────────────────────────────────────
async function checkAndNotify() {
  let pending;
  try { pending = await invoke('get_pending_doses'); }
  catch (e) { return; }
  pending.forEach(p => {
    const title = `💊 ${p.med_name}`;
    const body  = p.notes || t('st_due');
    sendNotif(title, body);
  });
}

// ── Boot ────────────────────────────────────────────────────────────────────
function init() {
  try { I18N.apply(); } catch (e) { console.error('i18n', e); }
  try { buildMarquee(); } catch (e) { console.error('marquee', e); }

  // Activate the home screen right away so the user always sees styled content,
  // even if a later wiring step throws.
  navigate('home');

  try {
  requestNotifPermission();

  selectedColor = COLORS[0];
  buildColorPicker();

  $('new-day-chips').querySelectorAll('.day-chip').forEach(chip => {
    chip.addEventListener('click', () => chip.classList.toggle('active'));
  });

  $('new-interval-opts').querySelectorAll('.interval-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedInterval = parseInt(btn.dataset.val);
      $('new-interval-opts').querySelectorAll('.interval-btn').forEach(b =>
        b.classList.toggle('active', b === btn));
    });
  });

  document.querySelectorAll('.nav-item[data-screen]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.screen));
  });

  $('fab-add').addEventListener('click', () => openEditMed(null));
  $('meds-add-btn').addEventListener('click', () => openEditMed(null));
  $('home-refresh-btn').addEventListener('click', loadHome);

  $('edit-back-btn').addEventListener('click', () => navigate(editingMedId ? 'meds' : 'home'));
  $('edit-delete-btn').addEventListener('click', () => {
    deleteTargetId = editingMedId;
    $('delete-modal').classList.add('open');
  });
  $('edit-save-btn').addEventListener('click', saveMed);

  $('add-time-btn').addEventListener('click', async () => {
    const time = $('new-time-input').value;
    if (!time) { showToast(t('t_pick_time')); return; }
    if (!editingMedId) {
      const name = $('edit-name').value.trim();
      if (!name) { showToast(t('t_name_first')); return; }
      const med = await invoke('add_medication', {
        name, color: selectedColor, notes: $('edit-notes').value.trim(),
      });
      editingMedId = med.id;
      $('edit-title').textContent = t('edit_med');
      $('edit-delete-btn').style.display = '';
    }
    const days = getDaysString();
    if (days === '0000000') { showToast(t('t_pick_day')); return; }
    try {
      await invoke('add_schedule', {
        med_id: editingMedId, time_hhmm: time, days, interval: selectedInterval,
      });
      await loadEditSchedules(editingMedId);
      showToast(t('t_reminder_added', { t: time }));
    } catch (e) { showToast('Error: ' + e); }
  });

  // Delete modal
  $('delete-cancel-btn').addEventListener('click', () => {
    $('delete-modal').classList.remove('open');
    deleteTargetId = null;
  });
  $('delete-confirm-btn').addEventListener('click', async () => {
    $('delete-modal').classList.remove('open');
    if (deleteTargetId) {
      try {
        await invoke('delete_medication', { id: deleteTargetId });
        showToast(t('t_deleted'));
      } catch (e) { showToast('Error: ' + e); }
      deleteTargetId = null;
      navigate('meds');
    }
  });
  $('delete-modal').addEventListener('click', e => {
    if (e.target === $('delete-modal')) {
      $('delete-modal').classList.remove('open');
      deleteTargetId = null;
    }
  });

  $('settings-save-btn').addEventListener('click', saveSettings);

  // Language toggle
  $('lang-toggle').querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      I18N.setLang(btn.dataset.lang);
      showToast(t('t_lang_set'));
    });
  });

  // React to language change anywhere
  document.addEventListener('langchange', () => {
    buildMarquee();
    navigate(currentScreen === 'edit-med' ? 'meds' : currentScreen);
  });

  setInterval(checkAndNotify, 60_000);
  } catch (e) {
    console.error('init wiring failed', e);
    showToast('Init error: ' + (e && e.message ? e.message : e));
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
