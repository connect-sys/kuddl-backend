import { describe, it, expect } from 'vitest';
import { assembleCare, resolveVerifiedTitle } from '../src/utils/careShape.js';

const base = () => ({
  service: {
    id: 'svc_care1', name: 'Child Speech Therapy',
    subcategory_label: 'Speech Therapy', languages: 'English,Hindi', primary_image_url: 'care.jpg',
  },
  provider: {
    business_name: 'Dr. Meera Rao', experience_years: 8,
    city: 'Gurugram',
  },
  session_price: 1200,
  session_duration_minutes: 45,
  packages: [{ label: '6-session plan', sessions: 6, price: 6600 }],
  claimed_title: 'Clinical Psychologist',
  credential_verified: true,
  registration_number: 'RCI-12345',
  age_min: 2, age_max: 12,
  review_count: 0,
  rating: 4.8,
});

describe('assembleCare — specialists, §07 rules', () => {
  it('title = person; verified clinical title shows with a real registration', () => {
    const c = assembleCare(base());
    expect(c.practitionerName).toBe('Dr. Meera Rao');
    expect(c.verifiedTitle).toBe('Clinical Psychologist');
    expect(c.credentialVerified).toBe(true);
    expect(c.serviceTitle).toBe('Child Speech Therapy');
    expect(c.sessionPrice).toBe(1200);
    expect(c.packages[0].perSession).toBe(1100); // 6600 / 6, derived
    expect(c.locality).toBe('Gurugram');
    expect(c.badge).toBe('Kuddl Curated');
    expect(c.incomplete).toBe(false);
  });

  it('protected title WITHOUT a verified registration falls back to "Counsellor"', () => {
    expect(resolveVerifiedTitle('Clinical Psychologist', false, '')).toBe('Counsellor');
    expect(resolveVerifiedTitle('Clinical Psychologist', true, '')).toBe('Counsellor'); // verified but no number
    expect(resolveVerifiedTitle('Psychiatrist', true, 'MCI-9')).toBe('Psychiatrist');
    expect(resolveVerifiedTitle('Special Educator', false, '')).toBe('Special Educator'); // unprotected renders as-is
    expect(resolveVerifiedTitle('', false, '')).toBe('Counsellor');
    const unverified = { ...base(), credential_verified: false };
    expect(assembleCare(unverified).verifiedTitle).toBe('Counsellor');
    expect(assembleCare(unverified).credentialVerified).toBe(false);
  });

  it('hold→confirm model with a confirm sentence; intake prompt is the single question', () => {
    const c = assembleCare(base());
    expect(c.bookingModel).toBe('request');
    expect(c.confirmSentence).toMatch(/12–24 hours/);
    expect(c.confirmSentence).toMatch(/refunded in full/);
    expect(c.intakePrompt).toBe('What are you hoping to work on?');
  });

  it('NO urgency — never emits seat/scarcity fields; no fake rating under 3 reviews', () => {
    const c = assembleCare(base());
    expect(c.seatsLeft).toBeUndefined();
    expect('seatsLeft' in c).toBe(false);
    expect(c.rating).toBeNull();
    expect(assembleCare({ ...base(), review_count: 3, rating: 4.6 }).rating).toBe(4.6);
  });

  it('flags incomplete when there is no session price', () => {
    const noPrice = { ...base() }; delete noPrice.session_price;
    expect(assembleCare(noPrice).incomplete).toBe(true);
  });
});
