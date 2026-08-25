'use strict';
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { chromium } = require('playwright');
const config = require('./config');

// ------------------------------------------------------------------
//  أداة استكشاف Snoonu: تسجّل دخول ببراند واحد، وتكشف:
//   - شكل تسجيل الدخول (وهل فيه كابتشا)
//   - رابط صفحة الطلبات وردود الـ API (لإيجاد الأرقام)
//   - عناصر الترقيم
//  شغّل:  npm run inspect          (أول براند)
//         npm run inspect 3        (البراند رقم 3 في القائمة)
// ------------------------------------------------------------------

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(q, (a) => { rl.close(); res(a); }));
}

function ensureDirs() {
  for (const d of [config.dataDir, config.rawDir]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

async function tryFill(page, selectors, value) {
  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el) {
      try { await el.fill(value); return sel; } catch (_) {}
    }
  }
  return null;
}

async function main() {
  ensureDirs();
  const idx = Number(process.argv[2] || 0);
  const brand = config.brands[idx];
  if (!brand) {
    console.error('لا توجد بيانات براندات. انسخ brands.example.json إلى brands.json واملأ الباسوردات.');
    process.exit(1);
  }
  console.log(`=== استكشاف Snoonu — البراند: ${brand.name} (${brand.email}) ===`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(config.navTimeoutMs);

  const captured = [];
  context.on('response', async (r) => {
    try {
      const ct = (r.headers()['content-type'] || '').toLowerCase();
      if (!ct.includes('json')) return;
      const body = await r.json().catch(() => null);
      if (body == null) return;
      captured.push({ url: r.url(), json: body });
    } catch (_) {}
  });

  // التقط طلب الطلبات (لمعرفة آلية المصادقة: توكن/كوكيز)
  let orderReq = null;
  context.on('request', (r) => {
    try {
      const u = r.url();
      if (/\/api\/Order(\?|\b)/i.test(u) && !/BySections/i.test(u) && !orderReq) {
        orderReq = { url: u, method: r.method(), headers: r.headers(), postData: r.postData() || null };
      }
    } catch (_) {}
  });

  // 1) صفحة الدخول + محاولة تعبئة تلقائية
  console.log('فتح صفحة الدخول…');
  await page.goto(config.loginUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(2500);

  const emailSel = await tryFill(page, [
    'input[type="email"]', 'input[name*="email" i]', 'input[id*="email" i]',
    'input[placeholder*="email" i]', 'input[type="text"]',
  ], brand.email);
  const passSel = await tryFill(page, [
    'input[type="password"]', 'input[name*="pass" i]', 'input[id*="pass" i]',
  ], brand.password);
  console.log('حقل الإيميل:', emailSel || 'لم يُوجد', '| حقل الباسورد:', passSel || 'لم يُوجد');

  // زر الدخول
  const clicked = await page.evaluate(() => {
    const cand = Array.from(document.querySelectorAll('button, [type="submit"], input[type="submit"]'));
    const btn = cand.find((b) => /login|sign in|log in|دخول|تسجيل/i.test((b.textContent || '') + ' ' + (b.value || '')));
    if (btn) { btn.click(); return true; }
    return false;
  }).catch(() => false);
  if (!clicked && passSel) { await page.press(passSel, 'Enter').catch(() => {}); }

  await page.waitForTimeout(4000);

  console.log('\n>>> لو ظهرت كابتشا أو خطوة تحقق، اعملها الآن في المتصفح وتأكد إنك دخلت.');
  await ask('>>> بعد ما تتأكد إنك سجّلت دخول، اضغط Enter لأفتح صفحة الطلبات تلقائياً…');

  // 2) انتقل لصفحة الطلبات تلقائياً ثم مرّر والتقط
  console.log('فتح صفحة الطلبات:', config.ordersUrl);
  await page.goto(config.ordersUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
  await page.waitForTimeout(2500);

  const lines = [];
  const out = (...a) => { const s = a.join(' '); console.log(s); lines.push(s); };

  out('\n=== الرابط الحالي ===');
  out(page.url());

  out('\n=== الإطارات (frames) ===');
  for (const f of page.frames()) out('  -', f.url().slice(0, 120));

  // احفظ ردود JSON الخام (المرشّحة أنها طلبات = الأكبر/فيها أرقام)
  out('\n=== ردود JSON الملتقطة (' + captured.length + ') ===');
  let savedCount = 0;
  for (const { url, json } of captured) {
    const str = JSON.stringify(json);
    const hasPhone = /\d{7,}/.test(str);
    const big = str.length > 800;
    const isOrder = /\/api\/Order(\?|\b)/i.test(url) && !/BySections/i.test(url);
    out(`  [${str.length} حرف]${hasPhone ? ' (فيه أرقام)' : ''}${isOrder ? ' [الطلبات★]' : ''} ${url.slice(0, 110)}`);
    // احفظ استجابة الطلبات دائماً (بالأولوية)، وباقي الاستجابات ذات الأرقام حتى 12
    if (isOrder || (hasPhone && big && savedCount < 12)) {
      const safe = (isOrder ? 'ORDER_' : '') + (url.split('?')[0].split('/').slice(-1)[0] || 'resp').replace(/[^a-z0-9_-]/gi, '_').slice(0, 50);
      fs.writeFileSync(path.join(config.rawDir, `${Date.now()}_${savedCount}_${safe}.json`), JSON.stringify(json, null, 2));
      savedCount++;
    }
  }
  out(`\nحُفظت ${savedCount} استجابة خام في: data/raw/`);

  out('\n=== طلب الطلبات (Order request) — آلية المصادقة ===');
  if (orderReq) {
    const h = orderReq.headers || {};
    out('  method:', orderReq.method, '| url:', orderReq.url.slice(0, 120));
    out('  authorization:', h.authorization ? h.authorization.slice(0, 20) + '…(موجود ✓)' : '(لا يوجد)');
    out('  cookie:', h.cookie ? '(موجود)' : '(لا يوجد)');
    out('  كل الترويسات:', Object.keys(h).join(', '));
  } else {
    out('  لم يُلتقط طلب Order — افتح صفحة الطلبات جيداً.');
  }

  // عناصر ترقيم محتملة (عبر كل الإطارات، مع اختراق shadow DOM)
  const PAGER_FN = () => {
    const acc = [];
    const all = (root) => { for (const el of root.querySelectorAll('*')) { acc.push(el); if (el.shadowRoot) all(el.shadowRoot); } };
    all(document);
    const res = [];
    for (const el of acc) {
      const cls = (el.className && el.className.toString) ? el.className.toString() : '';
      const aria = (el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title') || '')) || '';
      if (/pag(e|er|inat)|next|prev|arrow/i.test(cls + ' ' + aria) && el.children.length <= 2 && res.length < 20) {
        res.push({ tag: el.tagName, cls: cls.slice(0, 70), aria, text: (el.textContent || '').trim().slice(0, 20) });
      }
    }
    return res;
  };
  out('\n=== عناصر ترقيم محتملة ===');
  for (const f of page.frames()) {
    let r = null; try { r = await f.evaluate(PAGER_FN); } catch (_) {}
    if (r && r.length) { out('  إطار:', f.url().slice(0, 60)); r.forEach((c) => out('    ', JSON.stringify(c))); }
  }

  const dumpFile = path.join(config.dataDir, 'snoonu_dump.txt');
  fs.writeFileSync(dumpFile, lines.join('\n'), 'utf8');
  out('\n✓ التقرير محفوظ في:', dumpFile);
  out('ابعت محتوى الملف ده + قول أي استجابة فيها الأرقام.');

  await ask('اضغط Enter لإغلاق المتصفح…');
  await browser.close();
}

main().catch((e) => { console.error('خطأ:', e.message); process.exit(1); });
