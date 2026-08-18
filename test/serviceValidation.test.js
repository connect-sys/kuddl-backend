import { describe, it, expect } from 'vitest';
import v from '../src/utils/serviceValidation.js';

describe('service name', () => {
  it('accepts a valid "Business — Service" name', () => {
    expect(v.validateServiceName('MDFC — Kids Dance').valid).toBe(true);
  });
  it('rejects > 60 chars', () => {
    expect(v.validateServiceName('x'.repeat(61)).valid).toBe(false);
  });
  it('rejects banned words', () => {
    expect(v.validateServiceName('Best in Noida Dance').valid).toBe(false);
  });
});

describe('banned words (Partner Mockups §B/G)', () => {
  it('flags cure/treats/guaranteed/100%/reverses/best in noida', () => {
    expect(v.findBannedWords('We cure and treat, guaranteed 100% results')).toEqual(
      expect.arrayContaining(['cure', 'guaranteed', '100%'])
    );
  });
  it('flags phone numbers and links', () => {
    expect(v.hasBannedWords('call me 98765 43210')).toBe(true);
    expect(v.hasBannedWords('visit www.example.com')).toBe(true);
    expect(v.hasBannedWords('see growsports.in')).toBe(true);
  });
  it('passes clean copy', () => {
    expect(v.hasBannedWords('A warm dance class for young children.')).toBe(false);
  });
});

describe('age band ≤ 8 years (Screen D hard rule)', () => {
  it('accepts a 3-year band', () => {
    expect(v.validateAgeBand(5, 8).valid).toBe(true);
  });
  it('rejects a band wider than 8 years (5→17)', () => {
    expect(v.validateAgeBand(5, 17).valid).toBe(false);
  });
  it('rejects min >= max', () => {
    expect(v.validateAgeBand(8, 8).valid).toBe(false);
  });
});

describe('age band formatting (never a giant range)', () => {
  it('formats a real band', () => {
    expect(v.formatAgeBand({ ageMin: 6, ageMax: 9 })).toBe('Ages 6–9');
  });
  it('formats open-above as X+', () => {
    expect(v.formatAgeBand({ openAbove: 5 })).toBe('Ages 5+');
  });
});

describe('derived fields — computed, never typed (Customer Spec §00)', () => {
  it('per-session = month price / sessions (₹3,200 / 8 = ₹400)', () => {
    expect(v.derivePerSessionPrice({ pricePerMonth: 3200, sessionsPerMonth: 8 })).toBe(400);
  });
  it('per-session null when sessions is 0', () => {
    expect(v.derivePerSessionPrice({ pricePerMonth: 3200, sessionsPerMonth: 0 })).toBeNull();
  });
  it('session duration 5:00PM→6:00PM = 60 min', () => {
    expect(v.deriveSessionDurationMinutes('17:00', '18:00')).toBe(60);
  });
  it('session duration rejects end <= start', () => {
    expect(v.deriveSessionDurationMinutes('18:00', '17:00')).toBeNull();
  });
  it('session count over a date range for Tue & Thu', () => {
    // 6 Aug 2026 is a Thursday. Tue(2) & Thu(4), 6 Aug → 3 Sep 2026.
    const n = v.deriveSessionCount({
      startDate: '2026-08-06',
      endDate: '2026-09-03',
      days: [2, 4],
    });
    expect(n).toBe(9); // Aug: 6,11,13,18,20,25,27 + Sep: 1,3
  });
  it('total hours = sessions × duration', () => {
    expect(v.deriveTotalHours({ sessionCount: 8, sessionDurationMinutes: 60 })).toBe(8);
  });
  it('seats-left derived from real bookings; null when unset', () => {
    expect(v.deriveSeatsLeft(15, 11)).toBe(4);
    expect(v.deriveSeatsLeft(null, 3)).toBeNull(); // typed scarcity is dead
    expect(v.deriveSeatsLeft(2, 5)).toBe(0); // never negative
  });
});

describe('trial + variants', () => {
  it('₹0 trial is valid and free', () => {
    const r = v.validateTrialPrice(0);
    expect(r.valid).toBe(true);
    expect(r.isFree).toBe(true);
  });
  it('negative trial invalid', () => {
    expect(v.validateTrialPrice(-1).valid).toBe(false);
  });
  it('1–3 priced variants valid, >3 invalid', () => {
    expect(v.validateVariants([{ label: '30 min', price: 4500 }]).valid).toBe(true);
    expect(
      v.validateVariants([
        { label: '30', price: 1 }, { label: '45', price: 2 }, { label: '60', price: 3 }, { label: '90', price: 4 },
      ]).valid
    ).toBe(false);
    expect(v.validateVariants([{ label: '30 min', price: 0 }]).valid).toBe(false);
  });
});

describe('Bloom publishing gate', () => {
  it('blocks when incomplete', () => {
    const r = v.bloomPublishGate({ trial_offered: true });
    expect(r.canPublish).toBe(false);
    expect(r.missing.length).toBeGreaterThan(0);
  });
  it('passes when complete (v3 — batch carries its own price, no makeup/plan)', () => {
    const r = v.bloomPublishGate({
      trial_offered: true,
      batches: [{ age_min: 5, price_per_month: 6500, days: [2, 4], start_time: '17:00', end_time: '18:00', start_date: '2026-08-06' }],
    });
    expect(r.canPublish).toBe(true);
  });
  it('blocks a batch with no price (v3)', () => {
    const r = v.bloomPublishGate({
      trial_offered: true,
      batches: [{ age_min: 5, days: [2, 4], start_time: '17:00', end_time: '18:00', start_date: '2026-08-06' }],
    });
    expect(r.canPublish).toBe(false);
  });
});
