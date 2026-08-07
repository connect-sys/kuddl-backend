// =====================================================================
// Settlement engine (PRD Core Volume §04 "payment in, settlement out" + §07)
// Pure schedule + line-item math. One payment object, line-item based; one
// settlement engine, schedule-based. Config per category (NOT hardcoded into
// the flow), so a subcategory can be flipped later without a code change.
//
//   Bloom      100% at T+3 from payment
//   Adventure   50% at T+3 from booking · 50% at T+3 after the event date
//   Care       100% at T+1 after provider confirmation
//   Discover   100% at T+3 from payment
//
// Registration fee is 100% pass-through, NO commission, refundable only before
// session 1. Third-party add-ons settle to their own vendor. Commission is 0%
// during the pilot (until 500 bookings / 90 days).
//
// Dependency-free → fully unit-testable. No DB, no dates-from-now magic: every
// base date is passed in.
// =====================================================================

// Each tranche: { pct, from: 'payment'|'booking'|'event'|'confirmation', offsetDays }.
export const SETTLEMENT_MATRIX = {
  bloom: [{ pct: 100, from: 'payment', offsetDays: 3 }],
  adventure: [
    { pct: 50, from: 'booking', offsetDays: 3 },
    { pct: 50, from: 'event', offsetDays: 3 },
  ],
  care: [{ pct: 100, from: 'confirmation', offsetDays: 1 }],
  discover: [{ pct: 100, from: 'payment', offsetDays: 3 }],
};

// Pilot: 0% commission platform-wide (Core Volume §07). A post-pilot rate card
// exists internally; expose the knob so it flips without touching the flow.
export const PILOT_COMMISSION_RATE = 0;

export function computeCommission(amount, rate = PILOT_COMMISSION_RATE) {
  const a = Number(amount) || 0;
  const r = Number(rate) || 0;
  return Math.round(a * r);
}

function addDays(iso, days) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Build the booking's line items. Every line carries {vendor, amount, type},
 * plus commissionable/passThrough flags the settlement uses.
 * @param p { serviceName, serviceAmount, registrationFee, addOns:[{label,amount,vendor}] , providerVendor }
 */
export function buildLineItems(p = {}) {
  const providerVendor = p.providerVendor || 'provider';
  const lines = [];

  const serviceAmount = Number(p.serviceAmount) || 0;
  lines.push({ type: 'service', label: p.serviceName || 'Service', vendor: providerVendor, amount: serviceAmount, commissionable: true });

  const reg = Number(p.registrationFee) || 0;
  if (reg > 0) {
    // 100% pass-through, no commission, refundable only before session 1.
    lines.push({ type: 'registration_fee', label: 'One-time registration fee', vendor: providerVendor, amount: reg, commissionable: false, passThrough: true, refundableBeforeSession1Only: true });
  }

  for (const a of p.addOns || []) {
    const amt = Number(a && a.amount) || 0;
    if (amt <= 0) continue;
    // Third-party add-ons settle to their own vendor on their own schedule.
    lines.push({ type: 'addon', label: a.label || 'Add-on', vendor: a.vendor || providerVendor, amount: amt, commissionable: a.vendor && a.vendor !== providerVendor ? true : true });
  }

  return lines;
}

/** Sum of all line-item amounts — the payment total. */
export function lineItemsTotal(lines = []) {
  return (lines || []).reduce((s, l) => s + (Number(l.amount) || 0), 0);
}

/**
 * Compute the settlement schedule for a booking.
 * @param category 'bloom'|'adventure'|'care'|'discover'
 * @param total    amount to settle (usually lineItemsTotal)
 * @param dates    { payment, booking, event, confirmation } as ISO strings
 * @param opts     { matrix?, commissionRate? }
 * @returns [{ pct, amount, netToProvider, commission, from, releaseDate }]
 */
export function computeSettlementSchedule(category, total, dates = {}, opts = {}) {
  const matrix = (opts.matrix || SETTLEMENT_MATRIX)[String(category || '').toLowerCase()];
  if (!matrix) return [];
  const amountTotal = Number(total) || 0;
  const rate = opts.commissionRate ?? PILOT_COMMISSION_RATE;

  // Distribute rupees so the tranches sum EXACTLY to the total (last one absorbs
  // the rounding remainder — no lost/created paise).
  let allocated = 0;
  return matrix.map((tranche, i) => {
    const isLast = i === matrix.length - 1;
    const amount = isLast ? amountTotal - allocated : Math.round((amountTotal * tranche.pct) / 100);
    allocated += amount;
    const baseDate = dates[tranche.from] || null;
    const releaseDate = baseDate ? addDays(baseDate, tranche.offsetDays) : null;
    const commission = computeCommission(amount, rate);
    return {
      pct: tranche.pct,
      amount,
      commission,
      netToProvider: amount - commission,
      from: tranche.from,
      offsetDays: tranche.offsetDays,
      releaseDate,
    };
  });
}

/**
 * The scheduled tranches that are DUE for release as of `asOf` (YYYY-MM-DD):
 * status 'scheduled' and release_date on or before asOf. Pure → testable.
 */
export function dueTranches(rows = [], asOf) {
  const cutoff = String(asOf || new Date().toISOString().slice(0, 10));
  return (rows || []).filter(
    (r) => String(r.status) === 'scheduled' && r.release_date && String(r.release_date) <= cutoff,
  );
}

export default { SETTLEMENT_MATRIX, PILOT_COMMISSION_RATE, computeCommission, buildLineItems, lineItemsTotal, computeSettlementSchedule, dueTranches };
