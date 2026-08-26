'use strict';
const config = require('./config');
const store = require('./store');
const { runOnce } = require('./scrape');
const { startServer } = require('./server');

let running = false;

async function tick() {
  if (running) return;
  running = true;
  try { await runOnce(); }
  catch (e) { console.error(`[${new Date().toISOString()}] خطأ في السحب:`, e.message); }
  finally { running = false; }
}

async function main() {
  const ms = Math.max(1, config.intervalMinutes) * 60 * 1000;
  console.log('======================================');
  console.log(' Snoonu Scraper — التشغيل المجدول');
  console.log(` الفترة: ${config.intervalMinutes} دقيقة | براندات: ${config.brands.length}`);
  console.log(` التخزين: ${store.usingDb ? 'Postgres (DATABASE_URL)' : 'JSON محلي'}`);
  console.log(' للإيقاف: Ctrl + C');
  console.log('======================================');

  try { await store.init(); } catch (e) { console.error('تعذّر تهيئة قاعدة البيانات:', e.message); }
  startServer();
  await tick();
  setInterval(tick, ms);
}

main();
