// Tests docs/Code.gs: the sync link, checking the Web app link, a new key, and copies of the spreadsheet.
// Run: node tools/test-code-gs.mjs
import assert from 'node:assert/strict';
import { loadCodeGs } from './gs-sim.mjs';

const BASE = 'https://script.google.com/macros/s/';
const sim = loadCodeGs();
const { gs, props, sheets, prompts, log, call, lastLink, serveAt, web } = sim;
const EXEC = serveAt(BASE + 'ABC123/exec');
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok -', name); };
const rec = (id, updatedAt, extra = {}) => ({ id, type: 'session', updatedAt, deleted: false, data: { id, type: 'session', updatedAt, date: '2026-10-27', items: [], ...extra } });
const keyOf = (link) => link.slice(link.indexOf('#') + 1);
// A fresh spreadsheet that tries to save `pasted` as its Web app link; returns the alert it shows.
const refusal = (pasted, setup = () => {}) => {
  const s = loadCodeGs({ web });
  setup(s);
  s.prompts.push(pasted);
  s.gs.menuShowLink();
  assert.equal(s.log.dialogs.length, 0, 'no link is shown');
  assert.equal(s.props.get('EXEC_URL'), undefined, 'nothing is saved');
  return s.log.alerts.at(-1);
};

test('menu has the three actions', () => {
  gs.onOpen();
  assert.deepEqual(log.menu.map((m) => m[1]), ['menuShowLink', 'menuNewLink', 'menuChangeUrl']);
});

test('the Web app page shows a public tag, never the key', () => {
  const page = JSON.parse(gs.doGet().getContent());
  assert.equal(page.app, 'tamarini');
  assert.ok(page.instance);
  assert.ok(!JSON.stringify(page).includes(props.get('KEY')));
});

test('a /dev link is refused', () => {
  assert.match(refusal(BASE + 'X/dev'), /exec/);
});

test('a cut-off link (Page not found) is refused', () => {
  assert.match(refusal(BASE + 'ABC1/exec'), /Page not found/);
});

test('a link that opens some other page is refused', () => {
  web.set(BASE + 'LOGIN/exec', () => ({ code: 200, text: '<!DOCTYPE html><title>Sign in</title>' }));
  assert.match(refusal(BASE + 'LOGIN/exec'), /Anyone/);
});

test('another spreadsheet\'s link is refused', () => {
  const other = loadCodeGs({ web, sheetId: 'someone-else' });
  const theirs = other.serveAt(BASE + 'THEIRS/exec');
  assert.match(refusal(theirs), /جدول ثاني/);
});

test('a deployment still running old code is refused', () => {
  web.set(BASE + 'OLD/exec', () => ({ code: 200, text: JSON.stringify({ ok: true, app: 'tamarini' }) }));
  assert.match(refusal(BASE + 'OLD/exec'), /New version/);
});

let key;
test('first "sync link" saves the checked link once, even when the whole sync link is pasted', () => {
  prompts.push(' ' + EXEC + '#pasted-by-mistake ');
  gs.menuShowLink();
  const link = lastLink()[0];
  assert.ok(link.startsWith(EXEC + '#'));
  assert.equal(props.get('EXEC_URL'), EXEC);
  key = keyOf(link);
  assert.ok(key.length >= 32);
  assert.ok(sheets.has('السجلات'));
  gs.menuShowLink();
  assert.equal(lastLink()[0], link);
  assert.equal(prompts.length, 0);
});

test('wrong, empty and odd keys are refused', () => {
  for (const k of ['nope', '', '__proto__', undefined, 12345, key + 'x']) assert.deepEqual(call({ key: k, op: 'ping' }), { ok: false, error: 'bad_key' });
});

test('push and pull with the right key', () => {
  assert.equal(call({ key, op: 'push', records: [rec('ss_1', 10), rec('ss_2', 10), rec('ss_2', 12)] }).applied, 2);
  assert.deepEqual(call({ key, op: 'pull', since: 0 }).records.map((r) => r.id).sort(), ['ss_1', 'ss_2']);
  assert.equal(call({ key, op: 'pull', since: 0 }).records.find((r) => r.id === 'ss_2').updatedAt, 12);
  assert.equal(call({ key, op: 'ping' }).count, 2);
});

test('newest updatedAt wins, and deleted survives the text format', () => {
  assert.equal(call({ key, op: 'push', records: [rec('ss_1', 5, { note: 'old' })] }).applied, 0);
  const del = rec('ss_1', 20, { note: 'new' });
  del.deleted = true;
  assert.equal(call({ key, op: 'push', records: [del] }).applied, 1);
  const got = call({ key, op: 'pull', since: 0 }).records.find((r) => r.id === 'ss_1');
  assert.equal(got.data.note, 'new');
  assert.equal(got.deleted, true);
});

test('pull since a server time returns only newer rows', () => {
  const t = call({ key, op: 'pull', since: 0 }).serverTime;
  assert.equal(call({ key, op: 'pull', since: t }).records.length, 0);
});

test('a saved link that stopped working is caught and replaced before it\'s shown', () => {
  props.set('EXEC_URL', BASE + 'AKfycbxDBNzky3Ff/exec');
  prompts.push(EXEC);
  gs.menuShowLink();
  assert.match(log.alerts.at(-1), /ما يشتغل/);
  assert.equal(props.get('EXEC_URL'), EXEC);
  assert.equal(lastLink()[0], EXEC + '#' + key);
});

test('"change Web app link" swaps the link and keeps the key', () => {
  const NEXT = serveAt(BASE + 'NEXTDEPLOY/exec');
  prompts.push(NEXT);
  gs.menuChangeUrl();
  assert.equal(props.get('EXEC_URL'), NEXT);
  assert.equal(lastLink()[0], NEXT + '#' + key);
  assert.equal(call({ key, op: 'ping' }).ok, true);
});

test('a pasted Deployment ID is turned into its Web app link', () => {
  const id = 'AKfycbTESTdeploymentID_1234567890-abc';
  const url = serveAt(BASE + id + '/exec');
  prompts.push(' ' + id + ' ');
  gs.menuChangeUrl();
  assert.equal(props.get('EXEC_URL'), url);
  assert.equal(lastLink()[0], url + '#' + key);
});

test('a refused link shows what was pasted', () => {
  assert.match(refusal(BASE + 'CUT/exec'), /اللي لصقته: https:\/\/script\.google\.com\/macros\/s\/CUT\/exec/);
  assert.match(refusal('   '), /اللي لصقته: \(فاضي\)/);
});

test('"change Web app link" refuses a bad link and keeps the old one', () => {
  const before = props.get('EXEC_URL');
  prompts.push(BASE + 'TYPO/exec');
  gs.menuChangeUrl();
  assert.equal(props.get('EXEC_URL'), before);
});

test('"new link" stops the old key and keeps the data', () => {
  gs.menuNewLink();
  const fresh = keyOf(lastLink()[0]);
  assert.notEqual(fresh, key);
  assert.deepEqual(call({ key, op: 'ping' }), { ok: false, error: 'bad_key' });
  assert.equal(call({ key: fresh, op: 'pull', since: 0 }).records.length, 2);
  key = fresh;
});

test('a sheet set up before this update keeps its key', () => {
  const old = new Map([['SHEET_ID', 'sheet-1'], ['KEY', 'k'.repeat(40)]]);
  const s = loadCodeGs({ props: old });
  assert.equal(s.call({ key: 'k'.repeat(40), op: 'ping' }).ok, true);
  assert.ok(old.get('INSTANCE'), 'it gets a tag on first use');
  assert.equal(old.get('KEY'), 'k'.repeat(40));
});

test('a copy of this spreadsheet gets its own key and refuses the original\'s link', () => {
  const copy = loadCodeGs({ sheetId: 'sheet-2', props: new Map(props), web });
  assert.deepEqual(copy.call({ key, op: 'ping' }), { ok: false, error: 'bad_key' });
  copy.prompts.push(props.get('EXEC_URL'));
  copy.gs.menuShowLink();
  assert.equal(copy.log.dialogs.length, 0, 'the original\'s Web app link is refused');
  const own = copy.serveAt(BASE + 'COPY/exec');
  copy.prompts.push(own);
  copy.gs.menuShowLink();
  const link = copy.lastLink()[0];
  assert.ok(link.startsWith(own + '#'));
  assert.notEqual(keyOf(link), key);
  assert.equal(copy.call({ key: keyOf(link), op: 'pull', since: 0 }).records.length, 0);
});

test('the original keeps working after being copied', () => {
  assert.equal(call({ key, op: 'ping' }).ok, true);
});

console.log(`\n${passed} passed`);
