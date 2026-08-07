import { describe, it, expect } from 'vitest';
import { mapRowsToBloomRaw } from '../src/controllers/bloomServiceController.js';
import { assembleBloom } from '../src/utils/bloomShape.js';

// Rows exactly as they come out of D1 (JSON columns are strings).
const serviceRow = {
  id: 'svc1', name: 'MDFC — Kids Dance', provider_id: 'p1',
  subcategory_label: 'Dance', languages: 'English,Hindi', primary_image_url: 'img.jpg',
  image_urls: '["a.jpg","b.jpg"]', city: 'Sector 50',
  bloom_pricing: JSON.stringify({
    trial: { offered: true, price: 200 },
    monthly_plans: [{ sessions_per_month: 8, price_per_month: 3200 }],
    registration_fee: 500,
    makeup_policy: 'teacher_discretion',
  }),
};
const providerRow = {
  id: 'p1', business_name: 'My Dance & Fitness Centre', experience_years: 12,
  city: 'Sector 50', cancellation_policy: 'flexible_24h', total_reviews: 4, average_rating: 4.6,
};
const batchRows = [{
  id: 'b1', age_min: 5, age_max: 8, total_seats: 15, booked_seats: 11, mode: 'offline',
  schedule: JSON.stringify({ time_of_day: 'Evening', days: [2, 4], start_time: '17:00', end_time: '18:00', start_date: '2026-08-06', end_date: '2026-09-03' }),
}];

describe('mapRowsToBloomRaw → assembleBloom (D1 rows → customer shape)', () => {
  it('parses JSON columns and produces the real customer shape', () => {
    const raw = mapRowsToBloomRaw(serviceRow, providerRow, batchRows);
    const b = assembleBloom(raw);
    expect(b.title).toBe('MDFC — Kids Dance');
    expect(b.byLine).toBe('by My Dance & Fitness Centre');
    expect(b.monthlyPlans[0].perSession).toBe(400);
    expect(b.registrationFee).toBe(500);
    expect(b.cancellationSentence).toBe('Free cancellation until 24 hours before.');
    expect(b.batches[0].ageBand).toBe('Ages 5–8');
    expect(b.batches[0].sessionCount).toBe(9);
    expect(b.batches[0].seatsLeft).toBe(4);
    expect(b.rating).toBe(4.6); // 4 reviews ≥ 3 → real rating shows
    expect(b.gallery).toEqual(['a.jpg', 'b.jpg']);
    expect(b.incomplete).toBe(false);
  });

  it('flags incomplete when bloom_pricing/batches are missing', () => {
    const raw = mapRowsToBloomRaw({ id: 'svc2', name: 'X' }, providerRow, []);
    expect(assembleBloom(raw).incomplete).toBe(true);
  });
});
