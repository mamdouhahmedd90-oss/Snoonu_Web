'use strict';
const fs = require('fs');
const XLSX = require('xlsx');
const config = require('./config');

function ensureDirs() {
  for (const d of [config.dataDir, config.rawDir]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

function load() {
  ensureDirs();
  if (!fs.existsSync(config.storePath)) return {};
  try { return JSON.parse(fs.readFileSync(config.storePath, 'utf8')) || {}; }
  catch (e) { console.error('[store] تعذّر قراءة المخزن:', e.message); return {}; }
}

function save(db) {
  ensureDirs();
  fs.writeFileSync(config.storePath, JSON.stringify(db, null, 2), 'utf8');
}

// المفتاح الفريد = رقم + رقم الطلب (نفس العميل بطلبات مختلفة = صفوف متعددة)
function recordKey(rec) {
  const oid = rec.context && rec.context.orderId;
  return oid ? `${rec.phone}|${oid}` : rec.phone;
}

function upsertMany(records, nowIso) {
  const db = load();
  let added = 0, updated = 0;
  for (const rec of records) {
    const key = recordKey(rec);
    if (db[key]) {
      db[key].lastSeen = nowIso;
      db[key].seenCount = (db[key].seenCount || 1) + 1;
      db[key].context = { ...db[key].context, ...rec.context };
      updated++;
    } else {
      db[key] = {
        phone: rec.phone,
        phoneE164: rec.phoneE164 || '+' + config.countryCode + rec.phone,
        context: rec.context || {},
        source: rec.source || '',
        firstSeen: nowIso,
        lastSeen: nowIso,
        seenCount: 1,
      };
      added++;
    }
  }
  save(db);
  return { added, updated, total: Object.keys(db).length };
}

// تنسيق وقت ISO ("2026-08-25T14:18:15.1") إلى "2026-08-25 14:18"
function fmtTime(v) {
  if (!v) return '';
  const s = String(v);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  return m ? `${m[1]} ${m[2]}` : s;
}

function contactsRows() {
  const db = load();
  const rows = Object.values(db).map((r) => {
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

function exportExcel() {
  const rows = contactsRows();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 11 }, { wch: 15 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
    { wch: 40 }, { wch: 17 }, { wch: 12 }, { wch: 22 }, { wch: 22 }, { wch: 10 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Contacts');
  try {
    XLSX.writeFile(wb, config.excelPath);
    return { file: config.excelPath, count: rows.length };
  } catch (e) {
    if (e && (e.code === 'EBUSY' || e.code === 'EPERM')) {
      const alt = config.excelPath.replace(/\.xlsx$/, '_' + Date.now() + '.xlsx');
      try { XLSX.writeFile(wb, alt); console.warn('[store] الملف مفتوح — حُفظ باسم بديل:', alt); return { file: alt, count: rows.length }; }
      catch (e2) { console.warn('[store] تعذّر كتابة Excel:', e2.message); return { file: '(فشل — أغلق الملف)', count: rows.length }; }
    }
    console.warn('[store] تعذّر كتابة Excel:', e.message);
    return { file: '(فشل)', count: rows.length };
  }
}

module.exports = { ensureDirs, load, save, upsertMany, exportExcel, contactsRows };

if (require.main === module && process.argv.includes('--export')) {
  const r = exportExcel();
  console.log(`تم تصدير ${r.count} سجل إلى:\n${r.file}`);
}
