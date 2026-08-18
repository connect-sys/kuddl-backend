import { describe, it, expect } from 'vitest';
import { assembleBloom } from '../src/utils/bloomShape.js';

const base = () => ({
  service: {
    id: 'svc1', name: 'MDFC — Kids Dance', mode: 'offline',
    subcategory_label: 'Dance', languages: 'English,Hindi', primary_image_url: 'img.jpg',
  },
  provider: {
    business_name: 'My Dance & Fitness Centre', experience_years: 12,
    city: 'Sector 50', cancellation_policy: 'flexible_24h',
  },
  trial: { offered: true, price: 200 },
  monthly_plans: [{ sessions_per_month: 8, price_per_month: 3200 }],
  registration_fee: 500,
  makeup_policy: 'teacher_discretion',
  batches: [{
    age_min: 5, age_max: 8, time_of_day: 'Evening', days: [2, 4],
    start_time: '17:00', end_time: '18:00', start_date: '2026-08-06', end_date: '2026-09-03',
    seats: 15, booked_count: 11, mode: 'offline',
  }],
  review_count: 0,
  rating: 4.5,
});

describe('assembleBloom — real values only', () => {
  it('derives per-session, schedule, seats-left; batch carries its own price; no makeup/badge (v3)', () => {
    const b = assembleBloom(base());
    expect(b.title).toBe('MDFC — Kids Dance');
    expect(b.byLine).toBe('by My Dance & Fitness Centre');
    expect(b.locality).toBe('Sector 50'); // never a pincode
    expect(b.fromPerSession).toBe(400);
    expect(b.registrationFee).toBe(500);
    expect(b.cancellationSentence).toBe('Free cancellation until 24 hours before.');
    // v3 · C2/C12 — makeup and the "Kuddl Curated" badge are gone.
    expect(b.makeupSentence).toBeUndefined();
    expect(b.badge).toBeUndefined();
    const batch = b.batches[0];
    expect(batch.ageBand).toBe('Ages 5–8');
    expect(batch.durationMinutes).toBe(60);
    expect(batch.sessionCount).toBe(9);
    expect(batch.totalHours).toBe(9);
    expect(batch.seatsLeft).toBe(4); // 15 - 11, from real bookings
    // v3 · B1 — the batch card carries its own price (here via the fallback).
    expect(batch.pricePerMonth).toBe(3200);
    expect(batch.sessionsPerMonth).toBe(8);
    expect(batch.perSession).toBe(400);
    expect(b.incomplete).toBe(false);
  });

  it('a batch with its OWN price/sessions overrides the service fallback (v3 · B1)', () => {
    const r = base();
    r.batches = [{
      ...r.batches[0], price: 6500, price_type: 'per_month', sessions_per_month: 8,
      class_type: 'group', schedule_type: 'fixed',
    }];
    const batch = assembleBloom(r).batches[0];
    expect(batch.pricePerMonth).toBe(6500);
    expect(batch.perSession).toBe(813); // 6500 / 8, rounded
  });

  it('a teacher-scheduled solo batch renders with no days/time (v3 · A3)', () => {
    const r = base();
    r.batches = [{
      age_min: 5, age_max: null, open_above: 5, price: 9000, price_type: 'per_month',
      sessions_per_month: 8, class_type: 'solo', schedule_type: 'teacher_scheduled',
      days: [], start_time: null, end_time: null, start_date: '2026-08-06',
    }];
    const out = assembleBloom(r);
    expect(out.batches).toHaveLength(1);
    const batch = out.batches[0];
    expect(batch.scheduleType).toBe('teacher_scheduled');
    expect(batch.classType).toBe('solo');
    expect(batch.pricePerMonth).toBe(9000);
  });

  it('derives a service-level ageLabel; span > 8 years collapses to "Ages X+"', () => {
    expect(assembleBloom(base()).ageLabel).toBe('Ages 5–8');
    // Two batches spanning 5–15 (> 8 years) → "Ages 5+" (§01 r6).
    const wide = base();
    wide.batches = [
      { ...wide.batches[0], age_min: 5, age_max: 8 },
      { ...wide.batches[0], age_min: 10, age_max: 15 },
    ];
    expect(assembleBloom(wide).ageLabel).toBe('Ages 5+');
    // An open-ended batch (open_above, no max) → "Ages X+".
    const open = base();
    open.batches = [{ ...open.batches[0], age_min: 5, age_max: null, open_above: 5 }];
    expect(assembleBloom(open).ageLabel).toBe('Ages 5+');
  });

  it('"New to Kuddl" (isNew) is true only in the first 21 days', () => {
    const now = new Date('2026-08-20T00:00:00Z').getTime();
    const fresh = base(); fresh.service.created_at = '2026-08-10'; fresh.now = now; // 10 days old
    expect(assembleBloom(fresh).isNew).toBe(true);
    const old = base(); old.service.created_at = '2026-07-01'; old.now = now; // 50 days old
    expect(assembleBloom(old).isNew).toBe(false);
    const noDate = base(); noDate.now = now; // no created_at
    expect(assembleBloom(noDate).isNew).toBe(false);
  });

  it('NEVER shows a fake rating — null under 3 reviews, shown at 3+', () => {
    expect(assembleBloom(base()).rating).toBeNull();
    const withReviews = { ...base(), review_count: 3, rating: 4.5 };
    expect(assembleBloom(withReviews).rating).toBe(4.5);
  });

  it('hides seat count when the partner set no seats (typed scarcity dead)', () => {
    const raw = base();
    raw.batches[0].seats = null;
    expect(assembleBloom(raw).batches[0].seatsLeft).toBeUndefined();
  });

  it('online service shows "Online", not a locality', () => {
    const raw = base();
    raw.service.mode = 'online';
    expect(assembleBloom(raw).locality).toBe('Online');
  });

  it('free trial (₹0) is marked free', () => {
    const raw = base();
    raw.trial = { offered: true, price: 0 };
    const t = assembleBloom(raw).trial;
    expect(t.isFree).toBe(true);
  });

  it('no trial → trial is null', () => {
    const raw = base();
    raw.trial = { offered: false };
    expect(assembleBloom(raw).trial).toBeNull();
  });

  it('flags incomplete when a monthly plan or batch is missing (no blanks rendered)', () => {
    const noPlan = { ...base(), monthly_plans: [] };
    expect(assembleBloom(noPlan).incomplete).toBe(true);
    const noBatch = { ...base(), batches: [] };
    expect(assembleBloom(noBatch).incomplete).toBe(true);
  });

  it('drops a monthly plan with zero sessions (never divides by zero)', () => {
    const raw = base();
    raw.monthly_plans = [{ sessions_per_month: 0, price_per_month: 3200 }];
    expect(assembleBloom(raw).monthlyPlans.length).toBe(0);
  });
});
