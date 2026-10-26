// A local stand-in for the Apps Script web app, for testing only.
// It speaks the same protocol as backend/Code.gs and, like Apps Script, answers every POST
// with a 302 redirect to a GET that carries the JSON result.
// Run: node tools/mock-sync.mjs [port]   → sync link: http://127.0.0.1:<port>/exec#testkey12345
import http from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.argv[2]) || 18924;
const KEY = 'testkey12345';
const rows = new Map(); // id -> { id, type, updatedAt, deleted, syncedAt, json }
const echoes = new Map();
const stats = { push: 0, pull: 0, ping: 0, bytesIn: 0, bytesOut: 0 };

function handle(body) {
  if (body.key !== KEY) return { ok: false, error: 'bad_key' };
  const now = Date.now();
  if (body.op === 'ping') { stats.ping++; return { ok: true, count: rows.size }; }
  if (body.op === 'push') {
    stats.push++;
    let applied = 0;
    for (const rec of body.records || []) {
      if (!rec || typeof rec.id !== 'string') continue;
      const cur = rows.get(rec.id);
      const u = Number(rec.updatedAt) || 0;
      if (cur && !(u > cur.updatedAt)) continue;
      rows.set(rec.id, { id: rec.id, type: rec.type, updatedAt: u, deleted: !!rec.deleted, syncedAt: now, json: JSON.stringify(rec.data ?? null) });
      applied++;
    }
    return { ok: true, applied, rejected: [], serverTime: now };
  }
  if (body.op === 'pull') {
    stats.pull++;
    const since = Number(body.since) || 0;
    const records = [...rows.values()].filter((r) => r.syncedAt > since)
      .map((r) => ({ id: r.id, type: r.type, updatedAt: r.updatedAt, deleted: r.deleted, data: JSON.parse(r.json) }));
    return { ok: true, records, serverTime: now };
  }
  return { ok: false, error: 'bad_op' };
}

const cors = { 'Access-Control-Allow-Origin': '*' };
http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (req.method === 'POST' && url.pathname === '/exec') {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      stats.bytesIn += Buffer.byteLength(raw);
      let out;
      try { out = handle(JSON.parse(raw)); } catch (e) { out = { ok: false, error: 'server: ' + e.message }; }
      const t = randomUUID();
      echoes.set(t, JSON.stringify(out));
      res.writeHead(302, { ...cors, Location: `/echo?t=${t}` });
      res.end();
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/echo') {
    const body = echoes.get(url.searchParams.get('t')) || '{"ok":false,"error":"gone"}';
    echoes.delete(url.searchParams.get('t'));
    stats.bytesOut += Buffer.byteLength(body);
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(body);
    return;
  }
  if (req.method === 'GET' && url.pathname === '/_debug') {
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ stats, rows: [...rows.values()].map((r) => ({ id: r.id, type: r.type, updatedAt: r.updatedAt, deleted: r.deleted })) }));
    return;
  }
  res.writeHead(404, cors);
  res.end();
}).listen(PORT, '127.0.0.1', () => console.log(`mock sync on http://127.0.0.1:${PORT}/exec#${KEY}`));
