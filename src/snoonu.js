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

// كاش للتوكن لكل براند (لتقليل عدد مرات تسجيل الدخول = أهدأ على حماية سنونو)
const _authCache = new Map();

function tokenExpMs(token, rawExpiration) {
  const p = jwtPayload(token);
  if (p && p.exp) return p.exp * 1000;
  if (rawExpiration) { const t = Date.parse(rawExpiration); if (!Number.isNaN(t)) return t; }
  return Date.now() + 60 * 60 * 1000;
}

// يرجّع توكن صالح من الكاش، أو يسجّل دخول جديد فقط لو انتهى/قارب على الانتهاء
async function getAuth(brand) {
  const cached = _authCache.get(brand.email);
  if (cached && Date.now() < cached.expMs - 5 * 60 * 1000) {
    return { token: cached.token, businessUnitId: cached.businessUnitId, cached: true };
  }
  const auth = await login(brand);
  _authCache.set(brand.email, {
    token: auth.token,
    businessUnitId: auth.businessUnitId,
    expMs: tokenExpMs(auth.token, auth.raw && auth.raw.expiration),
  });
  return { ...auth, cached: false };
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

module.exports = { login, getAuth, fetchOrdersPage, jwtPayload, findBusinessUnitId };
