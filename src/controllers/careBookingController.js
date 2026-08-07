/**
 * Care booking confirmation (§07.1) — the specialist side of the hold→confirm
 * loop. A Care booking is created as `awaiting_confirmation` with the money
 * HELD; the specialist confirms within the window (→ confirmed + Start OTP) or
 * declines / times out (→ automatic full refund). Every move goes through the
 * booking state machine so the rules live in ONE place.
 *
 * POST /api/care/bookings/:id/confirm
 * POST /api/care/bookings/:id/decline
 */

import { addCorsHeaders } from '../utils/cors.js';
import { transition, EVENTS, STATES } from '../utils/bookingStateMachine.js';
import { executeBookingEffects } from '../utils/bookingEffects.js';
import { scheduleSettlement } from './settlementController.js';

const json = (body, status = 200) =>
  addCorsHeaders(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

// /api/care/bookings/:id/(confirm|decline) → the id is the second-last segment.
function bookingIdFromUrl(request) {
  return new URL(request.url).pathname.split('/').slice(-2)[0];
}

async function loadHeld(env, id) {
  const booking = await env.KUDDL_DB.prepare('SELECT * FROM bookings WHERE id = ?').bind(id).first();
  if (!booking) return { error: json({ success: false, message: 'Booking not found' }, 404) };
  if (booking.status !== 'awaiting_confirmation') {
    return { error: json({ success: false, message: `Booking is not awaiting confirmation (status: ${booking.status})` }, 409) };
  }
  return { booking };
}

export async function confirmCareBooking(request, env) {
  try {
    const id = bookingIdFromUrl(request);
    const { booking, error } = await loadHeld(env, id);
    if (error) return error;

    // paid_hold --SPECIALIST_CONFIRM--> confirmed (captures payment, issues OTP).
    const r = transition(STATES.PAID_HOLD, EVENTS.SPECIALIST_CONFIRM);
    await env.KUDDL_DB.prepare('UPDATE bookings SET status = ?, payment_status = ?, updated_at = ? WHERE id = ?')
      .bind('confirmed', 'paid', new Date().toISOString(), id).run();

    const ran = await executeBookingEffects(env, r.effects, {
      bookingId: id, parentId: booking.parent_id, providerId: booking.provider_id, amount: booking.total_amount,
    });

    // Care settles 100% at T+1 after confirmation (§04).
    await scheduleSettlement(env, {
      bookingId: id, providerId: booking.provider_id, category: 'care',
      serviceName: null, serviceAmount: booking.total_amount,
      dates: { confirmation: new Date().toISOString().slice(0, 10), payment: (booking.created_at || '').slice(0, 10) },
    });

    return json({ success: true, message: 'Booking confirmed', status: 'confirmed', effects: ran });
  } catch (error) {
    console.error('confirmCareBooking error:', error);
    return json({ success: false, message: 'Failed to confirm booking', error: error.message }, 500);
  }
}

export async function declineCareBooking(request, env) {
  try {
    const id = bookingIdFromUrl(request);
    const { booking, error } = await loadHeld(env, id);
    if (error) return error;

    // paid_hold --SPECIALIST_DECLINE--> refunded (automatic full refund §07.1).
    const r = transition(STATES.PAID_HOLD, EVENTS.SPECIALIST_DECLINE);
    await env.KUDDL_DB.prepare('UPDATE bookings SET status = ?, payment_status = ?, updated_at = ? WHERE id = ?')
      .bind('refunded', 'refunded', new Date().toISOString(), id).run();

    const ran = await executeBookingEffects(env, r.effects, {
      bookingId: id, parentId: booking.parent_id, providerId: booking.provider_id, amount: booking.total_amount,
    });

    return json({ success: true, message: 'Booking declined; full refund issued', status: 'refunded', effects: ran, bookingId: booking.id });
  } catch (error) {
    console.error('declineCareBooking error:', error);
    return json({ success: false, message: 'Failed to decline booking', error: error.message }, 500);
  }
}
