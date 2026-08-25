'use strict';
const fs = require('fs');
const path = require('path');
const config = require('./config');

// يحوّل brands.json إلى JSON مضغوط (سطر واحد) لوضعه في متغيّر SNOONU_BRANDS على Railway.
// شغّل:  npm run brands:export

const f = path.join(config.root, 'brands.json');
if (!fs.existsSync(f)) {
  console.error('لا يوجد brands.json — انسخ brands.example.json إليه واملأ الباسوردات.');
  process.exit(1);
}
let json;
try { json = JSON.parse(fs.readFileSync(f, 'utf8')); }
catch (e) { console.error('brands.json غير صالح:', e.message); process.exit(1); }

const min = JSON.stringify(json);
const out = path.join(config.root, 'snoonu_brands.txt');
fs.writeFileSync(out, min, 'utf8');

console.log('\n=== متغيّر SNOONU_BRANDS لـ Railway ===');
console.log('انسخ محتوى هذا الملف كاملاً وضعه في المتغيّر SNOONU_BRANDS:');
console.log('  ' + out);
console.log('الطول:', min.length, 'حرف (يناسب Railway ✓)');
console.log('\n⚠️ يحتوي باسوردات — لا تشاركه ولا ترفعه على GitHub.\n');
