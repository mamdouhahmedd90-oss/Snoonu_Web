'use strict';
// ------------------------------------------------------------------
//  تخزين على Postgres (يُستخدم تلقائياً عند وجود DATABASE_URL)
//  جدول contacts: مفتاح فريد record_key = رقم|طلب، مع upsert.
//  ملاحظة: مكتبة pg تُحمّل بشكل كسول حتى لا تكون مطلوبة في وضع JSON المحلي.
// ------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL || '';

let pool = null;
function getPool() {
  if (!pool) {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: DATABASE_URL, ssl: sslOption() });
  }
  return pool;
}
function sslOption() {
  if (String(process.env.PGSSL || '').toLowerCase() === 'disable') return false;
  if (/railway\.internal|localhost|127\.0\.0\.1/.test(DATABASE_URL)) return false;
  return { rejectUnauthorized: false };
}

function recordKey(rec) {
  const oid = rec.context && rec.context.orderId;
  return oid ? `${rec.phone}|${oid}` : rec.phone;
}

let inited = false;
async function init() {
  if (inited) return;
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS contacts (
      record_key  TEXT PRIMARY KEY,
      phone       TEXT NOT NULL,
      phone_e164  TEXT,
      name        TEXT,
      brand       TEXT,
      order_id    TEXT,
      order_time  TEXT,
      context     JSONB,
      source      TEXT,
      first_seen  TIMESTAMPTZ,
      last_seen   TIMESTAMPTZ,
      seen_count  INTEGER DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
    CREATE INDEX IF NOT EXISTS idx_contacts_brand ON contacts(brand);
    CREATE INDEX IF NOT EXISTS idx_contacts_last_seen ON contacts(last_seen DESC);
  `);
  inited = true;
}

async function upsertMany(records, nowIso) {
  await init();
  if (!records.length) return { added: 0, updated: 0, total: await count() };
  const client = await getPool().connect();
  let added = 0;
  try {
    await client.query('BEGIN');
    for (const rec of records) {
      const key = recordKey(rec);
      const c = rec.context || {};
      const res = await client.query(
        `INSERT INTO contacts
           (record_key, phone, phone_e164, name, brand, order_id, order_time, context, source, first_seen, last_seen, seen_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,1)
         ON CONFLICT (record_key) DO UPDATE SET
           last_seen  = $10,
           seen_count = contacts.seen_count + 1,
           context    = contacts.context || EXCLUDED.context,
           name       = COALESCE(NULLIF(EXCLUDED.name,''), contacts.name),
           order_time = COALESCE(NULLIF(EXCLUDED.order_time,''), contacts.order_time)
         RETURNING (xmax = 0) AS inserted`,
        [key, rec.phone, rec.phoneE164 || '', c.name || '', c.brand || '',
          c.orderId || '', c.time || '', JSON.stringify(c), rec.source || '', nowIso]
      );
      if (res.rows[0] && res.rows[0].inserted) added++;
    }
    await client.query('COMMIT');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw e;
  } finally {
    client.release();
  }
  const total = await count();
  return { added, updated: records.length - added, total };
}

async function count() {
  await init();
  const r = await getPool().query('SELECT COUNT(*)::int AS n FROM contacts');
  return r.rows[0].n;
}

// يرجّع سجلات بنفس شكل مخزن JSON (لإعادة استخدام contactsRows)
async function allRecords() {
  await init();
  const r = await getPool().query(
    `SELECT phone, phone_e164, context, source, first_seen, last_seen, seen_count
     FROM contacts ORDER BY last_seen DESC`
  );
  return r.rows.map((row) => ({
    phone: row.phone,
    phoneE164: row.phone_e164,
    context: row.context || {},
    source: row.source || '',
    firstSeen: row.first_seen ? new Date(row.first_seen).toISOString() : '',
    lastSeen: row.last_seen ? new Date(row.last_seen).toISOString() : '',
    seenCount: row.seen_count || 1,
  }));
}

module.exports = { init, upsertMany, count, allRecords, isEnabled: () => !!DATABASE_URL };
