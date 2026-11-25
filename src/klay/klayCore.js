// =====================================================================
// KLAY module — shared core: responses, ids, auth (console staff),
// role scoping, audit log, seat maths, Razorpay helpers.
// Everything here is used only by /api/klay/* routes.
// =====================================================================
import jwt from '@tsndr/cloudflare-worker-jwt';

export const HOLD_MINUTES = 10;
export const DOC_TYPES = ['aadhaar', 'pan', 'address_proof', 'police_verification', 'bank_details', 'agreement'];
export const DOC_LABELS = {
  aadhaar: 'Aadhaar',
  pan: 'PAN',
  address_proof: 'Address proof',
  police_verification: 'Police verification',
  bank_details: 'Bank details (for payouts)',
  agreement: 'Agreement',
};
export const ROLES = ['hq', 'city', 'centre', 'coach'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
  });
}
export const ok = (data = {}) => json({ success: true, ...data });
export const fail = (message, status = 400, extra = {}) => json({ success: false, message, ...extra }, status);

export function nowIso() { return new Date().toISOString(); }
export function newId(prefix) {
  const rand = crypto.getRandomValues(new Uint8Array(6));
  return `${prefix}_${Date.now().toString(36)}${[...rand].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 8)}`;
}
export function shortCode(len = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}
export function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '')
    .trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 60);
}
export async function body(request) {
  try { return await request.json(); } catch { return {}; }
}
export function parseJson(v, fallback) {
  if (v == null || v === '') return fallback;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return fallback; }
}
export const db = (env) => env.KUDDL_DB;
export async function all(env, sql, ...binds) {
  const r = await db(env).prepare(sql).bind(...binds).all();
  return r?.results || [];
}
export async function first(env, sql, ...binds) {
  return db(env).prepare(sql).bind(...binds).first();
}
export async function run(env, sql, ...binds) {
  return db(env).prepare(sql).bind(...binds).run();
}

// ---------------------------------------------------------------- passwords
// PBKDF2-SHA256 via WebCrypto: pbkdf2$<iterations>$<salt b64>$<hash b64>
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 100000;
  const hash = await pbkdf2(password, salt, iterations);
  return `pbkdf2$${iterations}$${b64(salt)}$${b64(hash)}`;
}
export async function verifyPassword(password, stored) {
  try {
    const [scheme, iter, salt, hash] = String(stored || '').split('$');
    if (scheme !== 'pbkdf2') return false;
    const got = new Uint8Array(await pbkdf2(password, unb64(salt), Number(iter)));
    const want = unb64(hash);
    if (got.length !== want.length) return false;
    let diff = 0;
    for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
    return diff === 0;
  } catch { return false; }
}

// ---------------------------------------------------------------- staff auth
const TOKEN_TTL_S = 60 * 60 * 12; // 12 h console session
export async function signStaffToken(env, staff) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({ klay: true, sid: staff.id, role: staff.role, iat: now, exp: now + TOKEN_TTL_S }, env.JWT_SECRET);
}
/**
 * Returns the active klay_staff row for the bearer token, or null.
 * Two kinds of token are accepted:
 *  - a KLAY team token (City Manager / Centre Director / Coach), issued by
 *    /api/klay/console/login or the KLAY phone-OTP verify;
 *  - the HQ's normal Kuddl partner token (partner login / OTP): it maps to
 *    the org's HQ row through klay_staff.provider_id.
 * Either way the organisation must be active.
 */
export async function staffFromRequest(request, env) {
  const h = request.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  const token = h.slice(7);
  try {
    if (!(await jwt.verify(token, env.JWT_SECRET))) return null;
    const p = jwt.decode(token)?.payload || {};
    if (p.type === 'refresh') return null;
    if (p.klay && p.sid) {
      return (await first(env, `SELECT s.* FROM klay_staff s JOIN klay_orgs o ON o.id = s.org_id
        WHERE s.id = ? AND s.status = 'active' AND o.status = 'active'`, p.sid)) || null;
    }
    if (p.id && (p.role === 'partner' || p.role === 'provider')) {
      return (await first(env, `SELECT s.* FROM klay_staff s JOIN klay_orgs o ON o.id = s.org_id
        WHERE s.provider_id = ? AND s.role = 'hq' AND s.status = 'active' AND o.status = 'active'`, p.id)) || null;
    }
    return null;
  } catch { return null; }
}
export function publicStaff(s) {
  if (!s) return null;
  const { password_hash, ...rest } = s;
  return rest;
}

// ---------------------------------------------------------------- scoping
// HQ sees everything; City Manager their city; Centre Director their centre;
// Coach only their own classes (read-only).
export function centreScopeSql(staff, alias = 'c') {
  if (staff.role === 'hq') return { sql: `${alias}.org_id = ?`, binds: [staff.org_id] };
  if (staff.role === 'city') return { sql: `${alias}.org_id = ? AND ${alias}.city_id = ?`, binds: [staff.org_id, staff.city_id] };
  return { sql: `${alias}.id = ?`, binds: [staff.centre_id] };
}
export async function canSeeCentre(env, staff, centreId) {
  if (!centreId) return false;
  if (staff.role === 'centre' || staff.role === 'coach') return staff.centre_id === centreId;
  const c = await first(env, 'SELECT city_id, org_id FROM klay_centres WHERE id = ?', centreId);
  if (!c || c.org_id !== staff.org_id) return false;
  return staff.role === 'hq' || c.city_id === staff.city_id;
}
/** Can this staff member edit the centre's data (programmes, batches, seats, coaches)? */
export async function canEditCentre(env, staff, centreId) {
  if (staff.role === 'coach') return false;
  return canSeeCentre(env, staff, centreId);
}
export const isApprover = (staff) => staff.role === 'hq' || staff.role === 'city';

export async function audit(env, staff, action, entity, entityId, detail) {
  try {
    await run(env,
      'INSERT INTO klay_audit_log (id, staff_id, staff_role, action, entity, entity_id, detail, created_at, org_id) VALUES (?,?,?,?,?,?,?,?,?)',
      newId('kal'), staff?.id || null, staff?.role || null, action, entity || null, entityId || null,
      detail ? JSON.stringify(detail) : null, nowIso(), staff?.org_id || null);
  } catch (e) { console.warn('klay audit failed', e?.message); }
}

// ---------------------------------------------------------------- seats
// Expire stale holds first so they free their seat everywhere at once.
export async function expireHolds(env) {
  await run(env, "UPDATE klay_bookings SET status = 'expired', updated_at = ? WHERE status = 'held' AND hold_expires_at < ?", nowIso(), nowIso());
}
/** Seat numbers for a set of batch ids: { [batchId]: {capacity, offline, online, held, left} } */
export async function seatMap(env, batchIds) {
  const out = {};
  if (!batchIds.length) return out;
  const ph = batchIds.map(() => '?').join(',');
  const rows = await all(env, `
    SELECT b.id, b.capacity, b.booked_offline,
      COALESCE(SUM(CASE WHEN k.status = 'confirmed' AND k.takes_seat = 1 THEN 1 ELSE 0 END), 0) AS online,
      COALESCE(SUM(CASE WHEN k.status = 'held' AND k.takes_seat = 1 AND k.hold_expires_at >= ? THEN 1 ELSE 0 END), 0) AS held
    FROM klay_batches b LEFT JOIN klay_bookings k ON k.batch_id = b.id
    WHERE b.id IN (${ph}) GROUP BY b.id`, nowIso(), ...batchIds);
  for (const r of rows) {
    const capacity = Number(r.capacity) || 0;
    const offline = Number(r.booked_offline) || 0;
    const online = Number(r.online) || 0;
    const held = Number(r.held) || 0;
    out[r.id] = { capacity, offline, online, held, booked: offline + online, left: Math.max(0, capacity - offline - online - held) };
  }
  return out;
}

// ---------------------------------------------------------------- formatting
const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABEL = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
export function normDays(days) {
  const arr = Array.isArray(days) ? days : parseJson(days, []);
  return DAY_ORDER.filter((d) => arr.map((x) => String(x).toLowerCase().slice(0, 3)).includes(d));
}
export function daysLabel(days) { return normDays(days).map((d) => DAY_LABEL[d]).join(' & '); }
export function to12h(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ''));
  if (!m) return String(t || '');
  let h = Number(m[1]); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${h}:${m[2]} ${ap}`;
}
export function timeRange(a, b) {
  const A = to12h(a), B = to12h(b);
  const sa = A.slice(-2), sb = B.slice(-2);
  return sa === sb ? `${A.slice(0, -3)}–${B}` : `${A}–${B}`;
}
export function validTime(t) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t || '')); }
export function ageLabel(min, max) {
  if (min == null && max == null) return '';
  if (max == null) return `Ages ${min}+`;
  return `Ages ${min}–${max}`;
}

// ---------------------------------------------------------------- razorpay
export async function razorpayOrder(env, amountRupees, receipt) {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) throw new Error('Payments are not configured');
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`)}` },
    body: JSON.stringify({ amount: Math.round(amountRupees * 100), currency: 'INR', receipt: String(receipt).slice(0, 40), payment_capture: 1 }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.description || 'Could not start payment');
  return data;
}
export async function razorpaySignatureOk(env, orderId, paymentId, signature) {
  if (!env.RAZORPAY_KEY_SECRET || !orderId || !paymentId || !signature) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.RAZORPAY_KEY_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${orderId}|${paymentId}`));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (hex.length !== String(signature).length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ String(signature).charCodeAt(i);
  return diff === 0;
}
export async function razorpayRefund(env, paymentId) {
  try {
    if (!String(paymentId || '').startsWith('pay_')) return false;
    const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`)}` },
      body: '{}',
    });
    return res.ok;
  } catch { return false; }
}
