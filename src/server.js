'use strict';
const http = require('http');
const store = require('./store');

const TABLE_LIMIT = 4000;

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
function qs() { return _token ? '?token=' + encodeURIComponent(_token) : ''; }

const CSS = `
:root{--bg:#0b1120;--card:#151f34;--card2:#1b2740;--line:#2a3a5c;--txt:#e8eef7;--mut:#93a3bd;--acc:#ef4444;--acc2:#dc2626;--blue:#38bdf8}
*{box-sizing:border-box}body{font-family:system-ui,'Segoe UI',Arial;background:var(--bg);color:var(--txt);margin:0}
.bar{display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:space-between;padding:16px 22px;background:linear-gradient(90deg,#1a1020,#0b1120);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5}
.brand{display:flex;align-items:center;gap:12px}.brand h1{font-size:18px;margin:0}
.nav{display:flex;gap:8px}.nav a{padding:8px 16px;border-radius:10px;text-decoration:none;color:var(--mut);font-weight:600;border:1px solid transparent}
.nav a.on{background:var(--card2);color:var(--txt);border-color:var(--line)}
.dl a{padding:9px 15px;border-radius:10px;text-decoration:none;font-weight:700;margin-inline-start:6px}
.dl a.xls{background:var(--acc);color:#fff}.dl a.csv{background:var(--blue);color:#022}
.main{padding:18px 22px}
input.search{width:100%;padding:12px 16px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--txt);font-size:15px;margin-bottom:14px}
.wrap{overflow:auto;border:1px solid var(--line);border-radius:14px;max-height:74vh;background:var(--card)}
table{border-collapse:collapse;width:100%;font-size:13px;white-space:nowrap}
th,td{padding:11px 14px;border-bottom:1px solid var(--line);text-align:right}
th{position:sticky;top:0;background:#1a1020;cursor:pointer;user-select:none;font-weight:700}
tbody tr:nth-child(even){background:rgba(255,255,255,.02)}tbody tr:hover td{background:rgba(239,68,68,.08)}
small{color:var(--mut)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin-bottom:18px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px 20px}
.tile .v{font-size:30px;font-weight:800}.tile .l{color:var(--mut);font-size:13px;margin-top:4px}
.tile.r .v{color:var(--acc)}.tile.b .v{color:var(--blue)}.tile.o .v{color:#f59e0b}.tile.p .v{color:#a78bfa}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:820px){.grid{grid-template-columns:1fr}}
.panel{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px}
.panel h3{margin:0 0 14px;font-size:15px}
.hrow{display:flex;align-items:center;gap:10px;margin:7px 0}
.hlabel{width:140px;font-size:12px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.htrack{flex:1;background:var(--card2);border-radius:6px;overflow:hidden;height:16px}
.hbar{height:100%;background:linear-gradient(90deg,var(--acc),var(--acc2));border-radius:6px}
.hval{width:52px;text-align:left;font-size:12px;font-weight:700}
.chart{display:flex;align-items:flex-end;gap:5px;height:180px;padding-top:10px}
.col{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:5px;height:100%}
.vbar{width:70%;background:linear-gradient(180deg,var(--blue),#0ea5e9);border-radius:5px 5px 0 0;min-height:2px}
.col span{font-size:10px;color:var(--mut)}
`;

function layout(title, active, body, withSearch, count) {
  const dl = `<span class="dl"><a class="xls" href="/download.xlsx${qs()}">⬇️ Excel</a><a class="csv" href="/download.csv${qs()}">⬇️ CSV</a></span>`;
  const nav = `<div class="nav"><a href="/${qs()}" class="${active === 'table' ? 'on' : ''}">📋 الجدول</a><a href="/analytics${qs()}" class="${active === 'stats' ? 'on' : ''}">📊 التحليلات</a></div>`;
  const cnt = count != null ? `<div style="font-size:26px;font-weight:800;color:var(--acc);line-height:1">${count} <span style="font-size:13px;color:var(--mut);font-weight:400">عميل</span></div>` : '';
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head>
<body><div class="bar"><div class="brand"><span>📞</span><div><h1>أرقام عملاء Snoonu</h1>${cnt}</div></div>${nav}${dl}</div>
<div class="main">${body}</div>${withSearch ? searchScript() : ''}</body></html>`;
}
function searchScript() {
  return `<script>
const q=document.getElementById('q'),tb=document.querySelector('#t tbody');
if(q)q.addEventListener('input',()=>{const s=q.value.trim().toLowerCase();for(const tr of tb.rows){tr.style.display=!s||tr.textContent.toLowerCase().includes(s)?'':'none';}});
let asc=1,li=-1;function sortT(th){const i=[...th.parentNode.children].indexOf(th);asc=(li===i)?-asc:1;li=i;const rs=[...tb.rows];rs.sort((a,b)=>{const x=a.cells[i].textContent,y=b.cells[i].textContent;const nx=parseFloat(x.replace(/[^\\d.-]/g,'')),ny=parseFloat(y.replace(/[^\\d.-]/g,''));if(!isNaN(nx)&&!isNaN(ny))return(nx-ny)*asc;return x.localeCompare(y,'ar')*asc;});rs.forEach(r=>tb.appendChild(r));}
</script>`;
}

async function tablePage() {
  const rows = await store.contactsRows();
  const total = rows.length;
  const shown = rows.slice(0, TABLE_LIMIT);
  const cols = ['Phone', 'Name', 'Brand', 'Branch', 'Order ID', 'Address', 'Order Time', 'Times Seen'];
  const head = cols.map((c) => `<th onclick="sortT(this)">${esc(c)}</th>`).join('');
  const body = shown.map((r) => '<tr>' + cols.map((c) => `<td>${esc(r[c])}</td>`).join('') + '</tr>').join('');
  const note = total > TABLE_LIMIT ? `<small>يُعرض أحدث ${TABLE_LIMIT} من ${total} — التحميل يشمل الكل</small><br><br>` : '';
  const b = `<input id="q" class="search" placeholder="🔎 ابحث بالاسم / الرقم / البراند / العنوان...">${note}
<div class="wrap"><table id="t"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  return layout('Snoonu — الجدول', 'table', b, true, total);
}

function areaOf(addr) {
  if (!addr) return '';
  const parts = String(addr).split(/[,،]/).map((s) => s.trim()).filter(Boolean);
  const gov = parts.find((p) => /governorate|محافظة/i.test(p));
  return (gov || parts[0] || '').replace(/governorate/i, '').trim();
}

async function analyticsPage() {
  const recs = await store.allRecords();
  const phoneCount = {};
  const byBrand = {}, byDay = {}, byArea = {};
  for (const r of recs) {
    phoneCount[r.phone] = (phoneCount[r.phone] || 0) + 1;
    const c = r.context || {};
    const brand = c.brand || c.branch || 'غير معروف';
    byBrand[brand] = (byBrand[brand] || 0) + 1;
    if (c.time) { const day = String(c.time).slice(0, 10); if (/^\d{4}-\d{2}-\d{2}$/.test(day)) byDay[day] = (byDay[day] || 0) + 1; }
    const a = areaOf(c.address); if (a && a.length > 1) byArea[a] = (byArea[a] || 0) + 1;
  }
  const totalOrders = recs.length;
  const uniqueCustomers = Object.keys(phoneCount).length;
  const repeatCustomers = Object.values(phoneCount).filter((n) => n > 1).length;
  const byBrandArr = Object.entries(byBrand).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  const byDayArr = Object.entries(byDay).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
  const topAreas = Object.entries(byArea).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 12);

  const maxBrand = Math.max(1, ...byBrandArr.map((s) => s.count));
  const maxDay = Math.max(1, ...byDayArr.map((d) => d.count));
  const maxArea = Math.max(1, ...topAreas.map((a) => a.count));
  const repeatPct = uniqueCustomers ? Math.round((repeatCustomers / uniqueCustomers) * 100) : 0;

  const hbar = (arr, max) => arr.map((x) => `<div class="hrow"><span class="hlabel" title="${esc(x.name)}">${esc(x.name)}</span><div class="htrack"><div class="hbar" style="width:${Math.round(x.count / max * 100)}%"></div></div><span class="hval">${x.count}</span></div>`).join('');
  const vbars = byDayArr.map((d) => `<div class="col"><div class="vbar" style="height:${Math.round(d.count / maxDay * 100)}%" title="${d.date}: ${d.count}"></div><span>${d.date.slice(5)}</span></div>`).join('');

  const b = `
  <div class="tiles">
    <div class="tile r"><div class="v">${uniqueCustomers}</div><div class="l">👤 عملاء فريدون</div></div>
    <div class="tile b"><div class="v">${totalOrders}</div><div class="l">🧾 إجمالي الطلبات</div></div>
    <div class="tile o"><div class="v">${repeatCustomers}</div><div class="l">🔁 عملاء متكررون (${repeatPct}%)</div></div>
    <div class="tile p"><div class="v">${byBrandArr.length}</div><div class="l">🍔 عدد البراندات</div></div>
  </div>
  <div class="grid">
    <div class="panel"><h3>👥 العملاء حسب البراند</h3>${hbar(byBrandArr, maxBrand) || '<small>لا بيانات</small>'}</div>
    <div class="panel"><h3>📍 أكثر المناطق</h3>${hbar(topAreas, maxArea) || '<small>لا بيانات</small>'}</div>
  </div>
  <div class="panel" style="margin-top:16px"><h3>📅 الطلبات حسب اليوم (آخر ١٤ يوم)</h3><div class="chart">${vbars || '<small>لا بيانات</small>'}</div></div>`;
  return layout('Snoonu — التحليلات', 'stats', b, false);
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
      if (u.pathname === '/analytics') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(await analyticsPage()); return;
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(await tablePage());
    } catch (e) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('خطأ: ' + e.message);
    }
  });
  srv.listen(listenPort, () => console.log(`[web] الداشبورد على المنفذ ${listenPort}`));
  return srv;
}

module.exports = { startServer };
