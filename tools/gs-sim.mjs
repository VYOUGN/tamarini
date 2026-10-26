// Runs backend/Code.gs in Node with small stand-ins for the Apps Script services it uses,
// so the sync endpoint and the people menu can be tested without a Google account.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const CODE = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'Code.gs');

function makeSheet(name) {
  const rows = [];
  const formats = [];
  // Like Sheets: a cell formatted as plain text ('@') stores what you write as text.
  const store = (v, f) => (f === '@' && v !== '' && typeof v !== 'string' ? String(v).toUpperCase() === 'TRUE' || String(v).toUpperCase() === 'FALSE' ? String(v).toUpperCase() : String(v) : v);
  const range = (r, c, nr = 1, nc = 1) => ({
    getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => {
      const row = rows[r - 1 + i];
      return row && row[c - 1 + j] !== undefined ? row[c - 1 + j] : '';
    })),
    setValues(vals) {
      vals.forEach((vr, i) => {
        const ri = r - 1 + i;
        while (rows.length <= ri) rows.push([]);
        vr.forEach((v, j) => { rows[ri][c - 1 + j] = store(v, (formats[ri] || [])[c - 1 + j]); });
      });
      return this;
    },
    setNumberFormats(f) {
      f.forEach((fr, i) => { const ri = r - 1 + i; formats[ri] = formats[ri] || []; fr.forEach((x, j) => { formats[ri][c - 1 + j] = x; }); });
      return this;
    },
    setFontWeight() { return this; },
  });
  return { getName: () => name, getLastRow: () => rows.length, getRange: range, setFrozenRows() {}, rows };
}

// Pass the same `props` with a different `sheetId` to simulate someone copying a spreadsheet.
export function loadCodeGs({ devUrl = 'https://script.google.com/macros/s/SIM/dev', sheetId = 'sheet-1', props = new Map() } = {}) {
  const sheets = new Map([['Sheet1', makeSheet('Sheet1')]]);
  const prompts = []; // queued answers: string = OK with that text, null = Cancel
  const log = { alerts: [], dialogs: [], menu: [] };
  const Button = { OK: 'OK', CANCEL: 'CANCEL', YES: 'YES', NO: 'NO' };
  const ui = {
    Button,
    ButtonSet: { OK_CANCEL: 'OK_CANCEL', YES_NO: 'YES_NO' },
    prompt(title, msg) {
      if (!prompts.length) throw new Error(`unexpected prompt: ${title}`);
      const a = prompts.shift();
      return { getSelectedButton: () => (a === null ? Button.CANCEL : Button.OK), getResponseText: () => a || '' };
    },
    alert(title, msg, buttons) { log.alerts.push([title, msg].filter(Boolean).join(' | ')); return buttons === 'YES_NO' ? Button.YES : Button.OK; },
    showModalDialog(out, title) { log.dialogs.push({ title, html: out.getContent() }); },
    createMenu(name) {
      const m = { addItem(label, fn) { log.menu.push([label, fn]); return m; }, addSeparator() { return m; }, addToUi() {} };
      return m;
    },
  };
  const ctx = vm.createContext({
    JSON, Date, Math, Number, String, Object, Array,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (props.has(k) ? props.get(k) : null), setProperty: (k, v) => { props.set(k, String(v)); }, deleteProperty: (k) => { props.delete(k); } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { getUuid: () => randomUUID() },
    ScriptApp: { getService: () => ({ getUrl: () => devUrl }) },
    ContentService: { MimeType: { JSON: 'JSON' }, createTextOutput: (s) => ({ setMimeType() { return this; }, getContent: () => s }) },
    HtmlService: { createHtmlOutput: (h) => ({ setWidth() { return this; }, setHeight() { return this; }, getContent: () => h }) },
    SpreadsheetApp: {
      getUi: () => ui,
      getActiveSpreadsheet: () => ({
        getId: () => sheetId,
        getSheetByName: (n) => sheets.get(n) || null,
        insertSheet: (n) => { if (sheets.has(n)) throw new Error(`sheet exists: ${n}`); const s = makeSheet(n); sheets.set(n, s); return s; },
        getSheets: () => [...sheets.values()],
      }),
    },
  });
  vm.runInContext(readFileSync(CODE, 'utf8'), ctx, { filename: 'Code.gs' });
  const call = (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).getContent());
  const lastLink = () => {
    const d = log.dialogs[log.dialogs.length - 1];
    const m = d && d.html.match(/>(https:[^<]+)<\/textarea>/g);
    return m ? m.map((x) => x.slice(1, -'</textarea>'.length).replace(/&amp;/g, '&')) : [];
  };
  return { gs: ctx, props, sheets, prompts, log, call, lastLink };
}
