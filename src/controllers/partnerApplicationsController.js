import { addCorsHeaders } from '../utils/cors.js';
import { generateId } from '../utils/helpers.js';
import { getPublicR2Url } from '../utils/r2Utils.js';
import jwt from '@tsndr/cloudflare-worker-jwt';

const json = (body, status = 200) =>
  addCorsHeaders(new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+]?\d[\d\s-]{7,14}$/;

/**
 * Decode a data URL ("data:<mime>;base64,<payload>") into raw bytes.
 * Returns null for anything that isn't a data URL we can decode.
 */
function decodeDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const match = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(dataUrl);
  if (!match) return null;
  const contentType = match[1] || 'application/octet-stream';
  const isBase64 = !!match[2];
  const raw = match[3];
  if (isBase64) {
    const bin = atob(raw);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, contentType };
  }
  return { bytes: new TextEncoder().encode(decodeURIComponent(raw)), contentType };
}

/**
 * Upload an array of base64-encoded files to R2 and return lightweight
 * references ({ name, type, size, url }) suitable for storing in D1.
 * Files that can't be decoded are skipped rather than failing the whole submit.
 */
async function uploadFilesToR2(env, applicationId, kind, files) {
  const refs = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i] || {};
    const decoded = decodeDataUrl(f.data);
    if (!decoded) continue;
    const safeName = (f.name || `file-${i}`).replace(/[^\w.\-]+/g, '_').slice(0, 100);
    const key = `partner-applications/${applicationId}/${kind}/${i}-${safeName}`;
    await env.KUDDL_STORAGE.put(key, decoded.bytes, {
      httpMetadata: { contentType: f.type || decoded.contentType },
    });
    refs.push({
      name: f.name || safeName,
      type: f.type || decoded.contentType,
      size: f.size || decoded.bytes.length,
      url: getPublicR2Url(key, env),
    });
  }
  return refs;
}

async function ensureTable(env) {
  // Best-effort creation in case the migration hasn't been applied yet.
  await env.KUDDL_DB.prepare(`
    CREATE TABLE IF NOT EXISTS partner_applications (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      email        TEXT NOT NULL,
      phone        TEXT NOT NULL,
      company_name TEXT,
      description  TEXT,
      documents    TEXT,
      photos       TEXT,
      source       TEXT DEFAULT 'become_partner_form',
      status       TEXT DEFAULT 'new',
      notes        TEXT,
      created_at   TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at   TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

// POST /api/public/partner-applications
// Body: { name, email, phone, companyName?, description?, documents?, photos?, source? }
export async function submitPartnerApplication(request, env) {
  try {
    await ensureTable(env);

    const body = await request.json().catch(() => ({}));
    const name = (body.name || '').toString().trim();
    const email = (body.email || '').toString().trim();
    const phone = (body.phone || '').toString().trim();
    const companyName = (body.companyName || body.company_name || '').toString().trim();
    const description = (body.description || '').toString().trim();
    const documents = Array.isArray(body.documents) ? body.documents : [];
    const photos = Array.isArray(body.photos) ? body.photos : [];
    const source = (body.source || 'become_partner_form').toString().slice(0, 64);

    if (!name)       return json({ success: false, message: 'Name is required' }, 400);
    if (!EMAIL_RE.test(email)) return json({ success: false, message: 'Valid email is required' }, 400);
    if (!PHONE_RE.test(phone)) return json({ success: false, message: 'Valid phone is required' }, 400);

    const id = generateId();

    // Upload attachments to R2 and keep only their URLs in the DB row. Storing
    // the base64 blobs inline overflows D1's ~1 MB per-value limit and makes the
    // INSERT fail for any real photo or document.
    const [photoRefs, documentRefs] = await Promise.all([
      uploadFilesToR2(env, id, 'photos', photos),
      uploadFilesToR2(env, id, 'documents', documents),
    ]);

    await env.KUDDL_DB.prepare(
      `INSERT INTO partner_applications
         (id, name, email, phone, company_name, description, documents, photos, source, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')`
    ).bind(
      id, name, email, phone, companyName || null, description || null,
      JSON.stringify(documentRefs), JSON.stringify(photoRefs), source
    ).run();

    return json({ success: true, message: 'Thanks! Our team will reach out shortly.', data: { id } });
  } catch (error) {
    return json({ success: false, message: 'Failed to submit application', error: error.message }, 500);
  }
}

// GET /api/admin/partner-applications  (admin only)
export async function listPartnerApplications(request, env) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json({ success: false, message: 'Authorization required' }, 401);
    }
    const token = authHeader.substring(7);
    if (!(await jwt.verify(token, env.JWT_SECRET))) return json({ success: false, message: 'Invalid token' }, 401);
    const decoded = jwt.decode(token);
    if (decoded?.payload?.role !== 'admin') return json({ success: false, message: 'Admin access required' }, 403);

    await ensureTable(env);

    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    let query = 'SELECT * FROM partner_applications WHERE 1=1';
    const params = [];
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    query += ' ORDER BY created_at DESC LIMIT 200';

    const result = await env.KUDDL_DB.prepare(query).bind(...params).all();
    const rows = (result.results || []).map(r => ({
      ...r,
      documents: (() => { try { return JSON.parse(r.documents || '[]'); } catch { return []; } })(),
      photos:    (() => { try { return JSON.parse(r.photos || '[]'); } catch { return []; } })(),
    }));

    return json({ success: true, applications: rows });
  } catch (error) {
    return json({ success: false, message: 'Failed to list applications', error: error.message }, 500);
  }
}

// PATCH /api/admin/partner-applications/:id   { status?, notes? }
export async function updatePartnerApplication(request, env) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json({ success: false, message: 'Authorization required' }, 401);
    }
    const token = authHeader.substring(7);
    if (!(await jwt.verify(token, env.JWT_SECRET))) return json({ success: false, message: 'Invalid token' }, 401);
    const decoded = jwt.decode(token);
    if (decoded?.payload?.role !== 'admin') return json({ success: false, message: 'Admin access required' }, 403);

    const id = new URL(request.url).pathname.split('/').pop();
    const body = await request.json().catch(() => ({}));
    const allowedStatus = ['new', 'contacted', 'converted', 'rejected'];

    const sets = [];
    const params = [];
    if (body.status && allowedStatus.includes(body.status)) {
      sets.push('status = ?');
      params.push(body.status);
    }
    if (typeof body.notes === 'string') {
      sets.push('notes = ?');
      params.push(body.notes);
    }
    if (sets.length === 0) return json({ success: false, message: 'No fields to update' }, 400);

    sets.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    await env.KUDDL_DB.prepare(
      `UPDATE partner_applications SET ${sets.join(', ')} WHERE id = ?`
    ).bind(...params).run();

    return json({ success: true, message: 'Application updated' });
  } catch (error) {
    return json({ success: false, message: 'Failed to update application', error: error.message }, 500);
  }
}
