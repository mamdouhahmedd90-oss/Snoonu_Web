'use strict';
const http = require('http');
const config = require('./config');
const store = require('./store');
const XLSX = require('xlsx');

const TABLE_LIMIT = 4000; // أقصى صفوف تُعرض في الجدول (التحميل يشمل الكل)

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
async function buildCsv() {
  const rows = await store.contactsRows();
  if (!rows.length) return '﻿';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(headers.map((h) => csvEscape(r[h])).join(','));
  return '﻿' + lines.join('\r\n');
}
async function buildXlsxBuffer() {
  const res = await store.exportExcel();
  return require('fs').readFileSync(res.file);
}

let _token = '';
function tokenQS() { return _token ? '?token=' + encodeURIComponent(_token) : ''; }

async function dashboard() {
  const rows = await store.contactsRows();
  const total = rows.length;
  const shown = rows.slice(0, TABLE_LIMIT);
  const cols = ['Phone', 'Name', 'Brand', 'Branch', 'Order ID', 'Address', 'Order Time', 'Times Seen'];
  const head = cols.map((c) => `<th onclick="sortT(this)">${esc(c)}</th>`).join('');
  const body = shown.map((r) => '<tr>' + cols.map((c) => `<td>${esc(r[c])}</td>`).join('') + '</tr>').join('');
  const note = total > TABLE_LIMIT ? `<small>يُعرض أحدث ${TABLE_LIMIT} من ${total} — التحميل يشمل الكل</small>` : '';

  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Snoonu — لوحة الأرقام</title>
<style>
:root{--bg:#0f172a;--card:#1e293b;--line:#334155;--txt:#e2e8f0;--mut:#94a3b8;--red:#ef4444;--blue:#38bdf8}
*{box-sizing:border-box}body{font-family:system-ui,Arial;background:var(--bg);color:var(--txt);margin:0;padding:16px}
.top{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin-bottom:14px}
h1{font-size:20px;margin:0}.count{font-size:28px;font-weight:800;color:var(--red)}
input{flex:1;min-width:220px;padding:11px 14px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--txt);font-size:15px}
a.btn{padding:10px 16px;background:var(--red);color:#fff;font-weight:700;border-radius:10px;text-decoration:none;white-space:nowrap}
a.btn.csv{background:var(--blue);color:#023}
.wrap{overflow:auto;border:1px solid var(--line);border-radius:12px;max-height:78vh}
table{border-collapse:collapse;width:100%;font-size:13px;white-space:nowrap}
th,td{padding:9px 12px;border-bottom:1px solid var(--line);text-align:right}
th{position:sticky;top:0;background:#0b1220;cursor:pointer;user-select:none}
tr:hover td{background:#172033}small{color:var(--mut)}
</style></head><body>
<div class="top">
  <div><h1>📞 أرقام عملاء Snoonu</h1><span class="count">${total}</span> <small>عميل (كل البراندات)</small></div>
  <input id="q" placeholder="🔎 ابحث بالاسم / الرقم / البراند / العنوان...">
  <div><a class="btn" href="/download.xlsx${tokenQS()}">⬇️ Excel</a> <a class="btn csv" href="/download.csv${tokenQS()}">⬇️ CSV</a></div>
</div>
${note}
<div class="wrap"><table id="t"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
<script>
const q=document.getElementById('q'),tb=document.querySelector('#t tbody');
q.addEventListener('input',()=>{const s=q.value.trim().toLowerCase();for(const tr of tb.rows){tr.style.display=!s||tr.textContent.toLowerCase().includes(s)?'':'none';}});
let asc=1,li=-1;function sortT(th){const i=[...th.parentNode.children].indexOf(th);asc=(li===i)?-asc:1;li=i;const rs=[...tb.rows];rs.sort((a,b)=>{const x=a.cells[i].textContent,y=b.cells[i].textContent;const nx=parseFloat(x.replace(/[^\\d.-]/g,'')),ny=parseFloat(y.replace(/[^\\d.-]/g,''));if(!isNaN(nx)&&!isNaN(ny))return(nx-ny)*asc;return x.localeCompare(y,'ar')*asc;});rs.forEach(r=>tb.appendChild(r));}
</script>
</body></html>`;
}

function startServer() {
  const port = Number(process.env.PORT || 0);
  const enabled = port > 0 || String(process.env.ENABLE_WEB || '').toLowerCase() === 'true';
  if (!enabled) return null;
  _token = process.env.DOWNLOAD_TOKEN || '';
  const listenPort = port || 3000;

  const srv = http.createServer(async (req, res) => {
    let u;
    try { u = new URL(req.url, 'http://localhost'); } catch (_) { res.writeHead(400); res.end('bad'); return; }
    if (!_token) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end('<h3 dir="rtl">⚠️ اضبط متغيّر DOWNLOAD_TOKEN لحماية الأرقام.</h3>'); return; }
    if (u.searchParams.get('token') !== _token) { res.writeHead(401, { 'content-type': 'text/html; charset=utf-8' }); res.end('<h3 dir="rtl">🔒 غير مصرّح. أضف ?token=كلمتك</h3>'); return; }

    try {
      if (u.pathname === '/download.xlsx') {
        const buf = await buildXlsxBuffer();
        res.writeHead(200, { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': 'attachment; filename="snoonu-contacts.xlsx"' });
        res.end(buf); return;
      }
      if (u.pathname === '/download.csv') {
        res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="snoonu-contacts.csv"' });
        res.end(await buildCsv()); return;
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(await dashboard());
    } catch (e) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('خطأ: ' + e.message);
    }
  });
  srv.listen(listenPort, () => console.log(`[web] الداشبورد على المنفذ ${listenPort}`));
  return srv;
}

module.exports = { startServer };
