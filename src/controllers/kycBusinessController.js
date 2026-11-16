import { createApiResponse } from '../utils/cors.js';
import { isAdminRequest } from './adminPartnerManagementController.js';

/**
 * Partner KYC beyond DigiLocker:
 *  - Manual Aadhaar: partners without DigiLocker upload their Aadhaar card
 *    (via /api/documents/upload, types aadhaarCard / aadhaarCardBack), then
 *    submit it here for an admin to review.
 *  - GSTIN and CIN/LLPIN: optional, verified live against Sandbox (GST public
 *    search, MCA company master data) and the business details are saved.
 */

const KYC_COLUMNS = [
  ['aadhaar_method', 'TEXT'],          // 'digilocker' | 'manual'
  ['aadhaar_review_status', 'TEXT'],   // 'pending' | 'approved' | 'rejected'
  ['aadhaar_card_url', 'TEXT'],
  ['aadhaar_card_back_url', 'TEXT'],
  ['gst_number', 'TEXT'],
  ['is_gst_verified', 'INTEGER DEFAULT 0'],
  ['gst_details', 'TEXT'],
  ['cin_number', 'TEXT'],
  ['is_cin_verified', 'INTEGER DEFAULT 0'],
  ['cin_details', 'TEXT'],
];

let columnsReady = false;
export async function ensureKycColumns(env) {
  if (columnsReady) return;
  const info = await env.KUDDL_DB.prepare('PRAGMA table_info(providers)').all();
  const have = new Set((info.results || []).map((c) => c.name));
  for (const [name, type] of KYC_COLUMNS) {
    if (!have.has(name)) {
      try { await env.KUDDL_DB.prepare(`ALTER TABLE providers ADD COLUMN ${name} ${type}`).run(); } catch (e) {
        if (!/duplicate column/i.test(e?.message || '')) throw e;
      }
    }
  }
  columnsReady = true;
}

async function sandboxToken(env) {
  const res = await fetch(`${env.SANDBOX_BASE_URL}/authenticate`, {
    method: 'POST',
    headers: { 'x-api-key': env.SANDBOX_APPID, 'x-api-secret': env.SANDBOX_SECRET, 'x-api-version': '1.0' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.data?.access_token) throw new Error(`Sandbox auth failed (${res.status})`);
  return data.data.access_token;
}

async function sandboxPost(env, path, body) {
  const token = await sandboxToken(env);
  const res = await fetch(`${env.SANDBOX_BASE_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: token, 'x-api-key': env.SANDBOX_APPID, 'x-api-version': '1.0', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

const testMode = (env) => env.SANDBOX_API_TEST_MODE === 'true';
const fail = (message, status = 400) => createApiResponse({ success: false, message }, status);

// ---------------------------------------------------------------- Aadhaar (manual)

export async function submitManualAadhaar(request, env) {
  try {
    const providerId = request.user?.id;
    if (!providerId) return fail('Unauthorized', 401);
    await ensureKycColumns(env);
    const p = await env.KUDDL_DB.prepare('SELECT aadhaar_card_url, is_aadhaar_verified, aadhaar_method FROM providers WHERE id = ?').bind(providerId).first();
    if (!p) return fail('Partner not found', 404);
    if (p.is_aadhaar_verified === 1 && p.aadhaar_method === 'digilocker') {
      return createApiResponse({ success: true, aadhaar_method: 'digilocker', aadhaar_review_status: 'approved', message: 'Aadhaar already verified via DigiLocker' });
    }
    if (!p.aadhaar_card_url) return fail('Please upload your Aadhaar card first');
    await env.KUDDL_DB.prepare(`UPDATE providers SET aadhaar_method = 'manual', aadhaar_review_status = 'pending', is_aadhaar_verified = 0, updated_at = ? WHERE id = ?`)
      .bind(new Date().toISOString(), providerId).run();
    return createApiResponse({ success: true, aadhaar_method: 'manual', aadhaar_review_status: 'pending', message: 'Aadhaar card submitted for review' });
  } catch (e) {
    console.error('💥 [KYC] manual Aadhaar submit:', e?.message || e);
    return fail('Could not submit your Aadhaar card', 500);
  }
}

// Admin approves / rejects an uploaded Aadhaar card.
export async function reviewManualAadhaar(request, env) {
  try {
    if (!(await isAdminRequest(request, env))) return fail('Admin access required', 403);
    await ensureKycColumns(env);
    const id = request.params?.id || new URL(request.url).pathname.split('/').slice(-2)[0];
    const { decision } = await request.json().catch(() => ({}));
    if (decision !== 'approve' && decision !== 'reject') return fail("decision must be 'approve' or 'reject'");
    const p = await env.KUDDL_DB.prepare('SELECT id, aadhaar_card_url FROM providers WHERE id = ?').bind(id).first();
    if (!p) return fail('Partner not found', 404);
    if (decision === 'approve' && !p.aadhaar_card_url) return fail('No Aadhaar card uploaded for this partner');
    await env.KUDDL_DB.prepare(`UPDATE providers SET aadhaar_method = 'manual', aadhaar_review_status = ?, is_aadhaar_verified = ?, updated_at = ? WHERE id = ?`)
      .bind(decision === 'approve' ? 'approved' : 'rejected', decision === 'approve' ? 1 : 0, new Date().toISOString(), id).run();
    return createApiResponse({ success: true, aadhaar_review_status: decision === 'approve' ? 'approved' : 'rejected' });
  } catch (e) {
    console.error('💥 [KYC] Aadhaar review:', e?.message || e);
    return fail('Could not update Aadhaar review', 500);
  }
}

// ---------------------------------------------------------------- GSTIN

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

function gstAddress(a = {}) {
  return [a.flno, a.bno, a.bnm, a.st, a.locality || a.loc, a.landMark, a.dst, a.stcd].filter(Boolean).join(', ') + (a.pncd ? ` - ${a.pncd}` : '');
}

export async function verifyGstin(request, env) {
  try {
    const providerId = request.user?.id;
    if (!providerId) return fail('Unauthorized', 401);
    const body = await request.json().catch(() => ({}));
    const gstin = String(body.gst_number || body.gstin || '').trim().toUpperCase();
    if (!GSTIN_RE.test(gstin)) return fail('Enter a valid 15-character GSTIN (e.g. 07ABCDE1234F1Z5)');
    await ensureKycColumns(env);

    let details;
    if (testMode(env)) {
      details = { gstin, legal_name: 'TEST BUSINESS PRIVATE LIMITED', trade_name: 'Test Business', status: 'Active', registration_date: '01/04/2020', constitution: 'Private Limited Company', taxpayer_type: 'Regular', address: 'Test Street, New Delhi, Delhi - 110001', nature_of_business: ['Supplier of Services'] };
    } else {
      const { res, data } = await sandboxPost(env, '/gst/compliance/public/gstin/search', { gstin });
      const inner = data?.data?.data;
      const err = data?.data?.error;
      console.log('🧾 [KYC] GSTIN search:', res.status, data?.data?.status_cd, inner?.sts || err?.message || data?.message || '');
      if (!res.ok || !inner || err) {
        const msg = err?.message || data?.message || 'GSTIN not found';
        return fail(/no record/i.test(msg) ? 'No business found for this GSTIN' : msg, res.status === 422 ? 400 : 404);
      }
      details = {
        gstin,
        legal_name: inner.lgnm || '',
        trade_name: inner.tradeNam || '',
        status: inner.sts || '',
        registration_date: inner.rgdt || '',
        constitution: inner.ctb || '',
        taxpayer_type: inner.dty || '',
        address: gstAddress(inner.pradr?.addr),
        nature_of_business: inner.nba || [],
        state_jurisdiction: inner.stj || '',
      };
    }

    const active = /^active$/i.test(details.status);
    await env.KUDDL_DB.prepare('UPDATE providers SET gst_number = ?, is_gst_verified = ?, gst_details = ?, updated_at = ? WHERE id = ?')
      .bind(gstin, active ? 1 : 0, JSON.stringify(details), new Date().toISOString(), providerId).run();
    if (!active) return createApiResponse({ success: false, message: `This GSTIN is ${details.status || 'not active'}`, gst_data: details }, 400);
    return createApiResponse({ success: true, message: 'GSTIN verified', gst_data: details, verification_status: 'verified' });
  } catch (e) {
    console.error('💥 [KYC] GSTIN verify:', e?.message || e);
    return fail('GST verification is unavailable right now', 500);
  }
}

// ---------------------------------------------------------------- CIN / LLPIN

const CIN_RE = /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/;
const LLPIN_RE = /^[A-Z]{3}-[0-9]{4}$/;

export async function verifyCin(request, env) {
  try {
    const providerId = request.user?.id;
    if (!providerId) return fail('Unauthorized', 401);
    const body = await request.json().catch(() => ({}));
    const cin = String(body.cin_number || body.cin || '').trim().toUpperCase();
    if (!CIN_RE.test(cin) && !LLPIN_RE.test(cin)) return fail('Enter a valid 21-character CIN (or LLPIN like AAA-1234)');
    await ensureKycColumns(env);

    let details;
    if (testMode(env)) {
      details = { cin, company_name: 'TEST BUSINESS PRIVATE LIMITED', status: 'Active', incorporation_date: '2020-04-01', address: 'Test Street, New Delhi, Delhi - 110001', roc: 'ROC Delhi', company_class: 'Private', category: 'Company limited by shares' };
    } else {
      const { res, data } = await sandboxPost(env, '/kyc/mca/company/master-data', { cin });
      const d = Array.isArray(data?.data) ? data.data[0] : data?.data;
      console.log('🏢 [KYC] CIN lookup:', res.status, d?.company_status || data?.message || '');
      if (!res.ok || !d?.company_name) {
        return fail(res.status === 521 || /not found/i.test(data?.message || '') ? 'No company found for this CIN' : (data?.message || 'CIN not found'), 404);
      }
      details = {
        cin: d.cin || cin,
        company_name: d.company_name,
        status: d.company_status || '',
        incorporation_date: d.company_registration_date || '',
        address: d.registered_office_address || '',
        roc: d.company_roc_code || '',
        company_class: d.company_class || '',
        category: d.company_category || '',
      };
    }

    const active = /^active$/i.test(details.status);
    await env.KUDDL_DB.prepare('UPDATE providers SET cin_number = ?, is_cin_verified = ?, cin_details = ?, updated_at = ? WHERE id = ?')
      .bind(cin, active ? 1 : 0, JSON.stringify(details), new Date().toISOString(), providerId).run();
    if (!active) return createApiResponse({ success: false, message: `This company is ${details.status || 'not active'} on MCA`, cin_data: details }, 400);
    return createApiResponse({ success: true, message: 'CIN verified', cin_data: details, verification_status: 'verified' });
  } catch (e) {
    console.error('💥 [KYC] CIN verify:', e?.message || e);
    return fail('CIN verification is unavailable right now', 500);
  }
}
