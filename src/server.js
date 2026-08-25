'use strict';
const http = require('http');
const fs = require('fs');
const config = require('./config');
const store = require('./store');

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function buildCsv() {
  const rows = store.contactsRows();
  if (!rows.length) return '﻿';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(headers.map((h) => csvEscape(r[h])).join(','));
  return '﻿' + lines.join('\r\n');
}

let _token = '';
function tokenQS() { return _token ? '?token=' + encodeURIComponent(_token) : ''; }

function page(count) {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Snoonu Scraper</title>
<style>body{font-family:system-ui,Arial;background:#0f172a;color:#e2e8f0;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.card{background:#1e293b;padding:32px 40px;border-radius:16px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.4)}
h1{margin:0 0 8px;font-size:20px}.n{font-size:44px;font-weight:800;color:#ef4444;margin:12px 0}
a{display:inline-block;margin:8px;padding:12px 22px;background:#ef4444;color:#fff;font-weight:700;border-radius:10px;text-decoration:none}
a.csv{background:#38bdf8;color:#023}small{color:#94a3b8}</style></head>
<body><div class="card"><h1>📞 أرقام عملاء Snoonu</h1>
<div class="n">${count}</div><small>إجمالي الأرقام المجمّعة (كل البراندات)</small><br>
<a href="/download.xlsx${tokenQS()}">⬇️ تحميل Excel</a>
<a class="csv" href="/download.csv${tokenQS()}">⬇️ تحميل CSV</a></div></body></html>`;
}

function startServer() {
  const port = Number(process.env.PORT || 0);
  const enabled = port > 0 || String(process.env.ENABLE_WEB || '').toLowerCase() === 'true';
  if (!enabled) return null;
  _token = process.env.DOWNLOAD_TOKEN || '';
  const listenPort = port || 3000;

  const srv = http.createServer((req, res) => {
    let u;
    try { u = new URL(req.url, 'http://localhost'); } catch (_) { res.writeHead(400); res.end('bad'); return; }
    if (!_token) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end('<h3 dir="rtl">⚠️ اضبط متغيّر DOWNLOAD_TOKEN لحماية الأرقام.</h3>'); return; }
    if (u.searchParams.get('token') !== _token) { res.writeHead(401, { 'content-type': 'text/html; charset=utf-8' }); res.end('<h3 dir="rtl">🔒 غير مصرّح. أضف ?token=كلمتك</h3>'); return; }

    if (u.pathname === '/download.xlsx') {
      try { store.exportExcel(); const buf = fs.readFileSync(config.excelPath);
        res.writeHead(200, { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': 'attachment; filename="snoonu-contacts.xlsx"' });
        res.end(buf);
      } catch (e) { res.writeHead(500); res.end(String(e.message)); }
      return;
    }
    if (u.pathname === '/download.csv') {
      res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="snoonu-contacts.csv"' });
      res.end(buildCsv()); return;
    }
    const count = Object.keys(store.load()).length;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(page(count));
  });
  srv.listen(listenPort, () => console.log(`[web] صفحة التحميل على المنفذ ${listenPort}`));
  return srv;
}

module.exports = { startServer };
