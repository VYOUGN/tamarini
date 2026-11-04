(() => {
'use strict';

/* ============================== helpers ============================== */
const $ = (sel, root = document) => root.querySelector(sel);
const main = $('#main');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The Arabic keyboard types ٠-٩ and ٫ — accept them anywhere a number is typed.
function toNum(v) {
  const s = String(v == null ? '' : v).trim()
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٫,]/g, '.');
  const n = parseFloat(s);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
// Bodyweight lifts also take a minus: the weight an assisted machine takes off.
function toSigned(v) {
  const s = String(v == null ? '' : v).trim().replace(/^[−–]/, '-');
  return s[0] === '-' ? -toNum(s.slice(1)) || 0 : toNum(s.replace(/^\+/, ''));
}
const round2 = (n) => Math.round(n * 100) / 100;
const round1 = (n) => Math.round(n * 10) / 10;
const w2s = (n) => (n ? String(round2(n)) : '');
const kg = (n) => `${Math.round(n).toLocaleString('en-US')} كجم`;
const norm = (s) => String(s).replace(/[ً-ْٰـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase().trim();
const uid = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const est1rm = (w, r) => (r <= 1 ? w : w * (1 + r / 30)); // Epley

const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dateOf = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const todayKey = () => keyOf(new Date());
const addDays = (k, n) => { const d = dateOf(k); d.setDate(d.getDate() + n); return keyOf(d); };
// Weeks start on the day picked in settings (Saturday unless changed).
const weekStart = (k) => addDays(k, -((dateOf(k).getDay() - prefs().weekStart + 7) % 7));
const dayOrder = () => Array.from({ length: 7 }, (_, i) => (prefs().weekStart + i) % 7);
const DAY_NAME = { 6: 'السبت', 0: 'الأحد', 1: 'الاثنين', 2: 'الثلاثاء', 3: 'الأربعاء', 4: 'الخميس', 5: 'الجمعة' };
const DAY_SHORT = { 6: 'س', 0: 'ح', 1: 'ن', 2: 'ث', 3: 'ر', 4: 'خ', 5: 'ج' };

const LOC = 'ar-u-ca-gregory-nu-latn';
const dtf = (o) => new Intl.DateTimeFormat(LOC, o);
const F = {
  long: dtf({ weekday: 'long', day: 'numeric', month: 'long' }),
  dm: dtf({ day: 'numeric', month: 'long' }),
  dmy: dtf({ day: 'numeric', month: 'long', year: 'numeric' }),
  my: dtf({ month: 'long', year: 'numeric' }),
  wd: dtf({ weekday: 'long' }),
  time: dtf({ hour: 'numeric', minute: '2-digit' }),
};
const fmt = (f, k) => f.format(typeof k === 'string' ? dateOf(k) : new Date(k));

// Arabic counted nouns: 1 and 2 have their own forms, 3–10 take the plural, 11+ the singular.
const FORMS = {
  set: ['جولة واحدة', 'جولتان', 'جولات', 'جولة'],
  day: ['يوم واحد', 'يومان', 'أيام', 'يومًا'],
  ex: ['تمرين واحد', 'تمرينان', 'تمارين', 'تمرينًا'],
  rec: ['سجل واحد', 'سجلان', 'سجلات', 'سجلًا'],
  chg: ['تغيير واحد', 'تغييران', 'تغييرات', 'تغييرًا'],
  sess: ['جلسة واحدة', 'جلستان', 'جلسات', 'جلسة'],
  rep: ['عدّة واحدة', 'عدّتان', 'عدّات', 'عدّة'],
  min: ['دقيقة واحدة', 'دقيقتان', 'دقائق', 'دقيقة'],
  hr: ['ساعة', 'ساعتين', 'ساعات', 'ساعة'],
  entry: ['تسجيل واحد', 'تسجيلان', 'تسجيلات', 'تسجيلًا'],
  week: ['أسبوع واحد', 'أسبوعان', 'أسابيع', 'أسبوعًا'],
  pr: ['رقم قياسي واحد', 'رقمان قياسيان', 'أرقام قياسية', 'رقمًا قياسيًا'],
};
function cnt(n, k) {
  const f = FORMS[k];
  if (n === 1) return f[0];
  if (n === 2) return f[1];
  const r = n % 100;
  return `${n} ${r >= 3 && r <= 10 ? f[2] : f[3]}`;
}
// After "من" or as an object ("رجّعنا") the dual takes its -ين form: 1 من جولتين، رجّعنا سجلين.
const ofCnt = (n, k) => (n === 2 && { set: 'جولتين', day: 'يومين', rec: 'سجلين', week: 'أسبوعين', ex: 'تمرينين' }[k]) || cnt(n, k);
function ago(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'قبل لحظات';
  if (s < 120) return 'قبل دقيقة';
  if (s < 180) return 'قبل دقيقتين';
  if (s < 3600) return 'قبل ' + cnt(Math.floor(s / 60), 'min');
  if (s < 86400) return 'قبل ' + cnt(Math.floor(s / 3600), 'hr');
  return fmt(F.dm, ts);
}

const ICON = {
  check: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  up: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
  down: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  x: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

/* ============================== exercise library ============================== */
const MUSCLES = ['صدر', 'ظهر', 'أرجل', 'أكتاف', 'بايسبس', 'ترايسبس', 'بطن'];
// [id, name, muscle, kind]: 1 = uses an Olympic bar, 'bw' = bodyweight (the weight typed is what's added)
const BUILTIN = [
  ['b_bench', 'بنش برس بالبار', 'صدر', 1],
  ['b_incline', 'بنش مائل بالبار', 'صدر', 1],
  ['b_db_bench', 'بنش دمبل', 'صدر', 0],
  ['b_db_incline', 'بنش مائل دمبل', 'صدر', 0],
  ['b_fly', 'تفتيح دمبل', 'صدر', 0],
  ['b_chest_press', 'ضغط صدر بالجهاز', 'صدر', 0],
  ['b_cable_cross', 'كيبل كروس', 'صدر', 0],
  ['b_pushup', 'ضغط', 'صدر', 'bw'],
  ['b_deadlift', 'ديدلفت', 'ظهر', 1],
  ['b_pulldown', 'سحب أمامي', 'ظهر', 0],
  ['b_row', 'تجديف بالبار', 'ظهر', 1],
  ['b_db_row', 'تجديف دمبل', 'ظهر', 0],
  ['b_cable_row', 'سحب أرضي بالكيبل', 'ظهر', 0],
  ['b_pullup', 'عقلة', 'ظهر', 'bw'],
  ['b_squat', 'سكوات بالبار', 'أرجل', 1],
  ['b_leg_press', 'ليغ برس', 'أرجل', 0],
  ['b_rdl', 'رومانيان ديدلفت', 'أرجل', 1],
  ['b_leg_ext', 'مد الرجل بالجهاز', 'أرجل', 0],
  ['b_leg_curl', 'ثني الرجل بالجهاز', 'أرجل', 0],
  ['b_lunge', 'طعنات دمبل', 'أرجل', 0],
  ['b_calf', 'سمانة', 'أرجل', 0],
  ['b_ohp', 'ضغط أكتاف بالبار', 'أكتاف', 1],
  ['b_db_ohp', 'ضغط أكتاف دمبل', 'أكتاف', 0],
  ['b_lateral', 'رفرفة جانبية', 'أكتاف', 0],
  ['b_rear_delt', 'فراشة عكسية', 'أكتاف', 0],
  ['b_shrug', 'ترابيس دمبل', 'أكتاف', 0],
  ['b_curl', 'بايسبس بالبار', 'بايسبس', 0],
  ['b_db_curl', 'بايسبس دمبل', 'بايسبس', 0],
  ['b_hammer', 'هامر', 'بايسبس', 0],
  ['b_pushdown', 'تراي بالكيبل', 'ترايسبس', 0],
  ['b_skull', 'تراي فرنسي', 'ترايسبس', 0],
  ['b_dips', 'ديبس', 'ترايسبس', 'bw'],
  ['b_crunch', 'كرنش بالكيبل', 'بطن', 0],
  ['b_leg_raise', 'رفع الرجلين', 'بطن', 'bw'],
].map(([id, name, muscle, kind]) => ({ id, type: 'exercise', name, muscle, bar: kind === 1, bw: kind === 'bw', builtin: true }));
const BUILTIN_MAP = new Map(BUILTIN.map((e) => [e.id, e]));

// A starting push/pull/legs plan. updatedAt 1 means any real edit, here or in the backup, wins over it.
function seedRecords() {
  const mk = (id, name, order, items) => ({
    id, type: 'routine', name, createdAt: order, updatedAt: 1,
    items: items.map(([ex, sets, reps]) => ({ ex, sets, reps, weight: 0 })),
  });
  return [
    mk('rt_push', 'دفع: صدر وأكتاف وتراي', 1, [['b_bench', 4, 8], ['b_db_incline', 3, 10], ['b_db_ohp', 3, 10], ['b_lateral', 3, 12], ['b_pushdown', 3, 12]]),
    mk('rt_pull', 'سحب: ظهر وبايسبس', 2, [['b_deadlift', 3, 5], ['b_pulldown', 4, 10], ['b_row', 3, 8], ['b_curl', 3, 10], ['b_hammer', 3, 12]]),
    mk('rt_legs', 'أرجل', 3, [['b_squat', 4, 6], ['b_leg_press', 3, 10], ['b_rdl', 3, 10], ['b_leg_curl', 3, 12], ['b_calf', 4, 15]]),
    { id: 'schedule', type: 'schedule', updatedAt: 1, days: { 6: 'rt_push', 0: 'rt_pull', 1: 'rt_legs', 2: 'rt_push', 3: 'rt_pull', 4: 'rt_legs', 5: null } },
  ];
}

/* ============================== storage ============================== */
// Everything lives in memory (R) and in IndexedDB. `outbox` holds ids changed since the last upload.
let idb = null;
let storageBroken = false;
const R = new Map();
const outbox = new Set();
const meta = {};

const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const txDone = (t) => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = t.onabort = () => rej(t.error); });

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('tamarini', 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore('records', { keyPath: 'id' });
      db.createObjectStore('outbox', { keyPath: 'id' });
      db.createObjectStore('meta', { keyPath: 'k' });
    };
    r.onsuccess = () => { idb = r.result; res(); };
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('blocked'));
  });
}
// A set: w (kg; on a bodyweight lift a minus is the machine's help), r (reps), done, and optionally its type
// t (w warm-up, d drop set, f to failure) and how hard it was: rpe 6–10 or rir 0–5 reps left.
const SET_TYPES = ['w', 'd', 'f'];
function saneSet(x) {
  const o = { w: toSigned(x && x.w), r: Math.round(toNum(x && x.r)), done: !!(x && x.done) };
  if (!x) return o;
  if (SET_TYPES.includes(x.t)) o.t = x.t;
  const rpe = Math.round(toNum(x.rpe) * 2) / 2;
  if (rpe >= 6 && rpe <= 10) o.rpe = rpe;
  if (x.rir != null && x.rir !== '' && toNum(x.rir) <= 5) o.rir = Math.round(toNum(x.rir));
  return o;
}
// Rest after each set of one exercise, in seconds (none: the rest in settings).
function saneRest(it) {
  const v = Math.round(toNum(it.rest));
  if (v > 0 && v <= 900) it.rest = v; else delete it.rest;
}
function sane(r) {
  if (!r || typeof r.id !== 'string' || typeof r.type !== 'string') return null;
  if (r.type === 'session') {
    r.items = Array.isArray(r.items) ? r.items.filter((it) => it && it.ex) : [];
    for (const it of r.items) {
      it.sets = Array.isArray(it.sets) ? it.sets.map(saneSet) : [];
      if (it.note != null) it.note = String(it.note).slice(0, 500);
      saneRest(it);
    }
    if (typeof r.date !== 'string') return r.deleted ? r : null;
  }
  if (r.type === 'routine') {
    r.items = Array.isArray(r.items) ? r.items.filter((it) => it && it.ex) : [];
    for (const it of r.items) saneRest(it);
  }
  if (r.type === 'schedule' && (!r.days || typeof r.days !== 'object')) r.days = {};
  if (r.type === 'prefs' && (!r.values || typeof r.values !== 'object')) r.values = {};
  if (r.type === 'body') {
    if (typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) return r.deleted ? r : null;
    for (const k of BODY_KEYS) r[k] = toNum(r[k]);
  }
  if (r.type === 'profile') { r.height = toNum(r.height); r.goalKg = toNum(r.goalKg); }
  return r;
}
async function loadAll() {
  const t = idb.transaction(['records', 'outbox', 'meta']);
  const [recs, ob, ms] = await Promise.all([
    req(t.objectStore('records').getAll()),
    req(t.objectStore('outbox').getAll()),
    req(t.objectStore('meta').getAll()),
  ]);
  for (const r of recs) if (sane(r)) R.set(r.id, r);
  for (const o of ob) outbox.add(o.id);
  for (const m of ms) meta[m.k] = m.v;
}
async function writeRecords(recs, dirty) {
  if (!idb) return;
  const t = idb.transaction(['records', 'outbox'], 'readwrite');
  for (const r of recs) {
    t.objectStore('records').put(r);
    if (dirty) t.objectStore('outbox').put({ id: r.id });
  }
  await txDone(t);
}
async function clearOutbox(ids) {
  if (!ids.length) return;
  if (idb) {
    const t = idb.transaction('outbox', 'readwrite');
    for (const id of ids) t.objectStore('outbox').delete(id);
    await txDone(t);
  }
  for (const id of ids) outbox.delete(id);
}
async function setMeta(k, v) {
  meta[k] = v;
  if (!idb) return;
  const t = idb.transaction('meta', 'readwrite');
  t.objectStore('meta').put({ k, v });
  await txDone(t);
}

const saveTimers = new Map();
function save(rec, { soon = false } = {}) {
  rec.updatedAt = Math.max(Date.now(), (rec.updatedAt || 0) + 1);
  R.set(rec.id, rec);
  outbox.add(rec.id);
  clearTimeout(saveTimers.get(rec.id));
  if (soon) saveTimers.set(rec.id, setTimeout(() => flushOne(rec.id), 400));
  else flushOne(rec.id);
  Sync.schedule(activeToday() ? WORKOUT_SYNC_MS : EDIT_SYNC_MS);
}
function flushOne(id) {
  clearTimeout(saveTimers.get(id));
  saveTimers.delete(id);
  const r = R.get(id);
  if (r) writeRecords([r], true).catch(() => toast('ما قدرنا نحفظ على الجوال. تأكد إن فيه مساحة فاضية.'));
}
function flushPending() { for (const id of [...saveTimers.keys()]) flushOne(id); }

/* ============================== queries ============================== */
const live = (r) => !!r && !r.deleted;
const exInfo = (id) => BUILTIN_MAP.get(id) || R.get(id) || { id, name: 'تمرين محذوف', muscle: '', bar: false };
const exercises = () => [...BUILTIN, ...[...R.values()].filter((r) => r.type === 'exercise' && live(r))];
const routines = () => [...R.values()].filter((r) => r.type === 'routine' && live(r)).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
const scheduleRec = () => { const s = R.get('schedule'); return live(s) ? s : null; };
function routineOnDay(dow) {
  const s = scheduleRec();
  const r = s && s.days[dow] ? R.get(s.days[dow]) : null;
  return live(r) && r.type === 'routine' ? r : null;
}
const routineFor = (k) => routineOnDay(dateOf(k).getDay());
const plannedDays = () => dayOrder().filter((d) => routineOnDay(d)).length;
const sessions = () => [...R.values()].filter((r) => r.type === 'session' && live(r));
const sessionsDesc = () => sessions().sort((a, b) => (a.date === b.date ? (b.startedAt || 0) - (a.startedAt || 0) : a.date < b.date ? 1 : -1));
const doneSets = (s) => s.items.reduce((a, it) => a + it.sets.filter((x) => x.done).length, 0);
const totalSets = (s) => s.items.reduce((a, it) => a + it.sets.length, 0);
// The sets that count for records and kilos: done, with reps, and not a warm-up.
const working = (sets) => sets.filter((x) => x.done && x.r > 0 && x.t !== 'w');
const volume = (s) => s.items.reduce((a, it) => a + working(it.sets).reduce((b, x) => b + Math.max(0, x.w || 0) * x.r, 0), 0);
const routineSets = (r) => r.items.reduce((a, it) => a + (it.sets || 0), 0);
// keep(session) narrows the workouts counted, e.g. to the ones up to a given workout.
function trainedDates(keep) {
  const set = new Set();
  for (const s of sessions()) if (doneSets(s) > 0 && (!keep || keep(s))) set.add(s.date);
  return set;
}
// The unfinished workout from today, or one started in the last 8 hours (a workout that runs past midnight).
const ACTIVE_FOR_MS = 8 * 3600e3;
const activeToday = () => sessionsDesc().find((s) => !s.finishedAt && (s.date === todayKey() || Date.now() - (s.startedAt || 0) < ACTIVE_FOR_MS)) || null;
const hasUserData = () => [...R.values()].some((r) => r.type === 'routine' || r.type === 'session' || r.type === 'schedule' || r.type === 'body');

/* ============================== body ============================== */
// One record per day: { id: 'body_<date>', type: 'body', date, kg, neck, chest, waist, fat, bicepR, bicepL, ... }. 0 means not measured that day.
// A measure's fields are [field, side]: one field, or a right and a left one (bicepR, bicepL).
const SIDES = [['R', 'يمين'], ['L', 'يسار']];
const measure = (key, name, unit, sided) => ({ key, name, unit, fields: sided ? SIDES.map(([s, side]) => [key + s, side]) : [[key, '']] });
const MEASURES = [
  measure('neck', 'الرقبة', 'سم'), measure('chest', 'الصدر', 'سم'), measure('waist', 'الخصر', 'سم'), measure('fat', 'نسبة الدهون', '%'),
  measure('bicep', 'العضد', 'سم', 1), measure('forearm', 'الساعد', 'سم', 1), measure('thigh', 'الفخذ', 'سم', 1), measure('calf', 'البطه', 'سم', 1),
];
// Before right and left were split, the arm and the thigh were one number each. Still shown, no longer asked for.
const OLD_MEASURES = [
  { key: 'oldArm', name: 'الذراع (قديم)', unit: 'سم', fields: [['arm', '']] },
  { key: 'oldThigh', name: 'الفخذ (قديم)', unit: 'سم', fields: [['thigh', '']] },
];
const ALL_MEASURES = [...MEASURES, ...OLD_MEASURES];
const BODY_KEYS = ['kg', ...ALL_MEASURES.flatMap((m) => m.fields.map(([f]) => f))];
function bodyLimits(k) {
  if (k === 'kg') return [20, 400, 'الوزن', 'كجم'];
  const m = ALL_MEASURES.find((x) => x.fields.some(([f]) => f === k)), side = m.fields.find(([f]) => f === k)[1];
  return [...(m.unit === '%' ? [2, 70] : [10, 300]), side ? `${m.name} ${side}` : m.name, m.unit];
}
const bodyRecs = () => [...R.values()].filter((r) => r.type === 'body' && live(r) && BODY_KEYS.some((k) => r[k] > 0)).sort((a, b) => (a.date < b.date ? -1 : 1));
const weighIns = () => bodyRecs().filter((r) => r.kg > 0);
// The weigh-in that applies on a date: the last one on or before it, else the first one after.
function bodyKgOn(date) {
  const ws = weighIns();
  let hit = null;
  for (const r of ws) { if (r.date <= date) hit = r; else break; }
  return hit || ws[0] || null;
}
// Height and goal live in their own record, so resetting the settings leaves them alone.
function profile() {
  const r = R.get('profile');
  return { height: (live(r) && r.height) || 0, goalKg: (live(r) && r.goalKg) || 0 };
}
const dayNum = (k) => Math.round(dateOf(k).getTime() / 864e5);
// pts: [{ date, v }] sorted by date. The average of each point and the ones in the `days` before it (null when it's alone).
const movingAvg = (pts, days) => pts.map((p, i) => {
  const win = pts.slice(0, i + 1).filter((q) => dayNum(p.date) - dayNum(q.date) < days);
  return win.length > 1 ? round1(win.reduce((a, q) => a + q.v, 0) / win.length) : null;
});
// Slope of a least-squares line through the last `days` days of points, in units per day (null without two weeks of data).
function trend(pts, days) {
  if (!pts.length) return null;
  const end = dayNum(pts[pts.length - 1].date);
  const win = pts.filter((p) => end - dayNum(p.date) <= days);
  if (win.length < 2 || end - dayNum(win[0].date) < 7) return null;
  const xs = win.map((p) => dayNum(p.date)), mx = xs.reduce((a, x) => a + x, 0) / xs.length;
  const my = win.reduce((a, p) => a + p.v, 0) / win.length;
  let num = 0, den = 0;
  win.forEach((p, i) => { num += (xs[i] - mx) * (p.v - my); den += (xs[i] - mx) ** 2; });
  return den ? num / den : null;
}
function bmiInfo(kgV, cm) {
  const v = round1(kgV / (cm / 100) ** 2);
  return { v, cat: v < 18.5 ? 'نحيف' : v < 25 ? 'طبيعي' : v < 30 ? 'زايد' : 'سمنة' };
}

/* ============================== settings ============================== */
// Settings are a normal record, so they're backed up and come back after a reinstall like everything else.
// effort: how hard each set was, as 'rpe' (6–10) or 'rir' (reps left), or 'off'. suggest: the next-weight line.
const PREF_DEFAULTS = { rest: 90, restSound: true, wake: false, coach: true, step: 2.5, plates: true, bar: 20, weekStart: 6, theme: 'auto', effort: 'off', suggest: true };
const TEXT_PREFS = new Set(['theme', 'effort']);
function prefs() {
  const r = R.get('prefs');
  return Object.assign({}, PREF_DEFAULTS, live(r) && r.values ? r.values : {});
}
function setPref(k, v) {
  const r = R.get('prefs') || { id: 'prefs', type: 'prefs', values: {} };
  r.values = Object.assign({}, r.values, { [k]: v });
  save(r);
  applyTheme();
}
// The theme is also kept in localStorage so the page paints in it before the database opens.
function applyTheme() {
  const t = prefs().theme;
  const fixed = t === 'light' || t === 'dark';
  if (fixed) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  try { if (fixed) localStorage.setItem('tamarini-theme', t); else localStorage.removeItem('tamarini-theme'); } catch (e) {}
}

// Bodyweight exercises: the weight typed is what's added on top of the body, or with a minus what an assisted
// machine takes off (0 = body only). A set beats another with more weight (less help), or the same and more
// reps. Other exercises compare weight.
const isBw = (exId) => !!exInfo(exId).bw;
const beats = (a, b, bw) => a.w > b.w || (bw && a.w === b.w && a.r > b.r);
const bw2s = (n) => (n > 0 ? `+${round2(n)}` : n < 0 ? `−${round2(-n)}` : '');
const extraTxt = (w) => (w > 0 ? `+${round2(w)} كجم` : w < 0 ? `مساعدة ${round2(-w)} كجم` : 'بوزن جسمك بس');
// How a finished set reads: 60×8, or for bodyweight 8 (reps), +10×6 (10 kg added) and −20×6 (20 kg of help).
const setTxt = (x, bw) => (bw ? (x.w ? `${bw2s(x.w)}×${x.r}` : String(x.r)) : `${w2s(x.w) || 0}×${x.r}`);
const effortTxt = (x) => (x.rpe ? ` @${x.rpe}` : x.rir != null ? ` RIR ${x.rir}` : '');
// A row of sets for an Arabic line: first set on the right, each one kept left-to-right inside.
// A warm-up reads (40×10), a drop set and a set to failure carry د or ف, and the effort follows: 80×8 @8.
const setsHTML = (sets, bw) => sets.map((x) => (x.t === 'w' ? `<bdi dir="ltr" class="wu">(${setTxt(x, bw)}${effortTxt(x)})</bdi>`
  : `<bdi dir="ltr">${setTxt(x, bw)}${effortTxt(x)}</bdi>${x.t ? `<sub class="st">${x.t === 'd' ? 'د' : 'ف'}</sub>` : ''}`)).join(' · ');

// Was workout `o` before workout `ref`? Editing an old workout compares it with what came before it.
const isBefore = (o, ref) => o.id !== ref.id && (o.date < ref.date || (o.date === ref.date && (o.startedAt || 0) < (ref.startedAt || 0)));
function lastSetsFor(exId, ref) {
  for (const s of sessionsDesc()) {
    if (!isBefore(s, ref)) continue;
    const it = s.items.find((i) => i.ex === exId && i.sets.some((x) => x.done));
    if (it) return { date: s.date, sets: it.sets.filter((x) => x.done) };
  }
  return null;
}
// The newest note on this exercise from an earlier workout, however long ago.
function lastNoteFor(exId, ref) {
  for (const s of sessionsDesc()) {
    if (!isBefore(s, ref)) continue;
    const it = s.items.find((i) => i.ex === exId && i.note && i.note.trim());
    if (it) return { date: s.date, note: it.note.trim() };
  }
  return null;
}
function history(exId) {
  const out = [];
  for (const s of sessionsDesc().reverse()) {
    for (const it of s.items) {
      if (it.ex !== exId) continue;
      const d = working(it.sets);
      if (!d.length) continue;
      const top = d.reduce((a, b) => (b.w > a.w || (b.w === a.w && b.r > a.r) ? b : a));
      const e1Set = d.reduce((a, b) => (est1rm(b.w, b.r) > est1rm(a.w, a.r) ? b : a)); // the set the 1RM estimate comes from
      out.push({
        date: s.date, sid: s.id, top, sets: it.sets.filter((x) => x.done && x.r > 0), note: (it.note || '').trim(),
        e1: est1rm(e1Set.w, e1Set.r), e1Set,
        reps: Math.max(...d.map((x) => x.r)),
      });
    }
  }
  const bw = isBw(exId);
  let best = null;
  for (const h of out) {
    h.pr = !!best && (bw ? beats(h.top, best, true) : best.w > 0 && h.top.w > best.w);
    if (!best || beats(h.top, best, bw)) best = h.top;
  }
  return out;
}
// One chronological pass: which sessions set a new record on any exercise.
function prsBySession() {
  const best = new Map();
  const out = new Map();
  for (const s of sessionsDesc().reverse()) {
    for (const it of s.items) {
      const d = working(it.sets);
      if (!d.length) continue;
      const bw = isBw(it.ex);
      const top = d.reduce((a, b) => (beats(b, a, true) ? b : a));
      const prev = best.get(it.ex);
      if (prev && (bw ? beats(top, prev, true) : prev.w > 0 && top.w > prev.w) && !(out.get(s.id) || []).some((p) => p.ex === it.ex)) {
        if (!out.has(s.id)) out.set(s.id, []);
        out.get(s.id).push({ ex: it.ex, top, prev });
      }
      if (!prev || beats(top, prev, bw)) best.set(it.ex, top);
    }
  }
  return out;
}
function prText(p) {
  if (!isBw(p.ex)) return `${round2(p.top.w)} كجم، كان ${round2(p.prev.w)}`;
  if (p.top.w === p.prev.w) return `${cnt(p.top.r, 'rep')}، كان ${p.prev.r}`;
  return `${extraTxt(p.top.w)}، كان ${extraTxt(p.prev.w)}`;
}

// Plates per side for the bar weight in settings, IWF colors.
const PLATES = [[25, '--plate-25'], [20, '--plate-20'], [15, '--plate-15'], [10, '--plate-10'], [5, '--plate-5'], [2.5, '--plate-2'], [1.25, '--plate-1']];
function platesHTML(total) {
  const { plates, bar } = prefs();
  if (!plates || !total || total < bar) return '';
  if (total === bar) return `<span>البار لحاله، ${bar} كجم</span>`;
  let side = round2((total - bar) / 2);
  const counts = [];
  for (const [p, c] of PLATES) {
    let n = 0;
    while (side >= p - 1e-9) { n++; side = round2(side - p); }
    if (n) counts.push([p, c, n]);
  }
  let h = '<span>لكل جهة:</span>';
  for (const [p, c, n] of counts) h += `<span class="plate" dir="ltr"><i style="background:var(${c})"></i>${p}${n > 1 ? ` ×${n}` : ''}</span>`;
  if (side > 0.001) h += `<span>والباقي ${side} ما يطلع بالصفائح</span>`;
  return h;
}

/* ============================== motivation ============================== */
// One line under the workout's progress bar. It changes only when a set is ticked, and says
// something that fits the moment: a new record, the last set, an exercise done, halfway.
const COACH = {
  start: [
    'يلا بسم الله، أول جولة تفتح الباقي',
    'اليوم يوم شغل، وجسمك جاهز',
    'إحماء زين، وبعدها نكسر الحديد',
    'ركّز على الحركة الصح، والوزن يجي بعدين',
    'أصعب شي إنك تجي النادي، وأنت جيت. يلا!',
  ],
  set: [
    'كفو! كمّل على نفس الرتم',
    'جولة ورا جولة، كذا تنبني العضلة',
    'قوي! خذ نفسك وارجع',
    'عاش! الحديد ما يكذب',
    'كل جولة تقرّبك من هدفك',
    'شد حيلك، أنت قدها',
    'تعب اليوم قوة بكرة',
    'استمر، السر كله في الاستمرار',
    'ولا أروع، خلّ الراحة قصيرة',
    'زين! اشرب موية وكمّل',
    'جسمك يتعب، بس عقلك اللي يقرر',
    'ما أحد بيرفعها عنك، يلا الجولة الجاية',
    'الثبات أهم من الوزن، وأنت ثابت',
    'تمام التمام، كمّل',
  ],
  half: [
    'خلّصت النص! النص الثاني أسهل',
    'نص التمرين راح، باقي القليل',
    'وصلت النص، لا توقف الحين',
  ],
  last: [
    'آخر جولة! طلّع كل اللي فيك',
    'باقي جولة وحدة، خلّها أحسن وحدة',
    'آخر وحدة، وبعدها ترتاح وضميرك مرتاح',
  ],
  exDone: [
    'خلّصت {ex}! يلا على اللي بعده',
    '{ex} خلص ✓ كمّل على نفس القوة',
    'شطبت {ex}، أحسنت',
  ],
  pr: [
    'رقم جديد في {ex}! {w} كجم 🔥',
    '{w} كجم في {ex}! أثقل من أي مرة قبل 💪',
    'كسرت رقمك في {ex}: {w} كجم!',
  ],
  prReps: [
    'رقم جديد في {ex}: {r} 🔥',
    '{r} في {ex}! أكثر من أي مرة قبل 💪',
    'كسرت رقمك في {ex}: {r}!',
  ],
  // An assisted bodyweight lift with less help than ever: {a} is «مساعدة 15 كجم» or «بوزن جسمك بس».
  prHelp: [
    'رقم جديد في {ex}: {a} 🔥',
    'مساعدة أقل من أي مرة في {ex}: {a} 💪',
    'جسمك يقوى! {ex}: {a}',
  ],
  allDone: [
    'خلّصت كل الجولات! اضغط «إنهاء التمرين» تحت',
    'كل الجولات خلصت 💪 اضغط «إنهاء التمرين» وارتاح',
  ],
};
const coachOn = () => prefs().coach;
const recentLines = [];
function pickLine(kind, vars = {}) {
  const pool = COACH[kind];
  const fresh = pool.filter((t) => !recentLines.includes(t));
  const t = (fresh.length ? fresh : pool)[Math.floor(Math.random() * (fresh.length || pool.length))];
  recentLines.push(t);
  if (recentLines.length > 6) recentLines.shift();
  return t.replace(/\{ex\}/g, vars.ex || '').replace(/\{w\}/g, vars.w == null ? '' : String(round2(vars.w)))
    .replace(/\{r\}/g, vars.r == null ? '' : cnt(vars.r, 'rep')).replace(/\{a\}/g, vars.a || '');
}
// The best finished set for this exercise in the workouts before `ref` (null if none).
function bestBefore(exId, ref) {
  const bw = isBw(exId);
  let best = null;
  for (const s of sessions()) {
    if (!isBefore(s, ref)) continue;
    for (const it of s.items) if (it.ex === exId) for (const x of working(it.sets)) if (!best || beats(x, best, bw)) best = x;
  }
  return best;
}
// Called right after set j of exercise i was ticked. Returns { text, pr }.
function lineAfterSet(s, i, j) {
  const it = s.items[i], x = it.sets[j];
  const name = exInfo(it.ex).name;
  const total = totalSets(s), dn = doneSets(s);
  const bw = isBw(it.ex);
  const prev = bestBefore(it.ex, s);
  const bestToday = it.sets.every((o, k) => k === j || !o.done || o.t === 'w' || beats(x, o, bw));
  // A warm-up is never a record.
  if (prev && x.r > 0 && x.t !== 'w' && bestToday && (bw ? beats(x, prev, true) : prev.w > 0 && x.w > prev.w)) {
    // Same added weight as the best so far (earlier today included) means the record is in reps.
    const bestSoFar = it.sets.reduce((b, o, k) => (k !== j && o.done && o.t !== 'w' && beats(o, b, bw) ? o : b), prev);
    const text = bw && x.w === bestSoFar.w ? pickLine('prReps', { ex: name, r: x.r })
      : bw && x.w <= 0 ? pickLine('prHelp', { ex: name, a: extraTxt(x.w) })
      : pickLine('pr', { ex: name, w: x.w });
    return { text, pr: true };
  }
  if (dn === total) return { text: pickLine('allDone') };
  if (it.sets.every((o) => o.done)) return { text: pickLine('exDone', { ex: name }) };
  if (total - dn === 1) return { text: pickLine('last') };
  if (dn - 1 < total / 2 && dn >= total / 2) return { text: pickLine('half') };
  return { text: pickLine('set') };
}

/* ============================== sync (Google Sheets via Apps Script) ============================== */
// Every change is safe in IndexedDB the moment it's made; the upload is the off-phone copy.
// To keep mobile data low, a workout in progress uploads at most every 10 minutes and once more
// when it's finished, and the phone only downloads on open (at most every 30 minutes) or on request.
const EDIT_SYNC_MS = 20000;
const WORKOUT_SYNC_MS = 10 * 60000;
const PULL_EVERY_MS = 30 * 60000;

const Sync = {
  conf: null, lastPull: 0, lastPullAt: 0, busy: false, again: false, timer: 0, due: 0, error: '', fails: 0,

  // "<web app url>#<key>"
  parse(link) {
    const raw = String(link || '').replace(/\s+/g, '');
    const at = raw.search(/https?:\/\//);
    const s = at > 0 ? raw.slice(at) : raw;
    const i = s.lastIndexOf('#');
    if (i < 0) return null;
    const url = s.slice(0, i), key = s.slice(i + 1);
    const okUrl = /^https:\/\/\S+$/.test(url) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url);
    return okUrl && key.length >= 8 ? { url, key } : null;
  },
  // Throttle, not debounce: a later request never pushes back an upload that's already due.
  schedule(ms) {
    if (!this.conf) return;
    const due = Date.now() + ms;
    if (this.timer && this.due <= due) return;
    clearTimeout(this.timer);
    this.due = due;
    this.timer = setTimeout(() => { this.timer = 0; this.run(); }, ms);
  },
  async call(body, conf = this.conf, keepalive = false) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 30000);
    try {
      const payload = JSON.stringify(Object.assign({}, body, { key: conf.key }));
      // text/plain keeps this a "simple" request, so Apps Script needs no CORS preflight.
      const res = await fetch(conf.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: payload,
        signal: ctl.signal,
        cache: 'no-store',
        redirect: 'follow',
        keepalive: keepalive && payload.length < 60000,
      });
      if (res.status === 404) throw new Error('not_found');
      const txt = await res.text();
      let j = null;
      try { j = JSON.parse(txt); } catch (e) { throw new Error('bad_response'); }
      if (!j || !j.ok) throw new Error((j && j.error) || 'failed');
      return j;
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('timeout');
      if (e instanceof TypeError) throw new Error('network');
      throw e;
    } finally {
      clearTimeout(t);
    }
  },
  async run(opts = {}) {
    if (!this.conf) return 0;
    if (this.busy) { this.again = true; return 0; }
    clearTimeout(this.timer);
    this.timer = 0;
    flushPending();
    const ids = [...outbox];
    const missing = ids.filter((id) => !R.has(id));
    const todo = ids.filter((id) => R.has(id));
    const doPull = !!opts.pull || Date.now() - this.lastPullAt > PULL_EVERY_MS;
    if (!todo.length && !doPull) { await clearOutbox(missing); renderSyncState(); return 0; }
    this.busy = true;
    renderSyncState();
    let got = 0;
    let tooBig = false;
    try {
      await clearOutbox(missing);
      for (let i = 0; i < todo.length; i += 80) {
        const sent = todo.slice(i, i + 80).map((id) => {
          const r = R.get(id);
          return { id: r.id, type: r.type, updatedAt: r.updatedAt || 0, deleted: !!r.deleted, data: r };
        });
        const res = await this.call({ op: 'push', records: sent }, this.conf, opts.keepalive);
        const refused = new Set(res.rejected || []);
        if (refused.size) tooBig = true;
        await clearOutbox(sent.filter((s) => { const cur = R.get(s.id); return !refused.has(s.id) && cur && cur.updatedAt === s.updatedAt; }).map((s) => s.id));
      }
      if (doPull) {
        const res = await this.call({ op: 'pull', since: this.lastPull });
        const incoming = [];
        for (const rec of res.records || []) {
          const d = sane(rec && rec.data);
          if (!d) continue;
          const local = R.get(d.id);
          if (!local || (d.updatedAt || 0) > (local.updatedAt || 0)) incoming.push(d);
        }
        if (incoming.length) {
          await writeRecords(incoming, false);
          for (const d of incoming) R.set(d.id, d);
          got = incoming.length;
        }
        this.lastPull = res.serverTime || this.lastPull;
        this.lastPullAt = Date.now();
      }
      await setMeta('sync', { url: this.conf.url, key: this.conf.key, lastPull: this.lastPull, lastOk: Date.now() });
      this.error = tooBig ? 'too_big' : '';
      this.fails = 0;
      if (got) safeRender();
    } catch (e) {
      this.error = navigator.onLine === false ? 'offline' : (e && e.message) || 'failed';
      // A wrong link stays wrong: don't spend data retrying it until the app is opened again.
      if (!['bad_key', 'not_found', 'bad_response'].includes(this.error)) {
        this.fails += 1;
        this.schedule(Math.min(15 * 60000, 30000 * 2 ** (this.fails - 1)));
      }
    } finally {
      this.busy = false;
      renderSyncState();
      if (this.again) { this.again = false; this.schedule(1500); }
    }
    return got;
  },
};

function syncState() {
  if (!meta.sync) return { s: 'off', short: 'بدون نسخ', long: 'النسخ الاحتياطي مو مفعّل' };
  if (Sync.busy) return { s: 'busy', short: 'يرفع…', long: 'يرفع التغييرات…' };
  if (Sync.error === 'bad_key') return { s: 'err', short: 'خطأ', long: 'المفتاح في الرابط غلط. الصق الرابط الصحيح.' };
  if (Sync.error === 'not_found' || Sync.error === 'bad_response') return { s: 'err', short: 'خطأ', long: 'رابط المزامنة ما يشتغل. افتح جدولك من الكمبيوتر، ومن قائمة «تماريني» اختر «رابط المزامنة»، والصقه هنا من «غيّر الرابط».' };
  if (Sync.error === 'too_big') return { s: 'err', short: 'خطأ', long: 'فيه تمرين كبير مرة ما قبله الجدول. احفظ ملف نسخة من تحت عشان ما يضيع.' };
  const n = outbox.size;
  if (n && Sync.error === 'offline') return { s: 'wait', short: 'ينتظر النت', long: `${cnt(n, 'chg')} تنتظر الإنترنت، وبترتفع لحالها` };
  if (n && Sync.error) return { s: 'wait', short: 'ينتظر', long: `${cnt(n, 'chg')} ما ارتفعت للحين. بنعيد المحاولة لحالنا.` };
  if (n) return { s: 'wait', short: 'بيرتفع', long: `${cnt(n, 'chg')} محفوظة على الجوال، وبترتفع خلال دقايق` };
  if (Sync.error && Sync.error !== 'offline') return { s: 'wait', short: 'ينتظر', long: 'ما قدرنا نتأكد من آخر نسخة. بنعيد المحاولة.' };
  const last = meta.sync.lastOk;
  return { s: 'ok', short: 'محفوظ', long: last ? `كل شي محفوظ. آخر مزامنة ${ago(last)}` : 'كل شي محفوظ' };
}
function renderSyncState() {
  const st = syncState();
  const dot = $('#syncDot');
  dot.dataset.s = st.s;
  $('#syncDotText').textContent = st.short;
  dot.hidden = UI.screen === 'setup';
  const box = $('.sync-state', main);
  if (box) { box.dataset.s = st.s; box.querySelector('span').textContent = st.long; }
}

async function connect(link) {
  const msgEl = $('#link-msg');
  const say = (t, cls) => { if (msgEl) { msgEl.textContent = t; msgEl.className = 'msg ' + (cls || ''); } };
  const conf = Sync.parse(link);
  if (!conf) {
    say(/\/exec$/.test(String(link).trim())
      ? 'هذا رابط Web app بس، بدون المفتاح. رابط المزامنة تلقاه في جدولك: قائمة «تماريني» ثم «رابط المزامنة»، وفي آخره علامة # ومفتاح طويل.'
      : 'الرابط مو صحيح. لازم يكون رابط Apps Script وبعده علامة # والمفتاح.', 'err');
    return null;
  }
  say('يتصل…');
  try {
    await Sync.call({ op: 'ping' }, conf);
  } catch (e) {
    const why = {
      bad_key: 'المفتاح غلط. تأكد إنك نسخت الرابط كامل.',
      not_found: 'الرابط ما يفتح، غالبًا انقص وقت النسخ. انسخه من جديد من جدولك: قائمة «تماريني» ثم «رابط المزامنة».',
      bad_response: 'الرابط يفتح صفحة ثانية مو جدولك. تأكد إن النشر مضبوط على Anyone، وانسخ الرابط من قائمة «تماريني».',
      timeout: 'الجدول ما رد. جرّب مرة ثانية بعد شوي.',
    };
    say(navigator.onLine === false ? 'ما فيه إنترنت. الربط يحتاج إنترنت أول مرة بس.' : why[e.message] || 'ما قدرنا نوصل للرابط. تأكد إنه منسوخ كامل وإن السكربت منشور.', 'err');
    return null;
  }
  while (Sync.busy) await sleep(200);
  Sync.conf = conf;
  Sync.lastPull = 0;
  Sync.error = '';
  Sync.fails = 0;
  UI.linkDraft = '';
  await setMeta('sync', { url: conf.url, key: conf.key, lastPull: 0, lastOk: 0 });
  // The sheet gets a full copy of whatever is already on this phone.
  const all = [...R.values()];
  if (all.length) { await writeRecords(all, true); for (const r of all) outbox.add(r.id); }
  say('يرجّع بياناتك…');
  const got = await Sync.run({ pull: true });
  if (Sync.error) say('انربط، بس صار خطأ وقت المزامنة. بنعيد المحاولة لحالنا.', 'err');
  else say('انربط.', 'ok');
  return { got };
}

async function seedIfEmpty() {
  if (hasUserData()) return false;
  const recs = seedRecords();
  await writeRecords(recs, true);
  for (const r of recs) { R.set(r.id, r); outbox.add(r.id); }
  Sync.schedule(3000);
  return true;
}

/* ============================== file backup ============================== */
async function exportBackup() {
  flushPending();
  const data = { app: 'tamarini', version: 1, exportedAt: new Date().toISOString(), records: [...R.values()] };
  const name = `tamarini-backup-${todayKey()}.json`;
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  try {
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });
      toast('إذا اخترت «حفظ في الملفات»، احفظه في iCloud Drive');
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
async function importBackup(file) {
  let data = null;
  try { data = JSON.parse(await file.text()); } catch (e) {}
  const recs = data && data.app === 'tamarini' && Array.isArray(data.records) ? data.records.map(sane).filter(Boolean) : [];
  if (!recs.length) { toast('هذا الملف مو نسخة من تماريني'); return; }
  const apply = recs.filter((r) => { const l = R.get(r.id); return !l || (r.updatedAt || 0) > (l.updatedAt || 0); });
  if (apply.length) {
    await writeRecords(apply, true);
    for (const r of apply) { R.set(r.id, r); outbox.add(r.id); }
    Sync.schedule(1000);
  }
  if (!meta.setup) await setMeta('setup', true);
  toast(apply.length ? `رجّعنا ${ofCnt(apply.length, 'rec')}` : 'كل اللي في الملف موجود عندك');
  if (UI.screen === 'setup') go('today'); else render();
}

/* ============================== UI state ============================== */
const UI = {
  tab: 'today', screen: 'today', stack: [],
  sessionId: null, draft: null, pickFor: null, pickQuery: '', newExFor: null,
  setPanel: null, // '<session id>:<exercise>:<set>' whose type/effort panel is open
  recAll: false, shareCache: null, // { key, file } the finished workout's picture, made ahead of the tap
  progEx: null, progRange: 90, progMetric: 'load', linkEdit: false, dirtyRender: false, coach: null, linkDraft: '', rest: null,
  bodyRange: 90, bodyDate: null, bodyMore: false, bodyProfile: false, bodyMeasure: null, bodyAll: false,
  bodyDraft: null, // { date, vals } typed into the body form but not saved yet, so a re-render keeps it
};
const isField = (el) => !!el && main.contains(el) && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);

function go(tab) {
  UI.tab = tab; UI.screen = tab; UI.stack = []; UI.linkEdit = false; UI.bodyDate = null;
  render();
  window.scrollTo(0, 0);
}
function push(screen) {
  UI.stack.push(UI.screen);
  UI.screen = screen;
  render();
  window.scrollTo(0, 0);
}
function back() {
  if (UI.screen === 'routine') commitDraft(true);
  UI.screen = UI.stack.pop() || UI.tab;
  render();
}
function curSession() {
  const s = UI.screen === 'session' ? R.get(UI.sessionId) : activeToday();
  return live(s) ? s : null;
}

let toastT = 0;
function toast(t) {
  const el = $('#toast');
  el.textContent = t;
  el.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { el.hidden = true; }, 2800);
}
// Two taps for anything that deletes: the first arms the button, the second acts.
function armed(btn, label) {
  if (btn.dataset.armed === '1') return true;
  const old = btn.innerHTML;
  btn.dataset.armed = '1';
  btn.classList.add('armed');
  if (label) btn.textContent = label;
  setTimeout(() => { if (btn.isConnected) { btn.dataset.armed = ''; btn.classList.remove('armed'); btn.innerHTML = old; } }, 3500);
  return false;
}

/* ============================== render ============================== */
function render() {
  UI.dirtyRender = false;
  applyTheme(); // settings may have just arrived from the backup

  const v = SCREENS[UI.screen]();
  $('#title').textContent = v.title;
  $('#subtitle').textContent = v.subtitle || '';
  $('#back').hidden = !v.back;
  $('#tabs').hidden = !v.tabs;
  main.classList.toggle('no-tabs', !v.tabs);
  main.innerHTML = v.html;
  for (const b of document.querySelectorAll('#tabs [data-tab]')) {
    if (b.dataset.tab === UI.tab && v.tabs) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  $('#gear').hidden = UI.screen === 'setup' || UI.screen === 'settings';
  renderSyncState();
  tickRest();
  syncWakeLock();
  // A finished workout's picture is drawn now, so «شارك» can open the share sheet straight from the tap.
  const sb = main.querySelector('[data-act="share-sum"]');
  const ss = sb && R.get(sb.dataset.sid);
  if (live(ss)) setTimeout(() => prepareShare(ss).catch(() => {}), 300);
}
function safeRender() {
  if (isField(document.activeElement)) UI.dirtyRender = true; else render();
}

/* ---------- setup ---------- */
function screenSetup() {
  const html = `<div class="setup">
    <h2>هلا! هذا «تماريني»</h2>
    <p>جدول تمارينك، وجولاتك، وتقدّم أوزانك. يشتغل في النادي حتى بدون إنترنت.</p>
    <section class="card form">
      <p><b>عندك رابط مزامنة؟</b> اربطه عشان ينحفظ تقدمك في جدول Google Sheets في حسابك، وما يضيع لو حذفت التطبيق. ولو كان لك بيانات قبل، بترجع كلها.</p>
      <label for="sync-link">رابط المزامنة
        <textarea class="field" id="sync-link" data-f="link" rows="3" placeholder="https://script.google.com/macros/s/…/exec#…" autocapitalize="off" autocomplete="off" spellcheck="false">${esc(UI.linkDraft)}</textarea>
      </label>
      <button class="btn primary block" type="button" data-act="setup-connect">اربط وابدأ</button>
      <p class="msg" id="link-msg" role="status"></p>
      <a class="link" href="help.html">ما عندك رابط؟ هذي طريقة تسويه</a>
    </section>
    <div class="or">أو</div>
    <button class="btn quiet block" type="button" data-act="setup-skip">ابدأ بدون نسخ احتياطي</button>
    <p class="fine">بدون الرابط، تقدمك يكون على هذا الجوال بس. تقدر تضيف الرابط بعدين من تبويب «السجل».</p>
    <button class="link" type="button" data-act="import">عندي ملف نسخة احتياطية</button>
    <input type="file" id="import-file" accept=".json,application/json" hidden>
  </div>`;
  return { title: 'تماريني', subtitle: 'أول مرة', html };
}

/* ---------- today ---------- */
function weekCard() {
  const t = todayKey(), ws = weekStart(t), trained = trainedDates(), sc = streaks().cur;
  let cells = '', planned = 0, got = 0, sets = 0, vol = 0;
  for (let i = 0; i < 7; i++) {
    const k = addDays(ws, i), dow = dateOf(k).getDay();
    const isPlanned = !!routineOnDay(dow);
    const tr = trained.has(k);
    if (isPlanned) planned++;
    if (tr) got++;
    cells += `<div class="day ${tr ? 'trained' : ''} ${isPlanned ? 'planned' : 'rest'} ${k === t ? 'today' : ''}"><span>${DAY_SHORT[dow]}</span><b>✓</b></div>`;
  }
  const we = addDays(ws, 6);
  for (const s of sessions()) if (s.date >= ws && s.date <= we) { sets += doneSets(s); vol += volume(s); }
  return `<section class="card">
    <div class="sec-title flush"><h2>هالأسبوع</h2><span class="num">${got} من ${planned}</span></div>
    <div class="week" role="img" aria-label="تمرّنت ${cnt(got, 'day')} من ${ofCnt(planned, 'day')} مخطط لها هالأسبوع">${cells}</div>
    <div class="week-sum"><span>${got ? cnt(got, 'day') + ' في النادي' : 'ما تمرّنت للحين هالأسبوع'}</span><span class="muted num">${cnt(sets, 'set')} · ${kg(vol)}</span></div>
    ${sc >= 2 ? `<p class="fine streak">🔥 سلسلتك ${ofCnt(sc, 'week')} متتالية. لا تكسرها!</p>` : ''}
  </section>`;
}
function doneCard(s) {
  const mins = s.finishedAt && s.startedAt ? Math.max(1, Math.round((s.finishedAt - s.startedAt) / 60000)) : 0;
  return `<section class="card done-today">
    <h3>خلّصت تمرين اليوم: ${esc(s.name)}</h3>
    <p class="small num">${cnt(doneSets(s), 'set')} · ${kg(volume(s))}${mins ? ` · ${cnt(mins, 'min')}` : ''}</p>
    <div><button class="link" type="button" data-act="open-session" data-sid="${s.id}">افتح التمرين</button></div>
  </section>`;
}
// A nudge to weigh in when the last weigh-in is over a week old. «لاحقًا» hides it for 3 days on this phone.
function weighCard() {
  const t = todayKey();
  if (meta.bodySnooze && meta.bodySnooze > t) return '';
  const last = weighIns().slice(-1)[0];
  if (last && last.date > addDays(t, -7)) return '';
  return `<section class="card weigh">
    <div class="sec-title flush"><h2>سجّل وزنك</h2></div>
    <p class="fine">${last ? `آخر مرة سجّلته ${fmtDay(last.date)}، وكان ${round1(last.kg)} كجم.` : 'سجّله مرة بالأسبوع، وتشوف تقدّمه في تبويب «التقدّم».'}</p>
    <div class="weigh-row">
      <input class="field" data-body="kg" inputmode="decimal" enterkeyhint="done" autocomplete="off" value="${esc(bodyDraftFor(t).kg || '')}" placeholder="${last ? round1(last.kg) : 'كم كيلو؟'}" aria-label="وزنك اليوم بالكيلو">
      <button class="btn primary" type="button" data-act="body-save">سجّل</button>
    </div>
    <div><button class="link" type="button" data-act="body-snooze">لاحقًا</button></div>
  </section>`;
}
function screenToday() {
  const t = todayKey();
  const act = activeToday();
  if (act) return screenSession(act, true);
  const rt = routineFor(t);
  const doneToday = sessionsDesc().filter((s) => s.date === t && s.finishedAt);
  let h = '';
  if (storageBroken) h += '<div class="banner"><span>التخزين على الجوال مو شغال، يمكن لأنك فاتح الصفحة في التصفح الخاص. افتح التطبيق من الشاشة الرئيسية.</span></div>';
  else if (!meta.sync) h += '<div class="banner"><span>تقدمك محفوظ على هذا الجوال بس. فعّل النسخ الاحتياطي عشان ما يضيع لو حذفت التطبيق.</span><button type="button" data-act="go" data-to="log">فعّله</button></div>';
  for (const s of doneToday) h += doneCard(s);
  if (rt) {
    h += `<section class="card hero">
      <p class="eyebrow">${doneToday.length ? 'تمرين اليوم حسب الجدول' : 'تمرين اليوم'}</p>
      <h2>${esc(rt.name)}</h2>
      <p class="sub">${cnt(rt.items.length, 'ex')} · ${cnt(routineSets(rt), 'set')}</p>
      <ul class="plan-list">${rt.items.map((it) => `<li><span>${esc(exInfo(it.ex).name)}</span><span class="num" dir="ltr">${it.sets} × ${it.reps || '–'}</span></li>`).join('')}</ul>
      <button class="btn primary block" type="button" data-act="start" data-rt="${rt.id}">${doneToday.length ? 'ابدأه مرة ثانية' : 'ابدأ التمرين'}</button>
    </section>`;
  } else {
    h += `<section class="card hero is-rest">
      <p class="eyebrow">اليوم</p>
      <h2>يوم راحة</h2>
      <p class="sub">العضل يكبر وأنت مرتاح. وإذا تبي تتمرّن، اختر تمرين من تحت.</p>
    </section>`;
  }
  h += weighCard() + weekCard();
  const others = routines().filter((r) => !rt || r.id !== rt.id);
  h += `<div class="sec-title"><h2>تمرين ثاني</h2></div><div class="choice-list">
    ${others.map((r) => `<button class="choice" type="button" data-act="start" data-rt="${r.id}"><span>${esc(r.name)}</span><span>${cnt(r.items.length, 'ex')}</span></button>`).join('')}
    <button class="choice" type="button" data-act="start" data-rt=""><span>تمرين حر</span><span>تختار التمارين بنفسك</span></button>
  </div>`;
  return { title: 'اليوم', subtitle: fmt(F.long, t), html: h, tabs: true };
}

/* ---------- session ---------- */
const TYPE_NAME = { '': 'عادية', w: 'إحماء', d: 'دروب سيت', f: 'للفشل' };
const TYPE_MARK = { w: 'إ', d: 'د', f: 'ف' };
const REST_CHOICES = [60, 90, 120, 180, 240, 300];
// Under a set (opened by tapping its number): its type, and how hard it was when that's on in settings.
function setPanelHTML(it, i, j) {
  const x = it.sets[j], eff = prefs().effort;
  let h = `<div class="set-panel" data-sp="${i}:${j}">
    <div class="seg full" role="group" aria-label="نوع الجولة ${j + 1}">${[['', 'عادية'], ['w', 'إحماء'], ['d', 'دروب'], ['f', 'للفشل']].map(([t, l]) => `<button type="button" data-act="set-type" data-i="${i}" data-j="${j}" data-t="${t}" aria-pressed="${(x.t || '') === t}">${l}</button>`).join('')}</div>`;
  if (eff === 'rpe' || eff === 'rir') {
    const cur = eff === 'rpe' ? x.rpe : x.rir;
    h += `<div class="effort"><span>${eff === 'rpe' ? 'الصعوبة (RPE)' : 'كم عدّة كان باقي (RIR)'}</span>
      <div class="chips" role="group" aria-label="${eff === 'rpe' ? 'صعوبة' : 'العدّات الباقية في'} الجولة ${j + 1}">${(eff === 'rpe' ? [6, 7, 8, 9, 10] : [0, 1, 2, 3, 4]).map((v) => `<button type="button" data-act="set-effort" data-i="${i}" data-j="${j}" data-v="${v}" aria-pressed="${cur === v}">${eff === 'rir' && v === 4 ? '4+' : v}</button>`).join('')}</div></div>
      <p class="fine">${eff === 'rpe' ? '10 يعني ما تقدر ولا عدّة زيادة، و8 يعني باقي لك عدّتين.' : '0 يعني ما تقدر ولا عدّة زيادة، و2 يعني باقي لك عدّتين.'}</p>`;
  }
  return h + '</div>';
}
// The next step for an exercise, from last time's working sets (no warm-ups or drop sets): every set at the top
// weight reached the target reps (the routine's, else 12) → a step more weight; otherwise the same weight and the
// reps to aim for. Three workouts in a row without beating what came before them → a lighter week.
function suggestFor(s, it) {
  if (!prefs().suggest || s.finishedAt) return null;
  const prev = history(it.ex).filter((h) => { const o = R.get(h.sid); return o && isBefore(o, s); });
  if (!prev.length) return null;
  const bw = isBw(it.ex), step = prefs().step;
  const score = (h) => (bw ? h.top : est1rm(h.top.w, h.top.r));
  if (prev.length >= 4) {
    const before = prev.slice(0, -3), recent = prev.slice(-3);
    const better = bw ? (a, b) => beats(a, b, true) : (a, b) => a > b;
    const bestBefore = before.reduce((a, h) => (better(score(h), a) ? score(h) : a), score(before[0]));
    if (!recent.some((h) => better(score(h), bestBefore))) {
      const top = prev[prev.length - 1].top.w;
      const light = Math.round((top * 0.6) / step) * step;
      return { text: bw || light <= 0 ? 'أرقامك هنا ثابتة آخر 3 مرات. خذ أسبوع أخف، بعدّات وجولات أقل، وبعدها ارجع.'
        : `أرقامك هنا ثابتة آخر 3 مرات. جرّب أسبوع تخفيف بحوالي ${round2(light)} كجم، وبعدها ارجع لوزنك.`, deload: true };
    }
  }
  const ws = prev[prev.length - 1].sets.filter((x) => x.t !== 'w' && x.t !== 'd');
  if (!ws.length) return null;
  const W = Math.max(...ws.map((x) => x.w));
  const atW = ws.filter((x) => x.w === W);
  const goal = (it.target && it.target.reps) || 12;
  if (atW.every((x) => x.r >= goal)) {
    const next = round2(W + step);
    const text = bw && W < 0 ? (next >= 0 ? `كمّلت ${cnt(goal, 'rep')} في كل الجولات. جرّبها بدون مساعدة.` : `كمّلت ${cnt(goal, 'rep')} في كل الجولات. قلّل المساعدة إلى ${round2(-next)} كجم.`)
      : bw && W === 0 ? `كمّلت ${cnt(goal, 'rep')} في كل الجولات. جرّب تضيف ${step} كجم.`
      : `كمّلت ${cnt(goal, 'rep')} في كل الجولات آخر مرة. جرّب ${next} كجم.`;
    return { text, w: next };
  }
  const most = Math.max(...atW.map((x) => x.r));
  return { text: `${bw && W === 0 ? 'حاول' : 'نفس الوزن، وحاول'} توصل ${cnt(goal, 'rep')} في كل الجولات. آخر مرة أكثر شي ${most}.` };
}
function exCard(s, it, i) {
  const info = exInfo(it.ex);
  const dn = it.sets.filter((x) => x.done).length;
  const bw = !!info.bw;
  const last = lastSetsFor(it.ex, s);
  const lastTxt = last
    ? `آخر مرة، ${fmt(F.dm, last.date)}${bw ? '، وزن الجسم' : ''}: <span class="num">${setsHTML(last.sets, bw)}</span>`
    : 'أول مرة تسجّل هذا التمرين';
  const prevNote = lastNoteFor(it.ex, s);
  const sug = suggestFor(s, it);
  const applied = sug && sug.w != null && it.sets.every((x) => x.done || x.t === 'w' || x.w === sug.w);
  const cur = it.sets.find((x) => !x.done) || it.sets[it.sets.length - 1];
  const p = prefs(), eff = p.effort === 'rpe' || p.effort === 'rir';
  // Set numbers count the working sets; a warm-up, a drop set and a set to failure show إ, د and ف instead.
  let n = 0;
  const marks = it.sets.map((x) => (x.t === 'w' ? TYPE_MARK.w : (n++, x.t ? TYPE_MARK[x.t] : String(n))));
  const restNow = it.rest && it.rest !== p.rest ? it.rest : 0;
  const restSel = `<select class="rest-pick" data-f="ex-rest" data-i="${i}" aria-label="الراحة بعد كل جولة في ${esc(info.name)}">
    <option value="">⏱ ${p.rest ? mmss(p.rest * 1000) : 'بدون'}</option>
    ${REST_CHOICES.filter((v) => v !== p.rest).map((v) => `<option value="${v}" ${v === restNow ? 'selected' : ''}>⏱ ${mmss(v * 1000)}</option>`).join('')}</select>`;
  const rows = it.sets.map((x, j) => `
    <div class="set-row ${x.done ? 'done' : ''}">
      <button type="button" class="n num${x.t ? ' t-' + x.t : ''}" data-act="set-panel" data-i="${i}" data-j="${j}" aria-expanded="${UI.setPanel === `${s.id}:${i}:${j}`}" aria-label="الجولة ${j + 1}، ${TYPE_NAME[x.t || '']}${effortTxt(x)}. اضغط ${eff ? 'لنوعها وصعوبتها' : 'لنوعها'}">${marks[j]}</button>
      <div class="stepper">
        <button type="button" data-act="w+" data-i="${i}" data-j="${j}" aria-label="زِد وزن الجولة ${j + 1} ${prefs().step} كجم">+</button>
        <input class="field${bw ? ' bw' : ''}" data-f="w" data-i="${i}" data-j="${j}" dir="ltr" inputmode="decimal" enterkeyhint="done" autocomplete="off" value="${bw ? bw2s(x.w) : w2s(x.w)}" placeholder="${bw ? 'وزن الجسم' : '0'}" aria-label="${bw ? 'الوزن الزايد، أو المساعدة بالسالب، في الجولة' : 'وزن الجولة'} ${j + 1} بالكيلو">
        <button type="button" data-act="w-" data-i="${i}" data-j="${j}" aria-label="نقّص وزن الجولة ${j + 1} ${prefs().step} كجم">−</button>
      </div>
      <div class="stepper">
        <button type="button" data-act="r+" data-i="${i}" data-j="${j}" aria-label="زِد عدّة في الجولة ${j + 1}">+</button>
        <input class="field" data-f="r" data-i="${i}" data-j="${j}" inputmode="numeric" enterkeyhint="done" autocomplete="off" value="${x.r || ''}" placeholder="0" aria-label="عدّات الجولة ${j + 1}">
        <button type="button" data-act="r-" data-i="${i}" data-j="${j}" aria-label="نقّص عدّة من الجولة ${j + 1}">−</button>
      </div>
      <button type="button" class="check" data-act="toggle" data-i="${i}" data-j="${j}" aria-pressed="${x.done}" aria-label="خلّصت الجولة ${j + 1}">${ICON.check}</button>
    </div>${UI.setPanel === `${s.id}:${i}:${j}` ? setPanelHTML(it, i, j) : ''}`).join('');
  const target = it.target && it.target.sets ? ` · الهدف <span dir="ltr">${it.target.sets} × ${it.target.reps || '–'}</span>` : '';
  const hint = i === 0 && !s.finishedAt && !meta.setHintSeen && it.sets.length
    ? `<p class="fine set-hint">اضغط رقم الجولة عشان تخليها إحماء أو دروب أو للفشل${eff ? '، وتسجّل صعوبتها' : ''}. الإحماء ما ينحسب في أرقامك.</p>` : '';
  return `<article class="card ex-card ${dn && dn === it.sets.length ? 'complete' : ''}">
    <div class="ex-head">
      <div><h3>${esc(info.name)}</h3><span class="tag">${esc(info.muscle)}${bw ? ' · وزن الجسم' : ''}${target}</span></div>
      <div class="ex-side"><span class="count num">${dn} / ${it.sets.length}</span>${s.finishedAt ? '' : restSel}</div>
    </div>
    <p class="last">${lastTxt}</p>
    ${sug ? `<p class="suggest${sug.deload ? ' deload' : ''}">${sug.text}${sug.w != null && !applied ? ` <button class="link" type="button" data-act="apply-suggest" data-i="${i}">طبّق</button>` : applied ? ' <span class="ok">✓</span>' : ''}</p>` : ''}
    ${prevNote ? `<p class="ex-note"><b>ملاحظتك، ${fmt(F.dm, prevNote.date)}:</b> ${esc(prevNote.note)}</p>` : ''}
    ${hint}
    <div class="sets">
      ${it.sets.length ? '<div class="set-row set-head"><span>#</span><span>' + (bw ? '+ زايد / − مساعدة' : 'الوزن (كجم)') + '</span><span>العدّات</span><span></span></div>' : ''}
      ${rows}
    </div>
    <p class="plates" data-plates="${i}">${info.bar && cur ? platesHTML(cur.w) : ''}</p>
    <label class="note-box" id="note-${i}" ${it.note ? '' : 'hidden'}><span>ملاحظة تطلع لك المرة الجاية</span>
      <textarea class="field note-field" data-f="note" data-i="${i}" rows="2" maxlength="500" placeholder="مثلًا: الكرسي على رقم 4، أو جرّب قبضة أعرض">${esc(it.note || '')}</textarea></label>
    <div class="card-actions">
      <button class="link" type="button" data-act="add-set" data-i="${i}">+ جولة</button>
      ${it.note ? '' : `<button class="link" type="button" data-act="note" data-i="${i}">+ ملاحظة</button>`}
      ${s.finishedAt ? '' : `<button class="link" type="button" data-act="swap-ex" data-i="${i}">بدّل</button>`}
      ${it.sets.length ? `<button class="link del" type="button" data-act="del-set" data-i="${i}">حذف آخر جولة</button>` : ''}
      <button class="link del" type="button" data-act="remove-ex" data-i="${i}">شيل التمرين</button>
    </div>
  </article>`;
}
const sessionMins = (s) => (s.finishedAt && s.startedAt ? Math.max(1, Math.round((s.finishedAt - s.startedAt) / 60000)) : 0);
function summaryCard(s) {
  const prs = prsBySession().get(s.id) || [];
  const mins = sessionMins(s);
  const nb = badgesFrom(s);
  return `<section class="card">
    <div class="sec-title flush"><h2>ملخّص التمرين</h2></div>
    <div class="summary">
      <div><b>${doneSets(s)}</b><span>الجولات</span></div>
      <div><b>${Math.round(volume(s)).toLocaleString('en-US')}</b><span>مجموع الكيلوات</span></div>
      <div><b>${mins || '–'}</b><span>الدقايق</span></div>
    </div>
    ${prs.length ? `<ul class="plan-list pr-list">${prs.map((p) => `<li><span><span class="pr-chip">رقم جديد</span> ${esc(exInfo(p.ex).name)}</span><span class="num">${prText(p)}</span></li>`).join('')}</ul>` : ''}
    ${nb.length ? `<ul class="plan-list badge-list">${nb.map(([, icon, name]) => `<li><span><span class="pr-chip">شارة جديدة</span> ${name}</span><span aria-hidden="true">${icon}</span></li>`).join('')}</ul>` : ''}
    ${doneSets(s) ? `<button class="btn quiet block" type="button" data-act="share-sum" data-sid="${s.id}">شارك الملخص كصورة</button>` : ''}
  </section>`;
}
/* ---------- share card ---------- */
// The finished workout as a 1080×1350 picture: name and date, the numbers, records, new badges, best sets.
// Drawn ahead of the tap, because iPhone only opens the share sheet straight from a tap.
const shareKey = (s) => `${s.id}:${s.updatedAt}`;
function drawShare(s) {
  const W = 1080, H = 1350, P = 80;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const fam = getComputedStyle(document.body).fontFamily;
  const font = (px, wt = 700) => { g.font = `${wt} ${px}px ${fam}`; };
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#15171A'); bg.addColorStop(1, '#1D2434');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.direction = 'rtl'; g.textAlign = 'right'; g.textBaseline = 'alphabetic';
  const R0 = W - P;
  let y = P + 40;
  font(34, 800); g.fillStyle = '#7FA2F6'; g.fillText('تماريني 💪', R0, y);
  g.textAlign = 'left'; font(32, 600); g.fillStyle = '#9BA0A8'; g.fillText(fmt(F.long, s.date), P, y);
  g.textAlign = 'right';
  y += 110; font(76, 800); g.fillStyle = '#ECEDEF';
  let name = s.name;
  while (g.measureText(name).width > W - 2 * P && name.length > 4) name = name.slice(0, -2);
  g.fillText(name === s.name ? name : name + '…', R0, y);
  // Three tiles: minutes, sets, kilos.
  y += 60;
  const tiles = [['الدقايق', String(sessionMins(s) || '–')], ['الجولات', String(doneSets(s))], ['مجموع الكيلوات', Math.round(volume(s)).toLocaleString('en-US')]];
  const tw = (W - 2 * P - 2 * 30) / 3;
  tiles.forEach(([label, val], k) => {
    const x = R0 - k * (tw + 30);
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.beginPath();
    if (g.roundRect) g.roundRect(x - tw, y, tw, 170, 28); else g.rect(x - tw, y, tw, 170); // older Safari
    g.fill();
    font(64, 800); g.fillStyle = '#ECEDEF'; g.textAlign = 'center'; g.fillText(val, x - tw / 2, y + 95);
    font(30, 600); g.fillStyle = '#9BA0A8'; g.fillText(label, x - tw / 2, y + 145);
  });
  g.textAlign = 'right';
  y += 170 + 90;
  const line = (label, value, color) => {
    font(38, 700); g.fillStyle = color || '#ECEDEF'; g.textAlign = 'right'; g.direction = 'rtl'; g.fillText(label, R0, y);
    font(38, 800); g.textAlign = 'left'; g.direction = 'ltr'; g.fillStyle = '#ECEDEF'; g.fillText(value, P, y);
    g.textAlign = 'right'; g.direction = 'rtl';
    y += 64;
  };
  const prs = prsBySession().get(s.id) || [];
  if (prs.length) {
    font(40, 800); g.fillStyle = '#EBBC4D'; g.fillText(`أرقام جديدة 🔥`, R0, y); y += 66;
    for (const p of prs.slice(0, 3)) line(exInfo(p.ex).name, setTxt(p.top, isBw(p.ex)));
    y += 20;
  }
  const best = s.items.map((it) => { const d = working(it.sets); return d.length ? { it, top: d.reduce((a, b) => (beats(b, a, true) ? b : a)) } : null; }).filter(Boolean);
  if (best.length) {
    font(40, 800); g.fillStyle = '#7FA2F6'; g.fillText('أفضل جولة في كل تمرين', R0, y); y += 66;
    for (const b of best.slice(0, prs.length ? 4 : 6)) { if (y > H - 200) break; line(exInfo(b.it.ex).name, setTxt(b.top, isBw(b.it.ex))); }
  }
  const nb = badgesFrom(s);
  if (nb.length && y < H - 140) {
    y += 10; font(40, 800); g.fillStyle = '#4FC987';
    g.fillText(`شارة جديدة: ${nb.map((b) => `${b[1]} ${b[2]}`).slice(0, 2).join('، ')}`, R0, y);
    y += 64;
  }
  // A short workout ends up square instead of a tall picture that's half empty.
  const out = document.createElement('canvas');
  out.width = W; out.height = Math.min(H, Math.max(1080, y + P));
  out.getContext('2d').drawImage(c, 0, 0);
  return new Promise((res) => out.toBlob((b) => res(b), 'image/jpeg', 0.92));
}
async function prepareShare(s) {
  const key = shareKey(s);
  if (UI.shareCache && UI.shareCache.key === key) return UI.shareCache;
  const blob = await drawShare(s);
  if (!blob) return null;
  UI.shareCache = { key, file: new File([blob], `tamarini-${s.date}.jpg`, { type: 'image/jpeg' }) };
  return UI.shareCache;
}
/* ---------- rest timer ---------- */
// Starts when a set is ticked (unless it was the last one) and counts down in the workout header.
let audioCtx = null;
// The exercise's own rest wins over the one in settings.
function startRest(s, it) {
  const p = prefs();
  const secs = (it && it.rest) || p.rest;
  if (!secs || s.finishedAt || doneSets(s) >= totalSets(s)) { UI.rest = null; return; }
  UI.rest = { sid: s.id, until: Date.now() + secs * 1000, total: secs * 1000, rang: false };
  // Sound can only start from a tap, so the audio is opened now for the beep later.
  if (p.restSound) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { audioCtx = null; }
  }
}
function restBox(s) {
  if (!UI.rest || UI.rest.sid !== s.id || s.finishedAt) return '';
  return `<div class="rest-box" id="rest" role="timer" aria-live="off">
    <div class="rest-row"><span id="rest-label">الراحة</span><b id="rest-time"></b><button class="link" type="button" data-act="rest-skip">تخطّي</button></div>
    <div class="bar rest-bar"><i id="rest-fill"></i></div>
  </div>`;
}
const mmss = (ms) => { const t = Math.ceil(ms / 1000); return `${Math.floor(t / 60)}:${pad(t % 60)}`; };
function tickRest() {
  const box = $('#rest', main);
  const r = UI.rest;
  if (!r) { if (box) box.remove(); return; }
  const left = r.until - Date.now();
  if (left <= 0 && !r.rang) {
    r.rang = true;
    // Coming back to the app long after the rest ended shouldn't beep.
    if (left > -3000 && document.visibilityState === 'visible') restOver();
  }
  if (left <= -8000) { UI.rest = null; if (box) box.remove(); return; }
  if (!box) return;
  box.classList.toggle('over', left <= 0);
  $('#rest-time', box).textContent = left > 0 ? mmss(left) : 'يلا!';
  $('#rest-label', box).textContent = left > 0 ? 'الراحة' : 'خلصت الراحة، الجولة الجاية';
  $('#rest-fill', box).style.width = `${Math.max(0, Math.min(100, (left / r.total) * 100))}%`;
}
function restOver() {
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  if (!prefs().restSound || !audioCtx) return;
  try {
    const t0 = audioCtx.currentTime;
    for (const d of [0, 0.25, 0.5]) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t0 + d);
      g.gain.exponentialRampToValueAtTime(0.3, t0 + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.18);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0 + d);
      o.stop(t0 + d + 0.2);
    }
  } catch (e) {}
}
setInterval(tickRest, 250);

/* ---------- keep the screen on ---------- */
// Only while an unfinished workout is on screen, and only if the setting is on.
let wakeLock = null, wakeBusy = false;
function workoutOnScreen() {
  if (UI.screen === 'today') return activeToday();
  if (UI.screen === 'session') { const s = R.get(UI.sessionId); return live(s) && !s.finishedAt ? s : null; }
  return null;
}
async function syncWakeLock() {
  if (wakeBusy || !('wakeLock' in navigator)) return;
  const want = prefs().wake && document.visibilityState === 'visible' && !!workoutOnScreen();
  wakeBusy = true;
  try {
    if (want && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!want && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (e) {
    wakeLock = null;
  } finally {
    wakeBusy = false;
  }
}

/* ---------- settings ---------- */
function screenSettings() {
  const p = prefs();
  const seg = (k, opts, label) => `<div class="seg full" role="group" aria-label="${label}">${opts.map(([v, l]) => `<button type="button" data-act="pref" data-k="${k}" data-v="${v}" aria-pressed="${String(p[k]) === String(v)}">${l}</button>`).join('')}</div>`;
  const row = (label, note, control) => `<div class="set-line"><div><b>${label}</b>${note ? `<small>${note}</small>` : ''}</div>${control}</div>`;
  const sw = (k, label, note, disabled) => `<label class="switch-line"><span><b>${label}</b>${note ? `<small>${note}</small>` : ''}</span><input type="checkbox" class="switch" role="switch" data-pref="${k}" ${p[k] ? 'checked' : ''} ${disabled ? 'disabled' : ''}></label>`;
  const wakeOk = 'wakeLock' in navigator;
  const h = `<section class="card settings">
      <h2 class="set-h">التمرين</h2>
      ${row('مؤقت الراحة', 'يبدأ لحاله كل ما تخلّص جولة، ويطلع فوق تحت شريط التقدّم', seg('rest', [[0, 'إيقاف'], [60, '1:00'], [90, '1:30'], [120, '2:00'], [180, '3:00']], 'مؤقت الراحة'))}
      ${sw('restSound', 'صوت لما تخلص الراحة', 'إذا الجوال على الصامت ما يطلع صوت', !p.rest)}
      ${sw('wake', 'الشاشة تظل شغّالة', wakeOk ? 'وقت التمرين بس، عشان ما تفتح القفل كل جولة' : 'جهازك ما يدعم هذي الخاصية', !wakeOk)}
      ${sw('coach', 'جمل تحفيزية', 'تحت شريط التقدّم وقت التمرين')}
      ${sw('suggest', 'اقتراح الوزن الجاي', 'سطر تحت «آخر مرة» يقول لك تزيد الوزن أو العدّات، أو تاخذ أسبوع أخف')}
      ${row('صعوبة الجولة', 'بعد كل جولة تختار كم كانت صعبة. RPE من 6 إلى 10، وRIR كم عدّة كان باقي لك', seg('effort', [['off', 'إيقاف'], ['rpe', 'RPE'], ['rir', 'RIR']], 'صعوبة الجولة'))}
      ${row('خطوة زر + و − للوزن', 'كم كيلو يزيد أو ينقص الوزن مع كل ضغطة', seg('step', [[1, '1'], [1.25, '1.25'], [2.5, '2.5'], [5, '5']], 'خطوة الوزن'))}
    </section>
    <section class="card settings">
      <h2 class="set-h">البار والصفائح</h2>
      ${sw('plates', 'حساب الصفائح', 'يقول لك كم صفيحة تحط على كل جهة في تمارين البار')}
      ${row('وزن البار', 'البار الأولمبي 20 كجم، وبار السيدات 15', seg('bar', [[20, '20 كجم'], [15, '15 كجم'], [10, '10 كجم']], 'وزن البار'))}
    </section>
    <section class="card settings">
      <h2 class="set-h">الأسبوع والمظهر</h2>
      ${row('بداية الأسبوع', 'للجدول ولعدّ أيام النادي', seg('weekStart', [[6, 'السبت'], [0, 'الأحد'], [1, 'الاثنين']], 'بداية الأسبوع'))}
      ${row('المظهر', 'تلقائي يمشي مع وضع الجوال', seg('theme', [['auto', 'تلقائي'], ['light', 'فاتح'], ['dark', 'داكن']], 'المظهر'))}
    </section>
    <p class="fine">الإعدادات تنحفظ مع نسختك الاحتياطية، وترجع لو ثبّت التطبيق من جديد.</p>
    <button class="btn danger block" type="button" data-act="reset-prefs">رجّع الإعدادات الافتراضية</button>`;
  return { title: 'الإعدادات', subtitle: 'الراحة، والبار، والمظهر', html: h, back: true };
}

function coachLine(s, dn) {
  if (!coachOn() || s.finishedAt || !s.items.length) return '';
  if (!UI.coach || UI.coach.sid !== s.id) UI.coach = { sid: s.id, text: pickLine(dn ? 'set' : 'start') };
  return `<p class="coach" role="status">${esc(UI.coach.text)}</p>`;
}
function screenSession(s, inline) {
  const total = totalSets(s), dn = doneSets(s);
  let h = `<div class="wk-top">
    <div class="wk-top-row"><h2>${esc(s.name)}</h2><span class="wk-count num">${dn} <small>من ${ofCnt(total, 'set')}</small></span></div>
    <div class="bar"><i style="width:${total ? Math.round((dn / total) * 100) : 0}%"></i></div>
    ${restBox(s)}
    ${coachLine(s, dn)}
  </div>`;
  if (!s.items.length) h += '<p class="empty">ما فيه تمارين للحين. أضف أول تمرين.</p>';
  s.items.forEach((it, i) => { h += exCard(s, it, i); });
  h += '<button class="btn quiet block" type="button" data-act="add-ex">+ أضف تمرين</button>';
  if (!s.finishedAt) {
    h += '<button class="btn primary block" type="button" data-act="finish">إنهاء التمرين</button>';
  } else {
    h += summaryCard(s);
    h += '<button class="btn quiet block" type="button" data-act="reopen">رجّع التمرين مفتوح</button>';
  }
  h += '<button class="btn danger block" type="button" data-act="delete-session">حذف هذا التمرين</button>';
  return {
    title: inline ? 'تمرين اليوم' : fmt(F.long, s.date),
    subtitle: s.startedAt ? `${inline ? fmt(F.long, s.date) + ' · ' : ''}بدأ ${fmt(F.time, s.startedAt)}` : '',
    html: h, tabs: inline, back: !inline,
  };
}
function screenSessionPushed() {
  const s = R.get(UI.sessionId);
  if (!live(s)) { UI.screen = UI.stack.pop() || UI.tab; return SCREENS[UI.screen](); }
  return screenSession(s, false);
}

/* ---------- plan ---------- */
function screenPlan() {
  const sch = scheduleRec();
  const rts = routines();
  const tdow = new Date().getDay();
  const opts = (sel) => '<option value="">راحة</option>' + rts.map((r) => `<option value="${r.id}" ${r.id === sel ? 'selected' : ''}>${esc(r.name)}</option>`).join('');
  let h = `<div class="sec-title"><h2>جدول الأسبوع</h2><span>يبدأ ${DAY_NAME[prefs().weekStart]}</span></div>
    <section class="card"><ul class="week-plan">
      ${dayOrder().map((d) => `<li class="${d === tdow ? 'today' : ''}"><label class="dname" for="day-${d}">${DAY_NAME[d]}</label><select class="field" id="day-${d}" data-f="day" data-day="${d}">${opts(sch && sch.days[d])}</select></li>`).join('')}
    </ul></section>`;
  h += `<div class="sec-title"><h2>التمارين اليومية</h2><span>${rts.length}</span></div>`;
  h += rts.length ? rts.map((r) => {
    const days = dayOrder().filter((d) => sch && sch.days[d] === r.id).map((d) => DAY_NAME[d]).join('، ');
    return `<button class="card routine-card" type="button" data-act="edit-routine" data-rt="${r.id}">
      <h3>${esc(r.name)}</h3>
      <p>${cnt(r.items.length, 'ex')} · ${cnt(routineSets(r), 'set')}${days ? ' · ' + days : ''}</p>
    </button>`;
  }).join('') : '<p class="empty">ما عندك تمارين يومية للحين. سوّ أول واحد وحطه في الجدول.</p>';
  h += '<button class="btn quiet block" type="button" data-act="new-routine">+ تمرين يومي جديد</button>';
  const all = exercises();
  h += `<div class="sec-title"><h2>مكتبة التمارين</h2><span>${all.length}</span></div><section class="card">`;
  for (const m of MUSCLES) {
    const list = all.filter((e) => e.muscle === m);
    if (!list.length) continue;
    h += `<details class="lib-group"><summary><h3>${esc(m)} <span class="muted">(${list.length})</span></h3></summary><ul>
      ${list.map((e) => `<li><span>${esc(e.name)}${kindTag(e)}</span>${e.builtin ? '' : `<button class="link del" type="button" data-act="del-ex" data-ex="${e.id}">حذف</button>`}</li>`).join('')}
    </ul></details>`;
  }
  h += '</section><button class="btn quiet block" type="button" data-act="new-ex">+ أضف تمرين للمكتبة</button>';
  return { title: 'الجدول', subtitle: 'جدول الأسبوع والتمارين اليومية', html: h, tabs: true };
}

/* ---------- routine editor ---------- */
function openRoutine(id) {
  const r = id ? R.get(id) : null;
  UI.draft = r
    ? { id: r.id, name: r.name, items: r.items.map((it) => ({ ...it })), isNew: false, changed: false }
    : { id: uid('rt'), name: '', items: [], isNew: true, changed: false };
  push('routine');
}
function commitDraft(silent) {
  const d = UI.draft;
  if (!d || !d.changed) return true;
  // Leaving the editor keeps the exercises even if the name was left empty.
  const name = d.name.trim() || (silent && d.items.length ? 'تمرين يومي جديد' : '');
  if (!name || !d.items.length) {
    if (!silent) toast(!name ? 'اكتب اسم للتمرين اليومي' : 'أضف تمرين واحد على الأقل');
    return false;
  }
  const rec = R.get(d.id) || { id: d.id, type: 'routine', createdAt: Date.now() };
  rec.name = name;
  rec.items = d.items.map((it) => ({ ex: it.ex, sets: Math.max(1, Math.round(it.sets) || 1), reps: Math.round(it.reps) || 0, weight: round2(it.weight || 0), ...(it.rest ? { rest: it.rest } : {}) }));
  rec.deleted = false;
  save(rec);
  d.changed = false;
  d.isNew = false;
  toast('انحفظ');
  return true;
}
function screenRoutine() {
  const d = UI.draft;
  let h = `<section class="card form"><label for="rt-name">اسم التمرين اليومي
    <input class="field" id="rt-name" data-f="rt-name" value="${esc(d.name)}" placeholder="مثلًا: صدر وتراي" enterkeyhint="done" autocomplete="off"></label></section>`;
  h += `<ol class="rt-items">${d.items.map((it, i) => `<li class="card rt-item">
    <div class="rt-item-head"><h3>${esc(exInfo(it.ex).name)}</h3>
      <div class="rt-tools">
        <button class="icon-btn" type="button" data-act="rt-up" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="انقله فوق">${ICON.up}</button>
        <button class="icon-btn" type="button" data-act="rt-down" data-i="${i}" ${i === d.items.length - 1 ? 'disabled' : ''} aria-label="انقله تحت">${ICON.down}</button>
        <button class="icon-btn" type="button" data-act="rt-remove" data-i="${i}" aria-label="شيل التمرين">${ICON.x}</button>
      </div>
    </div>
    <div class="rt-fields">
      <label>الجولات<input class="field" data-f="rt-sets" data-i="${i}" inputmode="numeric" value="${it.sets || ''}" autocomplete="off"></label>
      <label>العدّات<input class="field" data-f="rt-reps" data-i="${i}" inputmode="numeric" value="${it.reps || ''}" autocomplete="off"></label>
      <label>الوزن (كجم)<input class="field" data-f="rt-weight" data-i="${i}" dir="ltr" inputmode="decimal" value="${exInfo(it.ex).bw ? bw2s(it.weight) : w2s(it.weight)}" placeholder="${exInfo(it.ex).bw ? 'وزن الجسم' : '–'}" autocomplete="off"></label>
      <label class="rt-rest">الراحة بعد كل جولة<select class="field" data-f="rt-rest" data-i="${i}">
        <option value="">حسب الإعدادات (${prefs().rest ? mmss(prefs().rest * 1000) : 'بدون مؤقت'})</option>
        ${REST_CHOICES.map((v) => `<option value="${v}" ${it.rest === v ? 'selected' : ''}>${mmss(v * 1000)}</option>`).join('')}
      </select></label>
    </div>
  </li>`).join('')}</ol>`;
  if (!d.items.length) h += '<p class="empty">أضف التمارين اللي تسويها في هذا اليوم.</p>';
  h += '<button class="btn quiet block" type="button" data-act="rt-add-ex">+ أضف تمرين</button>';
  h += '<button class="btn primary block" type="button" data-act="rt-save">حفظ</button>';
  if (!d.isNew) h += '<button class="btn danger block" type="button" data-act="rt-delete">حذف هذا التمرين اليومي</button>';
  h += '<p class="fine">الوزن هنا للبداية بس. لما تتمرّن، التطبيق يعبّي وزن آخر مرة تلقائيًا.</p>';
  return { title: d.isNew ? 'تمرين يومي جديد' : 'تعديل التمرين اليومي', subtitle: d.name, html: h, back: true };
}

/* ---------- exercise picker ---------- */
const kindTag = (e) => (e.bar ? '<span class="bar-tag">بار</span>' : e.bw ? '<span class="bar-tag">وزن الجسم</span>' : '');
// Swapping an exercise lists the same muscle first, without the one being swapped.
function pickListHTML() {
  const q = norm(UI.pickQuery);
  const swap = UI.pickFor && UI.pickFor.kind === 'swap' ? UI.pickFor : null;
  const all = exercises().filter((e) => (!q || norm(e.name).includes(q)) && (!swap || e.id !== swap.ex));
  if (!all.length) return '<p class="empty">ما لقينا تمرين بهالاسم. أضفه من الزر تحت.</p>';
  const group = (title, list) => `<div class="pick-group"><h3>${title}</h3>${list.map((e) => `<button class="pick" type="button" data-act="pick" data-ex="${e.id}"><span>${esc(e.name)}</span>${kindTag(e)}</button>`).join('')}</div>`;
  let h = '';
  const same = swap && !q ? exInfo(swap.ex).muscle : '';
  if (same) {
    const list = all.filter((e) => e.muscle === same);
    if (list.length) h += group(`بدائل لنفس العضلة: ${esc(same)}`, list);
  }
  for (const m of MUSCLES) {
    if (m === same) continue;
    const list = all.filter((e) => e.muscle === m);
    if (list.length) h += group(esc(m), list);
  }
  return h;
}
function screenPick() {
  const p = UI.pickFor;
  const h = `<input class="field" id="pick-q" data-f="pick-q" type="search" placeholder="دوّر على تمرين" value="${esc(UI.pickQuery)}" autocomplete="off" enterkeyhint="search">
    <div id="pick-list" class="pick-list">${pickListHTML()}</div>
    <button class="btn quiet block" type="button" data-act="new-ex">+ تمرين مو موجود؟ أضفه</button>`;
  const subtitle = p && p.kind === 'swap' ? `بدال ${exInfo(p.ex).name}` : p && p.kind === 'routine' ? 'يضاف للتمرين اليومي' : 'يضاف لتمرين اليوم';
  return { title: p && p.kind === 'swap' ? 'بدّل التمرين' : 'اختر تمرين', subtitle, html: h, back: true };
}
function pickExercise(exId) {
  const p = UI.pickFor;
  let swapped = -1;
  if (p && p.kind === 'session') {
    const s = R.get(p.sid);
    if (live(s)) { s.items.push(itemFromTarget(exId, 3, 0, 0, s)); save(s); }
  } else if (p && p.kind === 'swap') {
    // Same number of working sets, the same target and rest; the weights come from the new exercise's last time.
    const s = R.get(p.sid), old = live(s) ? s.items[p.i] : null;
    if (old && old.ex === p.ex && !old.sets.some((x) => x.done)) {
      const t = old.target;
      s.items[p.i] = itemFromTarget(exId, t ? t.sets : old.sets.filter((x) => x.t !== 'w').length, t ? t.reps : 0, 0, s, old.rest);
      if (t) s.items[p.i].target = t;
      UI.setPanel = null;
      save(s);
      swapped = p.i;
      toast(`بدّلنا ${exInfo(p.ex).name} بـ ${exInfo(exId).name}`);
    }
  } else if (p && p.kind === 'routine' && UI.draft) {
    UI.draft.items.push({ ex: exId, sets: 3, reps: 10, weight: 0 });
    UI.draft.changed = true;
  }
  UI.pickQuery = '';
  back();
  if (swapped >= 0) { const c = main.querySelectorAll('.ex-card')[swapped]; if (c) c.scrollIntoView({ block: 'center' }); }
  else window.scrollTo(0, document.body.scrollHeight);
}

/* ---------- new exercise ---------- */
function screenNewEx() {
  const h = `<section class="card form">
    <label for="ne-name">اسم التمرين<input class="field" id="ne-name" placeholder="مثلًا: بنش هاك سكوات" autocomplete="off" enterkeyhint="done"></label>
    <label for="ne-muscle">العضلة<select class="field" id="ne-muscle">${MUSCLES.map((m) => `<option>${esc(m)}</option>`).join('')}</select></label>
    <label for="ne-kind">النوع<select class="field" id="ne-kind">
      <option value="">أوزان عادية (دمبل، جهاز، كيبل)</option>
      <option value="bar">بالبار الأولمبي، ويحسب لك الصفائح</option>
      <option value="bw">بوزن الجسم (عقلة، ضغط، ديبس…)</option>
    </select></label>
    <button class="btn primary block" type="button" data-act="ne-save">أضف التمرين</button>
  </section>`;
  return { title: 'تمرين جديد', subtitle: 'يضاف لمكتبة التمارين', html: h, back: true };
}

/* ---------- progress ---------- */
function niceRange(min, max) {
  const floor0 = min >= 0;
  if (min === max) { const p = Math.max(2.5, Math.abs(min) * 0.1); min -= p; max += p; }
  const raw = (max - min) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  let lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  if (floor0 && lo < 0) lo = 0;
  return { lo, hi, step };
}
// `goal` (optional) draws a flat dotted line at that value and keeps it in view.
// y is the main line; y2 is a dashed average, or with `pair` a second line of its own (left beside right).
function lineChart(pts, label, goal = 0, pair = false) {
  const W = 340, H = 200, L = 40, RR = 16, T = 18, B = 26;
  const iw = W - L - RR, ih = H - T - B;
  const xs = pts.map((p) => p.x), x0 = Math.min(...xs), x1 = Math.max(...xs);
  const yv = pts.flatMap((p) => [p.y, p.y2]).filter((v) => v != null).concat(goal ? [goal] : []);
  const { lo, hi, step } = niceRange(Math.min(...yv), Math.max(...yv));
  const sx = (x) => (x1 === x0 ? L + iw / 2 : L + ((x - x0) / (x1 - x0)) * iw);
  const sy = (y) => T + (1 - (y - lo) / (hi - lo)) * ih;
  const num = (v) => String(round2(v)).replace('-', '−'); // an assisted lift goes below 0
  let g = '';
  for (let v = lo; v <= hi + 1e-9; v += step) {
    const y = sy(v).toFixed(1);
    g += `<line class="grid" x1="${L}" x2="${W - RR}" y1="${y}" y2="${y}"/><text x="${L - 6}" y="${(+y + 3.5).toFixed(1)}" text-anchor="end">${num(v)}</text>`;
  }
  if (goal) {
    const gy = sy(goal).toFixed(1);
    g += `<line class="goal" x1="${L}" x2="${W - RR}" y1="${gy}" y2="${gy}"/><text class="goal-t" x="${L + 4}" y="${(+gy - 4).toFixed(1)}" text-anchor="start">الهدف ${round2(goal)}</text>`;
  }
  const line = (k) => pts.filter((p) => p[k] != null).map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p[k]).toFixed(1)}`).join('');
  const base = (T + ih).toFixed(1);
  const ys = pts.filter((p) => p.y != null), lastP = ys[ys.length - 1];
  const area = ys.length > 1 ? `${line('y')}L${sx(lastP.x).toFixed(1)},${base}L${sx(ys[0].x).toFixed(1)},${base}Z` : '';
  const dot = (p, k, c) => `<circle class="pt ${c}" cx="${sx(p.x).toFixed(1)}" cy="${sy(p[k]).toFixed(1)}" r="${c === 'pr' ? 4.5 : 3.2}"/>`;
  const dots = ys.map((p) => dot(p, 'y', p.pr ? 'pr' : '')).join('') + (pair ? pts.filter((p) => p.y2 != null).map((p) => dot(p, 'y2', 'b')).join('') : '');
  const endY = Math.max(T - 4, sy(lastP.y) - 9);
  const endX = Math.min(W - RR, Math.max(L + 10, sx(lastP.x)));
  let xl = `<text x="${sx(x0).toFixed(1)}" y="${H - 6}" text-anchor="${x1 === x0 ? 'middle' : 'start'}">${fmt(F.dm, x0)}</text>`;
  if (x1 !== x0) xl += `<text x="${sx(x1).toFixed(1)}" y="${H - 6}" text-anchor="end">${fmt(F.dm, x1)}</text>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
    ${g}${area ? `<path class="area" d="${area}"/>` : ''}<path class="${pair ? 'l1 b' : 'l2'}" d="${line('y2')}"/><path class="l1" d="${line('y')}"/>${dots}
    <text class="end" x="${endX.toFixed(1)}" y="${endY.toFixed(1)}" text-anchor="end">${num(lastP.y)}</text>${xl}
  </svg>`;
}
function attendanceCard() {
  const t = todayKey(), ws0 = weekStart(t), trained = trainedDates(), planned = plannedDays();
  const weeks = [];
  for (let w = 7; w >= 0; w--) {
    const ws = addDays(ws0, -7 * w);
    let c = 0;
    for (let i = 0; i < 7; i++) if (trained.has(addDays(ws, i))) c++;
    weeks.push({ ws, c, cur: w === 0 });
  }
  const full = weeks.slice(4, 7);
  const avg = round1((full.reduce((a, b) => a + b.c, 0) + weeks[3].c) / 4);
  const max = 7;
  return `<section class="card">
    <div class="sec-title flush"><h2>أيام النادي</h2><span class="num">المعدل ${avg} بالأسبوع</span></div>
    <div class="bars" role="img" aria-label="أيام التمرين في آخر 8 أسابيع، والمخطط ${planned} بالأسبوع">
      ${planned ? `<span class="target" style="bottom:${(planned / max) * 100}%"></span>` : ''}
      ${weeks.map((w) => `<div class="col ${w.cur ? 'cur' : ''}"><b style="bottom:calc(${(w.c / max) * 100}% + 2px)">${w.c}</b><i style="height:${(w.c / max) * 100}%"></i></div>`).join('')}
    </div>
    <div class="bars-x">${weeks.map((w) => `<span>${w.cur ? 'هالأسبوع' : fmt(F.dm, w.ws).replace(' ', '<br>')}</span>`).join('')}</div>
    <div class="legend"><span><i></i>أيام تمرّنت فيها</span>${planned ? `<span><i class="d"></i>المخطط: ${cnt(planned, 'day')}</span>` : ''}</div>
    ${streakLine()}
  </section>`;
}

/* ---------- streaks and badges ---------- */
// Weeks in a row with at least the planned number of training days (one day when there's no plan).
// This week joins the streak once it's met, and only breaks it after it ends.
function streaks(keep) {
  const trained = trainedDates(keep);
  if (!trained.size) return { cur: 0, best: 0 };
  const need = plannedDays() || 1;
  const ws0 = weekStart(todayKey());
  let run = 0, best = 0, cur = 0;
  for (let ws = weekStart([...trained].sort()[0]); ws <= ws0; ws = addDays(ws, 7)) {
    let c = 0;
    for (let i = 0; i < 7; i++) if (trained.has(addDays(ws, i))) c++;
    if (ws === ws0) { cur = c >= need ? run + 1 : run; best = Math.max(best, cur); break; }
    run = c >= need ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { cur, best };
}
function streakLine() {
  const st = streaks();
  if (!st.best) return '';
  return `<p class="fine streak">${st.cur ? `🔥 سلسلتك ${ofCnt(st.cur, 'week')} متتالية` : 'السلسلة وقفت. التزم بجدولك هالأسبوع وتبدأ من جديد'}${st.best > st.cur ? `، وأطول سلسلة ${ofCnt(st.best, 'week')}` : ''}.</p>`;
}
// Everything the badges look at, from the workouts keep() lets through (all of them by default).
function badgeStats(keep = () => true) {
  const ss = sessions().filter((s) => doneSets(s) > 0 && keep(s));
  let sets = 0, kgs = 0;
  for (const s of ss) { kgs += volume(s); for (const it of s.items) sets += working(it.sets).length; }
  let prs = 0;
  for (const [sid, list] of prsBySession()) { const s = R.get(sid); if (s && keep(s)) prs += list.length; }
  // A bodyweight lift done with no help after needing the machine's help on it before.
  const helped = new Set();
  let unassisted = false;
  for (const s of ss.sort((a, b) => (a.date === b.date ? (a.startedAt || 0) - (b.startedAt || 0) : a.date < b.date ? -1 : 1))) {
    for (const it of s.items) if (isBw(it.ex)) for (const x of working(it.sets)) { if (x.w < 0) helped.add(it.ex); else if (helped.has(it.ex)) unassisted = true; }
  }
  const pf = profile(), ws = weighIns();
  const dir = pf.goalKg && ws.length ? Math.sign(pf.goalKg - ws[0].kg) : 0;
  const goal = !!dir && ws.slice(1).some((r) => (dir > 0 ? r.kg >= pf.goalKg - 0.3 : r.kg <= pf.goalKg + 0.3));
  return { workouts: ss.length, sets, kgs, prs, streak: streaks(keep).best, unassisted, goal };
}
// [id, icon, name, how to earn it, (stats) => [have, need], what's left to say]
const BADGES = [
  ['w1', '🏁', 'أول تمرين', 'خلّص أول تمرين', (b) => [b.workouts, 1], (n) => ofCnt(n, 'ex')],
  ['w10', '💪', '10 تمارين', 'تمرّن 10 مرات', (b) => [b.workouts, 10], (n) => ofCnt(n, 'ex')],
  ['w50', '🏋️', '50 تمرين', 'تمرّن 50 مرة', (b) => [b.workouts, 50], (n) => ofCnt(n, 'ex')],
  ['w100', '🏆', '100 تمرين', 'تمرّن 100 مرة', (b) => [b.workouts, 100], (n) => ofCnt(n, 'ex')],
  ['s100', '🔁', '100 جولة', 'خلّص 100 جولة', (b) => [b.sets, 100], (n) => ofCnt(n, 'set')],
  ['s1000', '⚙️', '1000 جولة', 'خلّص 1000 جولة', (b) => [b.sets, 1000], (n) => ofCnt(n, 'set')],
  ['car', '🚗', 'وزن سيارة', 'ارفع 1.5 طن في المجموع', (b) => [b.kgs, 1500], (n) => kg(n)],
  ['elephant', '🐘', 'وزن فيل', 'ارفع 6 أطنان في المجموع', (b) => [b.kgs, 6000], (n) => kg(n)],
  ['bus', '🚌', 'وزن باص', 'ارفع 12 طن في المجموع', (b) => [b.kgs, 12000], (n) => kg(n)],
  ['plane', '✈️', 'وزن طيارة', 'ارفع 40 طن في المجموع', (b) => [b.kgs, 40000], (n) => kg(n)],
  ['pr1', '⭐', 'أول رقم قياسي', 'اكسر رقمك في أي تمرين', (b) => [b.prs, 1], (n) => cnt(n, 'pr')],
  ['pr10', '🌟', '10 أرقام قياسية', 'اكسر رقمك 10 مرات', (b) => [b.prs, 10], (n) => cnt(n, 'pr')],
  ['pr50', '💫', '50 رقم قياسي', 'اكسر رقمك 50 مرة', (b) => [b.prs, 50], (n) => cnt(n, 'pr')],
  ['st4', '🔥', 'سلسلة 4 أسابيع', 'التزم بجدولك 4 أسابيع ورا بعض', (b) => [b.streak, 4], (n) => ofCnt(n, 'week')],
  ['st12', '☄️', 'سلسلة 12 أسبوع', 'التزم بجدولك 12 أسبوع ورا بعض', (b) => [b.streak, 12], (n) => ofCnt(n, 'week')],
  ['free', '🦅', 'بدون مساعدة', 'سوّ جولة بدون مساعدة في تمرين كنت تحتاج فيه مساعدة', (b) => [b.unassisted ? 1 : 0, 1], null],
  ['goal', '🎯', 'وصلت هدفك', 'وصّل وزن جسمك للوزن المستهدف', (b) => [b.goal ? 1 : 0, 1], null],
];
const earnedBadges = (b) => BADGES.filter((x) => { const [have, need] = x[4](b); return have >= need; }).map((x) => x[0]);
// The badges a workout earned: the ones true with it and everything before it, but not without it.
function badgesFrom(s) {
  const upTo = (o) => o.id === s.id || isBefore(o, s);
  const before = new Set(earnedBadges(badgeStats((o) => isBefore(o, s))));
  return earnedBadges(badgeStats(upTo)).filter((id) => !before.has(id)).map((id) => BADGES.find((x) => x[0] === id));
}
function badgesCard() {
  const b = badgeStats();
  const got = new Set(earnedBadges(b));
  return `<div class="sec-title"><h2>شاراتك</h2><span class="num">${got.size} من ${BADGES.length}</span></div>
  <section class="card"><ul class="badges">${BADGES.map(([id, icon, name, how, prog, left]) => {
    const [have, need] = prog(b), on = got.has(id);
    const sub = on ? 'حصّلتها ✓' : left && have > 0 ? `باقي ${left(Math.max(0, Math.ceil(need - have)))}` : how;
    return `<li class="${on ? 'on' : ''}"><span class="b-icon" aria-hidden="true">${icon}</span><b>${name}</b><small>${sub}</small></li>`;
  }).join('')}</ul></section>`;
}

/* ---------- muscles, weekly volume, records ---------- */
// Fatigue per muscle from the last 4 days: a working set counts 1 right after it, fading to 0 at 96 hours.
const RECOVER_H = 96;
function muscleLoad() {
  const now = Date.now(), load = Object.fromEntries(MUSCLES.map((m) => [m, 0]));
  for (const s of sessions()) {
    const hrs = (now - (s.finishedAt || s.startedAt || dateOf(s.date).getTime())) / 3600e3;
    if (hrs < 0 || hrs >= RECOVER_H) continue;
    for (const it of s.items) {
      const m = exInfo(it.ex).muscle;
      if (m in load) load[m] += working(it.sets).length * (1 - hrs / RECOVER_H);
    }
  }
  return load;
}
const muscleState = (v) => (v >= 6 ? 'tired' : v >= 2 ? 'mid' : 'ready');
const STATE_NAME = { tired: 'متعبة', mid: 'تتعافى', ready: 'جاهزة' };
// A plain figure from the front (right) and the back (left). Each muscle group is a set of shapes.
function bodySVG(st) {
  const c = (m) => `m-${st[m]}`;
  const fig = (cx, front) => `
    <circle class="m-base" cx="${cx}" cy="16" r="10"/>
    <rect class="m-base" x="${cx - 4}" y="25" width="8" height="7"/>
    <rect class="m-base" x="${cx - 20}" y="32" width="40" height="56" rx="10"/>
    <rect class="m-base" x="${cx - 36}" y="73" width="9" height="24" rx="4"/><rect class="m-base" x="${cx + 27}" y="73" width="9" height="24" rx="4"/>
    <ellipse class="${c('أكتاف')}" cx="${cx - 25}" cy="40" rx="9" ry="8"/><ellipse class="${c('أكتاف')}" cx="${cx + 25}" cy="40" rx="9" ry="8"/>
    <rect class="${c(front ? 'بايسبس' : 'ترايسبس')}" x="${cx - 34}" y="48" width="10" height="23" rx="5"/><rect class="${c(front ? 'بايسبس' : 'ترايسبس')}" x="${cx + 24}" y="48" width="10" height="23" rx="5"/>
    ${front
      ? `<ellipse class="${c('صدر')}" cx="${cx - 9}" cy="47" rx="10" ry="8"/><ellipse class="${c('صدر')}" cx="${cx + 9}" cy="47" rx="10" ry="8"/>
         <rect class="${c('بطن')}" x="${cx - 9}" y="58" width="18" height="27" rx="4"/>`
      : `<path class="${c('ظهر')}" d="M${cx - 18} 34 L${cx + 18} 34 L${cx + 15} 80 Q${cx} 86 ${cx - 15} 80 Z"/>`}
    <rect class="${front ? 'm-base' : c('أرجل')}" x="${cx - 18}" y="86" width="36" height="12" rx="5"/>
    <rect class="${c('أرجل')}" x="${cx - 17}" y="99" width="15" height="42" rx="6"/><rect class="${c('أرجل')}" x="${cx + 2}" y="99" width="15" height="42" rx="6"/>
    <rect class="${c('أرجل')}" x="${cx - 15}" y="144" width="11" height="32" rx="5"/><rect class="${c('أرجل')}" x="${cx + 4}" y="144" width="11" height="32" rx="5"/>`;
  return `<svg class="body-map" viewBox="0 0 240 180" role="img" aria-label="${MUSCLES.map((m) => `${m} ${STATE_NAME[st[m]]}`).join('، ')}">${fig(180, true)}${fig(60, false)}</svg>`;
}
function musclesCard() {
  const load = muscleLoad();
  const st = Object.fromEntries(MUSCLES.map((m) => [m, muscleState(load[m])]));
  const by = (k) => MUSCLES.filter((m) => st[m] === k);
  const line = ['tired', 'mid', 'ready'].filter((k) => by(k).length).map((k) => `<span class="ms-${k}">${STATE_NAME[k]}: ${by(k).join('، ')}</span>`).join(' · ');
  return `<div class="sec-title"><h2>عضلاتك</h2><span>آخر 4 أيام</span></div>
  <section class="card muscles">
    <div class="map-wrap">${bodySVG(st)}<div class="map-x"><span>ورا</span><span>قدّام</span></div></div>
    <p class="ms-line">${line}</p>
    <div class="legend"><span><i class="sw m-tired"></i>متعبة</span><span><i class="sw m-mid"></i>تتعافى</span><span><i class="sw m-ready"></i>جاهزة</span></div>
    <p class="fine">تقدير من عدد جولاتك، وكل جولة يخف أثرها مع الوقت لين تختفي بعد 4 أيام. مو قياس طبي.</p>
  </section>`;
}
// Kilos lifted per week (weight × reps of the working sets) over the last 12 weeks, in tonnes.
function volumeCard() {
  const ws0 = weekStart(todayKey());
  const weeks = [];
  for (let w = 11; w >= 0; w--) weeks.push({ ws: addDays(ws0, -7 * w), kg: 0, cur: w === 0 });
  for (const s of sessions()) {
    const wk = weeks.find((x) => s.date >= x.ws && s.date < addDays(x.ws, 7));
    if (wk) wk.kg += volume(s);
  }
  if (!weeks.some((w) => w.kg)) return '';
  const max = Math.max(...weeks.map((w) => w.kg));
  const full = weeks.slice(0, -1).filter((w) => w.kg);
  const avg = full.length ? full.reduce((a, w) => a + w.kg, 0) / full.length : 0;
  const t = (v) => round1(v / 1000);
  return `<div class="sec-title"><h2>الحجم الأسبوعي</h2><span class="num">هالأسبوع ${t(weeks[11].kg)} طن</span></div>
  <section class="card">
    <div class="bars w12" role="img" aria-label="الطن اللي رفعته كل أسبوع، آخر 12 أسبوع">
      ${weeks.map((w) => `<div class="col ${w.cur ? 'cur' : ''}"><b style="bottom:calc(${(w.kg / max) * 100}% + 2px)">${w.kg ? t(w.kg) : ''}</b><i style="height:${(w.kg / max) * 100}%"></i></div>`).join('')}
    </div>
    <div class="bars-x w12">${weeks.map((w, k) => `<span>${w.cur ? 'هالأسبوع' : k % 3 === 2 ? fmt(F.dm, w.ws).replace(' ', '<br>') : ''}</span>`).join('')}</div>
    <p class="fine">مجموع الوزن × العدّات في جولاتك بالطن، بدون الإحماء ووزن جسمك${avg ? `. معدلك ${t(avg)} طن بالأسبوع` : ''}.</p>
  </section>`;
}
// Every exercise's best set and the day it was first done, newest record first.
function recordsCard(list) {
  const rows = [];
  for (const { e } of list) {
    const bw = isBw(e.id);
    let best = null, date = '';
    for (const h of history(e.id)) if (!best || beats(h.top, best, true)) { best = h.top; date = h.date; }
    if (best) rows.push({ e, best, date, bw });
  }
  if (!rows.length) return '';
  rows.sort((a, b) => (a.date < b.date ? 1 : -1));
  const shown = UI.recAll ? rows : rows.slice(0, 8);
  return `<div class="sec-title"><h2>أرقامك القياسية</h2><span>${cnt(rows.length, 'ex')}</span></div>
  <section class="card">
    <ul class="hist rec-list">${shown.map((r) => `<li><button class="link" type="button" data-act="rec-pick" data-ex="${r.e.id}">${esc(r.e.name)}</button><span class="sets-txt"><bdi dir="ltr">${setTxt(r.best, r.bw)}</bdi> · ${fmtDay(r.date)}</span></li>`).join('')}</ul>
    ${rows.length > 8 ? `<div><button class="link" type="button" data-act="rec-all">${UI.recAll ? 'اعرض أقل' : 'اعرض الكل'}</button></div>` : ''}
  </section>`;
}
/* ---------- body ---------- */
const bodyDraftFor = (date) => (UI.bodyDraft && UI.bodyDraft.date === date ? UI.bodyDraft.vals : {});
const RANGES =[[30, 'شهر'], [90, '3 شهور'], [365, 'سنة'], [0, 'الكل']];
const sgn = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(round1(n))}`;
const fmtDay = (k) => fmt(k.slice(0, 4) === todayKey().slice(0, 4) ? F.dm : F.dmy, k);
const kgPerWeek = (slope) => `<bdi dir="ltr">${sgn(slope * 7)}</bdi> كجم بالأسبوع`;
// Every body input carries data-body="<field>"; «سجّل» saves the ones on screen into that day's record.
function bodyForm(date, t) {
  const rec = R.get('body_' + date), cur = live(rec) ? rec : null;
  const last = weighIns().slice(-1)[0];
  const dv = bodyDraftFor(date);
  const val = (k) => (k in dv ? esc(dv[k]) : cur && cur[k] ? round2(cur[k]) : '');
  return `<div class="body-entry">
      <label>التاريخ<input class="field" type="date" id="body-date" data-f="body-date" value="${date}" max="${t}"></label>
      <label>الوزن (كجم)<input class="field" data-body="kg" inputmode="decimal" enterkeyhint="done" autocomplete="off" value="${val('kg')}" placeholder="${last ? round1(last.kg) : '0'}"></label>
      <button class="btn primary" type="button" data-act="body-save">${cur ? 'حدّث' : 'سجّل'}</button>
    </div>
    <div class="measures" id="body-measures" ${UI.bodyMore ? '' : 'hidden'}>${MEASURES.map((m) => {
      const head = m.fields.length > 1 && m === MEASURES.find((x) => x.fields.length > 1) ? `<span></span>${SIDES.map(([, side]) => `<span class="m-side">${side}</span>`).join('')}` : '';
      return `${head}<span class="m-name">${m.name}</span>${m.fields.map(([f, side]) => `<input class="field ${side ? '' : 'wide'}" data-body="${f}" inputmode="decimal" enterkeyhint="done" autocomplete="off" value="${val(f)}" placeholder="${m.unit}" aria-label="${m.name}${side ? ' ' + side : ''} (${m.unit === '%' ? '%' : 'بالسنتيمتر'})">`).join('')}`;
    }).join('')}</div>
    <div><button class="link" type="button" data-act="body-more">${UI.bodyMore ? 'أخفِ المقاسات' : '+ مقاسات الجسم'}</button></div>`;
}
function bmiHTML(kgV, cm) {
  const b = bmiInfo(kgV, cm);
  const pos = Math.min(100, Math.max(0, ((b.v - 15) / 20) * 100)); // the bar runs from 15 to 35
  return `<div class="bmi">
    <div class="bmi-top"><span>مؤشر كتلة الجسم (BMI)</span><b><bdi dir="ltr">${b.v}</bdi> · ${b.cat}</b></div>
    <div class="bmi-bar" role="img" aria-label="BMI ${b.v}، ${b.cat}"><i class="u"></i><i class="n"></i><i class="o"></i><i class="ob"></i><b style="left:${pos.toFixed(1)}%"></b></div>
    <div class="bmi-x"><span style="left:17.5%">18.5</span><span style="left:50%">25</span><span style="left:75%">30</span></div>
    <p class="fine">تقريبي، وما يفرّق بين العضل والدهون. لو جسمك عضلي، يطلع رقمك أعلى من الحقيقة.</p>
  </div>`;
}
function bodyCard() {
  const t = todayKey();
  const date = UI.bodyDate && UI.bodyDate <= t ? UI.bodyDate : t;
  const ws = weighIns(), pf = profile(), goal = pf.goalKg;
  let h = `<div class="sec-title"><h2>وزن جسمك</h2>${ws.length ? `<span>${cnt(ws.length, 'entry')}</span>` : ''}</div>
    <section class="card body-card">${bodyForm(date, t)}`;
  if (!ws.length) {
    h += '<p class="fine">وزّن نفسك مرة بالأسبوع على الأقل، الصبح قبل الأكل، عشان تكون الأرقام قابلة للمقارنة.</p>';
  } else {
    const last = ws[ws.length - 1];
    const from = UI.bodyRange ? addDays(t, -UI.bodyRange) : '0000';
    const start = (ws.find((r) => r.date >= from) || last).date;
    const first = ws.find((r) => r.date === start);
    const delta = round1(last.kg - first.kg);
    const week = ws.filter((r) => r.date > addDays(t, -7));
    const avg7 = week.length ? round1(week.reduce((a, r) => a + r.kg, 0) / week.length) : null;
    const pts = ws.map((r) => ({ date: r.date, v: r.kg }));
    const ma = movingAvg(pts, 7), slope = trend(pts, 28);
    const left = goal ? round1(goal - last.kg) : 0;
    const reached = goal && Math.abs(left) < 0.3;
    const toward = goal && delta && Math.sign(delta) === Math.sign(goal - first.kg);
    const kgs = ws.map((r) => r.kg);
    h += `<div class="stats">
      <div class="stat"><span>الحالي · ${last.date === t ? 'اليوم' : fmt(F.dm, last.date)}</span><b>${round1(last.kg)} <small>كجم</small></b></div>
      <div class="stat"><span>التغيّر في الفترة</span><b class="${toward ? 'up' : ''}" dir="ltr">${sgn(delta)} <small>كجم</small></b></div>
      <div class="stat"><span>معدل آخر 7 أيام</span><b>${avg7 == null ? '–' : `${avg7} <small>كجم</small>`}</b></div>
      ${goal ? `<div class="stat"><span>باقي على هدفك (${round1(goal)})</span><b>${reached ? 'وصلت 🎉' : `${Math.abs(left)} <small>كجم ${left < 0 ? 'تنزّلها' : 'تزيدها'}</small>`}</b></div>`
        : `<div class="stat"><span>أقل وأعلى</span><b dir="ltr">${round1(Math.min(...kgs))}–${round1(Math.max(...kgs))} <small>كجم</small></b></div>`}
    </div>`;
    let note = '';
    if (reached) note = 'وصلت هدفك! حط هدف جديد من «الهدف والطول» تحت.';
    else if (goal) {
      if (slope == null) note = 'سجّل وزنك أكثر من مرة على أسبوعين، ونقدّر لك متى توصل هدفك.';
      else if (Math.abs(slope * 7) < 0.1) note = 'وزنك ثابت تقريبًا آخر 4 أسابيع.';
      else if (Math.sign(slope) !== Math.sign(left)) note = `وزنك ماشي عكس هدفك آخر 4 أسابيع (${kgPerWeek(slope)}).`;
      else {
        const days = Math.round(left / slope);
        note = days > 730 ? `على سرعتك آخر 4 أسابيع (${kgPerWeek(slope)})، بتاخذ أكثر من سنتين توصل هدفك.`
          : `على سرعتك آخر 4 أسابيع (${kgPerWeek(slope)})، توصل هدفك تقريبًا ${fmtDay(addDays(last.date, days))}.`;
      }
    } else if (slope != null) note = `سرعتك آخر 4 أسابيع: ${kgPerWeek(slope)}.`;
    if (note) h += `<p class="fine">${note}</p>`;
    if (pf.height) h += bmiHTML(last.kg, pf.height);
    const cpts = ws.map((r, i) => ({ date: r.date, x: dateOf(r.date).getTime(), y: round1(r.kg), y2: ma[i] })).filter((p) => p.date >= start);
    h += `<div class="seg" role="group" aria-label="الفترة">${RANGES.map(([r, l]) => `<button type="button" data-act="body-range" data-r="${r}" aria-pressed="${UI.bodyRange === r}">${l}</button>`).join('')}</div>
      ${lineChart(cpts, 'وزن جسمك في كل تسجيل', goal)}
      <div class="legend"><span><i></i>وزنك</span>${cpts.some((p) => p.y2 != null) ? '<span><i class="d"></i>معدل 7 أيام</span>' : ''}${goal ? '<span><i class="g"></i>الهدف</span>' : ''}</div>`;
  }
  h += UI.bodyProfile
    ? `<div class="form profile-form">
        <div class="two"><label>الوزن المستهدف (كجم)<input class="field" id="pf-goal" inputmode="decimal" enterkeyhint="done" autocomplete="off" value="${goal ? round2(goal) : ''}" placeholder="مثلًا 75"></label>
        <label>الطول (سم)<input class="field" id="pf-height" inputmode="decimal" enterkeyhint="done" autocomplete="off" value="${pf.height || ''}" placeholder="مثلًا 175"></label></div>
        <div class="btn-row"><button class="btn primary" type="button" data-act="profile-save">احفظ</button><button class="btn quiet" type="button" data-act="body-profile">إلغاء</button></div>
      </div>`
    : `<div><button class="link" type="button" data-act="body-profile">${goal || pf.height ? `الهدف: ${goal ? round1(goal) + ' كجم' : '–'} · الطول: ${pf.height ? pf.height + ' سم' : '–'} · عدّل` : 'حدّد هدفك وطولك'}</button></div>`;
  return h + '</section>' + measuresCard() + bodyHistCard();
}
// One measure at a time; a two-sided one shows right and left side by side, and as two lines.
function measuresCard() {
  const recs = bodyRecs();
  const withM = ALL_MEASURES.filter((m) => m.fields.some(([f]) => recs.some((r) => r[f] > 0)));
  if (!withM.length) return '';
  const m = withM.find((x) => x.key === UI.bodyMeasure) || withM[0];
  const sides = m.fields.filter(([f]) => recs.some((r) => r[f] > 0));
  const ms = recs.filter((r) => sides.some(([f]) => r[f] > 0));
  const stats = sides.map(([f, side]) => {
    const xs = ms.filter((r) => r[f] > 0), first = xs[0], last = xs[xs.length - 1];
    return [`<div class="stat"><span>${side || 'الحالي'} · ${fmt(F.dm, last.date)}</span><b>${round1(last[f])} <small>${m.unit}</small></b></div>`,
      xs.length > 1 ? `<div class="stat"><span>${side ? `${side} من أول قياس` : `من أول قياس، ${fmt(F.dm, first.date)}`}</span><b dir="ltr">${sgn(last[f] - first[f])} <small>${m.unit}</small></b></div>`
        : `<div class="stat"><span>${side ? `${side}: التغيّر` : 'التغيّر'}</span><b>–</b><small class="muted">قِسه مرة ثانية وتشوفه</small></div>`];
  });
  const [a, b] = sides.map(([f]) => f);
  const pts = ms.map((r) => ({ x: dateOf(r.date).getTime(), y: r[a] > 0 ? round1(r[a]) : null, y2: b && r[b] > 0 ? round1(r[b]) : null }));
  return `<section class="card">
    <div class="sec-title flush"><h2>مقاساتك</h2><span>${cnt(ms.length, 'entry')}</span></div>
    <label class="form"><span class="sr">المقاس</span><select class="field" data-f="body-m" aria-label="اختر المقاس">${withM.map((x) => `<option value="${x.key}" ${x === m ? 'selected' : ''}>${x.name}</option>`).join('')}</select></label>
    <div class="stats" style="margin-top:12px">${stats.map((s) => s[0]).join('')}${stats.map((s) => s[1]).join('')}</div>
    ${lineChart(pts, `${m.name}${b ? ' يمين ويسار' : ''} في كل قياس`, 0, !!b)}
    ${b ? `<div class="legend"><span><i></i>يمين</span><span><i class="b"></i>يسار</span></div>` : ''}
  </section>`;
}
function bodyHistCard() {
  const recs = bodyRecs(), ws = weighIns();
  if (!recs.length) return '';
  const shown = (UI.bodyAll ? recs : recs.slice(-5)).reverse();
  const row = (r) => {
    const parts = [];
    if (r.kg) {
      const prev = ws.filter((o) => o.date < r.date).pop();
      parts.push(`<bdi dir="ltr">${round1(r.kg)}</bdi> كجم${prev ? ` <bdi dir="ltr">(${sgn(r.kg - prev.kg)})</bdi>` : ''}`);
    }
    for (const m of ALL_MEASURES) {
      const vs = m.fields.filter(([f]) => r[f] > 0).map(([f, side]) => `${side ? side + ' ' : ''}<bdi dir="ltr">${round1(r[f])}${m.unit === '%' ? '%' : ''}</bdi>`);
      if (vs.length) parts.push(`${m.name} ${vs.join(' و')}`);
    }
    return `<li><button class="link" type="button" data-act="body-pick" data-d="${r.date}">${fmt(F.dm, r.date)}</button><span class="sets-txt">${parts.join(' · ')}</span><button class="link del" type="button" data-act="body-del" data-id="${r.id}">حذف</button></li>`;
  };
  return `<section class="card">
    <div class="sec-title flush"><h2>تسجيلاتك</h2><span>${cnt(recs.length, 'entry')}</span></div>
    <ul class="hist body-hist">${shown.map(row).join('')}</ul>
    ${recs.length > 5 ? `<div><button class="link" type="button" data-act="body-all">${UI.bodyAll ? 'اعرض أقل' : 'اعرض الكل'}</button></div>` : ''}
  </section>`;
}
// Under the lift's numbers: the best lift as a multiple of body weight, or a bodyweight move's total load.
function strengthLine(all, bw) {
  if (!weighIns().length) return `<p class="fine" style="margin-top:8px">سجّل وزن جسمك فوق، ويطلع لك هنا ${bw ? 'الحمل الكلي: وزن جسمك مع الزايد أو ناقص المساعدة' : 'كم مرة ترفع من وزن جسمك'}.</p>`;
  if (bw) return ''; // the stats above already show the total load
  let x = all[0];
  for (const y of all) if (y.top.w >= x.top.w) x = y;
  if (!x.top.w) return '';
  const b = bodyKgOn(x.date).kg;
  return `<p class="fine" style="margin-top:8px">أعلى وزن <bdi dir="ltr">${round2(x.top.w)}</bdi> كجم = <b><bdi dir="ltr">${round2(x.top.w / b)}×</bdi></b> وزن جسمك (كان ${round1(b)} كجم).</p>`;
}

function screenProgress() {
  let h = bodyCard() + attendanceCard();
  const withData = [];
  for (const e of [...BUILTIN, ...[...R.values()].filter((r) => r.type === 'exercise')]) {
    const hs = history(e.id);
    if (hs.length) withData.push({ e, last: hs[hs.length - 1].date });
  }
  withData.sort((a, b) => (a.last < b.last ? 1 : -1));
  if (!withData.length) {
    h += '<div class="sec-title"><h2>تقدّم الأوزان</h2></div><section class="card"><p class="empty">خلّص أول تمرين وبيطلع لك هنا رسم يوضح كيف أوزانك تزيد.</p></section>';
    h += badgesCard();
    return { title: 'التقدّم', subtitle: 'جسمك وأوزانك وأيام النادي', html: h, tabs: true };
  }
  h += musclesCard();
  const exId = withData.some((w) => w.e.id === UI.progEx) ? UI.progEx : withData[0].e.id;
  const all = history(exId);
  const from = UI.progRange ? addDays(todayKey(), -UI.progRange) : '0000';
  let hs = all.filter((x) => x.date >= from);
  if (!hs.length) hs = all.slice(-1);
  const bw = isBw(exId);
  // A bodyweight lift with a weigh-in shows its total load: the body that day plus what's added, or minus the
  // machine's help. «العدّات» switches it to reps. Without a weigh-in it shows the added weight, or reps if none.
  const hasBody = bw && weighIns().length > 0;
  const byReps = hasBody ? UI.progMetric === 'reps' : all.every((x) => !x.top.w);
  const load = hasBody && !byReps;
  if (load) for (const x of all) { x.body = round1(bodyKgOn(x.date).kg); x.load = round1(x.body + x.top.w); }
  const val = (x) => (byReps ? x.reps : load ? x.load : x.top.w);
  const bestX = all.reduce((a, x) => (val(x) >= val(a) ? x : a));
  const best = val(bestX);
  const maxReps = Math.max(...all.map((x) => x.reps));
  const helped = bw && all.some((x) => x.top.w < 0);
  const lineName = byReps ? 'أكثر عدّات' : load ? 'الحمل الكلي' : bw ? (helped ? 'الزايد، والمساعدة بالسالب' : 'أعلى وزن زايد') : 'أعلى وزن';
  const bestName = byReps ? 'أكثر عدّات' : load ? 'أعلى حمل كلي' : bw ? (best < 0 ? 'أقل مساعدة' : 'أعلى وزن زايد') : 'أعلى وزن';
  const bestE1X = all.reduce((a, x) => (x.e1 > a.e1 ? x : a));
  const bestE1 = bestE1X.e1;
  const last = all[all.length - 1];
  const first = hs[0];
  const delta = round2(val(last) - val(first));
  // The word after a number: 3–10 take the plural (8 عدّات), the rest the singular (12 عدّة).
  const repWord = (n) => (Math.abs(n) % 100 >= 3 && Math.abs(n) % 100 <= 10 ? 'عدّات' : 'عدّة');
  const unitFor = (n) => (byReps ? repWord(n) : 'كجم');
  const numFor = (n) => (byReps || load || !bw ? round2(n) : bw2s(n) || '0');
  // Under a total load: what it was made of that day.
  const parts = (x) => `<small>جسمك ${x.body} كجم${x.top.w > 0 ? ` + ${round2(x.top.w)} زايد` : x.top.w < 0 ? ` − ${round2(-x.top.w)} مساعدة` : ''}</small>`;
  const pts = hs.map((x) => ({ x: dateOf(x.date).getTime(), y: val(x), y2: load ? x.body : byReps || bw ? null : round1(x.e1), pr: x.pr }));
  const hint = !bw ? '' : hasBody ? 'تمرين بوزن الجسم: الحمل الكلي هو وزن جسمك يومها، مع الوزن الزايد أو ناقص مساعدة الجهاز.'
    : 'تمرين بوزن الجسم: الرقم لحاله عدد العدّات، و«+» وزن زايد فوق وزن جسمك، و«−» مساعدة الجهاز.';
  h += `<div class="sec-title"><h2>تقدّم الأوزان</h2></div>
  <section class="card">
    <label class="form"><span class="sr">التمرين</span><select class="field" id="prog-ex" data-f="prog-ex" aria-label="اختر التمرين">${withData.map((w) => `<option value="${w.e.id}" ${w.e.id === exId ? 'selected' : ''}>${esc(w.e.name)}</option>`).join('')}</select></label>
    ${hasBody ? `<div class="seg" role="group" aria-label="وش يعرض" style="margin-top:12px">${[['load', 'الحمل الكلي'], ['reps', 'العدّات']].map(([m, l]) => `<button type="button" data-act="prog-metric" data-m="${m}" aria-pressed="${(m === 'reps') === byReps}">${l}</button>`).join('')}</div>` : ''}
    ${hint ? `<p class="fine" style="margin-top:8px">${hint}</p>` : ''}
    <div class="stats" style="margin-top:12px">
      <div class="stat"><span>${bestName}</span><b dir="ltr">${bestName === 'أقل مساعدة' ? round2(-best) : numFor(best)} <small>${unitFor(best)}</small></b>${load ? parts(bestX) : ''}</div>
      ${byReps ? `<div class="stat"><span>آخر مرة</span><b>${last.reps} <small>${repWord(last.reps)}</small></b></div>`
        : bw ? `<div class="stat"><span>أكثر عدّات</span><b>${maxReps} <small>${repWord(maxReps)}</small></b></div>`
        : `<div class="stat"><span>أقصى وزن لعدّة وحدة (تقدير)</span><b>${Math.round(bestE1)} <small>كجم</small></b><small>من <bdi dir="ltr">${setTxt(bestE1X.e1Set, false)}</bdi> · ${fmtDay(bestE1X.date)}</small></div>`}
      ${byReps ? `<div class="stat"><span>عدد الجلسات</span><b>${all.length}</b></div>`
        : `<div class="stat"><span>آخر مرة</span><b dir="ltr" class="num">${load ? `${last.load}×${last.top.r}` : setTxt(last.top, bw)}</b>${load ? parts(last) : ''}</div>`}
      <div class="stat"><span>التغيّر في الفترة</span><b class="${delta > 0 ? 'up' : ''}" dir="ltr">${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(delta)} <small>${unitFor(delta)}</small></b></div>
    </div>
    ${strengthLine(all, bw)}
    <div class="seg" role="group" aria-label="الفترة" style="margin-top:14px">${RANGES.map(([r, l]) => `<button type="button" data-act="range" data-r="${r}" aria-pressed="${UI.progRange === r}">${l}</button>`).join('')}</div>
    ${lineChart(pts, `${exInfo(exId).name}: ${lineName} في كل تمرين`)}
    <div class="legend"><span><i></i>${lineName}</span>${load ? '<span><i class="d"></i>وزن جسمك يومها</span>' : byReps || bw ? '' : '<span><i class="d"></i>أقصى وزن تقديري لعدّة وحدة</span>'}<span><i class="p"></i>رقم جديد</span></div>
  </section>
  <section class="card">
    <div class="sec-title flush"><h2>آخر الجلسات</h2><span>${cnt(all.length, 'sess')}</span></div>
    <ul class="hist">${all.slice(-10).reverse().map((x) => `<li${x.note ? ' class="has-note"' : ''}><span>${fmt(F.dm, x.date)} ${x.pr ? '<span class="pr-chip">رقم جديد</span>' : ''}</span><span class="sets-txt">${setsHTML(x.sets, bw)}</span>${x.note ? `<p class="hist-note">${esc(x.note)}</p>` : ''}</li>`).join('')}</ul>
  </section>`;
  h += recordsCard(withData) + volumeCard() + badgesCard();
  return { title: 'التقدّم', subtitle: 'جسمك وأوزانك وأيام النادي', html: h, tabs: true };
}

/* ---------- log ---------- */
function syncCard() {
  const st = syncState();
  let h = `<section class="card sync-card">
    <div class="sec-title flush"><h2>النسخ الاحتياطي</h2></div>
    <div class="sync-state" data-s="${st.s}" role="status"><i></i><span>${esc(st.long)}</span></div>`;
  if (meta.sync && !UI.linkEdit) {
    h += `<p class="fine">كل تغيير يرتفع لجدولك في Google Sheets أول ما يكون فيه إنترنت. لو حذفت التطبيق، ثبّته من جديد والصق نفس الرابط، وترجع بياناتك كلها.</p>
      <div class="btn-row"><button class="btn primary" type="button" data-act="sync-now">ارفع الحين</button><button class="btn quiet" type="button" data-act="copy-link">انسخ رابط المزامنة</button></div>
      <div><button class="link" type="button" data-act="edit-link">غيّر الرابط</button></div>`;
  } else {
    h += `<p class="fine">${meta.sync ? 'الصق الرابط الجديد. كل اللي على الجوال بيرتفع له.' : 'تقدمك محفوظ على هذا الجوال بس. الصق رابط المزامنة عشان تنحفظ نسخة في Google Sheets.'}</p>
      <div class="form">
        <label for="sync-link">رابط المزامنة<textarea class="field" id="sync-link" data-f="link" rows="3" placeholder="https://script.google.com/macros/s/…/exec#…" autocapitalize="off" autocomplete="off" spellcheck="false">${esc(UI.linkDraft)}</textarea></label>
        <button class="btn primary block" type="button" data-act="connect">اربط</button>
        <p class="msg" id="link-msg" role="status"></p>
        <div><a class="link" href="help.html">ما عندك رابط؟ هذي طريقة تسويه</a></div>
        ${UI.linkEdit ? '<button class="link" type="button" data-act="cancel-link">إلغاء</button>' : ''}
      </div>`;
  }
  h += `<p class="fine">وللاحتياط الزيادة، احفظ ملف نسخة في «الملفات» على iCloud Drive كل فترة.</p>
    <div class="btn-row"><button class="btn quiet" type="button" data-act="export">احفظ ملف نسخة</button><button class="btn quiet" type="button" data-act="import">رجّع من ملف</button></div>
    <input type="file" id="import-file" accept=".json,application/json" hidden>
  </section>`;
  return h;
}
function screenLog() {
  let h = syncCard();
  h += '<button class="choice" type="button" data-act="open-settings"><span>الإعدادات</span><span>مؤقت الراحة، البار، المظهر…</span></button>';
  const list = sessionsDesc();
  const prs = prsBySession();
  h += `<div class="sec-title"><h2>التمارين السابقة</h2><span>${list.length}</span></div>`;
  if (!list.length) h += '<p class="empty">ما فيه تمارين للحين. ابدأ أول تمرين من تبويب «اليوم».</p>';
  let month = '';
  let open = false;
  for (const s of list) {
    const m = s.date.slice(0, 7);
    if (m !== month) {
      if (open) h += '</div>';
      h += `<h3 class="month-h">${fmt(F.my, s.date)}</h3><div>`;
      month = m;
      open = true;
    }
    h += `<button class="sess" type="button" data-act="open-session" data-sid="${s.id}">
      <div><h3>${esc(s.name)}</h3><p class="num">${cnt(doneSets(s), 'set')} · ${kg(volume(s))} ${prs.has(s.id) ? '<span class="pr-chip">رقم جديد</span>' : ''}${s.finishedAt ? '' : ' · مفتوح'}</p></div>
      <span class="when">${fmt(F.wd, s.date)}<br>${fmt(F.dm, s.date)}</span>
    </button>`;
  }
  if (open) h += '</div>';
  return { title: 'السجل', subtitle: 'تمارينك والنسخ الاحتياطي', html: h, tabs: true };
}

const SCREENS = {
  setup: screenSetup, today: screenToday, plan: screenPlan, progress: screenProgress, log: screenLog,
  session: screenSessionPushed, routine: screenRoutine, pick: screenPick, newex: screenNewEx, settings: screenSettings,
};

/* ============================== actions ============================== */
// The rest last picked for this exercise, so a free workout keeps it too.
function lastRestFor(exId) {
  for (const s of sessionsDesc()) {
    const it = s.items.find((i) => i.ex === exId && i.rest);
    if (it) return it.rest;
  }
  return 0;
}
// A new exercise in a workout: last time's warm-ups first, then the working sets with last time's weights.
function itemFromTarget(ex, sets, reps, weight, s, rest) {
  const last = lastSetsFor(ex, s);
  const warm = last ? last.sets.filter((x) => x.t === 'w') : [];
  const work = last ? last.sets.filter((x) => x.t !== 'w') : [];
  const n = Math.max(1, sets || 3);
  const it = {
    ex,
    target: sets && reps ? { sets, reps } : null,
    sets: [
      ...warm.map((x) => ({ w: x.w, r: x.r, done: false, t: 'w' })),
      ...Array.from({ length: n }, (_, j) => {
        const ls = work.length ? work[Math.min(j, work.length - 1)] : null;
        return { w: (ls && ls.w) || weight || 0, r: reps || (ls && ls.r) || 0, done: false };
      }),
    ],
  };
  const r = rest || lastRestFor(ex);
  if (r) it.rest = r;
  return it;
}
function startSession(rtId) {
  const rt = rtId ? R.get(rtId) : null;
  const s = {
    id: uid('ss'), type: 'session', date: todayKey(),
    routine: live(rt) ? rt.id : null, name: live(rt) ? rt.name : 'تمرين حر',
    startedAt: Date.now(), finishedAt: null, items: [],
  };
  if (live(rt)) s.items = rt.items.map((it) => itemFromTarget(it.ex, it.sets, it.reps, it.weight, s, it.rest));
  save(s);
  go('today');
}

const actions = {
  go: (b) => go(b.dataset.to),
  start: (b) => startSession(b.dataset.rt),
  'open-session': (b) => { UI.sessionId = b.dataset.sid; push('session'); },

  'w+': (b) => tapStep(b),
  'w-': (b) => tapStep(b),
  'r+': (b) => tapStep(b),
  'r-': (b) => tapStep(b),
  toggle: (b) => {
    const s = curSession(); if (!s) return;
    const it = s.items[+b.dataset.i], x = it && it.sets[+b.dataset.j];
    if (!x) return;
    x.done = !x.done;
    const key = `${s.id}:${b.dataset.i}:${b.dataset.j}`;
    if (x.done) {
      if (!x.r && it.target && it.target.reps) x.r = it.target.reps;
      const nx = it.sets[+b.dataset.j + 1];
      if (nx && !nx.done && !nx.w) nx.w = x.w;
      if (coachOn() && !s.finishedAt) {
        const line = lineAfterSet(s, +b.dataset.i, +b.dataset.j);
        UI.coach = { sid: s.id, text: line.text };
        if (line.pr) toast(line.text);
      }
      startRest(s, it);
      // With effort on, the set's panel opens right away to ask how hard it was.
      const e = prefs().effort;
      if ((e === 'rpe' || e === 'rir') && x.t !== 'w') UI.setPanel = key;
    } else if (UI.setPanel === key) UI.setPanel = null;
    save(s);
    render();
  },
  // Opened and closed in place, so numbers being typed elsewhere on the card stay.
  'set-panel': (b) => {
    const s = curSession(); if (!s) return;
    const i = +b.dataset.i, j = +b.dataset.j, key = `${s.id}:${i}:${j}`;
    const open = main.querySelector('.set-panel');
    const wasThis = open && open.dataset.sp === `${i}:${j}`;
    if (open) open.remove();
    for (const o of main.querySelectorAll('[data-act="set-panel"][aria-expanded="true"]')) o.setAttribute('aria-expanded', 'false');
    if (!meta.setHintSeen) { setMeta('setHintSeen', true); const h = main.querySelector('.set-hint'); if (h) h.remove(); }
    if (wasThis) { UI.setPanel = null; return; }
    UI.setPanel = key;
    b.closest('.set-row').insertAdjacentHTML('afterend', setPanelHTML(s.items[i], i, j));
    b.setAttribute('aria-expanded', 'true');
  },
  'set-type': (b) => {
    const s = curSession(); if (!s) return;
    const x = s.items[+b.dataset.i] && s.items[+b.dataset.i].sets[+b.dataset.j]; if (!x) return;
    if (b.dataset.t) x.t = b.dataset.t; else delete x.t;
    save(s);
    render();
  },
  // Tapping the chosen value again clears it. Picking one closes the panel.
  'set-effort': (b) => {
    const s = curSession(); if (!s) return;
    const x = s.items[+b.dataset.i] && s.items[+b.dataset.i].sets[+b.dataset.j]; if (!x) return;
    const k = prefs().effort === 'rir' ? 'rir' : 'rpe', v = +b.dataset.v;
    if (x[k] === v) delete x[k];
    else { x[k] = v; UI.setPanel = null; }
    save(s);
    render();
  },
  'apply-suggest': (b) => {
    const s = curSession(); if (!s) return;
    const it = s.items[+b.dataset.i]; if (!it) return;
    const sug = suggestFor(s, it); if (!sug || sug.w == null) return;
    for (const x of it.sets) if (!x.done && x.t !== 'w') x.w = sug.w;
    save(s);
    render();
    toast(`حطّينا ${isBw(it.ex) ? extraTxt(sug.w) : round2(sug.w) + ' كجم'} في الجولات الباقية`);
  },
  'swap-ex': (b) => {
    const s = curSession(); if (!s) return;
    const i = +b.dataset.i, it = s.items[i]; if (!it) return;
    if (it.sets.some((x) => x.done)) { toast('خلّصت جولات في هذا التمرين. أضف التمرين الجديد بدال ما تبدّله.'); return; }
    UI.pickFor = { kind: 'swap', sid: s.id, i, ex: it.ex };
    UI.pickQuery = '';
    push('pick');
  },
  'add-set': (b) => {
    const s = curSession(); if (!s) return;
    const it = s.items[+b.dataset.i]; if (!it) return;
    const lastSet = it.sets[it.sets.length - 1];
    it.sets.push({ w: lastSet ? lastSet.w : 0, r: lastSet ? lastSet.r : (it.target && it.target.reps) || 0, done: false });
    save(s);
    render();
  },
  'del-set': (b) => {
    const s = curSession(); if (!s) return;
    const it = s.items[+b.dataset.i]; if (!it || !it.sets.length) return;
    if (it.sets[it.sets.length - 1].done && !armed(b, 'متأكد؟ اضغط مرة ثانية')) return;
    it.sets.pop();
    UI.setPanel = null;
    save(s);
    render();
  },
  'remove-ex': (b) => {
    const s = curSession(); if (!s) return;
    if (!armed(b, 'متأكد؟ اضغط مرة ثانية')) return;
    s.items.splice(+b.dataset.i, 1);
    UI.setPanel = null;
    save(s);
    render();
  },
  'add-ex': () => {
    const s = curSession(); if (!s) return;
    UI.pickFor = { kind: 'session', sid: s.id };
    UI.pickQuery = '';
    push('pick');
  },
  finish: () => {
    const s = curSession(); if (!s) return;
    flushPending();
    UI.rest = null;
    s.finishedAt = Date.now();
    save(s);
    Sync.run();
    UI.tab = 'today';
    UI.stack = ['today'];
    UI.sessionId = s.id;
    UI.screen = 'session';
    UI.setPanel = null;
    render();
    window.scrollTo(0, document.body.scrollHeight);
    const nb = badgesFrom(s);
    toast(nb.length ? `عافية عليك! شارة جديدة: ${nb[0][1]} ${nb[0][2]}${nb.length > 1 ? `، و${nb.length - 1} غيرها في الملخص` : ''}` : 'عافية عليك! انحفظ التمرين');
  },
  reopen: () => {
    const s = curSession(); if (!s) return;
    s.finishedAt = null;
    save(s);
    if (s.date === todayKey()) go('today'); else render();
  },
  'delete-session': (b) => {
    const s = curSession(); if (!s) return;
    if (!armed(b, 'متأكد؟ اضغط مرة ثانية للحذف')) return;
    s.deleted = true;
    s.items = [];
    save(s);
    toast('انحذف التمرين');
    if (UI.screen === 'session') back(); else render();
  },

  'edit-routine': (b) => openRoutine(b.dataset.rt),
  'new-routine': () => openRoutine(null),
  'rt-up': (b) => moveItem(+b.dataset.i, -1),
  'rt-down': (b) => moveItem(+b.dataset.i, 1),
  'rt-remove': (b) => { UI.draft.items.splice(+b.dataset.i, 1); UI.draft.changed = true; render(); },
  'rt-add-ex': () => { UI.pickFor = { kind: 'routine' }; UI.pickQuery = ''; push('pick'); },
  'rt-save': () => {
    if (!UI.draft.changed && !UI.draft.isNew) { back(); return; }
    UI.draft.changed = true;
    if (commitDraft(false)) { UI.screen = UI.stack.pop() || UI.tab; render(); }
  },
  'rt-delete': (b) => {
    if (!armed(b, 'متأكد؟ اضغط مرة ثانية للحذف')) return;
    const rec = R.get(UI.draft.id);
    if (rec) { rec.deleted = true; save(rec); }
    const sch = scheduleRec();
    if (sch) {
      let touched = false;
      for (const d of Object.keys(sch.days)) if (sch.days[d] === UI.draft.id) { sch.days[d] = null; touched = true; }
      if (touched) save(sch);
    }
    UI.draft = null;
    UI.screen = UI.stack.pop() || UI.tab;
    render();
    toast('انحذف');
  },

  pick: (b) => pickExercise(b.dataset.ex),
  'new-ex': () => { UI.newExFor = UI.screen === 'pick' ? UI.pickFor : null; push('newex'); },
  'ne-save': () => {
    const name = $('#ne-name').value.trim();
    if (!name) { toast('اكتب اسم التمرين'); return; }
    const kind = $('#ne-kind').value;
    const rec = { id: uid('ex'), type: 'exercise', name, muscle: $('#ne-muscle').value, bar: kind === 'bar', bw: kind === 'bw' };
    save(rec);
    const forPick = UI.newExFor;
    UI.screen = UI.stack.pop() || UI.tab;
    if (forPick && UI.screen === 'pick') { UI.pickFor = forPick; pickExercise(rec.id); }
    else { render(); toast('انضاف للمكتبة'); }
  },
  'del-ex': (b) => {
    if (!armed(b, 'متأكد؟')) return;
    const rec = R.get(b.dataset.ex);
    if (rec) { rec.deleted = true; save(rec); render(); }
  },

  range: (b) => { UI.progRange = +b.dataset.r; render(); },
  'prog-metric': (b) => { UI.progMetric = b.dataset.m; render(); },
  'rec-all': () => { UI.recAll = !UI.recAll; render(); },
  // The picture is usually ready from when the summary showed; without the share sheet it downloads.
  'share-sum': async (b) => {
    const s = R.get(b.dataset.sid); if (!live(s)) return;
    const c = await prepareShare(s).catch(() => null);
    if (!c) { toast('ما قدرنا نجهّز الصورة'); return; }
    if (navigator.canShare && navigator.canShare({ files: [c.file] })) {
      try { await navigator.share({ files: [c.file] }); } catch (e) {
        // iPhone opens the share sheet only straight from a tap; the picture is ready for the next one.
        if (e && e.name === 'NotAllowedError') toast('الصورة جاهزة، اضغط «شارك» مرة ثانية');
        else if (!e || e.name !== 'AbortError') toast('ما انفتحت المشاركة');
      }
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(c.file);
    a.download = c.file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    toast('نزّلنا الصورة');
  },
  // A record picks its exercise in «تقدّم الأوزان» above and scrolls up to it.
  'rec-pick': (b) => {
    UI.progEx = b.dataset.ex;
    render();
    const sel = $('#prog-ex');
    if (sel) sel.closest('.card').scrollIntoView({ block: 'start', behavior: 'smooth' });
  },
  // Opened in place (no render), so a weight or reps being typed on the card stays.
  note: (b) => {
    const box = $(`#note-${b.dataset.i}`);
    if (!box) return;
    box.hidden = false;
    b.hidden = true;
    box.querySelector('textarea').focus();
  },

  'body-save': () => {
    const t = todayKey(), dEl = $('#body-date');
    const date = dEl && /^\d{4}-\d{2}-\d{2}$/.test(dEl.value) && dEl.value <= t ? dEl.value : t;
    const vals = {};
    for (const el of main.querySelectorAll('[data-body]')) vals[el.dataset.body] = round2(toNum(el.value));
    for (const [k, v] of Object.entries(vals)) {
      const [lo, hi, name, unit] = bodyLimits(k);
      if (v && (v < lo || v > hi)) { toast(`${name} لازم ${k === 'fat' ? 'تكون' : 'يكون'} بين ${lo} و${hi}${unit === '%' ? '%' : ' ' + unit}`); return; }
    }
    const old = R.get('body_' + date);
    const rec = live(old) ? old : { id: 'body_' + date, type: 'body', date };
    // Only the fields on screen change, so saving the weight alone keeps that day's measurements.
    const next = Object.assign({}, rec, vals);
    if (!BODY_KEYS.some((k) => next[k] > 0)) { toast(live(old) ? 'لمسح هذا اليوم، اضغط «حذف» في تسجيلاتك' : 'اكتب وزنك أول'); return; }
    Object.assign(rec, vals, { deleted: false });
    save(rec);
    UI.bodyDraft = null;
    toast(date === t ? (UI.screen === 'today' ? 'انحفظ وزنك. تشوف تقدّمه في «التقدّم»' : 'انحفظ') : `انحفظ ${fmt(F.dm, date)}`);
    render();
  },
  // Shown and hidden in place (no render), so a weight typed but not saved yet stays in its field.
  'body-more': (b) => {
    UI.bodyMore = !UI.bodyMore;
    $('#body-measures').hidden = !UI.bodyMore;
    b.textContent = UI.bodyMore ? 'أخفِ المقاسات' : '+ مقاسات الجسم';
  },
  'body-range': (b) => { UI.bodyRange = +b.dataset.r; render(); },
  'body-profile': () => { UI.bodyProfile = !UI.bodyProfile; render(); },
  'body-all': () => { UI.bodyAll = !UI.bodyAll; render(); },
  'body-pick': (b) => {
    UI.bodyDate = b.dataset.d;
    render();
    $('#body-date').scrollIntoView({ block: 'center', behavior: 'smooth' });
  },
  'body-del': (b) => {
    if (!armed(b, 'متأكد؟')) return;
    const rec = R.get(b.dataset.id);
    if (rec) { rec.deleted = true; save(rec); render(); }
  },
  'body-snooze': async () => { await setMeta('bodySnooze', addDays(todayKey(), 3)); render(); },
  'profile-save': () => {
    const goal = round2(toNum($('#pf-goal').value));
    let height = toNum($('#pf-height').value);
    if (height > 0 && height < 3) height *= 100; // typed in meters
    height = Math.round(height);
    if (goal && (goal < 20 || goal > 400)) { toast('الهدف لازم يكون بين 20 و400 كجم'); return; }
    if (height && (height < 100 || height > 250)) { toast('الطول لازم يكون بين 100 و250 سم'); return; }
    const old = R.get('profile');
    const rec = live(old) ? old : { id: 'profile', type: 'profile' };
    Object.assign(rec, { goalKg: goal, height, deleted: false });
    save(rec);
    UI.bodyProfile = false;
    toast('انحفظ');
    render();
  },

  'setup-connect': async (b) => {
    b.disabled = true;
    const res = await connect($('#sync-link').value);
    b.disabled = false;
    if (!res) return;
    const seeded = await seedIfEmpty();
    await setMeta('setup', true);
    go('today');
    toast(res.got && !seeded ? `رجّعنا ${ofCnt(res.got, 'rec')}` : 'انربط. جهّزنا لك جدول تقدر تعدّل عليه');
  },
  'setup-skip': async () => {
    await seedIfEmpty();
    await setMeta('setup', true);
    go('today');
  },
  connect: async (b) => {
    b.disabled = true;
    const res = await connect($('#sync-link').value);
    b.disabled = false;
    if (!res) return;
    UI.linkEdit = false;
    render();
    toast(res.got ? `انربط ورجّعنا ${ofCnt(res.got, 'rec')}` : 'انربط. كل تغيير بيرتفع للجدول');
  },
  'sync-now': () => Sync.run({ pull: true }),
  'edit-link': () => { UI.linkEdit = true; render(); },
  'cancel-link': () => { UI.linkEdit = false; render(); },
  'copy-link': async () => {
    const text = `${meta.sync.url}#${meta.sync.key}`;
    try { await navigator.clipboard.writeText(text); toast('نسخنا الرابط. احفظه في الملاحظات'); }
    catch (e) { toast('ما قدرنا ننسخ. تلقى الرابط في جدولك: قائمة تماريني ثم رابط المزامنة'); }
  },
  export: () => exportBackup(),
  import: () => $('#import-file').click(),

  'open-settings': () => push('settings'),
  pref: (b) => {
    const k = b.dataset.k;
    setPref(k, TEXT_PREFS.has(k) ? b.dataset.v : Number(b.dataset.v));
    render();
  },
  'reset-prefs': (b) => {
    if (!armed(b, 'متأكد؟ اضغط مرة ثانية')) return;
    const r = R.get('prefs');
    if (r) { r.values = {}; save(r); }
    applyTheme();
    render();
    toast('رجعت الإعدادات الافتراضية');
  },
  'rest-skip': () => { UI.rest = null; tickRest(); },
};
// One step of a + or − button (data-act w+, w-, r+, r-). Returns the session it changed.
function stepSet(b) {
  const s = curSession(); if (!s) return null;
  const i = +b.dataset.i, j = +b.dataset.j, f = b.dataset.act[0];
  const x = s.items[i] && s.items[i].sets[j];
  if (!x) return null;
  const d = (b.dataset.act[1] === '+' ? 1 : -1) * (f === 'w' ? prefs().step : 1);
  // On a bodyweight lift − keeps going below 0, into the machine's help.
  const bw = f === 'w' && isBw(s.items[i].ex);
  x[f] = Math.max(bw ? -500 : 0, round2((x[f] || 0) + d));
  const el = main.querySelector(`input[data-f="${f}"][data-i="${i}"][data-j="${j}"]`);
  if (el) el.value = f === 'w' ? (bw ? bw2s(x.w) : w2s(x.w)) : x.r || '';
  if (f === 'w') updatePlates(s, i);
  return s;
}
// Holding + or − keeps stepping, faster the longer it's held. The workout is saved once, on release.
const STEP_ACTS = new Set(['w+', 'w-', 'r+', 'r-']);
const hold = { b: null, timer: 0, n: 0, skipClickUntil: 0 };
function tapStep(b) {
  if (Date.now() < hold.skipClickUntil) return; // the click that ends a hold
  const s = stepSet(b);
  if (s) { save(s); render(); }
}
function holdTick() {
  stepSet(hold.b);
  hold.n++;
  hold.timer = setTimeout(holdTick, hold.n < 5 ? 150 : hold.n < 15 ? 80 : 40);
}
function holdEnd() {
  if (!hold.b) return;
  clearTimeout(hold.timer);
  hold.b = null;
  if (!hold.n) return; // a short tap: its click does the step
  hold.skipClickUntil = Date.now() + 400;
  const s = curSession();
  if (s) { save(s); render(); }
}
function moveItem(i, d) {
  const items = UI.draft.items, j = i + d;
  if (j < 0 || j >= items.length) return;
  [items[i], items[j]] = [items[j], items[i]];
  UI.draft.changed = true;
  render();
}
function updatePlates(s, i) {
  const el = main.querySelector(`[data-plates="${i}"]`);
  const it = s.items[i];
  if (!el || !it) return;
  const cur = it.sets.find((x) => !x.done) || it.sets[it.sets.length - 1];
  el.innerHTML = exInfo(it.ex).bar && cur ? platesHTML(cur.w) : '';
}

/* ============================== events ============================== */
main.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || !main.contains(b) || b.disabled) return;
  const fn = actions[b.dataset.act];
  if (fn) fn(b);
});
// A touch that turns into a scroll is cancelled before the hold starts, so scrolling never changes a number.
main.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || e.button !== 0 || !STEP_ACTS.has(b.dataset.act)) return;
  holdEnd();
  Object.assign(hold, { b, n: 0, timer: setTimeout(holdTick, 400) });
});
for (const t of ['pointerup', 'pointercancel']) window.addEventListener(t, holdEnd);
main.addEventListener('pointerout', (e) => { if (e.target === hold.b) holdEnd(); });
// «Done» on the keyboard saves the body form it's in.
main.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.isComposing) return;
  const el = e.target;
  if (el.dataset && el.dataset.body) { e.preventDefault(); actions['body-save'](); }
  else if (el.id === 'pf-goal' || el.id === 'pf-height') { e.preventDefault(); actions['profile-save'](); }
});
main.addEventListener('input', (e) => {
  const el = e.target, f = el.dataset.f;
  if (el.dataset.body) {
    const dEl = $('#body-date'), date = dEl ? dEl.value : todayKey();
    if (!UI.bodyDraft || UI.bodyDraft.date !== date) UI.bodyDraft = { date, vals: {} };
    UI.bodyDraft.vals[el.dataset.body] = el.value;
    return;
  }
  if (!f) return;
  const i = +el.dataset.i, j = +el.dataset.j;
  if (f === 'w' || f === 'r') {
    const s = curSession();
    const x = s && s.items[i] && s.items[i].sets[j];
    if (!x) return;
    x[f] = f === 'w' ? (isBw(s.items[i].ex) ? toSigned(el.value) : toNum(el.value)) : Math.round(toNum(el.value));
    save(s, { soon: true });
    if (f === 'w') updatePlates(s, i);
  } else if (f === 'note') {
    const s = curSession();
    const it = s && s.items[i];
    if (!it) return;
    it.note = el.value.slice(0, 500);
    save(s, { soon: true });
  } else if (f === 'rt-name') {
    UI.draft.name = el.value; UI.draft.changed = true;
  } else if (f === 'rt-sets' || f === 'rt-reps' || f === 'rt-weight') {
    const it = UI.draft.items[i]; if (!it) return;
    const k = f.slice(3);
    it[k] = k === 'weight' ? (exInfo(it.ex).bw ? toSigned(el.value) : toNum(el.value)) : Math.round(toNum(el.value));
    UI.draft.changed = true;
  } else if (f === 'link') {
    UI.linkDraft = el.value;
  } else if (f === 'pick-q') {
    UI.pickQuery = el.value;
    $('#pick-list').innerHTML = pickListHTML();
  }
});
main.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'import-file') { const file = el.files && el.files[0]; el.value = ''; if (file) importBackup(file); return; }
  if (el.dataset.f === 'day') {
    const sch = scheduleRec() || { id: 'schedule', type: 'schedule', days: {} };
    sch.days = Object.assign({}, sch.days, { [el.dataset.day]: el.value || null });
    save(sch);
    render();
  } else if (el.dataset.f === 'prog-ex') {
    UI.progEx = el.value;
    render();
  } else if (el.dataset.f === 'body-date') {
    UI.bodyDate = el.value || null;
    UI.bodyDraft = null; // the fields fill with the picked day's values
    render();
  } else if (el.dataset.f === 'body-m') {
    UI.bodyMeasure = el.value;
    render();
  } else if (el.dataset.f === 'ex-rest') {
    // A rest already counting down keeps going; the new one starts after the next set.
    const s = curSession();
    const it = s && s.items[+el.dataset.i];
    if (!it) return;
    if (+el.value) it.rest = +el.value; else delete it.rest;
    save(s);
  } else if (el.dataset.f === 'rt-rest') {
    const it = UI.draft && UI.draft.items[+el.dataset.i];
    if (!it) return;
    if (+el.value) it.rest = +el.value; else delete it.rest;
    UI.draft.changed = true;
  } else if (el.dataset.pref) {
    setPref(el.dataset.pref, el.checked);
    render();
  }
});
main.addEventListener('focusout', () => {
  setTimeout(() => { if (UI.dirtyRender && !isField(document.activeElement)) render(); }, 0);
});
$('#back').addEventListener('click', back);
$('#syncDot').addEventListener('click', () => go('log'));
$('#gear').addEventListener('click', () => push('settings'));
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (b) { if (UI.screen === 'routine') commitDraft(true); go(b.dataset.tab); }
});
window.addEventListener('online', () => Sync.run());
window.addEventListener('offline', renderSyncState);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    holdEnd();
    flushPending();
    // Mid-workout the phone gets locked between every set; the 10-minute upload covers that.
    if (outbox.size && !activeToday()) Sync.run({ keepalive: true });
  } else {
    if (Sync.conf && (Sync.error || Date.now() - Sync.lastPullAt > PULL_EVERY_MS)) Sync.run({ pull: true });
    else if (outbox.size && !activeToday()) Sync.run();
    safeRender();
  }
  syncWakeLock();
});
setInterval(renderSyncState, 60000);

/* ============================== boot ============================== */
async function boot() {
  try { await openDB(); await loadAll(); } catch (e) { storageBroken = true; }
  if (meta.sync && meta.sync.url) {
    Sync.conf = { url: meta.sync.url, key: meta.sync.key };
    Sync.lastPull = meta.sync.lastPull || 0;
  }
  if (meta.prefs && meta.prefs.coach === false && !R.get('prefs')) setPref('coach', false);
  applyTheme();
  UI.screen = meta.setup || storageBroken ? 'today' : 'setup';
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if (Sync.conf) Sync.run({ pull: true });
}
boot();
})();
