/**
 * Batches Controller — Camp Architecture v2.0 (Multi-Variant Booking System)
 *
 * A Service or Camp is the shared shell (name, description, category, images).
 * Each Batch is a bookable variant: its own mode, age range, pincodes, seats,
 * price, schedule, instructor and status.
 */

import { addCorsHeaders } from '../utils/cors.js';
import jwt from '@tsndr/cloudflare-worker-jwt';

const json = (body, status = 200) =>
  addCorsHeaders(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  );

async function authUser(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.substring(7);
  if (!(await jwt.verify(token, env.JWT_SECRET))) return null;
  const decoded = jwt.decode(token);
  const p = decoded?.payload || {};
  return { id: p.id || p.userId || p.partnerId || p.provider_id, role: p.role };
}

const JSON_FIELDS = ['pincodes', 'schedule', 'features'];

/** Parse JSON columns back into objects/arrays for API responses. */
function normalizeBatch(row) {
  if (!row) return row;
  const out = { ...row };
  for (const f of JSON_FIELDS) {
    if (typeof out[f] === 'string') {
      try {
        out[f] = JSON.parse(out[f]);
      } catch {
        /* leave as-is */
      }
    }
  }
  return out;
}

/**
 * Insert a batch row. Shared by the POST /api/batches endpoint and by
 * createService / createCamp (which create Batch #1 on first publish).
 * Returns the new batch id.
 */
export async function insertBatch(env, data) {
  const id = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  await env.KUDDL_DB.prepare(
    `INSERT INTO batches (
      id, parent_type, parent_id, provider_id, batch_name, mode,
      age_min, age_max, pincodes, total_seats, per_session_override,
      cancellation_policy, booking_cutoff_hours, instructor, what_to_bring,
      price, price_type, schedule, features, status, booked_seats,
      created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  )
    .bind(
      id,
      data.parent_type,
      data.parent_id,
      data.provider_id || null,
      data.batch_name || '',
      data.mode || 'offline',
      data.age_min ?? null,
      data.age_max ?? null,
      JSON.stringify(data.pincodes || []),
      data.total_seats ?? null,
      data.per_session_override ?? null,
      data.cancellation_policy || 'flexible',
      data.booking_cutoff_hours ?? 24,
      data.instructor || null,
      data.what_to_bring || null,
      data.price ?? 0,
      data.price_type || null,
      JSON.stringify(data.schedule || {}),
      JSON.stringify(data.features || {}),
      data.status || 'live',
      data.booked_seats ?? 0,
      now,
      now
    )
    .run();
  return id;
}

// POST /api/batches
export async function createBatch(request, env) {
  try {
    const user = await authUser(request, env);
    if (!user) return json({ success: false, message: 'Authorization required' }, 401);

    const body = await request.json().catch(() => ({}));
    if (!['service', 'camp'].includes(body.parent_type) || !body.parent_id) {
      return json(
        { success: false, message: 'parent_type (service|camp) and parent_id are required' },
        400
      );
    }

    const providerId =
      user.role === 'admin' && body.provider_id ? body.provider_id : user.id;

    const batchId = await insertBatch(env, { ...body, provider_id: providerId });
    return json({ success: true, message: 'Batch created', batchId }, 201);
  } catch (error) {
    console.error('createBatch error:', error);
    return json({ success: false, message: 'Failed to create batch', error: error.message }, 500);
  }
}

// GET /api/batches?parent_type=&parent_id=
export async function listBatches(request, env) {
  try {
    const url = new URL(request.url);
    const parentType = url.searchParams.get('parent_type');
    const parentId = url.searchParams.get('parent_id');
    if (!parentId) {
      return json({ success: false, message: 'parent_id is required' }, 400);
    }

    const stmt = parentType
      ? env.KUDDL_DB.prepare(
          `SELECT * FROM batches WHERE parent_type = ? AND parent_id = ?
           AND status != 'archived' ORDER BY created_at ASC`
        ).bind(parentType, parentId)
      : env.KUDDL_DB.prepare(
          `SELECT * FROM batches WHERE parent_id = ?
           AND status != 'archived' ORDER BY created_at ASC`
        ).bind(parentId);

    const result = await stmt.all();
    return json({ success: true, batches: (result.results || []).map(normalizeBatch) });
  } catch (error) {
    console.error('listBatches error:', error);
    return json({ success: false, message: 'Failed to list batches', error: error.message }, 500);
  }
}

// GET /api/batches/:id
export async function getBatch(request, env) {
  try {
    const id = new URL(request.url).pathname.split('/').pop();
    const row = await env.KUDDL_DB.prepare('SELECT * FROM batches WHERE id = ?')
      .bind(id)
      .first();
    if (!row) return json({ success: false, message: 'Batch not found' }, 404);
    return json({ success: true, batch: normalizeBatch(row) });
  } catch (error) {
    console.error('getBatch error:', error);
    return json({ success: false, message: 'Failed to fetch batch', error: error.message }, 500);
  }
}

// GET /api/service-detail/:type/:id  — parent record + its batches (one call)
export async function getParentWithBatches(request, env) {
  try {
    const parts = new URL(request.url).pathname.split('/').filter(Boolean);
    const id = parts.pop();
    const type = parts.pop(); // 'service' | 'camp'
    if (!['service', 'camp'].includes(type) || !id) {
      return json({ success: false, message: 'Invalid type or id' }, 400);
    }

    const table = type === 'camp' ? 'camps' : 'services';
    const parent = await env.KUDDL_DB.prepare(`SELECT * FROM ${table} WHERE id = ?`)
      .bind(id)
      .first();
    if (!parent) return json({ success: false, message: `${type} not found` }, 404);

    const batchRows = await env.KUDDL_DB.prepare(
      `SELECT * FROM batches WHERE parent_type = ? AND parent_id = ?
       AND status != 'archived' ORDER BY created_at ASC`
    )
      .bind(type, id)
      .all();

    return json({
      success: true,
      parent_type: type,
      parent,
      batches: (batchRows.results || []).map(normalizeBatch),
    });
  } catch (error) {
    console.error('getParentWithBatches error:', error);
    return json({ success: false, message: 'Failed to load service detail', error: error.message }, 500);
  }
}

// PUT /api/batches/:id
export async function updateBatch(request, env) {
  try {
    const user = await authUser(request, env);
    if (!user) return json({ success: false, message: 'Authorization required' }, 401);

    const id = new URL(request.url).pathname.split('/').pop();
    const existing = await env.KUDDL_DB.prepare('SELECT * FROM batches WHERE id = ?')
      .bind(id)
      .first();
    if (!existing) return json({ success: false, message: 'Batch not found' }, 404);
    if (user.role !== 'admin' && existing.provider_id && existing.provider_id !== user.id) {
      return json({ success: false, message: 'Unauthorized' }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const editable = [
      'batch_name', 'mode', 'age_min', 'age_max', 'pincodes', 'total_seats',
      'per_session_override', 'cancellation_policy', 'booking_cutoff_hours',
      'instructor', 'what_to_bring', 'price', 'price_type', 'schedule',
      'features', 'status',
    ];
    const sets = [];
    const vals = [];
    for (const field of editable) {
      if (body[field] === undefined) continue;
      sets.push(`${field} = ?`);
      vals.push(JSON_FIELDS.includes(field) ? JSON.stringify(body[field]) : body[field]);
    }
    if (sets.length === 0) {
      return json({ success: false, message: 'No editable fields provided' }, 400);
    }
    sets.push('updated_at = ?');
    vals.push(new Date().toISOString(), id);

    await env.KUDDL_DB.prepare(`UPDATE batches SET ${sets.join(', ')} WHERE id = ?`)
      .bind(...vals)
      .run();
    return json({ success: true, message: 'Batch updated' });
  } catch (error) {
    console.error('updateBatch error:', error);
    return json({ success: false, message: 'Failed to update batch', error: error.message }, 500);
  }
}

// POST /api/batches/bulk  { action, batch_ids[], value? }
export async function bulkBatchAction(request, env) {
  try {
    const user = await authUser(request, env);
    if (!user) return json({ success: false, message: 'Authorization required' }, 401);

    const body = await request.json().catch(() => ({}));
    const { action, batch_ids: batchIds, value } = body;
    if (!action || !Array.isArray(batchIds) || batchIds.length === 0) {
      return json({ success: false, message: 'action and batch_ids[] are required' }, 400);
    }

    const now = new Date().toISOString();

    if (action === 'duplicate') {
      const newIds = [];
      for (const bid of batchIds) {
        const row = await env.KUDDL_DB.prepare('SELECT * FROM batches WHERE id = ?')
          .bind(bid)
          .first();
        if (!row) continue;
        const copy = normalizeBatch(row);
        const newId = await insertBatch(env, {
          ...copy,
          batch_name: `${copy.batch_name || 'Batch'} (copy)`,
          status: 'draft',
          booked_seats: 0,
        });
        newIds.push(newId);
      }
      return json({ success: true, message: 'Batches duplicated', batchIds: newIds });
    }

    const placeholders = batchIds.map(() => '?').join(',');
    let sql = null;
    let bindVals = [];

    if (action === 'pause') {
      sql = `UPDATE batches SET status='paused', updated_at=? WHERE id IN (${placeholders})`;
      bindVals = [now, ...batchIds];
    } else if (action === 'resume') {
      sql = `UPDATE batches SET status='live', updated_at=? WHERE id IN (${placeholders})`;
      bindVals = [now, ...batchIds];
    } else if (action === 'archive') {
      sql = `UPDATE batches SET status='archived', updated_at=? WHERE id IN (${placeholders})`;
      bindVals = [now, ...batchIds];
    } else if (action === 'price_update') {
      if (value === undefined || value === null) {
        return json({ success: false, message: 'value (new price) required for price_update' }, 400);
      }
      sql = `UPDATE batches SET price=?, updated_at=? WHERE id IN (${placeholders})`;
      bindVals = [Number(value), now, ...batchIds];
    } else {
      return json({ success: false, message: `Unknown action: ${action}` }, 400);
    }

    await env.KUDDL_DB.prepare(sql).bind(...bindVals).run();
    return json({ success: true, message: `Bulk ${action} applied to ${batchIds.length} batch(es)` });
  } catch (error) {
    console.error('bulkBatchAction error:', error);
    return json({ success: false, message: 'Bulk action failed', error: error.message }, 500);
  }
}
