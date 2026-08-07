import { describe, it, expect } from 'vitest';
import { assembleAdventure } from '../src/utils/adventureShape.js';

const base = () => ({
  service: {
    id: 'svc_adv1', name: 'The Birthday Magic Show',
    subcategory_label: 'Magician', primary_image_url: 'magic.jpg',
  },
  provider: {
    business_name: 'Magic Mayhem Co.', experience_years: 9,
    city: 'Noida', cancellation_policy: 'moderate_48h',
  },
  variants: [
    { label: '45 min', price: 6000 },
    { label: '30 min', price: 4500, note: 'travel included' },
    { label: '60 min', price: 7500 },
  ],
  add_ons: [
    { label: 'Face painting station', price: 2500 },
    { label: '30-min extension', price: 1500 },
  ],
  age_min: 3, age_max: 10,
  capacity: 40,
  space: 'medium',
  review_count: 0,
  rating: 4.5,
});

describe('assembleAdventure — parties, real values only', () => {
  it('flat-priced variants sorted low→high; from-price + duration flag; add-ons kept', () => {
    const a = assembleAdventure(base());
    expect(a.title).toBe('The Birthday Magic Show');
    expect(a.byLine).toBe('by Magic Mayhem Co.');
    expect(a.locality).toBe('Noida'); // never a pincode
    expect(a.variants.map((v) => v.label)).toEqual(['30 min', '45 min', '60 min']); // sorted by price
    expect(a.variants[0].note).toBe('travel included');
    expect(a.fromPrice).toBe(4500);
    expect(a.flagLabel).toBe('30 min · 45 min · 60 min');
    expect(a.addOns).toHaveLength(2);
    expect(a.ageLabel).toBe('Ages 3–10');
    expect(a.capacityLabel).toBe('up to 40 kids');
    expect(a.spaceLabel).toBe('Space: Medium');
    expect(a.badge).toBe('Kuddl Curated');
    expect(a.incomplete).toBe(false);
  });

  it('NEVER shows a fake rating — null under 3 reviews, shown at 3+', () => {
    expect(assembleAdventure(base()).rating).toBeNull();
    expect(assembleAdventure({ ...base(), review_count: 3, rating: 4.2 }).rating).toBe(4.2);
  });

  it('drops invalid variants; flags incomplete when none remain', () => {
    const raw = base();
    raw.variants = [{ label: '', price: 5000 }, { label: '30 min', price: 0 }];
    const a = assembleAdventure(raw);
    expect(a.variants).toHaveLength(0);
    expect(a.fromPrice).toBeNull();
    expect(a.incomplete).toBe(true); // no renderable variant → flagged, not blank
  });

  it('age span wider than 8 years collapses to "Ages X+"; hides pills when absent', () => {
    const wide = { ...base(), age_min: 3, age_max: 14 };
    expect(assembleAdventure(wide).ageLabel).toBe('Ages 3+');
    const noPills = { ...base() };
    delete noPills.capacity; delete noPills.space;
    const a = assembleAdventure(noPills);
    expect(a.capacityLabel).toBeNull();
    expect(a.spaceLabel).toBeNull();
  });

  it('passes through setup questions for play-setup vendors (asked before pay)', () => {
    const raw = { ...base(), setup_questions: ['How much space do you have?', 'Is there a power socket?', ''] };
    expect(assembleAdventure(raw).setupQuestions).toEqual(['How much space do you have?', 'Is there a power socket?']);
  });

  it('surfaces the Adventure service type + type-specific details + travel', () => {
    const raw = {
      ...base(),
      service_type: 'photography_event',
      type_details: { edited_photos: 60, delivery_days: 7, crew_size: 2 },
      travel_included: true, travel_radius_km: 12,
    };
    const a = assembleAdventure(raw);
    expect(a.serviceType).toBe('photography_event');
    expect(a.typeDetails).toEqual({ edited_photos: 60, delivery_days: 7, crew_size: 2 });
    expect(a.travelIncluded).toBe(true);
    expect(a.travelRadiusKm).toBe(12);
    // Absent → nulls (nothing invented).
    const bare = assembleAdventure(base());
    expect(bare.serviceType).toBeNull();
    expect(bare.typeDetails).toBeNull();
    expect(bare.travelIncluded).toBeNull();
  });
});
