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

// تسجيل الدخول ببريد + باسورد
async function login(brand) {
  const url = `${API}/api/Auth/LoginWithTwoFactor`;
  const { status, body } = await httpJson(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ email: brand.email, password: brand.password }),
  });
  const data = body && body.data;
  if (data && data.accessToken) {
    const buId = findBusinessUnitId(jwtPayload(data.accessToken) || {});
    return { token: data.accessToken, businessUnitId: buId, raw: data };
  }
  if (data && data.requiresTwoFactor) {
    throw new Error(`${brand.name}: الحساب يطلب تحقق ثنائي (2FA) — لا يمكن الدخول الآلي`);
  }
  const msg = (body && (body.message || (body.error && body.error.message))) || `HTTP ${status}`;
  throw new Error(`فشل دخول ${brand.name} (${brand.email}): ${msg}`);
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
