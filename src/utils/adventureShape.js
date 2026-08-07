// =====================================================================
// Adventure customer-facing shape assembler (Customer Spec · Screen 4 §05)
// A party listing is a SHOW or PACKAGE booked for ONE date + time — never a
// class. Turns raw partner/DB rows into EXACTLY what a parent sees:
//   • variants (flat-priced: "30 min ₹4,500") — pick one            (§05.2)
//   • optional add-ons in the SAME payment                          (§05.3)
//   • ages / capacity / space pills from real fields                (§05)
//   • by-line = provider; "Kuddl Curated"; no fake rating           (§01)
//   • NO batches, NO monthly plans, NO "Per batch"                  (§05)
// Missing structured data → `incomplete: true` so the API can flag the
// listing for re-collection instead of rendering blanks.
//
// Pure + dependency-light (only serviceValidation) → unit-testable.
// =====================================================================

import v from './serviceValidation.js';

const CANCELLATION_SENTENCE = {
  flexible_24h: 'Free cancellation until 24 hours before.',
  moderate_48h: 'Free cancellation until 48 hours before.',
  strict_7d: 'Free cancellation until 7 days before.',
};

function money(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function shapeVariant(raw) {
  const price = money(raw && raw.price);
  const label = String((raw && raw.label) || '').trim();
  if (!label || price == null || price <= 0) return null;
  const note = String((raw && raw.note) || '').trim() || null;
  return { label, price, note };
}

function shapeAddOn(raw) {
  const price = money(raw && raw.price);
  const label = String((raw && raw.label) || '').trim();
  if (!label || price == null || price < 0) return null;
  return { label, price };
}

/**
 * @param raw {
 *   service, provider, variants[], add_ons[], setup_questions[],
 *   age_min, age_max, capacity, space, review_count, rating
 * }
 * @returns customer-facing Adventure object (+ `incomplete` when unrenderable).
 */
export function assembleAdventure(raw = {}) {
  const s = raw.service || {};
  const provider = raw.provider || {};

  const variants = (raw.variants || []).map(shapeVariant).filter(Boolean).sort((a, b) => a.price - b.price);
  const addOns = (raw.add_ons || []).map(shapeAddOn).filter(Boolean);

  const prices = variants.map((x) => x.price);
  const fromPrice = prices.length ? Math.min(...prices) : null;

  // Card flag (§03 slot 7 for Adventure) = the show durations, e.g. "30 min · 45 min".
  const flagLabel = variants.length ? variants.map((x) => x.label).join(' · ') : null;

  const reviewCount = Number(raw.review_count) || 0;
  const rating = reviewCount >= 3 && Number.isFinite(Number(raw.rating)) ? Number(raw.rating) : null; // never a fake 4.5

  // Ages pill — derived band, §01 r6 (>8yr span → "Ages X+").
  const ageMin = Number(raw.age_min);
  const ageMax = Number(raw.age_max);
  let ageLabel = null;
  if (Number.isFinite(ageMin)) {
    if (!Number.isFinite(ageMax)) ageLabel = `Ages ${ageMin}+`;
    else ageLabel = ageMax - ageMin > 8 ? `Ages ${ageMin}+` : v.formatAgeBand({ ageMin, ageMax });
  }

  // Capacity + space pills — only when real.
  const capacityNum = Number(raw.capacity);
  const capacityLabel = Number.isFinite(capacityNum) && capacityNum > 0 ? `up to ${capacityNum} kids` : null;
  const spaceRaw = String(raw.space || '').trim();
  const spaceLabel = spaceRaw ? `Space: ${spaceRaw.charAt(0).toUpperCase()}${spaceRaw.slice(1)}` : null;

  // Setup questions (bouncy-castle / play setups, §05.5) — asked before pay.
  const setupQuestions = Array.isArray(raw.setup_questions)
    ? raw.setup_questions.map((q) => String(q || '').trim()).filter(Boolean)
    : [];

  const locality = provider.city || provider.area || s.locality || null;

  const shaped = {
    id: s.id,
    title: s.name || null,
    byLine: provider.business_name ? `by ${provider.business_name}` : null,
    locality,
    ageLabel,
    capacityLabel,
    spaceLabel,
    experienceYears: Number.isFinite(Number(provider.experience_years)) && Number(provider.experience_years) > 0
      ? Number(provider.experience_years) : null,
    primaryImage: s.primary_image_url || null,
    gallery: Array.isArray(s.gallery_images) ? s.gallery_images : [],
    subcategory: s.subcategory_label || s.subcategory || null,
    // §05/§F — which of the 9 Adventure types this is, + the type-specific
    // fields (photography delivery days, bouncy footprint, MOQ, etc.) passed
    // through verbatim so the customer detail can surface them.
    serviceType: raw.service_type || null,
    typeDetails: raw.type_details && typeof raw.type_details === 'object' ? raw.type_details : null,
    travelIncluded: raw.travel_included != null ? !!raw.travel_included : null,
    travelRadiusKm: Number.isFinite(Number(raw.travel_radius_km)) ? Number(raw.travel_radius_km) : null,
    variants,
    addOns,
    fromPrice,
    flagLabel,
    setupQuestions,
    cancellationSentence: CANCELLATION_SENTENCE[provider.cancellation_policy] || null,
    badge: 'Kuddl Curated',
    isNew: v.isNewListing(s.created_at, raw.now),
    rating,
    reviewCount,
  };

  // A party listing needs a name and at least one flat-priced variant to render
  // truthfully. Otherwise flag it — never show blanks/guesses.
  shaped.incomplete = !(shaped.title && variants.length > 0);
  return shaped;
}

export default { assembleAdventure };
