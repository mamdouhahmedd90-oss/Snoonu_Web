'use strict';
const config = require('./config');

const CC = config.countryCode.replace(/\D/g, ''); // 965

// يطبّع رقم الهاتف: يرجّع { local, e164 } أو null
function normalizePhone(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  let digits = s.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (/^(\d)\1+$/.test(digits)) return null;

  let local = digits;
  if (digits.startsWith(CC) && digits.length === CC.length + 8) {
    local = digits.slice(CC.length);
  }
  // كويتي كامل
  if (local.length === 8 && /^[569]/.test(local)) {
    return { local, e164: '+' + CC + local };
  }
  // رقم أجنبي/آخر: احتفظ به كما هو إن كان معقولاً
  if (digits.length >= 7 && digits.length <= 15) {
    return { local: digits, e164: (s.startsWith('+') ? '+' : '+') + digits };
  }
  return null;
}

// يحوّل استجابة api/Order إلى سجلات جهات اتصال
function extractOrders(json, brandName) {
  const arr = json && Array.isArray(json.data) ? json.data : (Array.isArray(json) ? json : []);
  const out = [];
  for (const o of arr) {
    if (!o || typeof o !== 'object') continue;
    const p = normalizePhone(o.phoneNumber);
    if (!p) continue;
    out.push({
      phone: p.local,
      phoneE164: p.e164,
      context: {
        name: o.customerName || '',
        brand: brandName || '',
        branch: (o.orderBranch && o.orderBranch.name) || '',
        address: (o.shippingAddress && (o.shippingAddress.addressLine || o.shippingAddress.address)) || '',
        orderId: String(o.customerFriendlyId || o.orderId || o.id || ''),
        time: o.createdAt || '',
        customerId: String(o.customerId || ''),
      },
      source: brandName || 'snoonu',
    });
  }
  return out;
}

module.exports = { normalizePhone, extractOrders };
