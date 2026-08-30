'use strict';
const config = require('./config');
const store = require('./store');
const { getAuth, getBrandName, fetchOrdersPage } = require('./snoonu');
const { extractOrders } = require('./extract');

function log(...a) { console.log(`[${new Date().toISOString()}]`, ...a); }

async function scrapeUnit(token, buid, brandName) {
  const recs = [];
  let pages = 0;
  for (let offset = 0; pages < config.maxPages; offset += config.pageSize, pages++) {
    let data;
    try { data = await fetchOrdersPage(token, buid, offset); }
    catch (e) { log(`  ${brandName}: خطأ في الصفحة ${pages + 1}: ${e.message}`); break; }
    if (!data.length) break;
    recs.push(...extractOrders({ data }, brandName));
    if (data.length < config.pageSize) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  return recs;
}

async function runOnce() {
  await store.init();
  const master = config.brands[0];
  if (!master) throw new Error('لا يوجد حساب ماستر. ضعه في brands.json أو متغيّر SNOONU_BRANDS.');

  const auth = await getAuth(master); // دخول واحد يغطّي كل البراندات
  log(`تسجيل الدخول ${auth.cached ? '[توكن مخزّن]' : '[دخول جديد]'} | عدد البراندات: ${auth.businessUnitIds.length}`);

  const all = [];
  let ok = 0;
  for (const buid of auth.businessUnitIds) {
    const name = await getBrandName(auth.token, buid);
    try {
      const recs = await scrapeUnit(auth.token, buid, name);
      all.push(...recs);
      ok++;
      log(`  ✓ ${name}: ${recs.length} رقم`);
    } catch (e) {
      log(`  ✗ ${name}: ${e.message}`);
    }
  }

  const now = new Date().toISOString();
  const up = await store.upsertMany(all, now);
  log(`الإجمالي: براندات ناجحة ${ok}/${auth.businessUnitIds.length} | أرقام ملتقطة ${all.length} | جديد ${up.added} | الإجمالي بالمخزن ${up.total} | التخزين: ${store.usingDb ? 'Postgres' : 'JSON'}`);
  return { ...up, okBrands: ok };
}

module.exports = { runOnce, scrapeUnit };

if (require.main === module) {
  runOnce().then(() => process.exit(0)).catch((e) => { console.error('خطأ:', e.message); process.exit(1); });
}
