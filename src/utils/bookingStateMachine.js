// =====================================================================
// Booking state machine — the "money spine" (PRD Core Volume §05 + §04)
// One diagram for all categories; Care adds the hold→confirm gate. Every screen
// and message keys off these explicit states. Controllers call transition() and
// carry out the returned `effects`. Pure + dependency-free → unit-testable.
//
// Canonical lifecycle (§05):
//   created → paid → pending_confirm(Care) → confirmed → in_progress →
//   delivered → settled → closed
// with branches: payment_failed · auto_declined(→refunded) · cancelled_parent ·
//   cancelled_partner(100% + make-good) · disputed.
//
// Note on settlement: it is SCHEDULE-based and never waits for the OTP (§04) —
// SETTLE may fire from confirmed / in_progress / delivered when a tranche's
// release date arrives.
//
// Booking models: 'instant' (Bloom/Adventure: pay → confirmed) · 'request'
// (Care: pay → held → specialist confirms in a window → else auto refund).
// =====================================================================

export const STATES = Object.freeze({
  PENDING_PAYMENT: 'pending_payment', // "created/paid" pre-confirmation holding point
  PAID_HOLD: 'paid_hold',             // Care: money held, awaiting confirm (pending_confirm)
  CONFIRMED: 'confirmed',
  IN_PROGRESS: 'in_progress',         // Start OTP entered — session under way
  DELIVERED: 'delivered',             // session finished
  SETTLED: 'settled',                 // provider paid out per §04 schedule
  CLOSED: 'closed',                   // review window done
  CANCELLED: 'cancelled',             // cancelled_parent
  CANCELLED_PARTNER: 'cancelled_partner',
  DISPUTED: 'disputed',
  REFUNDED: 'refunded',
  PAYMENT_FAILED: 'payment_failed',
  BOOKING_FAILED: 'booking_failed',
});

export const EVENTS = Object.freeze({
  PAY_SUCCESS: 'PAY_SUCCESS',
  PAY_FAIL: 'PAY_FAIL',
  BOOKING_SAVE_FAIL: 'BOOKING_SAVE_FAIL',
  SPECIALIST_CONFIRM: 'SPECIALIST_CONFIRM',
  SPECIALIST_DECLINE: 'SPECIALIST_DECLINE',
  CONFIRM_TIMEOUT: 'CONFIRM_TIMEOUT',
  OTP_ENTERED: 'OTP_ENTERED',
  START_OTP_VERIFIED: 'START_OTP_VERIFIED', // alias of OTP_ENTERED (back-compat)
  SESSION_DELIVERED: 'SESSION_DELIVERED',
  SETTLE: 'SETTLE',
  CLOSE: 'CLOSE',
  CANCEL: 'CANCEL',                 // parent cancels
  PARTNER_CANCEL: 'PARTNER_CANCEL', // partner cancels / no-show
  RAISE_DISPUTE: 'RAISE_DISPUTE',
  REFUND_ISSUED: 'REFUND_ISSUED',
  RETRY: 'RETRY',
});

const TERMINAL = new Set([STATES.CLOSED, STATES.REFUNDED]);
export function isTerminal(state) { return TERMINAL.has(state); }

// The §06 "moment payment succeeds" fan-out. Controllers map these to
// WhatsApp/email/OTP; the provider is NEVER sent the parent's phone (§06).
const CONFIRMED_EFFECTS = ['generate_start_otp', 'notify_provider_confirmed', 'notify_parent_confirmed', 'reveal_exact_address'];
// Partner cancel / no-show → 100% refund + make-good; recover from the ledger
// if funds were already released (§06 vendor ledger).
const PARTNER_CANCEL_EFFECTS = ['full_refund', 'make_good_credit', 'ledger_recovery_if_released', 'notify_parent_cancelled'];

/**
 * Next state + side-effects for an event. Pure; throws on an illegal move.
 * @param ctx { bookingModel?: 'instant'|'request', refundDue? }
 */
export function transition(state, event, ctx = {}) {
  const model = ctx.bookingModel === 'request' ? 'request' : 'instant';
  const isOtpEntered = event === EVENTS.OTP_ENTERED || event === EVENTS.START_OTP_VERIFIED;

  switch (state) {
    case STATES.PENDING_PAYMENT:
      if (event === EVENTS.PAY_SUCCESS) {
        return model === 'request'
          ? { state: STATES.PAID_HOLD, effects: ['hold_payment', 'notify_provider_request', 'start_confirm_window'] }
          : { state: STATES.CONFIRMED, effects: ['capture_payment', ...CONFIRMED_EFFECTS] };
      }
      if (event === EVENTS.PAY_FAIL) return { state: STATES.PAYMENT_FAILED, effects: [] };
      if (event === EVENTS.BOOKING_SAVE_FAIL) return { state: STATES.BOOKING_FAILED, effects: ['auto_refund', 'notify_parent_failure'] };
      break;

    case STATES.PAID_HOLD:
      if (event === EVENTS.SPECIALIST_CONFIRM) return { state: STATES.CONFIRMED, effects: ['capture_payment', ...CONFIRMED_EFFECTS] };
      if (event === EVENTS.SPECIALIST_DECLINE || event === EVENTS.CONFIRM_TIMEOUT) return { state: STATES.REFUNDED, effects: ['auto_refund', 'notify_parent_declined', 'suggest_alternatives'] };
      if (event === EVENTS.CANCEL) return { state: STATES.REFUNDED, effects: ['auto_refund', 'notify_parent_cancelled'] };
      if (event === EVENTS.PARTNER_CANCEL) return { state: STATES.CANCELLED_PARTNER, effects: PARTNER_CANCEL_EFFECTS };
      break;

    case STATES.CONFIRMED:
      if (isOtpEntered) return { state: STATES.IN_PROGRESS, effects: ['mark_session_started', 'notify_parent_session_started'] };
      if (event === EVENTS.SETTLE) return { state: STATES.SETTLED, effects: ['release_payment_to_provider'] }; // §04: schedule-based, doesn't wait for OTP
      if (event === EVENTS.CANCEL) {
        const refund = Number(ctx.refundDue) || 0;
        return { state: STATES.CANCELLED, effects: refund > 0 ? ['issue_refund', 'notify_provider_cancelled'] : ['notify_provider_cancelled'] };
      }
      if (event === EVENTS.PARTNER_CANCEL) return { state: STATES.CANCELLED_PARTNER, effects: PARTNER_CANCEL_EFFECTS };
      break;

    case STATES.IN_PROGRESS:
      if (event === EVENTS.SESSION_DELIVERED) return { state: STATES.DELIVERED, effects: ['request_review'] };
      if (event === EVENTS.SETTLE) return { state: STATES.SETTLED, effects: ['release_payment_to_provider'] };
      if (event === EVENTS.RAISE_DISPUTE) return { state: STATES.DISPUTED, effects: ['pause_settlement', 'open_dispute'] };
      break;

    case STATES.DELIVERED:
      if (event === EVENTS.SETTLE) return { state: STATES.SETTLED, effects: ['release_payment_to_provider'] };
      if (event === EVENTS.RAISE_DISPUTE) return { state: STATES.DISPUTED, effects: ['pause_settlement', 'open_dispute'] }; // ≤48h post-session
      break;

    case STATES.SETTLED:
      if (event === EVENTS.CLOSE) return { state: STATES.CLOSED, effects: [] };
      if (event === EVENTS.RAISE_DISPUTE) return { state: STATES.DISPUTED, effects: ['open_dispute'] };
      break;

    case STATES.DISPUTED:
      if (event === EVENTS.CLOSE) return { state: STATES.CLOSED, effects: [] };
      if (event === EVENTS.REFUND_ISSUED) return { state: STATES.REFUNDED, effects: [] };
      break;

    case STATES.CANCELLED:
      if (event === EVENTS.REFUND_ISSUED) return { state: STATES.REFUNDED, effects: [] };
      break;

    case STATES.CANCELLED_PARTNER:
      if (event === EVENTS.REFUND_ISSUED) return { state: STATES.REFUNDED, effects: [] };
      break;

    case STATES.PAYMENT_FAILED:
      if (event === EVENTS.RETRY) return { state: STATES.PENDING_PAYMENT, effects: [] };
      break;

    case STATES.BOOKING_FAILED:
      if (event === EVENTS.RETRY) return { state: STATES.PENDING_PAYMENT, effects: [] };
      if (event === EVENTS.REFUND_ISSUED) return { state: STATES.REFUNDED, effects: [] };
      break;

    default:
      break;
  }

  throw new Error(`Illegal booking transition: ${state} --${event}-->`);
}

export function can(state, event, ctx = {}) {
  try { transition(state, event, ctx); return true; } catch { return false; }
}

export default { STATES, EVENTS, transition, can, isTerminal };
