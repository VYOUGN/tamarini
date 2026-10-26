// Serves the real docs/Code.gs locally (through tools/gs-sim.mjs), for testing the app only.
// Like Apps Script, it answers every POST with a 302 redirect to a GET that carries the JSON result.
// One server is one person's spreadsheet. Run a second one on another port to act as someone else.
// Run: node tools/mock-sync.mjs [port] [key]   → sync link: http://127.0.0.1:<port>/exec#<key>
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { loadCodeGs } from './gs-sim.mjs';

const PORT = Number(process.argv[2]) || 18932;
const KEY = process.argv[3] || 'testkey12345';
const { gs, props, sheets, call } = loadCodeGs();
props.set('SHEET_ID', 'sheet-1');
props.set('KEY', KEY);
gs.sheet_();

const echoes = new Map();
const stats = { push: 0, pull: 0, ping: 0, bytesIn: 0, bytesOut: 0 };
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
      try {
        const body = JSON.parse(raw);
        if (body.op in stats) stats[body.op]++;
        out = JSON.stringify(call(body));
      } catch (e) {
        out = JSON.stringify({ ok: false, error: 'server: ' + e.message });
      }
      const t = randomUUID();
      echoes.set(t, out);
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
    const perSheet = {};
    for (const [name, s] of sheets) if (name !== 'Sheet1') perSheet[name] = s.rows.slice(1).map((r) => r[0]);
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ stats, sheets: perSheet }));
    return;
  }
  res.writeHead(404, cors);
  res.end();
}).listen(PORT, '127.0.0.1', () => console.log(`Code.gs on http://127.0.0.1:${PORT}/exec#${KEY}`));
