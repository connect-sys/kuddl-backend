/**
 * Migration — ensure the `refund_requests` table exists.
 *
 * The cancellation and Care auto-refund flows write a refund_requests row (and
 * notify ops). The table was missing on some environments, so this idempotent
 * CREATE keeps refunds working everywhere. Columns match what the controllers
 * already insert (id, booking_id, parent_id, amount, reason, status, timestamps).
 *
 * Idempotent. Route: GET/POST /api/admin/migrate/refund-requests-table
 */

import { addCorsHeaders } from '../utils/cors.js';

export async function addRefundRequestsTable(request, env) {
  try {
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS refund_requests (
        id TEXT PRIMARY KEY,
        booking_id TEXT,
        parent_id TEXT,
        amount REAL,
        reason TEXT,
        status TEXT DEFAULT 'pending',
        requested_at TEXT,
        processed_at TEXT,
        created_at TEXT,
        updated_at TEXT
      )
    `).run();
    return addCorsHeaders(new Response(JSON.stringify({
      success: true, message: 'refund_requests table ensured',
    }), { headers: { 'Content-Type': 'application/json' } }));
  } catch (error) {
    console.error('❌ Error ensuring refund_requests table:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false, message: 'Failed to ensure refund_requests table', error: error.message,
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}
