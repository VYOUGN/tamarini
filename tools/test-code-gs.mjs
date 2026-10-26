// Tests docs/Code.gs: one person's sheet, their link, a new link, and copies of the spreadsheet.
// Run: node tools/test-code-gs.mjs
import assert from 'node:assert/strict';
import { loadCodeGs } from './gs-sim.mjs';

const EXEC = 'https://script.google.com/macros/s/ABC123/exec';
const { gs, props, sheets, prompts, log, call, lastLink } = loadCodeGs();
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok -', name); };
const rec = (id, updatedAt, extra = {}) => ({ id, type: 'session', updatedAt, deleted: false, data: { id, type: 'session', updatedAt, date: '2026-10-27', items: [], ...extra } });
const keyOf = (link) => link.slice(link.indexOf('#') + 1);

test('menu has the two actions', () => {
  gs.onOpen();
  assert.deepEqual(log.menu.map((m) => m[1]), ['menuShowLink', 'menuNewLink']);
});

test('a /dev link is refused', () => {
  const fresh = loadCodeGs();
  fresh.prompts.push('https://script.google.com/macros/s/X/dev');
  fresh.gs.menuShowLink();
  assert.equal(fresh.log.dialogs.length, 0);
  assert.match(fresh.log.alerts.at(-1), /exec/);
});

let key;
test('first "sync link" asks for the /exec link once, then shows the same link', () => {
  prompts.push(EXEC);
  gs.menuShowLink();
  const link = lastLink()[0];
  assert.ok(link.startsWith(EXEC + '#'));
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

test('"new link" stops the old key and keeps the data', () => {
  gs.menuNewLink();
  const fresh = keyOf(lastLink()[0]);
  assert.notEqual(fresh, key);
  assert.deepEqual(call({ key, op: 'ping' }), { ok: false, error: 'bad_key' });
  assert.equal(call({ key: fresh, op: 'pull', since: 0 }).records.length, 2);
  key = fresh;
});

test('a copy of this spreadsheet never accepts the original link', () => {
  const copy = loadCodeGs({ sheetId: 'sheet-2', props: new Map(props) });
  assert.deepEqual(copy.call({ key, op: 'ping' }), { ok: false, error: 'bad_key' });
  copy.prompts.push('https://script.google.com/macros/s/COPY/exec');
  copy.gs.menuShowLink();
  const link = copy.lastLink()[0];
  assert.ok(link.startsWith('https://script.google.com/macros/s/COPY/exec#'), 'the copy asks for its own Web app link');
  assert.notEqual(keyOf(link), key);
  assert.equal(copy.call({ key: keyOf(link), op: 'pull', since: 0 }).records.length, 0);
});

test('the original keeps working after being copied', () => {
  assert.equal(call({ key, op: 'ping' }).ok, true);
});

console.log(`\n${passed} passed`);
