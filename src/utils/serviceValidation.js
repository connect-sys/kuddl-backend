// =====================================================================
// Kuddl Kin — Service validation & derived-field calculators
// One source for the hard rules shared by create/update controllers and
// (mirrored) by the partner forms. Encodes the PRD constants:
//   • service name ≤ 60 chars                         (Partner Mockups §B)
//   • age-band width ≤ 8 years                        (Partner Mockups §B/D)
//   • banned words rejected on save                   (Partner Mockups §B/G)
//   • derived fields computed on write, NEVER typed   (Customer Spec §00,
//     "never show a made-up number"; Partner Mockups impl-note 2)
//
// Every function is pure so it can be unit-tested without the worker/DB.
// =====================================================================

export const MAX_SERVICE_NAME = 60;
export const MIN_SERVICE_NAME = 3;
export const MAX_AGE_BAND_WIDTH = 8; // years — "hard validation" (Screen D)
export const MAX_ADVENTURE_VARIANTS = 3; // PRD recommendation (3/3 caps)
export const MAX_MONTHLY_PLANS = 3;

/**
 * Words/patterns rejected on save across all free-text description fields,
 * Care text fields and the admin shadow-listing entry (Partner Mockups §B):
 * "cure · treats · guaranteed · 100% · reverses · best in Noida · any phone
 * number · any link".
 */
export const BANNED_WORDS = [
  'cure',
  'cures',
  'treats',
  'treat ',
  'guaranteed',
  'guarantee',
  'reverses',
  'reverse ',
  'best in noida',
  'best in delhi',
  'number one',
  '#1',
];

const PHONE_RE = /(?:\+?\d[\s-]?){7,}/; // 7+ digits w/ optional separators = a phone number
const URL_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|in|co|org|net|io)\b)/i;
const PERCENT_100_RE = /\b100\s?%/;
// Superlative + location, e.g. "Best music class in Noida", "No.1 … in Delhi".
// Catches the C7 example that a bare "best in noida" substring would miss.
const SUPERLATIVE_LOCATION_RE =
  /\b(best|no\.?\s*1|#\s*1|number\s*one|top[-\s]?rated|world[-\s]?class|leading|finest|greatest)\b[^.]*\bin\s+[a-z]/i;

/** Returns an array of banned tokens found in `text` (empty = clean). */
export function findBannedWords(text) {
  const t = String(text || '').toLowerCase();
  const hits = [];
  for (const w of BANNED_WORDS) {
    if (t.includes(w)) hits.push(w.trim());
  }
  if (PERCENT_100_RE.test(t)) hits.push('100%');
  if (SUPERLATIVE_LOCATION_RE.test(t)) hits.push('superlative location claim');
  if (PHONE_RE.test(t)) hits.push('phone number');
  if (URL_RE.test(t)) hits.push('link');
  return [...new Set(hits)];
}

export function hasBannedWords(text) {
  return findBannedWords(text).length > 0;
}

/** Service name: 3–60 chars, no banned words. */
export function validateServiceName(name) {
  const n = String(name || '').trim();
  if (n.length < MIN_SERVICE_NAME) return { valid: false, error: 'Service name is too short.' };
  if (n.length > MAX_SERVICE_NAME) return { valid: false, error: `Service name must be ${MAX_SERVICE_NAME} characters or fewer.` };
  const banned = findBannedWords(n);
  if (banned.length) return { valid: false, error: `Service name contains not-allowed words: ${banned.join(', ')}.` };
  return { valid: true };
}

/**
 * Age band: min < max, both non-negative integers, width ≤ 8 years.
 * Error copy from Screen D: "Split wide ranges into separate batches —
 * parents don't book a class that mixes a 5-year-old with a 17-year-old."
 */
export function validateAgeBand(ageMin, ageMax) {
  const min = Number(ageMin);
  const max = Number(ageMax);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { valid: false, error: 'Age band must be two numbers.' };
  if (min < 0 || max < 0) return { valid: false, error: 'Age band cannot be negative.' };
  if (min >= max) return { valid: false, error: 'Minimum age must be below maximum age.' };
  if (max - min > MAX_AGE_BAND_WIDTH) {
    return { valid: false, error: `Split wide ranges into separate batches — an age band can span at most ${MAX_AGE_BAND_WIDTH} years.` };
  }
  return { valid: true };
}

/**
 * Format an age band for display. "Open to all above age X" (age policy B)
 * renders as "Ages X+"; a real band renders "Ages 6–9". Never a giant range.
 */
export function formatAgeBand({ ageMin, ageMax, openAbove } = {}) {
  if (openAbove != null && (ageMax == null || ageMax === '')) return `Ages ${Number(openAbove)}+`;
  const min = Number(ageMin);
  const max = Number(ageMax);
  if (!Number.isFinite(min)) return null;
  // An absent / zero / below-min upper bound means "open-ended" (e.g. a partner
  // enters min 5 and leaves max blank → stored as 0). Render "Ages 5+", never
  // the broken "Ages 5–0".
  if (!Number.isFinite(max) || max <= 0 || max < min) return `Ages ${min}+`;
  return `Ages ${min}–${max}`;
}

/**
 * "New to Kuddl" — a listing gets the badge for its first 21 days (Customer
 * Spec §01 r10). Pure: pass `now` for deterministic tests.
 */
export function isNewListing(createdAt, now = Date.now(), days = 21) {
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return false;
  const ageDays = (Number(now) - t) / 86400000;
  return ageDays >= 0 && ageDays <= days;
}

/**
 * Monthly plan derived per-session price. "This pair of numbers is what
 * makes prices comparable on the customer site (₹3,200/month · 8 sessions ·
 * ≈ ₹400/session)." (Screen C.) Calculated, never typed.
 */
export function derivePerSessionPrice({ pricePerMonth, sessionsPerMonth } = {}) {
  const price = Number(pricePerMonth);
  const sessions = Number(sessionsPerMonth);
  if (!Number.isFinite(price) || !Number.isFinite(sessions) || sessions <= 0) return null;
  return Math.round(price / sessions);
}

/**
 * Session duration in minutes from a batch's start/end time ("HH:MM").
 * "Session duration ('1 hr each') is calculated from these — never typed."
 */
export function deriveSessionDurationMinutes(startTime, endTime) {
  const toMin = (t) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim());
    if (!m) return null;
    const h = Number(m[1]);
    const mm = Number(m[2]);
    if (h > 23 || mm > 59) return null;
    return h * 60 + mm;
  };
  const s = toMin(startTime);
  const e = toMin(endTime);
  if (s == null || e == null || e <= s) return null;
  return e - s;
}

/**
 * Number of real session dates between start/end for the given weekdays,
 * excluding skip dates and (optionally) holidays. Days = array of 0–6
 * (0 = Sunday). "8 sessions · 1 hr each · 6 Aug – 3 Sep" is derived, not typed.
 */
export function deriveSessionCount({ startDate, endDate, days = [], skipDates = [], holidays = [] } = {}) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start) || isNaN(end) || end < start) return null;
  const daySet = new Set((days || []).map(Number));
  if (daySet.size === 0) return null;
  const skip = new Set([...(skipDates || []), ...(holidays || [])].map((d) => new Date(d).toISOString().slice(0, 10)));
  let count = 0;
  const cur = new Date(start);
  // Guard against runaway loops (max ~2 years of daily iteration).
  for (let i = 0; i < 800 && cur <= end; i++) {
    const iso = cur.toISOString().slice(0, 10);
    if (daySet.has(cur.getUTCDay()) && !skip.has(iso)) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

/**
 * Approximate sessions/month from a weekly recurrence pattern (avg 4.345
 * weeks/month, i.e. 30/7 days). Used to translate a legacy batch's own
 * per-month or per-session price (real values the partner set) into the
 * other unit — never an invented number, just a unit conversion of what the
 * partner already charges for their own real weekly schedule.
 */
export function deriveSessionsPerMonth(days = []) {
  const n = new Set((days || []).map(Number)).size;
  if (!n) return null;
  return Math.round((n * 30) / 7);
}

/** Total hours across a batch = sessions × duration. Derived, never typed. */
export function deriveTotalHours({ sessionCount, sessionDurationMinutes } = {}) {
  const s = Number(sessionCount);
  const d = Number(sessionDurationMinutes);
  if (!Number.isFinite(s) || !Number.isFinite(d) || s <= 0 || d <= 0) return null;
  return Math.round((s * d) / 60 * 10) / 10; // 1 decimal
}

/**
 * Seats-left is derived from real bookings, never typed (Screen D:
 * "Optional. If given, '4 seats left' is calculated from real bookings. If
 * blank, parents see no seat count at all. Typed scarcity is dead.")
 * Returns null when seats is not set → the customer UI shows no seat count.
 */
export function deriveSeatsLeft(seats, bookedCount = 0) {
  if (seats == null || seats === '') return null;
  const total = Number(seats);
  const booked = Number(bookedCount) || 0;
  if (!Number.isFinite(total)) return null;
  return Math.max(0, total - booked);
}

/**
 * Trial price: ₹0 allowed (renders "Free trial"); negative invalid.
 * (Screen C: "₹0 allowed → renders as 'Free trial'.")
 */
export function validateTrialPrice(price) {
  const p = Number(price);
  if (!Number.isFinite(p) || p < 0) return { valid: false, error: 'Trial price must be 0 or more.' };
  return { valid: true, isFree: p === 0 };
}

/**
 * Adventure variants: 1–3 rows, each {label, price} with a positive flat
 * price. "Parents pick one variant. This replaces any per-batch or per-month
 * structure for performers." (Screen E.)
 */
export function validateVariants(variants) {
  if (!Array.isArray(variants) || variants.length < 1) {
    return { valid: false, error: 'Add at least one duration/variant with a price.' };
  }
  if (variants.length > MAX_ADVENTURE_VARIANTS) {
    return { valid: false, error: `A show can have at most ${MAX_ADVENTURE_VARIANTS} variants.` };
  }
  for (const v of variants) {
    const price = Number(v && v.price);
    if (!Number.isFinite(price) || price <= 0) return { valid: false, error: 'Every variant needs a flat price above 0.' };
    if (!String(v && v.label || '').trim()) return { valid: false, error: 'Every variant needs a label (e.g. "30 min").' };
  }
  return { valid: true };
}

/**
 * Server-side publishing gate for a Bloom service (Build Spec v3 · A6):
 * trial answered + ≥1 complete PRICED batch. The service-level Monthly Plan
 * and Makeup policy are gone — price lives on each batch (C2).
 * Returns { canPublish, missing[] }.
 */
export function bloomPublishGate(service = {}) {
  const missing = [];
  if (service.trial_offered == null) missing.push('trial question');
  const batches = service.batches || [];
  // A complete batch has an age, its own price, a start date, and either a
  // fixed schedule (days + times) or is teacher-scheduled (solo).
  const hasBatch = batches.some((b) =>
    b.age_min != null &&
    Number(b.price_per_month) > 0 &&
    b.start_date &&
    (b.schedule_type === 'teacher_scheduled' || (b.days && b.start_time && b.end_time)));
  if (!hasBatch) missing.push('at least one complete priced batch');
  return { canPublish: missing.length === 0, missing };
}

export default {
  MAX_SERVICE_NAME,
  MIN_SERVICE_NAME,
  MAX_AGE_BAND_WIDTH,
  MAX_ADVENTURE_VARIANTS,
  MAX_MONTHLY_PLANS,
  BANNED_WORDS,
  findBannedWords,
  hasBannedWords,
  validateServiceName,
  validateAgeBand,
  formatAgeBand,
  isNewListing,
  derivePerSessionPrice,
  deriveSessionDurationMinutes,
  deriveSessionCount,
  deriveSessionsPerMonth,
  deriveTotalHours,
  deriveSeatsLeft,
  validateTrialPrice,
  validateVariants,
  bloomPublishGate,
};
