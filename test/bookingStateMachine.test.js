import { describe, it, expect } from 'vitest';
import { STATES, EVENTS, transition, can, isTerminal } from '../src/utils/bookingStateMachine.js';

describe('bookingStateMachine — the money spine', () => {
  it('instant (Bloom/Adventure): pay → confirmed with the full fan-out + OTP', () => {
    const r = transition(STATES.PENDING_PAYMENT, EVENTS.PAY_SUCCESS, { bookingModel: 'instant' });
    expect(r.state).toBe(STATES.CONFIRMED);
    expect(r.effects).toContain('capture_payment');
    expect(r.effects).toContain('generate_start_otp');
    expect(r.effects).toContain('notify_parent_confirmed');
    expect(r.effects).toContain('reveal_exact_address');
  });

  it('request (Care): pay → held (money not captured, provider asked to confirm)', () => {
    const r = transition(STATES.PENDING_PAYMENT, EVENTS.PAY_SUCCESS, { bookingModel: 'request' });
    expect(r.state).toBe(STATES.PAID_HOLD);
    expect(r.effects).toEqual(['hold_payment', 'notify_provider_request', 'start_confirm_window']);
  });

  it('Care hold → specialist confirms → confirmed + OTP', () => {
    const r = transition(STATES.PAID_HOLD, EVENTS.SPECIALIST_CONFIRM);
    expect(r.state).toBe(STATES.CONFIRMED);
    expect(r.effects).toContain('generate_start_otp');
  });

  it('Care hold → decline OR timeout → automatic full refund + alternatives', () => {
    for (const ev of [EVENTS.SPECIALIST_DECLINE, EVENTS.CONFIRM_TIMEOUT]) {
      const r = transition(STATES.PAID_HOLD, ev);
      expect(r.state).toBe(STATES.REFUNDED);
      expect(r.effects).toContain('auto_refund');
      expect(r.effects).toContain('suggest_alternatives');
    }
  });

  it('§05 lifecycle: confirmed → in_progress (OTP) → delivered → settled → closed', () => {
    const s1 = transition(STATES.CONFIRMED, EVENTS.OTP_ENTERED);
    expect(s1.state).toBe(STATES.IN_PROGRESS);
    expect(s1.effects).toContain('mark_session_started');
    // START_OTP_VERIFIED is a back-compat alias of OTP_ENTERED.
    expect(transition(STATES.CONFIRMED, EVENTS.START_OTP_VERIFIED).state).toBe(STATES.IN_PROGRESS);

    const s2 = transition(STATES.IN_PROGRESS, EVENTS.SESSION_DELIVERED);
    expect(s2.state).toBe(STATES.DELIVERED);
    expect(s2.effects).toContain('request_review');

    const s3 = transition(STATES.DELIVERED, EVENTS.SETTLE);
    expect(s3.state).toBe(STATES.SETTLED);
    expect(s3.effects).toContain('release_payment_to_provider');

    const s4 = transition(STATES.SETTLED, EVENTS.CLOSE);
    expect(s4.state).toBe(STATES.CLOSED);
    expect(isTerminal(s4.state)).toBe(true);
  });

  it('settlement never waits for the OTP — SETTLE can fire from confirmed (§04)', () => {
    expect(transition(STATES.CONFIRMED, EVENTS.SETTLE).state).toBe(STATES.SETTLED);
  });

  it('partner cancel / no-show → cancelled_partner with 100% + make-good + ledger recovery (§05)', () => {
    const r = transition(STATES.CONFIRMED, EVENTS.PARTNER_CANCEL);
    expect(r.state).toBe(STATES.CANCELLED_PARTNER);
    expect(r.effects).toEqual(expect.arrayContaining(['full_refund', 'make_good_credit', 'ledger_recovery_if_released']));
  });

  it('dispute raised post-session → disputed pauses settlement (§06 workflow)', () => {
    const r = transition(STATES.DELIVERED, EVENTS.RAISE_DISPUTE);
    expect(r.state).toBe(STATES.DISPUTED);
    expect(r.effects).toContain('pause_settlement');
  });

  it('confirmed → cancel issues a refund only when one is due (policy)', () => {
    expect(transition(STATES.CONFIRMED, EVENTS.CANCEL, { refundDue: 3700 }).effects).toContain('issue_refund');
    expect(transition(STATES.CONFIRMED, EVENTS.CANCEL, { refundDue: 0 }).effects).not.toContain('issue_refund');
  });

  it('failure paths: pay fail is retryable; paid-but-unsaved auto-refunds (§06.4)', () => {
    expect(transition(STATES.PENDING_PAYMENT, EVENTS.PAY_FAIL).state).toBe(STATES.PAYMENT_FAILED);
    expect(transition(STATES.PAYMENT_FAILED, EVENTS.RETRY).state).toBe(STATES.PENDING_PAYMENT);
    const bf = transition(STATES.PENDING_PAYMENT, EVENTS.BOOKING_SAVE_FAIL);
    expect(bf.state).toBe(STATES.BOOKING_FAILED);
    expect(bf.effects).toContain('auto_refund');
  });

  it('rejects illegal transitions and reports legality via can()', () => {
    expect(() => transition(STATES.CLOSED, EVENTS.CANCEL)).toThrow(/Illegal/);
    expect(can(STATES.PENDING_PAYMENT, EVENTS.PAY_SUCCESS)).toBe(true);
    expect(can(STATES.CONFIRMED, EVENTS.PAY_SUCCESS)).toBe(false);
  });
});
