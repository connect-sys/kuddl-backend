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

// Makeup policy removed entirely — Build Spec v3 · C2.

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

/**
 * Assemble one batch (Build Spec v3 · B1) — the batch CARRIES ITS OWN PRICE.
 * Each card shows: age · schedule · price/month · sessions · per-session (auto)
 * · seats. `fallback` supplies a service-level (sessions, price) pair for older
 * batches whose per-batch columns are null. Per-session is derived, never typed.
 */
function shapeBatch(b, holidays = [], fallback = {}) {
  let ageBand = v.formatAgeBand({ ageMin: b.age_min, ageMax: b.age_max, openAbove: b.open_above });
  // A band wider than 8 years is unrenderable (C5) → collapse to "Ages X+".
  const aLo = Number(b.age_min);
  const aHi = Number(b.age_max);
  if (Number.isFinite(aLo) && Number.isFinite(aHi) && aHi - aLo > 8) ageBand = `Ages ${aLo}+`;
  const durationMinutes = v.deriveSessionDurationMinutes(b.start_time, b.end_time);
  const days = Array.isArray(b.days) ? b.days : (typeof b.days === 'string' && b.days ? JSON.parse(b.days) : []);
  const sessionCount = v.deriveSessionCount({
    startDate: b.start_date, endDate: b.end_date, days,
    skipDates: b.skip_dates || [], holidays,
  });
  const totalHours = v.deriveTotalHours({ sessionCount, sessionDurationMinutes: durationMinutes });
  const scheduleType = b.schedule_type === 'teacher_scheduled' ? 'teacher_scheduled' : 'fixed';
  const classType = b.class_type === 'solo' ? 'solo' : 'group';

  // Per-batch price + frequency. v3 batches store price_per_month directly.
  // Legacy batches may store a per_session price → convert to a monthly figure
  // so the card still shows a real "/month". Fall back to the service-level
  // plan, then to days-derived frequency.
  const rawPrice = money(b.price);
  let sessionsPerMonth = Number(b.sessions_per_month);
  if (!Number.isFinite(sessionsPerMonth) || sessionsPerMonth <= 0) {
    sessionsPerMonth = Number(fallback.sessionsPerMonth) || v.deriveSessionsPerMonth(days) || null;
  }
  let pricePerMonth = null;
  let perSession = null;
  if (rawPrice != null && rawPrice > 0 && b.price_type === 'per_session') {
    perSession = Math.round(rawPrice);
    pricePerMonth = sessionsPerMonth ? Math.round(rawPrice * sessionsPerMonth) : null;
  } else {
    pricePerMonth = rawPrice != null && rawPrice > 0 ? rawPrice : (fallback.pricePerMonth ?? null);
    perSession = pricePerMonth != null && sessionsPerMonth
      ? v.derivePerSessionPrice({ pricePerMonth, sessionsPerMonth })
      : null;
  }
  // Solo shows one seat; otherwise seats-left comes from real bookings.
  const seatsLeft = classType === 'solo' ? null : v.deriveSeatsLeft(b.seats, b.booked_count);

  return {
    ageBand,
    classType,
    scheduleType,
    timeOfDay: b.time_of_day || null,
    days,
    startTime: b.start_time || null,
    endTime: b.end_time || null,
    startDate: b.start_date || null,
    endDate: b.end_date || null,
    durationMinutes,
    sessionCount,
    totalHours,
    // The batch's own price — the single source of truth for its card (B1).
    pricePerMonth,
    sessionsPerMonth: sessionsPerMonth || null,
    perSession,
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
    ? {
        isFree: trialPrice === 0,
        price: trialPrice,
        // v3 · A4/B3: description renders word-for-word in the trial lane;
        // slotRule drives which batch slots a parent can pick for the trial.
        description: raw.trial.description || null,
        slotRule: raw.trial.slot_rule || 'any_open_slot',
        days: Array.isArray(raw.trial.days) ? raw.trial.days : [],
      }
    : null;

  // Legacy service-level plan — kept ONLY as the per-batch fallback for older
  // rows whose batch price/sessions columns are null (Build Spec v3 · C1 moves
  // the customer render to per-batch price; there are no floating price cards).
  let monthlyPlans = (raw.monthly_plans || []).map(shapeMonthlyPlan).filter(Boolean);
  if (monthlyPlans.length === 0) {
    monthlyPlans = (raw.batches || []).map(legacyPlanFromBatch).filter(Boolean);
  }
  const fallback = monthlyPlans[0]
    ? { pricePerMonth: monthlyPlans[0].pricePerMonth, sessionsPerMonth: monthlyPlans[0].sessionsPerMonth }
    : {};

  // A batch card renders when it has an age band, its own price, and either a
  // real schedule (days + start/end time), a derivable sessionCount, OR is a
  // teacher-scheduled solo batch (no fixed days/time — "Timing agreed after
  // booking"). Each card carries its own price — no separate price list (B1).
  const batches = (raw.batches || [])
    .map((b) => shapeBatch(b, raw.holidays || [], fallback))
    .filter((b) =>
      b.ageBand &&
      b.pricePerMonth != null &&
      (b.scheduleType === 'teacher_scheduled' ||
        b.sessionCount ||
        (b.days.length > 0 && b.startTime && b.endTime)));

  const reviewCount = Number(raw.review_count) || 0;
  const rating = reviewCount >= MIN_REVIEWS_TO_SHOW_RATING && Number.isFinite(Number(raw.rating))
    ? Number(raw.rating)
    : null; // never a fake 4.5

  // "From ₹X/session" = the lowest per-session among LIVE batches (B6).
  const perSessionValues = batches.map((b) => b.perSession).filter((n) => n != null);
  const fromPerSession = perSessionValues.length ? Math.min(...perSessionValues) : null;

  // Area-level address for offline ("Sector 50, Noida"), the word "Online" for
  // online — NEVER a pincode, never a map pin at card level (Build Spec v3 · C11
  // / Customer Spec §01 r7). All live batches online → the service is online.
  const rawBatchesForMode = raw.batches || [];
  const allOnline = rawBatchesForMode.length > 0 && rawBatchesForMode.every((b) => String(b.mode).toLowerCase() === 'online');
  const isOnline = s.mode === 'online' || s.mode === 'ONLINE' || allOnline;
  const locality = isOnline
    ? 'Online'
    : ([provider.area, provider.city].filter(Boolean).join(', ') || provider.city || provider.area || s.locality || null);

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

  // v3 · C1 — the About section = the three description boxes (what/who/why),
  // stored combined in `description`, double-newline separated. Empty boxes
  // print nothing (never a blank heading).
  const about = String(s.description || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const shaped = {
    id: s.id,
    title: s.name || null,
    about,
    // v3 · C16 — prerequisites/inclusions shown before payment.
    whatToBring: raw.what_to_bring || null,
    included: raw.whats_included || null,
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
    subcategoryId: s.subcategory_id || null,
    languages: typeof s.languages === 'string' ? s.languages.split(',').map((x) => x.trim()).filter(Boolean) : (s.languages || []),
    trial,
    monthlyPlans,
    fromPerSession,
    registrationFee: money(raw.registration_fee),
    // Makeup removed (C2). Kuddl Curated badge removed (C12) — vetting is a
    // discreet line the customer page renders below About, not a badge.
    batches,
    cancellationSentence: CANCELLATION_SENTENCE[provider.cancellation_policy] || null,
    isNew: v.isNewListing(s.created_at, raw.now),
    rating,
    reviewCount,
  };

  // A Bloom listing renders when it has a name and at least one priced batch
  // (each batch carries its own price now). Otherwise flag it — never blanks.
  shaped.incomplete = !(shaped.title && batches.length > 0);
  return shaped;
}

export default { assembleBloom };
