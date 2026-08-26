'use strict';
const config = require('./config');
const store = require('./store');
const { login, fetchOrdersPage } = require('./snoonu');
const { extractOrders } = require('./extract');

function log(...a) { console.log(`[${new Date().toISOString()}]`, ...a); }

async function scrapeBrand(brand) {
  const recs = [];
  let token, businessUnitId;
  try {
    const auth = await login(brand);
    token = auth.token;
    businessUnitId = auth.businessUnitId;
  } catch (e) {
    log(`  ✗ ${brand.name}: ${e.message}`);
    return { brand: brand.name, records: [], ok: false };
  }

  let pages = 0;
  for (let offset = 0; pages < config.maxPages; offset += config.pageSize, pages++) {
    let data;
    try {
      data = await fetchOrdersPage(token, businessUnitId, offset);
    } catch (e) {
      log(`  ${brand.name}: خطأ في الصفحة ${pages + 1}: ${e.message}`);
      break;
    }
    if (!data.length) break;
    recs.push(...extractOrders({ data }, brand.name));
    if (data.length < config.pageSize) break; // آخر صفحة
    await new Promise((r) => setTimeout(r, 250));
  }
  log(`  ✓ ${brand.name}: ${recs.length} رقم (من ${pages + 1} صفحة)`);
  return { brand: brand.name, records: recs, ok: true };
}

async function runOnce() {
  await store.init();
  if (!config.brands.length) {
    throw new Error('لا توجد بيانات براندات. انسخ brands.example.json إلى brands.json واملأ الباسوردات، أو اضبط SNOONU_BRANDS.');
  }

  log(`بدء السحب — ${config.brands.length} براند`);
  const all = [];
  let okBrands = 0;
  for (const brand of config.brands) {
    const res = await scrapeBrand(brand);
    if (res.ok) okBrands++;
    all.push(...res.records);
  }

  const now = new Date().toISOString();
  const upres = await store.upsertMany(all, now);

  log(`الإجمالي: براندات ناجحة ${okBrands}/${config.brands.length} | أرقام ملتقطة ${all.length} | جديد ${upres.added} | الإجمالي بالمخزن ${upres.total} | التخزين: ${store.usingDb ? 'Postgres' : 'JSON'}`);
  return { ...upres, okBrands };
}

module.exports = { runOnce, scrapeBrand };

if (require.main === module) {
  runOnce().then(() => process.exit(0)).catch((e) => { console.error('خطأ:', e.message); process.exit(1); });
}
