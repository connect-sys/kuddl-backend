/**
 * debugBookingsController — small read/cleanup helpers behind /api/debug/*.
 * (These routes existed in the router but the module was never created, so they
 * were dead; this restores them.)
 */
import { addCorsHeaders } from '../utils/cors.js';

const json = (body, status = 200) =>
  addCorsHeaders(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

/** Read-only: the most recent bookings (ids/status only, no PII). */
export async function debugBookingsAndRatings(request, env) {
  try {
    const r = await env.KUDDL_DB
      .prepare('SELECT id, parent_id, status, payment_status, booking_date, created_at FROM bookings ORDER BY created_at DESC LIMIT 20')
      .all();
    return json({ success: true, bookings: r.results || [] });
  } catch (e) {
    return json({ success: false, error: e.message }, 500);
  }
}

/**
 * SAFE cleanup — deletes ONLY bookings whose parent's fullname starts with the
 * "ZZTEST" marker (verification bookings). It can never touch real customer
 * data. Removes those bookings + their OTP/payment/review child rows, and the
 * test parents + their children.
 */
export async function clearTestBookings(request, env) {
  try {
    const parents = await env.KUDDL_DB
      .prepare("SELECT id FROM parents WHERE fullname LIKE 'ZZTEST%'")
      .all();
    const pids = (parents.results || []).map((p) => p.id);
    if (pids.length === 0) return json({ success: true, deletedParents: 0, deletedBookings: 0, message: 'no ZZTEST test parents' });

    const ph = pids.map(() => '?').join(',');
    const bks = await env.KUDDL_DB.prepare(`SELECT id FROM bookings WHERE parent_id IN (${ph})`).bind(...pids).all();
    const bids = (bks.results || []).map((b) => b.id);

    if (bids.length) {
      const bph = bids.map(() => '?').join(',');
      for (const tbl of ['booking_otps', 'booking_opts', 'payment_orders', 'reviews']) {
        try { await env.KUDDL_DB.prepare(`DELETE FROM ${tbl} WHERE booking_id IN (${bph})`).bind(...bids).run(); } catch (_) { /* table may not exist */ }
      }
      await env.KUDDL_DB.prepare(`DELETE FROM bookings WHERE id IN (${bph})`).bind(...bids).run();
    }
    await env.KUDDL_DB.prepare(`DELETE FROM children WHERE parent_id IN (${ph})`).bind(...pids).run();
    await env.KUDDL_DB.prepare(`DELETE FROM parents WHERE id IN (${ph})`).bind(...pids).run();

    return json({ success: true, deletedParents: pids.length, deletedBookings: bids.length });
  } catch (e) {
    return json({ success: false, error: e.message }, 500);
  }
}
