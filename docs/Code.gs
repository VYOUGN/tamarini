/**
 * تماريني: النسخة الاحتياطية في Google Sheets.
 *
 * كل شخص يسوي جدوله في حسابه هو، فبياناته ما تروح لأحد ثاني.
 * كل سجل من التطبيق (تمرين، تمرين يومي، جدول، جلسة) ينحفظ صف في ورقة «السجلات»،
 * ولو وصل نفس السجل مرتين يبقى اللي updatedAt حقه أحدث.
 *
 * الخطوات بالتفصيل في صفحة «سوّ نسختك الاحتياطية» داخل التطبيق (help.html):
 *   1. الصق هذا الملف في Extensions > Apps Script داخل جدول Google Sheets جديد.
 *   2. Deploy > New deployment > Web app، وخلّ Execute as: Me و Who has access: Anyone.
 *   3. حدّث صفحة الجدول، ومن قائمة «تماريني» اختر «رابط المزامنة».
 */

var SHEET_NAME = 'السجلات';
var HEADERS = ['id', 'type', 'updatedAt', 'deleted', 'syncedAt', 'json'];
var MAX_CELL = 49000; // Sheets allows 50,000 characters per cell.

/* ============================== menu ============================== */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('تماريني')
    .addItem('رابط المزامنة', 'menuShowLink')
    .addItem('رابط جديد (يوقف القديم)', 'menuNewLink')
    .addToUi();
}

function menuShowLink() {
  var ui = SpreadsheetApp.getUi();
  var url = execUrl_(ui);
  if (!url) return;
  sheet_();
  showLink_('رابط المزامنة', url + '#' + state_().key,
    'الصق هذا الرابط في تطبيق تماريني، واحفظه في الملاحظات. لو حذفت التطبيق، تلصقه مرة ثانية وترجع بياناتك. لا تعطيه أحد.');
}

function menuNewLink() {
  var ui = SpreadsheetApp.getUi();
  var ok = ui.alert('رابط جديد؟', 'الرابط القديم بيوقف، ولازم تلصق الجديد في التطبيق من تبويب «السجل» ثم «غيّر الرابط». بياناتك ما تتأثر.', ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  var url = execUrl_(ui);
  if (!url) return;
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    state_();
    PropertiesService.getScriptProperties().setProperty('KEY', newKey_());
  } finally {
    lock.releaseLock();
  }
  showLink_('الرابط الجديد', url + '#' + state_().key, 'الرابط القديم وقف. الصق هذا في التطبيق من تبويب «السجل» ثم «غيّر الرابط».');
}

/* ============================== key and link ============================== */

// The key belongs to this spreadsheet. If someone copies a spreadsheet that already has one,
// the copy gets its own key, so the copy can never accept the original's link.
function state_() {
  var props = PropertiesService.getScriptProperties();
  var id = SpreadsheetApp.getActiveSpreadsheet().getId();
  if (props.getProperty('SHEET_ID') !== id || !props.getProperty('KEY')) {
    props.setProperty('SHEET_ID', id);
    props.setProperty('KEY', newKey_());
    props.deleteProperty('EXEC_URL');
  }
  return { key: props.getProperty('KEY') };
}

function newKey_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
}

// getUrl() sometimes returns the /dev link, which only works for the owner; the app needs /exec.
function execUrl_(ui) {
  state_();
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('EXEC_URL');
  if (url) return url;
  var guess = ScriptApp.getService().getUrl() || '';
  if (/\/exec$/.test(guess)) { props.setProperty('EXEC_URL', guess); return guess; }
  var r = ui.prompt('رابط Web app', 'الصق رابط Web app اللي نسخته من نافذة النشر (Deploy). لازم ينتهي بـ /exec', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return null;
  url = r.getResponseText().trim();
  if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) {
    ui.alert('هذا مو رابط Web app. لازم يبدأ بـ https://script.google.com وينتهي بـ /exec. إذا ما نشرت السكربت للحين: Deploy ثم New deployment ثم Web app.');
    return null;
  }
  props.setProperty('EXEC_URL', url);
  return url;
}

function showLink_(title, link, note) {
  var html = '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7">'
    + '<p style="margin:0 0 10px">' + esc_(note) + '</p>'
    + '<textarea id="l" readonly onclick="this.select()" style="width:100%;height:72px;direction:ltr;font-family:monospace;font-size:12px">' + esc_(link) + '</textarea>'
    + '<p><button onclick="var t=document.getElementById(\'l\');t.select();document.execCommand(\'copy\');this.textContent=\'تم النسخ\'">انسخ الرابط</button></p></div>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(480).setHeight(260), title);
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
    if (typeof body.key !== 'string' || body.key !== state_().key) return json_({ ok: false, error: 'bad_key' });
    var sh = sheet_();
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

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
