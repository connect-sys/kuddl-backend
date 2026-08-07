import { describe, it, expect } from 'vitest';
import { buildProviderPayload, providerEmailText } from '../src/utils/bookingEffects.js';

describe('bookingEffects.buildProviderPayload — §06 provider never sees the parent phone', () => {
  const ctx = {
    bookingId: 'bk1', parentId: 'p1', providerId: 'pr1',
    serviceName: 'Little Steps Ballet', date: '2026-10-14', time: '17:00',
    childFirstName: 'Aarav', childAge: 6, specialInstructions: 'Shy at first',
    // Sensitive parent fields that must NEVER reach the provider:
    parentPhone: '+919999999999', parentEmail: 'mom@example.com', parentFullName: 'Priya Sharma',
  };

  it('includes only the safe fields the provider needs', () => {
    const p = buildProviderPayload(ctx);
    expect(p).toEqual({
      booking_id: 'bk1',
      service_name: 'Little Steps Ballet',
      booking_date: '2026-10-14',
      booking_time: '17:00',
      child_first_name: 'Aarav',
      child_age: 6,
      special_instructions: 'Shy at first',
    });
  });

  it('never leaks the parent phone / email / full name in any form', () => {
    const serialized = JSON.stringify(buildProviderPayload(ctx));
    expect(serialized).not.toContain('9999999999');
    expect(serialized).not.toContain('mom@example.com');
    expect(serialized).not.toContain('Priya');
    expect(Object.keys(buildProviderPayload(ctx))).not.toContain('parent_phone');
  });

  it('provider email body carries only safe fields — no parent phone/email/name', () => {
    const body = providerEmailText(buildProviderPayload(ctx));
    expect(body).toContain('Little Steps Ballet');
    expect(body).toContain('Aarav (age 6)');
    expect(body).not.toContain('9999999999');
    expect(body).not.toContain('mom@example.com');
    expect(body).not.toContain('Priya');
  });
});
