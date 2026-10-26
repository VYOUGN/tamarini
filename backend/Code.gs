/**
 * تماريني: النسخة الاحتياطية في Google Sheets.
 *
 * جدول واحد يخدم أكثر من شخص: لكل شخص مفتاح خاص (داخل رابط مزامنته) وورقة باسمه.
 * كل سجل من التطبيق (تمرين، تمرين يومي، جدول، جلسة) ينحفظ صف في ورقة صاحبه،
 * ولو وصل نفس السجل مرتين يبقى اللي updatedAt حقه أحدث.
 *
 * الإعداد مذكور بالتفصيل في SETUP.md:
 *   1. الصق هذا الملف في Extensions > Apps Script داخل جدول Google Sheets جديد.
 *   2. Deploy > New deployment > Web app، وخلّ Execute as: Me و Who has access: Anyone.
 *   3. حدّث صفحة الجدول، وبتطلع قائمة «تماريني». منها «أضف شخص» يعطيك رابط مزامنة لكل شخص.
 */

var HEADERS = ['id', 'type', 'updatedAt', 'deleted', 'syncedAt', 'json'];
var MAX_CELL = 49000; // Sheets allows 50,000 characters per cell.

/* ============================== menu ============================== */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('تماريني')
    .addItem('أضف شخص', 'menuAddUser')
    .addItem('روابط الأشخاص', 'menuShowLinks')
    .addSeparator()
    .addItem('رابط جديد لشخص', 'menuRotateKey')
    .addItem('أوقف شخص', 'menuRemoveUser')
    .addToUi();
}

function menuAddUser() {
  var ui = SpreadsheetApp.getUi();
  var url = execUrl_(ui);
  if (!url) return;
  var r = ui.prompt('أضف شخص', 'اكتب اسم الشخص، مثلًا: أحمد', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var name = r.getResponseText().trim();
  if (!name) { ui.alert('ما كتبت اسم.'); return; }
  var added = addUser_(name);
  showLinks_('رابط المزامنة: ' + added.sheet, [{ name: added.sheet, link: url + '#' + added.key }],
    'أرسل هذا الرابط لـ ' + name + ' بس. يلصقه في التطبيق مرة وحدة، وبياناته تنحفظ في ورقة «' + added.sheet + '».');
}

function menuShowLinks() {
  var ui = SpreadsheetApp.getUi();
  var url = execUrl_(ui);
  if (!url) return;
  var users = users_();
  var keys = Object.keys(users);
  if (!keys.length) { ui.alert('ما فيه أشخاص للحين. استخدم «أضف شخص».'); return; }
  showLinks_('روابط الأشخاص', keys.map(function (k) { return { name: users[k].sheet, link: url + '#' + k }; }),
    'كل رابط لشخص واحد بس. لا تعطي شخصين نفس الرابط.');
}

function menuRotateKey() {
  var ui = SpreadsheetApp.getUi();
  var url = execUrl_(ui);
  if (!url) return;
  var key = pickUser_(ui, 'رابط جديد لشخص');
  if (!key) return;
  var res = rotateKey_(key);
  showLinks_('الرابط الجديد: ' + res.sheet, [{ name: res.sheet, link: url + '#' + res.key }],
    'الرابط القديم وقف. أرسل هذا الرابط له، ويلصقه في التطبيق من تبويب «السجل» ثم «غيّر الرابط». بياناته ما تتأثر.');
}

function menuRemoveUser() {
  var ui = SpreadsheetApp.getUi();
  var key = pickUser_(ui, 'أوقف شخص');
  if (!key) return;
  var name = users_()[key].sheet;
  var ok = ui.alert('أوقف ' + name + '؟', 'رابطه بيوقف وتطبيقه ما عاد يرفع له نسخة. ورقته تبقى في الجدول.', ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  removeUser_(key);
  ui.alert('وقف رابط ' + name + '. ورقته باقية في الجدول.');
}

/* ============================== people ============================== */

function users_() {
  var raw = PropertiesService.getScriptProperties().getProperty('USERS');
  try { return raw ? JSON.parse(raw) : {}; } catch (err) { return {}; }
}

function saveUsers_(users) {
  PropertiesService.getScriptProperties().setProperty('USERS', JSON.stringify(users));
}

function userFor_(key) {
  if (typeof key !== 'string' || !key) return null;
  var users = users_();
  return Object.prototype.hasOwnProperty.call(users, key) ? users[key] : null;
}

function newKey_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
}

function addUser_(name) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var users = users_();
    var sheet = uniqueSheetName_(name, users);
    sheet_(sheet);
    var key = newKey_();
    users[key] = { name: name, sheet: sheet, added: Date.now() };
    saveUsers_(users);
    return { key: key, sheet: sheet };
  } finally {
    lock.releaseLock();
  }
}

function rotateKey_(oldKey) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var users = users_();
    var u = users[oldKey];
    delete users[oldKey];
    var key = newKey_();
    users[key] = u;
    saveUsers_(users);
    return { key: key, sheet: u.sheet };
  } finally {
    lock.releaseLock();
  }
}

function removeUser_(key) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var users = users_();
    delete users[key];
    saveUsers_(users);
  } finally {
    lock.releaseLock();
  }
}

// A sheet name nobody has used yet, including people who were stopped.
function uniqueSheetName_(name, users) {
  var base = String(name).replace(/[\[\]*?\/\\:']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'شخص';
  var taken = {};
  SpreadsheetApp.getActiveSpreadsheet().getSheets().forEach(function (s) { taken[s.getName()] = true; });
  Object.keys(users).forEach(function (k) { taken[users[k].sheet] = true; });
  var out = base;
  for (var i = 2; taken[out]; i++) out = base + ' ' + i;
  return out;
}

function pickUser_(ui, title) {
  var users = users_();
  var keys = Object.keys(users);
  if (!keys.length) { ui.alert('ما فيه أشخاص للحين. استخدم «أضف شخص».'); return null; }
  var names = keys.map(function (k) { return users[k].sheet; });
  var r = ui.prompt(title, 'اكتب اسم الشخص مثل ما هو هنا:\n' + names.join('، '), ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return null;
  var want = r.getResponseText().trim();
  for (var i = 0; i < keys.length; i++) if (users[keys[i]].sheet === want) return keys[i];
  ui.alert('ما لقينا «' + want + '». اكتب الاسم مثل ما هو في القائمة.');
  return null;
}

// getUrl() sometimes returns the /dev link, which only works for you; the app needs /exec.
function execUrl_(ui) {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('EXEC_URL');
  if (url) return url;
  var guess = ScriptApp.getService().getUrl() || '';
  if (/\/exec$/.test(guess)) { props.setProperty('EXEC_URL', guess); return guess; }
  var r = ui.prompt('رابط Web app', 'الصق رابط Web app من نافذة النشر (Deploy). لازم ينتهي بـ /exec', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return null;
  url = r.getResponseText().trim();
  if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) {
    ui.alert('هذا مو رابط Web app. لازم يبدأ بـ https://script.google.com وينتهي بـ /exec');
    return null;
  }
  props.setProperty('EXEC_URL', url);
  return url;
}

function showLinks_(title, list, note) {
  var html = '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7">'
    + '<p style="margin:0 0 8px">' + esc_(note) + '</p>'
    + list.map(function (x) {
      return '<p style="margin:14px 0 4px;font-weight:bold">' + esc_(x.name) + '</p>'
        + '<textarea readonly onclick="this.select()" style="width:100%;height:64px;direction:ltr;font-family:monospace;font-size:12px">' + esc_(x.link) + '</textarea>';
    }).join('')
    + '<p style="color:#666;font-size:12px">اضغط على الرابط عشان تحدده كامل، بعدين انسخه.</p></div>';
  var out = HtmlService.createHtmlOutput(html).setWidth(480).setHeight(Math.min(560, 170 + list.length * 110));
  SpreadsheetApp.getUi().showModalDialog(out, title);
}

function esc_(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/* ============================== sync endpoint ============================== */

function doGet() {
  return json_({ ok: true, app: 'tamarini', note: 'هذا رابط مزامنة تماريني. التطبيق يستخدمه، ما يحتاج تفتحه.' });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
  } catch (err) {
    return json_({ ok: false, error: 'busy' });
  }
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var user = userFor_(body.key);
    if (!user) return json_({ ok: false, error: 'bad_key' });
    var sh = sheet_(user.sheet);
    if (body.op === 'ping') return json_({ ok: true, count: Math.max(0, sh.getLastRow() - 1) });
    if (body.op === 'push') return json_(push_(sh, body.records || []));
    if (body.op === 'pull') return json_(pull_(sh, Number(body.since) || 0));
    return json_({ ok: false, error: 'bad_op' });
  } catch (err) {
    return json_({ ok: false, error: 'server: ' + err });
  } finally {
    lock.releaseLock();
  }
}

function push_(sh, records) {
  var now = Date.now();
  var n = sh.getLastRow() - 1;
  var index = {};
  if (n > 0) {
    var rows = sh.getRange(2, 1, n, 3).getValues();
    for (var i = 0; i < rows.length; i++) index[String(rows[i][0])] = { row: i + 2, updatedAt: Number(rows[i][2]) || 0 };
  }
  var appends = [];
  var appendAt = {};
  var applied = 0;
  var rejected = [];
  for (var j = 0; j < records.length; j++) {
    var rec = records[j];
    if (!rec || typeof rec.id !== 'string' || !rec.id) continue;
    var text = JSON.stringify(rec.data === undefined ? null : rec.data);
    if (text.length > MAX_CELL) { rejected.push(rec.id); continue; }
    var row = [rec.id, String(rec.type || ''), Number(rec.updatedAt) || 0, rec.deleted ? true : false, now, text];
    var hit = Object.prototype.hasOwnProperty.call(index, rec.id) ? index[rec.id] : null;
    if (hit) {
      if (row[2] > hit.updatedAt) {
        sh.getRange(hit.row, 1, 1, HEADERS.length).setValues([row]);
        hit.updatedAt = row[2];
        applied++;
      }
    } else if (Object.prototype.hasOwnProperty.call(appendAt, rec.id)) {
      if (row[2] > appends[appendAt[rec.id]][2]) appends[appendAt[rec.id]] = row;
    } else {
      appendAt[rec.id] = appends.length;
      appends.push(row);
      applied++;
    }
  }
  if (appends.length) {
    // Plain text keeps Sheets from turning ids or JSON into dates or formulas.
    var range = sh.getRange(sh.getLastRow() + 1, 1, appends.length, HEADERS.length);
    range.setNumberFormats(appends.map(function () { return ['@', '@', '0', '@', '0', '@']; }));
    range.setValues(appends);
  }
  return { ok: true, applied: applied, rejected: rejected, serverTime: now };
}

function pull_(sh, since) {
  var now = Date.now();
  var n = sh.getLastRow() - 1;
  var records = [];
  if (n > 0) {
    var rows = sh.getRange(2, 1, n, HEADERS.length).getValues();
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!(Number(r[4]) > since)) continue;
      var data = null;
      try { data = JSON.parse(r[5]); } catch (err) { continue; }
      records.push({ id: String(r[0]), type: String(r[1]), updatedAt: Number(r[2]) || 0, deleted: r[3] === true || r[3] === 'TRUE' || r[3] === 'true', data: data });
    }
  }
  return { ok: true, records: records, serverTime: now };
}

function sheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
