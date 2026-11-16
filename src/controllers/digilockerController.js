import { createApiResponse } from '../utils/cors.js';
import { ensureKycColumns } from './kycBusinessController.js';

/**
 * Aadhaar verification through DigiLocker (Sandbox API).
 *
 * UIDAI shut down OTP-based offline e-KYC (OKYC) — Sandbox now answers 410 on
 * /kyc/aadhaar/okyc/*. The replacement is a consented DigiLocker session:
 *   1. POST /api/kyc/digilocker/start  → we create a Sandbox session and return
 *      DigiLocker's authorization_url; the partner opens it and signs in.
 *   2. DigiLocker sends them back to `${FRONTEND_URL}/digilocker/done`.
 *   3. GET /api/kyc/digilocker/status?session_id=…  (polled by the partner
 *      site) → once the session has succeeded we fetch the UIDAI-issued Aadhaar
 *      XML, mark the provider verified and return the details.
 */

const SANDBOX_HEADERS = (env, token) => ({
  Authorization: token, // Sandbox wants the raw token, no "Bearer"
  'x-api-key': env.SANDBOX_APPID,
  'x-api-version': '1.0',
  'Content-Type': 'application/json',
});

async function sandboxToken(env) {
  const res = await fetch(`${env.SANDBOX_BASE_URL}/authenticate`, {
    method: 'POST',
    headers: { 'x-api-key': env.SANDBOX_APPID, 'x-api-secret': env.SANDBOX_SECRET, 'x-api-version': '1.0' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.data?.access_token) {
    throw new Error(`Sandbox auth failed (${res.status}): ${data?.message || ''}`);
  }
  return data.data.access_token;
}

let tableReady = false;
async function ensureTable(env) {
  if (tableReady) return;
  await env.KUDDL_DB.prepare(`
    CREATE TABLE IF NOT EXISTS digilocker_sessions (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      status TEXT DEFAULT 'created',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`).run();
  tableReady = true;
}

// Where DigiLocker returns the partner. Only our own https origins are allowed.
function redirectUrl(env, requested) {
  const fallback = `${(env.FRONTEND_URL || 'https://partner.kuddlkin.co').replace(/\/$/, '')}/digilocker/done`;
  try {
    const u = new URL(requested);
    const okHost = u.hostname === 'kuddlkin.co' || u.hostname.endsWith('.kuddlkin.co') || u.hostname.endsWith('.pages.dev');
    if (u.protocol === 'https:' && okHost) return `${u.origin}/digilocker/done`;
  } catch { /* use fallback */ }
  return fallback;
}

const decodeXml = (s) => String(s || '')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function attrs(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}\\b([^>]*)>`, 'i'));
  const out = {};
  if (!m) return out;
  for (const a of m[1].matchAll(/([\w:]+)\s*=\s*"([^"]*)"/g)) out[a[1]] = decodeXml(a[2]);
  return out;
}

// DigiLocker's Aadhaar is the UIDAI-signed XML: <UidData uid="xxxxxxxx1234"><Poi name dob gender/><Poa …/><Pht>…</Pht>
export function parseAadhaarXml(xml) {
  const uid = attrs(xml, 'UidData').uid || '';
  const poi = attrs(xml, 'Poi');
  const poa = attrs(xml, 'Poa');
  const pht = (xml.match(/<Pht>\s*([A-Za-z0-9+/=\s]+?)\s*<\/Pht>/i) || [])[1];
  const address = [poa.house, poa.street, poa.lm, poa.loc, poa.vtc, poa.subdist, poa.dist, poa.state]
    .filter(Boolean).join(', ') + (poa.pc ? ` - ${poa.pc}` : '');
  return {
    name: poi.name || '',
    date_of_birth: poi.dob || '',
    gender: poi.gender || '',
    care_of: poa.co || '',
    full_address: address.replace(/^ - /, ''),
    aadhaar_last4: uid.replace(/\D/g, '').slice(-4),
    photo: pht ? `data:image/jpeg;base64,${pht.replace(/\s/g, '')}` : '',
  };
}

const testMode = (env) => env.SANDBOX_API_TEST_MODE === 'true';

export async function startDigilocker(request, env) {
  try {
    const providerId = request.user?.id;
    if (!providerId) return createApiResponse({ success: false, message: 'Unauthorized' }, 401);
    const body = await request.json().catch(() => ({}));
    const redirect = redirectUrl(env, body.redirect_url);
    await ensureTable(env);

    if (testMode(env)) {
      const sessionId = `TEST_DL_${providerId}_${Date.now()}`;
      await env.KUDDL_DB.prepare('INSERT INTO digilocker_sessions (id, provider_id) VALUES (?, ?)').bind(sessionId, providerId).run();
      return createApiResponse({ success: true, test_mode: true, session_id: sessionId, authorization_url: `${redirect}?test=1` });
    }

    const token = await sandboxToken(env);
    const res = await fetch(`${env.SANDBOX_BASE_URL}/kyc/digilocker/sessions/init`, {
      method: 'POST',
      headers: SANDBOX_HEADERS(env, token),
      body: JSON.stringify({
        '@entity': 'in.co.sandbox.kyc.digilocker.session.request',
        flow: 'signin',
        doc_types: ['aadhaar'],
        redirect_url: redirect,
        purpose: 'Partner KYC verification',
      }),
    });
    const data = await res.json().catch(() => ({}));
    console.log('🔐 [DigiLocker] init:', res.status, data?.code, data?.message || '');
    const sessionId = data?.data?.session_id;
    const authUrl = data?.data?.authorization_url;
    if (!res.ok || !sessionId || !authUrl) {
      return createApiResponse({ success: false, message: data?.message || 'Could not start DigiLocker' }, 502);
    }
    await env.KUDDL_DB.prepare('INSERT INTO digilocker_sessions (id, provider_id) VALUES (?, ?)').bind(String(sessionId), providerId).run();
    return createApiResponse({ success: true, test_mode: false, session_id: String(sessionId), authorization_url: authUrl });
  } catch (error) {
    console.error('💥 [DigiLocker] start error:', error?.message || error);
    return createApiResponse({ success: false, message: 'DigiLocker is unavailable right now' }, 500);
  }
}

async function markVerified(env, providerId, sessionId, details) {
  const masked = details.aadhaar_last4 ? `XXXXXXXX${details.aadhaar_last4}` : null;
  await ensureKycColumns(env);
  await env.KUDDL_DB.batch([
    env.KUDDL_DB.prepare(`UPDATE providers SET is_aadhaar_verified = 1, aadhaar_method = 'digilocker', aadhaar_review_status = 'approved', aadhaar_number = COALESCE(?, aadhaar_number) WHERE id = ?`).bind(masked, providerId),
    env.KUDDL_DB.prepare(`UPDATE digilocker_sessions SET status = 'verified', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(sessionId),
  ]);
}

export async function digilockerStatus(request, env) {
  try {
    const providerId = request.user?.id;
    if (!providerId) return createApiResponse({ success: false, message: 'Unauthorized' }, 401);
    const sessionId = new URL(request.url).searchParams.get('session_id') || '';
    await ensureTable(env);
    const row = await env.KUDDL_DB.prepare('SELECT id, status FROM digilocker_sessions WHERE id = ? AND provider_id = ?')
      .bind(sessionId, providerId).first();
    if (!row) return createApiResponse({ success: false, status: 'failed', message: 'Session not found' }, 404);

    if (testMode(env) && sessionId.startsWith('TEST_DL_')) {
      const details = { name: 'Test User', date_of_birth: '01-01-1990', gender: 'M', care_of: '', full_address: 'Test Address, Delhi - 110001', aadhaar_last4: '0019', photo: '' };
      await markVerified(env, providerId, sessionId, details);
      return createApiResponse({ success: true, status: 'verified', test_mode: true, aadhaar_data: { ...details, aadhaar_number: 'XXXX-XXXX-0019' } });
    }

    const token = await sandboxToken(env);
    const headers = SANDBOX_HEADERS(env, token);
    const base = `${env.SANDBOX_BASE_URL}/kyc/digilocker/sessions/${encodeURIComponent(sessionId)}`;

    const sres = await fetch(`${base}/status`, { headers });
    const sdata = await sres.json().catch(() => ({}));
    const status = sdata?.data?.status;
    console.log('🔐 [DigiLocker] status:', sres.status, status);
    if (status === 'created' || (!status && sres.status === 521)) {
      return createApiResponse({ success: true, status: 'pending' });
    }
    if (status !== 'succeeded') {
      await env.KUDDL_DB.prepare(`UPDATE digilocker_sessions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(status || 'failed', sessionId).run();
      return createApiResponse({
        success: false,
        status: 'failed',
        message: status === 'expired' ? 'DigiLocker session expired — please try again' : 'DigiLocker sign-in was not completed — please try again',
      });
    }
    const consented = sdata?.data?.documents_consented || [];
    if (!consented.includes('aadhaar')) {
      return createApiResponse({ success: false, status: 'failed', message: 'Please allow access to your Aadhaar in DigiLocker' });
    }

    // UIDAI-issued Aadhaar XML (temporary signed link).
    let details = {};
    const dres = await fetch(`${base}/documents/aadhaar`, { headers });
    const ddata = await dres.json().catch(() => ({}));
    const fileUrl = ddata?.data?.files?.[0]?.url;
    console.log('🔐 [DigiLocker] document:', dres.status, fileUrl ? 'file ok' : 'no file');
    if (fileUrl) {
      const xml = await fetch(fileUrl).then((r) => (r.ok ? r.text() : '')).catch(() => '');
      if (xml.includes('<')) details = parseAadhaarXml(xml);
    }
    // Profile as a fallback for name / DOB / gender.
    if (!details.name) {
      const pres = await fetch(`${base}/user/profile`, { headers });
      const p = (await pres.json().catch(() => ({})))?.data || {};
      details = { ...details, name: details.name || p.name || '', date_of_birth: details.date_of_birth || (p.date_of_birth ? String(p.date_of_birth) : ''), gender: details.gender || p.gender || '' };
    }
    if (!details.name && !fileUrl) {
      return createApiResponse({ success: false, status: 'failed', message: 'Could not read your Aadhaar from DigiLocker — please try again' }, 502);
    }

    await markVerified(env, providerId, sessionId, details);
    return createApiResponse({
      success: true,
      status: 'verified',
      test_mode: false,
      aadhaar_data: { ...details, aadhaar_number: details.aadhaar_last4 ? `XXXX-XXXX-${details.aadhaar_last4}` : '' },
    });
  } catch (error) {
    console.error('💥 [DigiLocker] status error:', error?.message || error);
    return createApiResponse({ success: false, status: 'error', message: 'Could not check DigiLocker right now' }, 500);
  }
}
