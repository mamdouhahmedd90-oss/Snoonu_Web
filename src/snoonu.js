'use strict';
const config = require('./config');
const db = require('./db');

// ------------------------------------------------------------------
//  عميل Snoonu — حساب ماستر واحد يغطّي كل البراندات (دخول واحد)
//  - login: يسجّل دخول ويرجّع token + كل businessUnitIds من التوكن
//  - getBrandName: اسم البراند مقابل الـid (كاش)
//  - getAuth: يعيد استخدام التوكن (كاش بالذاكرة + قاعدة البيانات) لتقليل الدخول
//  ترويسات شبيهة بالمتصفح لتبدو الطلبات طبيعية.
// ------------------------------------------------------------------

const API = config.apiBase.replace(/\/$/, '');
const H = {
  'content-type': 'application/json',
  accept: 'application/json, text/plain, */*',
  'accept-language': 'en-US,en;q=0.9,ar;q=0.8',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
  origin: 'https://snoonu-portal.kwt.snoonu.com',
  referer: 'https://snoonu-portal.kwt.snoonu.com/',
};

function b64urlDecode(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64').toString('utf8');
}
function jwtPayload(token) {
  try { return JSON.parse(b64urlDecode(String(token).split('.')[1])); } catch (_) { return null; }
}

// يجمع كل الـ BusinessUnitIds من التوكن (الماستر يحوي كل البراندات)
function allBusinessUnitIds(payload) {
  const out = [];
  for (const a of (payload && payload.userAccess) || []) {
    const b = a.BusinessUnitIds || a.businessUnitIds || '';
    if (b && b !== '*') out.push(...String(b).split(',').map((x) => x.trim()).filter(Boolean));
  }
  return [...new Set(out)];
}

async function httpJson(url, opts) {
  const res = await fetch(url, opts);
  let body = null;
  try { body = await res.json(); } catch (_) {}
  return { status: res.status, body };
}

// تسجيل الدخول
async function login(account) {
  const { status, body } = await httpJson(`${API}/api/Auth/LoginWithTwoFactor`, {
    method: 'POST', headers: H, body: JSON.stringify({ email: account.email, password: account.password }),
  });
  const data = body && body.data;
  if (data && data.accessToken) {
    return { token: data.accessToken, businessUnitIds: allBusinessUnitIds(jwtPayload(data.accessToken)), raw: data };
  }
  if (data && data.requiresTwoFactor) throw new Error(`${account.name || account.email}: يتطلب تحقق ثنائي (2FA)`);
  const msg = (body && (body.message || (body.error && body.error.message))) || `HTTP ${status}`;
  throw new Error(`فشل دخول (${account.email}): ${msg}`);
}

// كاش أسماء البراندات
const _brandNames = new Map();
async function getBrandName(token, buid) {
  if (_brandNames.has(buid)) return _brandNames.get(buid);
  try {
    const { body } = await httpJson(`${API}/api/pps/Brands/${buid}`, { headers: { authorization: `Bearer ${token}`, ...H } });
    const d = (body && (body.data || body)) || {};
    const name = d.name || d.title || d.nameEn || buid;
    _brandNames.set(buid, name);
    return name;
  } catch (_) { return buid; }
}

// جلب صفحة طلبات لبراند (businessUnitId)
async function fetchOrdersPage(token, businessUnitId, pageOffset) {
  const params = new URLSearchParams({ pageSize: String(config.pageSize), pageOffset: String(pageOffset) });
  if (businessUnitId) params.set('businessUnitId', businessUnitId);
  const { status, body } = await httpJson(`${API}/api/Order?${params.toString()}`, {
    headers: { authorization: `Bearer ${token}`, ...H },
  });
  if (status >= 400 || !body) throw new Error(`Order API status ${status}`);
  return Array.isArray(body.data) ? body.data : [];
}

// ---------- إعادة استخدام التوكن (كاش ذاكرة + قاعدة بيانات) ----------
let _mem = null; // { token, businessUnitIds, expMs }

function tokenExpMs(token, rawExpiration) {
  const p = jwtPayload(token);
  if (p && p.exp) return p.exp * 1000;
  if (rawExpiration) { const t = Date.parse(rawExpiration); if (!Number.isNaN(t)) return t; }
  return Date.now() + 60 * 60 * 1000;
}
function valid(a) { return a && a.token && Date.now() < a.expMs - 5 * 60 * 1000; }

async function getAuth(account) {
  if (valid(_mem)) return { ..._mem, cached: true };
  // جرّب من قاعدة البيانات (يبقى محفوظ عبر عمليات النشر)
  if (db.isEnabled()) {
    try {
      const saved = await db.getState('snoonu_auth');
      if (valid(saved)) { _mem = saved; return { ...saved, cached: true }; }
    } catch (_) {}
  }
  // دخول جديد
  const a = await login(account);
  _mem = { token: a.token, businessUnitIds: a.businessUnitIds, expMs: tokenExpMs(a.token, a.raw && a.raw.expiration) };
  if (db.isEnabled()) { try { await db.setState('snoonu_auth', _mem); } catch (_) {} }
  return { ..._mem, cached: false };
}

module.exports = { login, getAuth, getBrandName, fetchOrdersPage, jwtPayload, allBusinessUnitIds };
