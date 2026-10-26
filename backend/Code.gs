/**
 * تماريني: النسخة الاحتياطية في Google Sheets.
 *
 * كل سجل من التطبيق (تمرين، تمرين يومي، جدول، جلسة) ينحفظ صف في ورقة "records".
 * لو وصل نفس السجل مرتين، يبقى اللي updatedAt حقه أحدث.
 *
 * الإعداد مذكور بالتفصيل في SETUP.md:
 *   1. الصق هذا الملف في Extensions > Apps Script داخل جدول Google Sheets جديد.
 *   2. Deploy > New deployment > Web app، وخلّ Execute as: Me و Who has access: Anyone.
 *   3. شغّل الدالة setup مرة وحدة، وانسخ "رابط المزامنة" من السجل (Execution log).
 */

var SHEET_NAME = 'records';
var HEADERS = ['id', 'type', 'updatedAt', 'deleted', 'syncedAt', 'json'];
var MAX_CELL = 49000; // Sheets allows 50,000 characters per cell.

function setup() {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('KEY');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    props.setProperty('KEY', key);
  }
  sheet_();
  var url = ScriptApp.getService().getUrl() || '';
  Logger.log('المفتاح: ' + key);
  if (/\/exec$/.test(url)) {
    Logger.log('رابط المزامنة (انسخه كامل وأرسله لصاحب الجوال):');
    Logger.log(url + '#' + key);
  } else {
    Logger.log('خذ رابط Web app من نافذة النشر (ينتهي بـ /exec)، واكتب بعده # وبعدها المفتاح اللي فوق.');
  }
}

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
    var key = PropertiesService.getScriptProperties().getProperty('KEY');
    if (!key || body.key !== key) return json_({ ok: false, error: 'bad_key' });
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
    var hit = index[rec.id];
    if (hit) {
      if (row[2] > hit.updatedAt) {
        sh.getRange(hit.row, 1, 1, HEADERS.length).setValues([row]);
        hit.updatedAt = row[2];
        applied++;
      }
    } else if (appendAt[rec.id] !== undefined) {
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
