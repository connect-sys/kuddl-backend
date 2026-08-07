// =====================================================================
// Booking effect executor — turns the state machine's effect intents into real
// side-effects (notifications, refunds, payouts, Start OTP). One place so the
// §06/§07 rules are enforced consistently, most importantly:
//   • The provider is NEVER sent the parent's phone number (§06 table).
//   • A Care decline/timeout issues an AUTOMATIC full refund (§07.1).
//   • The Start OTP is issued only when a booking reaches `confirmed` (§07).
//
// executeBookingEffects() is DB-bound; buildProviderPayload() is pure so the
// "no parent phone" guarantee is unit-testable without a DB.
// =====================================================================

import { generateId } from './helpers.js';
import { createOTPForBooking } from '../controllers/otpServiceController.js';
import { sendEmail } from './email.js';
import { sendWhatsApp } from './whatsapp.js';
import { refundPayment } from './razorpay.js';

/**
 * Plain-text email body for a provider effect — uses ONLY the safe payload
 * (never the parent's phone/email/name, §06). Pure.
 */
export function providerEmailText(providerData = {}) {
  const lines = [
    providerData.service_name ? `Service: ${providerData.service_name}` : null,
    providerData.booking_date ? `Date: ${providerData.booking_date}` : null,
    providerData.booking_time ? `Time: ${providerData.booking_time}` : null,
    providerData.child_first_name ? `Child: ${providerData.child_first_name}${providerData.child_age != null ? ` (age ${providerData.child_age})` : ''}` : null,
    providerData.special_instructions ? `Notes: ${providerData.special_instructions}` : null,
  ].filter(Boolean);
  return lines.join('\n');
}

/**
 * The ONLY fields a provider sees about a booking (§06): service, when, the
 * child's first name + age, and special instructions. Never the parent's phone,
 * email, or full name. Pure → unit-testable.
 */
export function buildProviderPayload(ctx = {}) {
  return {
    booking_id: ctx.bookingId,
    service_name: ctx.serviceName || null,
    booking_date: ctx.date || null,
    booking_time: ctx.time || null,
    child_first_name: ctx.childFirstName || null,
    child_age: ctx.childAge ?? null,
    special_instructions: ctx.specialInstructions || null,
    // Deliberately NO parent phone / email / full name.
  };
}

async function notify(env, userId, userType, type, title, message, data) {
  await env.KUDDL_DB.prepare(
    `INSERT INTO notifications (id, user_id, user_type, type, title, message, data, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(generateId(), userId, userType, type, title, message, JSON.stringify(data || {}), new Date().toISOString()).run();
}

async function createRefund(env, ctx, auto) {
  const refundId = generateId();
  const now = new Date().toISOString();

  // Attempt the REAL Razorpay refund against the captured payment. Safe no-op
  // in dev / when there's no razorpay payment id; the audit row is written
  // either way so ops can see (and complete) anything the API couldn't.
  let paymentId = ctx.paymentId || null;
  if (!paymentId) {
    try {
      const b = await env.KUDDL_DB.prepare('SELECT payment_id FROM bookings WHERE id = ?').bind(ctx.bookingId).first();
      paymentId = b?.payment_id || null;
    } catch (e) { /* ignore */ }
  }
  const rp = await refundPayment(env, paymentId, ctx.amount || undefined);

  await env.KUDDL_DB.prepare(
    `INSERT INTO refund_requests (id, booking_id, parent_id, amount, reason, status, requested_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    refundId, ctx.bookingId, ctx.parentId, ctx.amount || 0,
    auto ? 'Automatic refund (specialist did not confirm)' : 'Cancellation refund',
    // If Razorpay processed it, mark completed; otherwise it awaits the ops run.
    rp.success ? 'completed' : (auto ? 'auto_approved' : 'pending'),
    now, now, now
  ).run();

  await notify(env, 'admin', 'admin', 'refund_request',
    rp.success ? 'Refund processed (Razorpay)' : (auto ? 'Auto-refund issued' : 'New refund request'),
    `Refund of ₹${ctx.amount || 0} for booking #${ctx.bookingId} (${auto ? 'auto' : 'manual'}${rp.success ? ', Razorpay ' + (rp.refundId || 'ok') : ''}).`,
    { bookingId: ctx.bookingId, refundId, amount: ctx.amount || 0, auto: !!auto, razorpay: rp });
  return refundId;
}

/**
 * Execute the effect intents returned by bookingStateMachine.transition().
 * Each effect is guarded so one failure can't block the others. Returns the
 * list of effects that ran successfully (handy for tests/logs).
 * @param env  Cloudflare env (KUDDL_DB…)
 * @param effects string[] from transition().effects
 * @param ctx { bookingId, parentId, providerId, serviceName, childFirstName, childAge, specialInstructions, date, time, amount }
 */
export async function executeBookingEffects(env, effects = [], ctx = {}) {
  const ran = [];
  const providerData = buildProviderPayload(ctx);

  // Resolve recipient emails once (only if an email-worthy effect is present).
  let parentEmail = null;
  let providerEmail = null;
  try {
    if (ctx.parentId && effects.some((e) => e.startsWith('notify_parent_'))) {
      parentEmail = (await env.KUDDL_DB.prepare('SELECT email FROM parents WHERE id = ?').bind(ctx.parentId).first())?.email || null;
    }
  } catch (e) { console.error('parent email lookup failed:', e?.message); }
  try {
    if (ctx.providerId && effects.some((e) => e.startsWith('notify_provider_'))) {
      providerEmail = (await env.KUDDL_DB.prepare('SELECT email FROM providers WHERE id = ?').bind(ctx.providerId).first())?.email || null;
    }
  } catch (e) { console.error('provider email lookup failed:', e?.message); }

  // Resolve phones for WhatsApp (same channels as §08; provider WhatsApp goes to
  // the PROVIDER's number and its body carries no parent phone).
  let parentPhone = null;
  let providerPhone = null;
  try {
    if (ctx.parentId && effects.some((e) => e.startsWith('notify_parent_'))) {
      parentPhone = (await env.KUDDL_DB.prepare('SELECT phone FROM parents WHERE id = ?').bind(ctx.parentId).first())?.phone || null;
    }
  } catch (e) { console.error('parent phone lookup failed:', e?.message); }
  try {
    if (ctx.providerId && effects.some((e) => e.startsWith('notify_provider_'))) {
      providerPhone = (await env.KUDDL_DB.prepare('SELECT phone FROM providers WHERE id = ?').bind(ctx.providerId).first())?.phone || null;
    }
  } catch (e) { console.error('provider phone lookup failed:', e?.message); }

  for (const effect of effects) {
    try {
      switch (effect) {
        case 'generate_start_otp':
          await createOTPForBooking(env, ctx.bookingId, ctx.parentId, ctx.providerId);
          break;

        case 'notify_provider_confirmed':
          await notify(env, ctx.providerId, 'partner', 'booking_confirmed',
            'New confirmed booking', `${providerData.service_name || 'A booking'} on ${providerData.booking_date || ''}.`, providerData);
          await sendEmail(env, { to: providerEmail, subject: 'New confirmed booking — Kuddl Kin',
            text: `You have a new confirmed booking.\n\n${providerEmailText(providerData)}` });
          await sendWhatsApp(env, { to: providerPhone, body: `New booking — ${providerData.booking_date || ''}. ${providerEmailText(providerData)}\nOpen your portal to view.` });
          break;

        case 'notify_provider_request':
          await notify(env, ctx.providerId, 'partner', 'booking_request',
            'New booking request — please confirm', 'A parent is waiting for you to confirm within 12–24 hours.', providerData);
          await sendEmail(env, { to: providerEmail, subject: 'New booking request — please confirm within 12–24h',
            text: `A parent is waiting for you to confirm this booking within 12–24 hours.\n\n${providerEmailText(providerData)}` });
          await sendWhatsApp(env, { to: providerPhone, body: `New booking request — please confirm within 12–24h.\n${providerEmailText(providerData)}` });
          break;

        case 'notify_parent_confirmed':
          await notify(env, ctx.parentId, 'customer', 'booking_confirmed',
            'Booking confirmed', 'Your booking is confirmed. The venue and Start OTP are now on your booking page.', { bookingId: ctx.bookingId });
          await sendEmail(env, { to: parentEmail, subject: 'Your booking is confirmed — Kuddl Kin',
            text: 'Your booking is confirmed. The exact venue and your Start OTP are now on your booking page.' });
          await sendWhatsApp(env, { to: parentPhone, body: 'Booking placed. Your booking is confirmed — the venue map and your Start OTP are on your booking page.' });
          break;

        case 'notify_parent_declined':
          await notify(env, ctx.parentId, 'customer', 'booking_declined',
            'Specialist unavailable — full refund on the way', "The specialist couldn't take this booking. You've been refunded in full. Here are a few alternatives.", { bookingId: ctx.bookingId });
          await sendEmail(env, { to: parentEmail, subject: 'Specialist unavailable — full refund on the way',
            text: "The specialist couldn't take this booking, so you've been refunded in full. It returns automatically in 5–7 days. We'll suggest a few alternatives in the app." });
          await sendWhatsApp(env, { to: parentPhone, body: "The specialist isn't available. Your money is on its way back (5–7 days). Here are similar specialists in the app." });
          break;

        case 'notify_parent_cancelled':
          await notify(env, ctx.parentId, 'customer', 'booking_cancelled',
            'Booking cancelled', 'Your booking was cancelled.', { bookingId: ctx.bookingId });
          await sendEmail(env, { to: parentEmail, subject: 'Your booking was cancelled — Kuddl Kin',
            text: 'Your booking was cancelled. Any refund due will be processed per the cancellation policy.' });
          break;

        case 'notify_parent_failure':
          await notify(env, ctx.parentId, 'customer', 'booking_failed',
            "We couldn't complete your booking", 'If any money was deducted, it returns automatically in 5–7 days.', { bookingId: ctx.bookingId });
          await sendEmail(env, { to: parentEmail, subject: "We couldn't complete your booking — Kuddl Kin",
            text: 'We were unable to complete your booking. If any money was deducted, it returns automatically in 5–7 days.' });
          break;

        case 'auto_refund':
          await createRefund(env, ctx, true);
          break;

        case 'issue_refund':
          await createRefund(env, ctx, false);
          break;

        case 'release_payment_to_provider':
          // Session happened (Start OTP verified) → provider payout is due.
          // Flag it to ops; the payout run settles it (schema-safe, no new col).
          await notify(env, 'admin', 'admin', 'payout_due',
            'Provider payout due', `Session completed for booking #${ctx.bookingId} — release ₹${ctx.amount || 0} to the provider.`,
            { bookingId: ctx.bookingId, providerId: ctx.providerId, amount: ctx.amount || 0 });
          break;

        // No direct side-effect needed: capture/hold happen at the Razorpay
        // layer (auto-capture), the exact address is revealed at read-time by
        // booking status, and the confirm window is enforced by a timeout job.
        case 'capture_payment':
        case 'hold_payment':
        case 'reveal_exact_address':
        case 'start_confirm_window':
        case 'suggest_alternatives':
          break;

        default:
          break;
      }
      ran.push(effect);
    } catch (err) {
      console.error(`Effect "${effect}" failed (non-fatal):`, err?.message);
    }
  }
  return ran;
}

export default { executeBookingEffects, buildProviderPayload };
