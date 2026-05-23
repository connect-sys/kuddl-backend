/**
 * MPIN login + setup.
 *
 * After a customer (parent) finishes profile setup, or a partner (provider)
 * reaches kyc_status='verified', they can set a 4-6 digit MPIN. Subsequent
 * logins can be done with phone + MPIN instead of an SMS OTP each time.
 */

import bcrypt from 'bcryptjs';
import jwt from '@tsndr/cloudflare-worker-jwt';
import { addCorsHeaders } from '../utils/cors.js';

const json = (body, status = 200) =>
  addCorsHeaders(new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));

const MPIN_LOCK_THRESHOLD = 5;       // consecutive wrong attempts before lockout
const MPIN_LOCK_MINUTES   = 15;      // lockout duration

const isValidMpin = (raw) => typeof raw === 'string' && /^\d{4,6}$/.test(raw.trim());

const normalizePhone = (raw) => {
  if (!raw) return '';
  let p = String(raw).trim();
  // Keep digits and a leading + only.
  p = p.replace(/[^\d+]/g, '');
  // Indian numbers without country code → assume +91.
  if (/^\d{10}$/.test(p)) p = `+91${p}`;
  if (!p.startsWith('+')) p = `+${p}`;
  return p;
};

async function ensureColumns(env) {
  // Best-effort guard in case the migration hasn't been applied yet.
  const stmts = [
    "ALTER TABLE parents ADD COLUMN mpin_hash TEXT",
    "ALTER TABLE parents ADD COLUMN mpin_updated_at TEXT",
    "ALTER TABLE parents ADD COLUMN mpin_failed_attempts INTEGER DEFAULT 0",
    "ALTER TABLE parents ADD COLUMN mpin_locked_until TEXT",
    "ALTER TABLE providers ADD COLUMN mpin_hash TEXT",
    "ALTER TABLE providers ADD COLUMN mpin_updated_at TEXT",
    "ALTER TABLE providers ADD COLUMN mpin_failed_attempts INTEGER DEFAULT 0",
    "ALTER TABLE providers ADD COLUMN mpin_locked_until TEXT",
  ];
  for (const sql of stmts) {
    try { await env.KUDDL_DB.prepare(sql).run(); } catch { /* duplicate column / table-missing — ignore */ }
  }
}

async function authedUser(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.substring(7);
  if (!(await jwt.verify(token, env.JWT_SECRET))) return null;
  const decoded = jwt.decode(token);
  return decoded?.payload || null;
}

// ---------------------------------------------------------------------------
// GET /api/auth/mpin/status?phone=...&role=customer|partner
// Used by the login screen to decide whether to show the MPIN keypad or the
// OTP flow.
// ---------------------------------------------------------------------------
export async function getMpinStatus(request, env) {
  try {
    await ensureColumns(env);
    const url = new URL(request.url);
    const role = (url.searchParams.get('role') || 'customer').toLowerCase();
    const phone = normalizePhone(url.searchParams.get('phone') || '');
    if (!phone) return json({ success: false, message: 'phone is required' }, 400);

    const table = role === 'partner' ? 'providers' : 'parents';
    const row = await env.KUDDL_DB.prepare(
      `SELECT mpin_hash, mpin_locked_until FROM ${table} WHERE phone = ? LIMIT 1`
    ).bind(phone).first();

    const locked = row?.mpin_locked_until && new Date(row.mpin_locked_until) > new Date();
    return json({
      success: true,
      hasMpin: !!row?.mpin_hash,
      locked: !!locked,
      lockedUntil: locked ? row.mpin_locked_until : null,
    });
  } catch (error) {
    return json({ success: false, message: 'Failed to check MPIN status', error: error.message }, 500);
  }
}

// ---------------------------------------------------------------------------
// POST /api/customer/mpin/set   (auth: customer token)
// Body: { mpin: '1234' }
// Profile-complete gate: parent must have a full_name and at least one of email
// or address set (i.e. they've gone through the profile completion screen).
// ---------------------------------------------------------------------------
export async function setCustomerMpin(request, env) {
  try {
    await ensureColumns(env);
    const payload = await authedUser(request, env);
    if (!payload) return json({ success: false, message: 'Authorization required' }, 401);
    if (payload.role && payload.role !== 'customer') {
      return json({ success: false, message: 'Customer auth required' }, 403);
    }

    const { mpin } = await request.json().catch(() => ({}));
    if (!isValidMpin(mpin)) return json({ success: false, message: 'MPIN must be 4–6 digits' }, 400);

    const parent = await env.KUDDL_DB.prepare(
      `SELECT id, fullname, email, address FROM parents WHERE id = ? LIMIT 1`
    ).bind(payload.id).first();
    if (!parent) return json({ success: false, message: 'Parent profile not found' }, 404);

    const fullName = (parent.fullname || '').trim();
    const profileComplete = !!fullName && (!!parent.email || !!parent.address);
    if (!profileComplete) {
      return json({ success: false, message: 'Please complete your profile before setting an MPIN' }, 412);
    }

    const hash = await bcrypt.hash(String(mpin).trim(), 10);
    await env.KUDDL_DB.prepare(
      `UPDATE parents
         SET mpin_hash = ?,
             mpin_updated_at = CURRENT_TIMESTAMP,
             mpin_failed_attempts = 0,
             mpin_locked_until = NULL
         WHERE id = ?`
    ).bind(hash, payload.id).run();

    return json({ success: true, message: 'MPIN set successfully' });
  } catch (error) {
    return json({ success: false, message: 'Failed to set MPIN', error: error.message }, 500);
  }
}

// ---------------------------------------------------------------------------
// POST /api/customer/mpin/login
// Body: { phone, mpin }
// Returns a customer JWT identical to the OTP-verified one.
// ---------------------------------------------------------------------------
export async function loginCustomerWithMpin(request, env) {
  try {
    await ensureColumns(env);
    const body = await request.json().catch(() => ({}));
    const phone = normalizePhone(body.phone);
    const mpin = (body.mpin || '').toString().trim();
    if (!phone) return json({ success: false, message: 'Phone is required' }, 400);
    if (!isValidMpin(mpin)) return json({ success: false, message: 'Enter a valid MPIN' }, 400);

    const parent = await env.KUDDL_DB.prepare(
      `SELECT id, phone, fullname, email, mpin_hash, mpin_failed_attempts, mpin_locked_until
       FROM parents WHERE phone = ? LIMIT 1`
    ).bind(phone).first();
    if (!parent || !parent.mpin_hash) {
      return json({ success: false, message: 'MPIN is not set for this number' }, 404);
    }
    if (parent.mpin_locked_until && new Date(parent.mpin_locked_until) > new Date()) {
      return json({ success: false, message: 'MPIN locked due to too many failed attempts. Try later or reset via OTP.' }, 423);
    }

    const ok = await bcrypt.compare(mpin, parent.mpin_hash);
    if (!ok) {
      const fails = (parent.mpin_failed_attempts || 0) + 1;
      const lockUntil = fails >= MPIN_LOCK_THRESHOLD
        ? new Date(Date.now() + MPIN_LOCK_MINUTES * 60_000).toISOString()
        : null;
      await env.KUDDL_DB.prepare(
        `UPDATE parents SET mpin_failed_attempts = ?, mpin_locked_until = ? WHERE id = ?`
      ).bind(fails, lockUntil, parent.id).run();
      return json({
        success: false,
        message: lockUntil ? 'Too many wrong attempts. MPIN locked for 15 minutes.' : 'Incorrect MPIN',
        attemptsLeft: Math.max(0, MPIN_LOCK_THRESHOLD - fails),
      }, 401);
    }

    // success → reset counters and issue token
    await env.KUDDL_DB.prepare(
      `UPDATE parents SET mpin_failed_attempts = 0, mpin_locked_until = NULL WHERE id = ?`
    ).bind(parent.id).run();

    const token = await jwt.sign({
      id: parent.id,
      phone: parent.phone,
      role: 'customer',
      exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60),
    }, env.JWT_SECRET);

    const storedFullName = (parent.fullname || '').trim();
    const [firstName, ...rest] = storedFullName.split(' ');
    return json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: parent.id,
        phone: parent.phone,
        first_name: firstName || '',
        last_name: rest.join(' ') || '',
        full_name: storedFullName,
        email: parent.email || '',
        role: 'customer',
      },
    });
  } catch (error) {
    return json({ success: false, message: 'Failed to log in', error: error.message }, 500);
  }
}

// ---------------------------------------------------------------------------
// POST /api/partner/mpin/set   (auth: partner token)
// Body: { mpin: '1234' }
// Profile-complete gate: providers.kyc_status must be 'verified'.
// ---------------------------------------------------------------------------
export async function setPartnerMpin(request, env) {
  try {
    await ensureColumns(env);
    const payload = await authedUser(request, env);
    if (!payload) return json({ success: false, message: 'Authorization required' }, 401);

    const { mpin } = await request.json().catch(() => ({}));
    if (!isValidMpin(mpin)) return json({ success: false, message: 'MPIN must be 4–6 digits' }, 400);

    const providerId = payload.id || payload.partnerId || payload.userId;
    const provider = await env.KUDDL_DB.prepare(
      `SELECT id, kyc_status FROM providers WHERE id = ? LIMIT 1`
    ).bind(providerId).first();
    if (!provider) return json({ success: false, message: 'Partner profile not found' }, 404);
    if ((provider.kyc_status || '').toLowerCase() !== 'verified') {
      return json({ success: false, message: 'Please complete your profile before setting an MPIN' }, 412);
    }

    const hash = await bcrypt.hash(String(mpin).trim(), 10);
    await env.KUDDL_DB.prepare(
      `UPDATE providers
         SET mpin_hash = ?,
             mpin_updated_at = CURRENT_TIMESTAMP,
             mpin_failed_attempts = 0,
             mpin_locked_until = NULL
         WHERE id = ?`
    ).bind(hash, providerId).run();

    return json({ success: true, message: 'MPIN set successfully' });
  } catch (error) {
    return json({ success: false, message: 'Failed to set MPIN', error: error.message }, 500);
  }
}

// ---------------------------------------------------------------------------
// POST /api/partner/mpin/login
// Body: { phone, mpin }
// Returns a partner JWT identical to the OTP-verified one.
// ---------------------------------------------------------------------------
export async function loginPartnerWithMpin(request, env) {
  try {
    await ensureColumns(env);
    const body = await request.json().catch(() => ({}));
    const phone = normalizePhone(body.phone);
    const mpin = (body.mpin || '').toString().trim();
    if (!phone) return json({ success: false, message: 'Phone is required' }, 400);
    if (!isValidMpin(mpin)) return json({ success: false, message: 'Enter a valid MPIN' }, 400);

    const provider = await env.KUDDL_DB.prepare(
      `SELECT id, phone, name, email, business_name, kyc_status, is_active,
              mpin_hash, mpin_failed_attempts, mpin_locked_until
       FROM providers WHERE phone = ? LIMIT 1`
    ).bind(phone).first();
    if (!provider || !provider.mpin_hash) {
      return json({ success: false, message: 'MPIN is not set for this number' }, 404);
    }
    if (provider.is_active === 0) {
      return json({ success: false, message: 'Account is inactive' }, 403);
    }
    if (provider.mpin_locked_until && new Date(provider.mpin_locked_until) > new Date()) {
      return json({ success: false, message: 'MPIN locked due to too many failed attempts. Try later or reset via OTP.' }, 423);
    }

    const ok = await bcrypt.compare(mpin, provider.mpin_hash);
    if (!ok) {
      const fails = (provider.mpin_failed_attempts || 0) + 1;
      const lockUntil = fails >= MPIN_LOCK_THRESHOLD
        ? new Date(Date.now() + MPIN_LOCK_MINUTES * 60_000).toISOString()
        : null;
      await env.KUDDL_DB.prepare(
        `UPDATE providers SET mpin_failed_attempts = ?, mpin_locked_until = ? WHERE id = ?`
      ).bind(fails, lockUntil, provider.id).run();
      return json({
        success: false,
        message: lockUntil ? 'Too many wrong attempts. MPIN locked for 15 minutes.' : 'Incorrect MPIN',
        attemptsLeft: Math.max(0, MPIN_LOCK_THRESHOLD - fails),
      }, 401);
    }

    await env.KUDDL_DB.prepare(
      `UPDATE providers SET mpin_failed_attempts = 0, mpin_locked_until = NULL WHERE id = ?`
    ).bind(provider.id).run();

    const token = await jwt.sign({
      id: provider.id,
      partnerId: provider.id,
      phone: provider.phone,
      email: provider.email || null,
      role: 'provider',
      exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60),
    }, env.JWT_SECRET);

    return json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: provider.id,
        phone: provider.phone,
        email: provider.email || '',
        name: provider.name || '',
        business_name: provider.business_name || '',
        role: 'provider',
        kyc_status: provider.kyc_status,
      },
    });
  } catch (error) {
    return json({ success: false, message: 'Failed to log in', error: error.message }, 500);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/customer/mpin   (auth)   — lets a user clear their MPIN.
// DELETE /api/partner/mpin    (auth)
// ---------------------------------------------------------------------------
export async function clearCustomerMpin(request, env) {
  try {
    const payload = await authedUser(request, env);
    if (!payload) return json({ success: false, message: 'Authorization required' }, 401);
    await env.KUDDL_DB.prepare(
      `UPDATE parents SET mpin_hash = NULL, mpin_updated_at = CURRENT_TIMESTAMP,
                          mpin_failed_attempts = 0, mpin_locked_until = NULL
       WHERE id = ?`
    ).bind(payload.id).run();
    return json({ success: true, message: 'MPIN removed' });
  } catch (error) {
    return json({ success: false, message: 'Failed to clear MPIN', error: error.message }, 500);
  }
}

export async function clearPartnerMpin(request, env) {
  try {
    const payload = await authedUser(request, env);
    if (!payload) return json({ success: false, message: 'Authorization required' }, 401);
    const providerId = payload.id || payload.partnerId || payload.userId;
    await env.KUDDL_DB.prepare(
      `UPDATE providers SET mpin_hash = NULL, mpin_updated_at = CURRENT_TIMESTAMP,
                            mpin_failed_attempts = 0, mpin_locked_until = NULL
       WHERE id = ?`
    ).bind(providerId).run();
    return json({ success: true, message: 'MPIN removed' });
  } catch (error) {
    return json({ success: false, message: 'Failed to clear MPIN', error: error.message }, 500);
  }
}
