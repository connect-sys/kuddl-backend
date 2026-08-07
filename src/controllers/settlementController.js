/**
 * Settlement persistence (PRD §04). Turns the pure schedule/line-item math in
 * utils/settlement.js into real rows: one `settlements` tranche per payout, and
 * the booking's `line_items` JSON. Scheduling happens when a booking is
 * captured/confirmed; a payout run (ops/cron) later releases tranches whose
 * release_date has passed. Idempotent per booking (clears prior tranches first).
 *
 * Migration route: GET/POST /api/admin/migrate/settlements-table
 */

import { addCorsHeaders } from '../utils/cors.js';
import { generateId } from '../utils/helpers.js';
import { buildLineItems, lineItemsTotal, computeSettlementSchedule, dueTranches } from '../utils/settlement.js';

const json = (body, status = 200) =>
  addCorsHeaders(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

export async function ensureSettlementsTable(request, env) {
  try {
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS settlements (
        id TEXT PRIMARY KEY,
        booking_id TEXT,
        provider_id TEXT,
        tranche_index INTEGER,
        pct INTEGER,
        amount REAL,
        commission REAL,
        net_to_provider REAL,
        from_date_type TEXT,
        release_date TEXT,
        status TEXT DEFAULT 'scheduled',
        created_at TEXT,
        updated_at TEXT
      )
    `).run();
    // Additive column for the payment line items (§04 booking.line_items[]).
    try {
      await env.KUDDL_DB.prepare('ALTER TABLE bookings ADD COLUMN line_items TEXT').run();
    } catch (e) {
      if (!String(e.message || '').toLowerCase().includes('duplicate column name')) throw e;
    }
    return json({ success: true, message: 'settlements table + bookings.line_items ensured' });
  } catch (error) {
    console.error('❌ ensureSettlementsTable error:', error);
    return json({ success: false, message: 'Failed to ensure settlements table', error: error.message }, 500);
  }
}

/**
 * Schedule a booking's settlement tranches and persist its line items.
 * Never throws — settlement scheduling must not fail a booking. Returns the
 * tranches that were written (or [] on any problem).
 * @param env
 * @param p { bookingId, providerId, category, dates, serviceName, serviceAmount, registrationFee, addOns }
 */
export async function scheduleSettlement(env, p = {}) {
  try {
    const lineItems = buildLineItems({
      serviceName: p.serviceName,
      serviceAmount: p.serviceAmount,
      registrationFee: p.registrationFee,
      addOns: p.addOns,
      providerVendor: p.providerId,
    });
    const total = lineItemsTotal(lineItems);
    const tranches = computeSettlementSchedule(p.category, total, p.dates || {});
    if (!tranches.length) return [];

    // Persist line items on the booking (idempotent overwrite).
    try {
      await env.KUDDL_DB.prepare('UPDATE bookings SET line_items = ? WHERE id = ?')
        .bind(JSON.stringify(lineItems), p.bookingId).run();
    } catch (e) {
      console.warn('line_items not saved (column missing?):', e?.message);
    }

    // Idempotent: clear any prior tranches for this booking, then insert fresh.
    await env.KUDDL_DB.prepare('DELETE FROM settlements WHERE booking_id = ?').bind(p.bookingId).run().catch(() => {});
    const now = new Date().toISOString();
    for (let i = 0; i < tranches.length; i++) {
      const t = tranches[i];
      await env.KUDDL_DB.prepare(`
        INSERT INTO settlements (id, booking_id, provider_id, tranche_index, pct, amount, commission, net_to_provider, from_date_type, release_date, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)
      `).bind(generateId(), p.bookingId, p.providerId, i, t.pct, t.amount, t.commission, t.netToProvider, t.from, t.releaseDate, now, now).run();
    }
    return tranches;
  } catch (error) {
    console.error('scheduleSettlement failed (non-fatal):', error?.message);
    return [];
  }
}

/**
 * Payout run (ops/cron). Releases every scheduled tranche whose release_date
 * has arrived: marks it 'released', notifies the provider of the earning, and
 * when a booking's tranches are ALL released moves the booking to 'settled'.
 * Accepts ?asOf=YYYY-MM-DD for deterministic runs/tests.
 *
 * GET/POST /api/admin/settlements/run
 */
/**
 * Core payout job — callable from the HTTP route AND the cron `scheduled`
 * handler. Returns { asOf, releasedTranches, settledBookings }.
 */
export async function runPayoutJob(env, asOf = new Date().toISOString().slice(0, 10)) {
  const all = await env.KUDDL_DB.prepare("SELECT * FROM settlements WHERE status = 'scheduled'").all().catch(() => ({ results: [] }));
  const due = dueTranches(all.results || [], asOf);

  const now = new Date().toISOString();
  const affectedBookings = new Set();
  let released = 0;

  for (const t of due) {
    await env.KUDDL_DB.prepare("UPDATE settlements SET status = 'released', updated_at = ? WHERE id = ?").bind(now, t.id).run();
    released++;
    affectedBookings.add(t.booking_id);
    await env.KUDDL_DB.prepare(
      `INSERT INTO notifications (id, user_id, user_type, type, title, message, data, created_at)
       VALUES (?, ?, 'partner', 'payout_released', 'Payout released', ?, ?, ?)`
    ).bind(generateId(), t.provider_id, `₹${t.net_to_provider} paid to you for booking #${t.booking_id}.`,
      JSON.stringify({ bookingId: t.booking_id, amount: t.net_to_provider }), now).run().catch(() => {});
  }

  let settledBookings = 0;
  for (const bookingId of affectedBookings) {
    const remaining = await env.KUDDL_DB.prepare("SELECT COUNT(*) AS n FROM settlements WHERE booking_id = ? AND status = 'scheduled'").bind(bookingId).first();
    if ((remaining?.n || 0) === 0) {
      await env.KUDDL_DB.prepare("UPDATE bookings SET status = 'settled', updated_at = ? WHERE id = ? AND status IN ('confirmed','in_progress','delivered')").bind(now, bookingId).run().catch(() => {});
      settledBookings++;
    }
  }
  return { asOf, releasedTranches: released, settledBookings };
}

export async function runSettlementPayouts(request, env) {
  try {
    const asOf = new URL(request.url).searchParams.get('asOf') || new Date().toISOString().slice(0, 10);
    const result = await runPayoutJob(env, asOf);
    return json({ success: true, ...result });
  } catch (error) {
    console.error('runSettlementPayouts error:', error);
    return json({ success: false, message: 'Payout run failed', error: error.message }, 500);
  }
}

/**
 * Partner earnings (§I earnings page) — Paid / On the way / Held rows.
 * GET /api/partner/earnings?providerId=...
 */
export async function getProviderEarnings(request, env) {
  try {
    const providerId = new URL(request.url).searchParams.get('providerId') || (request.user && request.user.id);
    if (!providerId) return json({ success: false, message: 'providerId required' }, 400);

    const res = await env.KUDDL_DB.prepare(
      'SELECT booking_id, amount, net_to_provider, release_date, status FROM settlements WHERE provider_id = ? ORDER BY release_date'
    ).bind(providerId).all().catch(() => ({ results: [] }));
    const rows = res.results || [];

    const today = new Date().toISOString().slice(0, 10);
    const paid = [];
    const onTheWay = [];
    const held = [];
    for (const r of rows) {
      const row = { bookingId: r.booking_id, amount: r.net_to_provider, date: r.release_date };
      if (r.status === 'released') paid.push(row);
      else if (r.release_date && String(r.release_date) <= today) onTheWay.push(row); // due, awaiting the run
      else held.push(row); // future tranche (e.g. Adventure's post-event half)
    }
    return json({ success: true, data: { paid, onTheWay, held } });
  } catch (error) {
    console.error('getProviderEarnings error:', error);
    return json({ success: false, message: 'Failed to load earnings', error: error.message }, 500);
  }
}

/** GET /api/bookings/:id/settlement — the tranche schedule for a booking. */
export async function getBookingSettlement(request, env) {
  try {
    const id = new URL(request.url).pathname.split('/').slice(-2)[0];
    const res = await env.KUDDL_DB.prepare('SELECT tranche_index, pct, amount, net_to_provider, from_date_type, release_date, status FROM settlements WHERE booking_id = ? ORDER BY tranche_index')
      .bind(id).all().catch(() => ({ results: [] }));
    return json({ success: true, data: res.results || [] });
  } catch (error) {
    console.error('getBookingSettlement error:', error);
    return json({ success: false, message: 'Failed to load settlement', error: error.message }, 500);
  }
}
