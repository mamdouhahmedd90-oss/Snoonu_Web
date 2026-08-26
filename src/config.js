'use strict';
require('dotenv').config();
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');

// يحمّل بيانات البراندات من brands.json (محلي) أو متغيّر SNOONU_BRANDS (JSON) للنشر
function loadBrands() {
  if (process.env.SNOONU_BRANDS) {
    try { return JSON.parse(process.env.SNOONU_BRANDS); } catch (_) {}
  }
  const f = path.join(ROOT, 'brands.json');
  if (fs.existsSync(f)) {
    try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {
      console.error('[config] brands.json غير صالح:', e.message);
    }
  }
  return [];
}

module.exports = {
  root: ROOT,
  loginUrl: process.env.SNOONU_LOGIN_URL || 'https://snoonu-portal.kwt.snoonu.com/login',
  ordersUrl: process.env.SNOONU_ORDERS_URL || 'https://snoonu-portal.kwt.snoonu.com/v2/dashboard/order-history',
  apiBase: process.env.SNOONU_API_BASE || 'https://portal-api.kwt.snoonu.com',
  pageSize: Number(process.env.PAGE_SIZE || 100),
  brands: loadBrands(),

  headless: String(process.env.HEADLESS || 'true').toLowerCase() !== 'false',
  navTimeoutMs: Number(process.env.NAV_TIMEOUT_MS || 60000),
  countryCode: String(process.env.PHONE_COUNTRY_CODE || '965'),
  // أرقام سنونو دائمة (لا تختفي)، فالسحب مرة/مرتين باليوم كافٍ ويقلّل تسجيل الدخول
  intervalMinutes: Number(process.env.SCRAPE_INTERVAL_MINUTES || 720),
  maxPages: Number(process.env.MAX_PAGES || 15),
  tzOffsetHours: Number(process.env.TZ_OFFSET_HOURS || 3),

  dataDir: DATA_DIR,
  rawDir: path.join(DATA_DIR, 'raw'),
  authDir: path.join(ROOT, 'auth'),
  storePath: path.join(DATA_DIR, 'contacts.json'),
  excelPath: path.join(DATA_DIR, 'snoonu-contacts.xlsx'),
};
