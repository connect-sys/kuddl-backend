// =====================================================================
// Bloom customer-facing shape assembler
// Turns raw partner/DB rows into EXACTLY what a parent sees on a Bloom
// listing/detail — applying the Customer Spec's rules:
//   • no fake ratings (stars only when ≥ 3 real reviews)          (§01 r4)
//   • localities, never pincodes                                   (§01 r7)
//   • prices always carry a unit; per-session is derived           (§01 r3)
//   • "Kuddl Curated" badge on every listing                       (§01 r5)
//   • real schedule / seats derived from real data, never typed    (§04)
// Missing structured data → `incomplete: true` so the API can flag the
// listing for re-collection instead of rendering blanks (Screen 3 note).
//
// Pure + dependency-light (only serviceValidation) → unit-testable.
// =====================================================================

import v from './serviceValidation.js';

const CANCELLATION_SENTENCE = {
  flexible_24h: 'Free cancellation until 24 hours before.',
  moderate_48h: 'Free cancellation until 48 hours before.',
  strict_7d: 'Free cancellation until 7 days before.',
};

const MAKEUP_SENTENCE = {
  offered: 'Makeup sessions offered.',
  not_offered: 'No makeup sessions.',
  teacher_discretion: "Makeup sessions at teacher's discretion.",
};

const MIN_REVIEWS_TO_SHOW_RATING = 3;

function money(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : null;
}

/** Assemble one monthly plan with its derived per-session price. */
function shapeMonthlyPlan(p) {
  const sessionsPerMonth = Number(p.sessions_per_month);
  const pricePerMonth = money(p.price_per_month);
  if (!Number.isFinite(sessionsPerMonth) || sessionsPerMonth <= 0 || pricePerMonth == null) return null;
  return {
    sessionsPerMonth,
    pricePerMonth,
    perSession: v.derivePerSessionPrice({ pricePerMonth, sessionsPerMonth }),
  };
}

/**
 * Legacy fallback: services created before bloom_pricing existed have no
 * monthly_plans, but their real batches carry their own real price +
 * price_type (set by the partner at batch creation). Translate each batch's
 * own price into the monthly-plan shape so these listings render with real
 * numbers instead of being flagged incomplete. Only per_month / per_session
 * are translated — per_term / per_camp aren't safely convertible to a
 * monthly-equivalent without guessing, so those batches are left out.
 */
function legacyPlanFromBatch(b) {
  const price = money(b.price);
  if (price == null || price <= 0) return null;
  const days = Array.isArray(b.days) ? b.days : (typeof b.days === 'string' && b.days ? JSON.parse(b.days) : []);
  const sessionsPerMonth = v.deriveSessionsPerMonth(days);
  if (!sessionsPerMonth) return null;
  if (b.price_type === 'per_month') {
    return { sessionsPerMonth, pricePerMonth: price, perSession: v.derivePerSessionPrice({ pricePerMonth: price, sessionsPerMonth }) };
  }
  if (b.price_type === 'per_session') {
    const pricePerMonth = Math.round(price * sessionsPerMonth);
    return { sessionsPerMonth, pricePerMonth, perSession: Math.round(price) };
  }
  return null;
}

/** Assemble one batch with derived duration / session-count / total-hours / seats-left. */
function shapeBatch(b, holidays = []) {
  const ageBand = v.formatAgeBand({ ageMin: b.age_min, ageMax: b.age_max, openAbove: b.open_above });
  const durationMinutes = v.deriveSessionDurationMinutes(b.start_time, b.end_time);
  const days = Array.isArray(b.days) ? b.days : (typeof b.days === 'string' && b.days ? JSON.parse(b.days) : []);
  const sessionCount = v.deriveSessionCount({
    startDate: b.start_date, endDate: b.end_date, days,
    skipDates: b.skip_dates || [], holidays,
  });
  const totalHours = v.deriveTotalHours({ sessionCount, sessionDurationMinutes: durationMinutes });
  const seatsLeft = v.deriveSeatsLeft(b.seats, b.booked_count);
  return {
    ageBand,
    timeOfDay: b.time_of_day || null,
    days,
    startTime: b.start_time || null,
    endTime: b.end_time || null,
    startDate: b.start_date || null,
    endDate: b.end_date || null,
    durationMinutes,
    sessionCount,
    totalHours,
    // Only present when the partner set real seats → typed scarcity is dead.
    seatsLeft: seatsLeft == null ? undefined : seatsLeft,
    mode: b.mode || null,
  };
}

/**
 * @param raw {
 *   service, provider, trial, monthly_plans, registration_fee,
 *   makeup_policy, batches, review_count, rating, holidays
 * }
 * @returns customer-facing Bloom object (+ `incomplete` when a listing can't render).
 */
export function assembleBloom(raw = {}) {
  const s = raw.service || {};
  const provider = raw.provider || {};

  const trialPrice = raw.trial && raw.trial.offered ? money(raw.trial.price) : null;
  const trial = raw.trial && raw.trial.offered
    ? { isFree: trialPrice === 0, price: trialPrice }
    : null;

  let monthlyPlans = (raw.monthly_plans || []).map(shapeMonthlyPlan).filter(Boolean);
  // No structured pricing on file → fall back to each real batch's own price.
  if (monthlyPlans.length === 0) {
    monthlyPlans = (raw.batches || []).map(legacyPlanFromBatch).filter(Boolean);
  }
  // A batch qualifies with a real recurring pattern (days + start/end time)
  // even when it has no sessionCount — that only exists when both start_date
  // and end_date are set, which most pre-Batch-Architecture listings never
  // had (the batch has run on the same weekly pattern since whenever it was
  // created; there's no real "start date" to report, so none is shown —
  // never invented). sessionCount is still shown whenever it IS derivable.
  const batches = (raw.batches || [])
    .map((b) => shapeBatch(b, raw.holidays || []))
    .filter((b) => b.ageBand && (b.sessionCount || (b.days.length > 0 && b.startTime && b.endTime)));

  const reviewCount = Number(raw.review_count) || 0;
  const rating = reviewCount >= MIN_REVIEWS_TO_SHOW_RATING && Number.isFinite(Number(raw.rating))
    ? Number(raw.rating)
    : null; // never a fake 4.5

  const perSessionValues = monthlyPlans.map((p) => p.perSession).filter((n) => n != null);
  const fromPerSession = perSessionValues.length ? Math.min(...perSessionValues) : null;

  // Locality name only — NEVER a pincode (Customer Spec §01 r7).
  const locality = s.mode === 'online' || s.mode === 'ONLINE'
    ? 'Online'
    : (provider.city || provider.area || s.locality || null);

  // Service-level age label for the listing card / pills — derived from real
  // batch ages only. §01 r6: a span wider than 8 years auto-collapses to
  // "Ages X+", and an open-ended batch (open_above, no max) shows "Ages X+".
  const rawBatches = raw.batches || [];
  const ageMins = rawBatches.map((b) => Number(b.age_min)).filter(Number.isFinite);
  const ageMaxs = rawBatches.map((b) => Number(b.age_max)).filter(Number.isFinite);
  const anyOpenAbove = rawBatches.some(
    (b) => b.open_above != null && (b.age_max == null || b.age_max === ''),
  );
  let ageLabel = null;
  if (ageMins.length) {
    const lo = Math.min(...ageMins);
    if (anyOpenAbove || !ageMaxs.length) {
      ageLabel = `Ages ${lo}+`;
    } else {
      const hi = Math.max(...ageMaxs);
      ageLabel = hi - lo > 8 ? `Ages ${lo}+` : v.formatAgeBand({ ageMin: lo, ageMax: hi });
    }
  }

  const shaped = {
    id: s.id,
    title: s.name || null,
    byLine: provider.business_name ? `by ${provider.business_name}` : null,
    locality,
    latitude: provider.latitude ?? null,
    longitude: provider.longitude ?? null,
    ageLabel,
    experienceYears: Number.isFinite(Number(provider.experience_years)) && Number(provider.experience_years) > 0
      ? Number(provider.experience_years) : null,
    primaryImage: s.primary_image_url || null,
    gallery: Array.isArray(s.gallery_images) ? s.gallery_images : [],
    subcategory: s.subcategory_label || s.subcategory || null,
    languages: typeof s.languages === 'string' ? s.languages.split(',').map((x) => x.trim()).filter(Boolean) : (s.languages || []),
    trial,
    monthlyPlans,
    fromPerSession,
    registrationFee: money(raw.registration_fee),
    makeupSentence: MAKEUP_SENTENCE[raw.makeup_policy] || null,
    batches,
    cancellationSentence: CANCELLATION_SENTENCE[provider.cancellation_policy] || null,
    badge: 'Kuddl Curated',
    isNew: v.isNewListing(s.created_at, raw.now),
    rating,
    reviewCount,
  };

  // A Bloom listing needs a name, at least one monthly plan and one batch to
  // render truthfully. Otherwise flag it — never show blanks/guesses.
  shaped.incomplete = !(shaped.title && monthlyPlans.length > 0 && batches.length > 0);
  return shaped;
}

export default { assembleBloom };
