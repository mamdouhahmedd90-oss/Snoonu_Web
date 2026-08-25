'use strict';
const config = require('./config');
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
  console.log(' للإيقاف: Ctrl + C');
  console.log('======================================');

  startServer();
  await tick();
  setInterval(tick, ms);
}

main();
