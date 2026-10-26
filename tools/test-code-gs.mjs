// Tests backend/Code.gs: each person only ever sees their own sheet.
// Run: node tools/test-code-gs.mjs
import assert from 'node:assert/strict';
import { loadCodeGs } from './gs-sim.mjs';

const EXEC = 'https://script.google.com/macros/s/ABC123/exec';
const { gs, props, sheets, prompts, log, call, lastLink } = loadCodeGs();
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok -', name); };
const rec = (id, updatedAt, extra = {}) => ({ id, type: 'session', updatedAt, deleted: false, data: { id, type: 'session', updatedAt, date: '2026-10-27', items: [], ...extra } });
const keyOf = (link) => link.slice(link.indexOf('#') + 1);

test('menu lists the four actions', () => {
  gs.onOpen();
  assert.deepEqual(log.menu.map((m) => m[1]), ['menuAddUser', 'menuShowLinks', 'menuRotateKey', 'menuRemoveUser']);
});

let ahmed, sara;
test('first "add person" asks for the /exec link because getUrl() gave /dev', () => {
  prompts.push(EXEC, 'أحمد');
  gs.menuAddUser();
  const links = lastLink();
  assert.equal(links.length, 1);
  assert.ok(links[0].startsWith(EXEC + '#'));
  ahmed = keyOf(links[0]);
  assert.equal(props.get('EXEC_URL'), EXEC);
  assert.ok(sheets.has('أحمد'));
});

test('a /dev link is refused', () => {
  const fresh = loadCodeGs();
  fresh.prompts.push('https://script.google.com/macros/s/X/dev');
  fresh.gs.menuAddUser();
  assert.equal(fresh.log.dialogs.length, 0);
  assert.match(fresh.log.alerts.at(-1), /exec/);
});

test('second person only gets asked for a name', () => {
  prompts.push('سارة');
  gs.menuAddUser();
  sara = keyOf(lastLink()[0]);
  assert.notEqual(sara, ahmed);
  assert.equal(prompts.length, 0);
});

test('same name twice gets its own sheet', () => {
  prompts.push('أحمد');
  gs.menuAddUser();
  assert.ok(sheets.has('أحمد 2'));
});

test('wrong, empty and prototype keys are refused', () => {
  for (const key of ['nope', '', '__proto__', 'constructor', undefined]) assert.deepEqual(call({ key, op: 'ping' }), { ok: false, error: 'bad_key' });
});

test('each person pushes and pulls only their own records', () => {
  assert.equal(call({ key: ahmed, op: 'push', records: [rec('ss_a1', 10), rec('ss_a2', 10)] }).applied, 2);
  assert.equal(call({ key: sara, op: 'push', records: [rec('ss_s1', 10)] }).applied, 1);
  const a = call({ key: ahmed, op: 'pull', since: 0 });
  const s = call({ key: sara, op: 'pull', since: 0 });
  assert.deepEqual(a.records.map((r) => r.id).sort(), ['ss_a1', 'ss_a2']);
  assert.deepEqual(s.records.map((r) => r.id), ['ss_s1']);
  assert.equal(call({ key: ahmed, op: 'ping' }).count, 2);
});

test('newest updatedAt wins, and deleted survives the text format', () => {
  assert.equal(call({ key: ahmed, op: 'push', records: [rec('ss_a1', 5, { note: 'old' })] }).applied, 0);
  const del = rec('ss_a1', 20, { note: 'new' });
  del.deleted = true;
  assert.equal(call({ key: ahmed, op: 'push', records: [del] }).applied, 1);
  const got = call({ key: ahmed, op: 'pull', since: 0 }).records.find((r) => r.id === 'ss_a1');
  assert.equal(got.data.note, 'new');
  assert.equal(got.deleted, true);
});

test('pull since a server time returns only newer rows', () => {
  const t = call({ key: sara, op: 'pull', since: 0 }).serverTime;
  assert.equal(call({ key: sara, op: 'pull', since: t }).records.length, 0);
});

test('"show links" lists everyone', () => {
  gs.menuShowLinks();
  assert.equal(lastLink().length, 3);
});

test('"new link" stops the old key and keeps the data', () => {
  prompts.push('سارة');
  gs.menuRotateKey();
  const fresh = keyOf(lastLink()[0]);
  assert.notEqual(fresh, sara);
  assert.deepEqual(call({ key: sara, op: 'ping' }), { ok: false, error: 'bad_key' });
  assert.deepEqual(call({ key: fresh, op: 'pull', since: 0 }).records.map((r) => r.id), ['ss_s1']);
  sara = fresh;
});

test('"stop person" blocks the key and keeps the sheet', () => {
  prompts.push('أحمد');
  gs.menuRemoveUser();
  assert.deepEqual(call({ key: ahmed, op: 'pull', since: 0 }), { ok: false, error: 'bad_key' });
  assert.ok(sheets.has('أحمد'));
  assert.ok(sheets.get('أحمد').rows.length > 1);
  prompts.push('أحمد');
  gs.menuAddUser();
  assert.ok(sheets.has('أحمد 3'), 'a stopped person\'s sheet name is not reused');
});

test('an unknown name in the picker changes nothing', () => {
  const before = props.get('USERS');
  prompts.push('مو موجود');
  gs.menuRemoveUser();
  assert.equal(props.get('USERS'), before);
});

console.log(`\n${passed} passed`);
