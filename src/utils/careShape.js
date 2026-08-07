// =====================================================================
// Care customer-facing shape assembler (Customer Spec · §07 "Care differences")
// A Care listing is a SPECIALIST (therapist/counsellor/coach). It uses the
// same detail/card scaffolding as Bloom/Adventure but with 5 rule changes:
//   1. Booking is hold→confirm (Swiggy-style): pay → held → specialist
//      confirms in 12–24h → else automatic full refund.          (§07.1)
//   2. Title = the PERSON + a verified title. A protected clinical title
//      (e.g. "Clinical Psychologist") renders ONLY when a verified
//      registration number is on file — otherwise "Counsellor". The title
//      comes from a fixed dropdown, never free-typed.             (§07.2)
//   3. Intake asks child age + service + ONE free-text "What are you hoping
//      to work on?" (booking-side; never a diagnosis).            (§07.3)
//   4. NO urgency: no seat counts, no countdowns.                 (§07.4)
//   5. Ordering = verification depth + credential strength (list API).(§07.5)
// Missing structured data → `incomplete: true` (flag, don't render blanks).
//
// Pure + dependency-light (only serviceValidation) → unit-testable.
// =====================================================================

import v from './serviceValidation.js';

// Titles that require a verified council/registration number to display. If
// the partner claims one of these but no verified registration is on file, we
// fall back to the safe, unprotected "Counsellor".
const PROTECTED_TITLES = new Set([
  'Clinical Psychologist',
  'Psychologist',
  'Psychiatrist',
  'Occupational Therapist',
  'Speech Therapist',
  'Speech-Language Pathologist',
  'Physiotherapist',
]);

const FALLBACK_TITLE = 'Counsellor';

function money(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolve the title a parent may see (§07.2). Protected clinical titles need a
 * verified registration number; otherwise everyone shows as "Counsellor".
 */
export function resolveVerifiedTitle(claimedTitle, credentialVerified, registrationNumber) {
  const claimed = String(claimedTitle || '').trim();
  if (!claimed) return FALLBACK_TITLE;
  if (PROTECTED_TITLES.has(claimed)) {
    const ok = credentialVerified === true && String(registrationNumber || '').trim().length > 0;
    return ok ? claimed : FALLBACK_TITLE;
  }
  return claimed; // unprotected titles (Counsellor, Special Educator, Coach…) render as-is
}

/**
 * @param raw {
 *   service, provider, session_price, session_duration_minutes, packages[],
 *   claimed_title, credential_verified, registration_number,
 *   age_min, age_max, mode, confirm_window_hours, review_count, rating
 * }
 * @returns customer-facing Care object (+ `incomplete` when unrenderable).
 */
export function assembleCare(raw = {}) {
  const s = raw.service || {};
  const provider = raw.provider || {};

  const verifiedTitle = resolveVerifiedTitle(raw.claimed_title, raw.credential_verified, raw.registration_number);
  const credentialVerified = verifiedTitle !== FALLBACK_TITLE && raw.credential_verified === true;

  const sessionPrice = money(raw.session_price);
  const sessionDurationMinutes = Number.isFinite(Number(raw.session_duration_minutes)) && Number(raw.session_duration_minutes) > 0
    ? Number(raw.session_duration_minutes) : null;

  const packages = (raw.packages || [])
    .map((p) => {
      const price = money(p && p.price);
      const sessions = Number(p && p.sessions);
      const label = String((p && p.label) || '').trim();
      if (price == null || price <= 0 || !Number.isFinite(sessions) || sessions <= 0) return null;
      // Per-session maths, so packages are comparable (like Bloom monthly plans).
      return { label: label || `${sessions} sessions`, sessions, price, perSession: Math.round(price / sessions) };
    })
    .filter(Boolean);

  const reviewCount = Number(raw.review_count) || 0;
  const rating = reviewCount >= 3 && Number.isFinite(Number(raw.rating)) ? Number(raw.rating) : null; // no fake stars

  // Ages the specialist works with — derived band, §01 r6 (>8yr → "Ages X+").
  const ageMin = Number(raw.age_min);
  const ageMax = Number(raw.age_max);
  let ageLabel = null;
  if (Number.isFinite(ageMin)) {
    if (!Number.isFinite(ageMax)) ageLabel = `Ages ${ageMin}+`;
    else ageLabel = ageMax - ageMin > 8 ? `Ages ${ageMin}+` : v.formatAgeBand({ ageMin, ageMax });
  }

  const online = s.mode === 'online' || s.mode === 'ONLINE' || raw.mode === 'online';
  const locality = online ? 'Online' : (provider.city || provider.area || s.locality || null);

  const confirmWindow = Number(raw.confirm_window_hours) > 0 ? Number(raw.confirm_window_hours) : 24;

  const shaped = {
    id: s.id,
    // §07.2 — the title IS the person; the verified title is the by-line.
    practitionerName: provider.business_name || s.name || null,
    verifiedTitle,
    credentialVerified,
    serviceTitle: s.name || null,
    // Card flag (§03 slot 7 for Care) = the qualification line.
    qualificationLine: verifiedTitle,
    locality,
    ageLabel,
    languages: typeof s.languages === 'string' ? s.languages.split(',').map((x) => x.trim()).filter(Boolean) : (s.languages || []),
    experienceYears: Number.isFinite(Number(provider.experience_years)) && Number(provider.experience_years) > 0
      ? Number(provider.experience_years) : null,
    primaryImage: s.primary_image_url || null,
    gallery: Array.isArray(s.gallery_images) ? s.gallery_images : [],
    subcategory: s.subcategory_label || s.subcategory || null,
    sessionPrice,
    sessionDurationMinutes,
    packages,
    // §07.1 — booking is a request that the specialist confirms.
    bookingModel: 'request',
    confirmWindowHours: confirmWindow,
    confirmSentence: `The specialist confirms your booking within ${confirmWindow >= 24 ? '12–24 hours' : `${confirmWindow} hours`}. If they can't, you're refunded in full.`,
    // §07.3 — the single intake question (never a diagnosis).
    intakePrompt: 'What are you hoping to work on?',
    cancellationSentence: null, // Care refunds are governed by the hold→confirm flow, not a fixed policy sentence.
    badge: 'Kuddl Curated',
    isNew: v.isNewListing(s.created_at, raw.now),
    rating,
    reviewCount,
    // §07.4 — NO seat counts, NO countdowns. (Intentionally no scarcity field.)
  };

  // A Care listing needs a practitioner name and a session price to render.
  shaped.incomplete = !(shaped.practitionerName && sessionPrice != null);
  return shaped;
}

export default { assembleCare, resolveVerifiedTitle };
