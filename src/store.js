'use strict';
const fs = require('fs');
const XLSX = require('xlsx');
const config = require('./config');
const db = require('./db');

const USE_DB = db.isEnabled();

// ---------- أدوات JSON (تُستخدم محلياً عند غياب DATABASE_URL) ----------
function ensureDirs() {
  for (const d of [config.dataDir, config.rawDir]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}
function loadJson() {
  ensureDirs();
  if (!fs.existsSync(config.storePath)) return {};
  try { return JSON.parse(fs.readFileSync(config.storePath, 'utf8')) || {}; }
  catch (e) { console.error('[store] تعذّر قراءة المخزن:', e.message); return {}; }
}
function saveJson(dbObj) { ensureDirs(); fs.writeFileSync(config.storePath, JSON.stringify(dbObj, null, 2), 'utf8'); }
function recordKey(rec) {
  const oid = rec.context && rec.context.orderId;
  return oid ? `${rec.phone}|${oid}` : rec.phone;
}

async function init() {
  if (USE_DB) await db.init();
  else ensureDirs();
}

async function upsertMany(records, nowIso) {
  if (USE_DB) return db.upsertMany(records, nowIso);
  const store = loadJson();
  let added = 0, updated = 0;
  for (const rec of records) {
    const key = recordKey(rec);
    if (store[key]) {
      store[key].lastSeen = nowIso;
      store[key].seenCount = (store[key].seenCount || 1) + 1;
      store[key].context = { ...store[key].context, ...rec.context };
      updated++;
    } else {
      store[key] = { phone: rec.phone, phoneE164: rec.phoneE164 || '+' + config.countryCode + rec.phone,
        context: rec.context || {}, source: rec.source || '', firstSeen: nowIso, lastSeen: nowIso, seenCount: 1 };
      added++;
    }
  }
  saveJson(store);
  return { added, updated, total: Object.keys(store).length };
}

async function allRecords() {
  if (USE_DB) return db.allRecords();
  return Object.values(loadJson());
}

async function count() {
  if (USE_DB) return db.count();
  return Object.keys(loadJson()).length;
}

// تنسيق وقت ISO إلى "YYYY-MM-DD HH:MM"
function fmtTime(v) {
  if (!v) return '';
  const m = String(v).match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  return m ? `${m[1]} ${m[2]}` : String(v);
}

async function contactsRows() {
  const recs = await allRecords();
  const rows = recs.map((r) => {
    const c = r.context || {};
    return {
      Phone: r.phone,
      'Phone (Intl)': r.phoneE164,
      Name: c.name || '',
      Brand: c.brand || '',
      Branch: c.branch || '',
      'Order ID': c.orderId || '',
      Address: c.address || '',
      'Order Time': fmtTime(c.time),
      'Customer ID': c.customerId || '',
      'First Seen': r.firstSeen,
      'Last Seen': r.lastSeen,
      'Times Seen': r.seenCount,
    };
  });
  rows.sort((a, b) => String(b['Order Time']).localeCompare(String(a['Order Time'])));
  return rows;
}

async function exportExcel() {
  const rows = await contactsRows();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 11 }, { wch: 15 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
    { wch: 40 }, { wch: 17 }, { wch: 12 }, { wch: 22 }, { wch: 22 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Contacts');
  ensureDirs();
  try { XLSX.writeFile(wb, config.excelPath); return { file: config.excelPath, count: rows.length }; }
  catch (e) {
    if (e && (e.code === 'EBUSY' || e.code === 'EPERM')) {
      const alt = config.excelPath.replace(/\.xlsx$/, '_' + Date.now() + '.xlsx');
      try { XLSX.writeFile(wb, alt); return { file: alt, count: rows.length }; } catch (_) {}
    }
    console.warn('[store] تعذّر كتابة Excel:', e.message);
    return { file: '(فشل)', count: rows.length };
  }
}

module.exports = { ensureDirs, init, upsertMany, allRecords, count, contactsRows, exportExcel, usingDb: USE_DB };

if (require.main === module && process.argv.includes('--export')) {
  exportExcel().then((r) => console.log(`تم تصدير ${r.count} سجل إلى:\n${r.file}`)).catch((e) => console.error(e.message));
}
