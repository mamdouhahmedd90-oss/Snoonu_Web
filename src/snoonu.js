'use strict';
const config = require('./config');

// ------------------------------------------------------------------
//  عميل Snoonu API (HTTP فقط، بدون متصفح)
//  - login: يسجّل دخول ببريد+باسورد ويرجّع accessToken
//  - businessUnitId: يُستخرج من داخل التوكن (JWT)
//  - fetchOrdersPage: يجلب صفحة طلبات بالتوكن
// ------------------------------------------------------------------

const API = config.apiBase.replace(/\/$/, '');

function b64urlDecode(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64').toString('utf8');
}

// يقرأ حمولة JWT بدون تحقق (فقط لقراءة businessUnitId)
function jwtPayload(token) {
  try { return JSON.parse(b64urlDecode(String(token).split('.')[1])); } catch (_) { return null; }
}

// يبحث بشكل تكراري عن businessUnitId داخل حمولة التوكن
function findBusinessUnitId(obj) {
  if (!obj || typeof obj !== 'object') return null;
  for (const [k, v] of Object.entries(obj)) {
    if (/businessunitid/i.test(k) && v && (typeof v === 'string' || typeof v === 'number')) {
      return String(v).split(',')[0].trim();
    }
    if (v && typeof v === 'object') {
      const r = findBusinessUnitId(v);
      if (r) return r;
    }
  }
  return null;
}

async function httpJson(url, opts) {
  const res = await fetch(url, opts);
  let body = null;
  try { body = await res.json(); } catch (_) {}
  return { status: res.status, body };
}

// تسجيل الدخول — يجرّب أشكال جسم الطلب المعروفة حتى ينجح
async function login(brand) {
  const url = `${API}/api/Auth/LoginWithTwoFactor`;
  const variants = [
    { email: brand.email, password: brand.password },
    { email: brand.email, password: brand.password, twoFactorCode: null },
    { emailOrUsername: brand.email, password: brand.password },
    { userName: brand.email, password: brand.password },
  ];
  let lastErr = '';
  for (const payload of variants) {
    const { status, body } = await httpJson(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    const token = body && body.data && body.data.accessToken;
    if (token) {
      const buId = findBusinessUnitId(jwtPayload(token) || {});
      return { token, businessUnitId: buId, raw: body.data };
    }
    lastErr = `status ${status} ${body && (body.message || body.error) ? JSON.stringify(body.message || body.error) : ''}`;
  }
  throw new Error(`تعذّر تسجيل الدخول (${brand.email}): ${lastErr}`);
}

// جلب صفحة طلبات واحدة
async function fetchOrdersPage(token, businessUnitId, pageOffset) {
  const params = new URLSearchParams({
    pageSize: String(config.pageSize),
    pageOffset: String(pageOffset),
  });
  if (businessUnitId) params.set('businessUnitId', businessUnitId);
  const url = `${API}/api/Order?${params.toString()}`;
  const { status, body } = await httpJson(url, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  });
  if (status >= 400 || !body) throw new Error(`Order API status ${status}`);
  const data = Array.isArray(body.data) ? body.data : [];
  return data;
}

module.exports = { login, fetchOrdersPage, jwtPayload, findBusinessUnitId };
