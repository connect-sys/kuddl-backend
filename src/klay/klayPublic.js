// =====================================================================
// KLAY module — public (parent-facing) API.
// National -> City -> Centre -> Programme pages, seat holds, Razorpay,
// waitlist, funnel events, certificates, self-serve centre registration.
// Everything is read from the klay_* tables, so pages fill in on their own
// as cities, centres and clubs are added.
// =====================================================================
import {
  ok, fail, body, nowIso, newId, shortCode, slugify, parseJson, all, first, run,
  expireHolds, seatMap, daysLabel, timeRange, ageLabel, normDays, HOLD_MINUTES,
  razorpayOrder, razorpaySignatureOk, razorpayRefund, hashPassword, audit,
} from './klayCore.js';
import { sendEmail } from '../utils/email.js';

// ------------------------------------------------------------ shapers
function shapeClub(c) {
  return {
    id: c.id, slug: c.slug, name: c.name,
    category_label: c.category_label, category_group: c.category_group,
    tagline: c.tagline, color: c.color, icon: c.icon,
    levels: parseJson(c.levels, []), levels_note: c.levels_note,
  };
}
function shapeBatch(b, seats) {
  const s = seats[b.id] || { capacity: b.capacity, left: 0, booked: 0, held: 0 };
  return {
    id: b.id,
    days: normDays(b.days),
    days_label: daysLabel(b.days),
    start_time: b.start_time, end_time: b.end_time,
    time_label: timeRange(b.start_time, b.end_time),
    age_min: b.age_min, age_max: b.age_max,
    age_label: ageLabel(b.age_min, b.age_max),
    capacity: s.capacity, seats_left: s.left, full: s.left <= 0,
  };
}

/** Live programmes (+club, batches, seats) for the given live centre ids. */
async function programmesFor(env, centreIds) {
  if (!centreIds.length) return [];
  const ph = centreIds.map(() => '?').join(',');
  const progs = await all(env, `
    SELECT p.*, cl.slug AS club_slug, cl.name AS club_name, cl.category_label, cl.category_group,
           cl.tagline, cl.color, cl.icon, cl.levels, cl.levels_note, cl.sort_order AS club_sort
    FROM klay_programmes p JOIN klay_clubs cl ON cl.id = p.club_id
    WHERE p.centre_id IN (${ph}) AND p.status = 'live'
    ORDER BY cl.sort_order, p.name`, ...centreIds);
  if (!progs.length) return [];
  const pph = progs.map(() => '?').join(',');
  const batches = await all(env, `SELECT * FROM klay_batches WHERE programme_id IN (${pph}) AND status = 'live' ORDER BY start_time`, ...progs.map((p) => p.id));
  const seats = await seatMap(env, batches.map((b) => b.id));
  return progs.map((p) => {
    const bs = batches.filter((b) => b.programme_id === p.id).map((b) => shapeBatch(b, seats));
    return {
      id: p.id, centre_id: p.centre_id, slug: p.slug, name: p.name, description: p.description,
      age_min: p.age_min, age_max: p.age_max, age_label: ageLabel(p.age_min, p.age_max),
      club: shapeClub({ id: p.club_id, slug: p.club_slug, name: p.club_name, category_label: p.category_label,
        category_group: p.category_group, tagline: p.tagline, color: p.color, icon: p.icon, levels: p.levels, levels_note: p.levels_note }),
      batches: bs,
      seats_left: bs.reduce((n, b) => n + b.seats_left, 0),
      schedule_label: bs[0] ? `${bs[0].days_label} · ${bs[0].time_label}` : '',
    };
  });
}

function ageSpan(progs) {
  const mins = progs.map((p) => p.age_min).filter((n) => n != null);
  const maxs = progs.map((p) => p.age_max).filter((n) => n != null);
  if (!mins.length) return '';
  return maxs.length ? `Ages ${Math.min(...mins)}–${Math.max(...maxs)}` : `Ages ${Math.min(...mins)}+`;
}
function shapeCentre(c, progs, citySlug) {
  const mine = progs.filter((p) => p.centre_id === c.id);
  return {
    id: c.id, slug: c.slug, name: c.name, area: c.area, address: c.address, pincode: c.pincode,
    lat: c.lat, lng: c.lng, rating: c.rating, hours_note: c.hours_note,
    city_slug: citySlug,
    clubs_count: mine.length,
    clubs: mine.map((p) => ({ slug: p.slug, name: p.name, color: p.club.color, icon: p.club.icon, club_slug: p.club.slug })),
    age_label: ageSpan(mine),
    seats_left: mine.reduce((n, p) => n + p.seats_left, 0),
  };
}

// ------------------------------------------------------------ pages
// GET /api/klay/home — national page
export async function home(request, env) {
  await expireHolds(env);
  const cities = await all(env, "SELECT * FROM klay_cities WHERE status = 'live' ORDER BY sort_order, name");
  const centres = await all(env, "SELECT * FROM klay_centres WHERE status = 'live'");
  const progs = await programmesFor(env, centres.map((c) => c.id));
  const clubIds = new Set(progs.map((p) => p.club.id));
  const clubs = (await all(env, 'SELECT * FROM klay_clubs ORDER BY sort_order, name')).filter((c) => clubIds.has(c.id)).map((c) => {
    const ps = progs.filter((p) => p.club.id === c.id);
    return { ...shapeClub(c), programmes_count: ps.length, age_label: ageSpan(ps) };
  });
  const cityList = cities.map((ci) => {
    const cs = centres.filter((c) => c.city_id === ci.id);
    const ratings = cs.map((c) => c.rating).filter((r) => r != null);
    return {
      id: ci.id, slug: ci.slug, name: ci.name,
      centres_count: cs.length,
      centre_names: cs.map((c) => c.area || c.name),
      rating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
    };
  }).filter((c) => c.centres_count > 0);
  return ok({
    stats: { clubs: clubs.length, centres: centres.length, cities: cityList.length, age_label: ageSpan(progs) },
    clubs, cities: cityList,
  });
}

// GET /api/klay/cities/:city
export async function cityPage(request, env, citySlug) {
  await expireHolds(env);
  const city = await first(env, "SELECT * FROM klay_cities WHERE slug = ? AND status = 'live'", citySlug);
  if (!city) return fail('City not found', 404);
  const centres = await all(env, "SELECT * FROM klay_centres WHERE city_id = ? AND status = 'live' ORDER BY name", city.id);
  const progs = await programmesFor(env, centres.map((c) => c.id));
  const seen = new Map();
  for (const p of progs) if (!seen.has(p.club.id)) seen.set(p.club.id, p.club);
  return ok({
    city: { id: city.id, slug: city.slug, name: city.name },
    activities: [...seen.values()],
    centres: centres.map((c) => shapeCentre(c, progs, city.slug)),
  });
}

async function liveCentre(env, citySlug, centreSlug) {
  const city = await first(env, "SELECT * FROM klay_cities WHERE slug = ? AND status = 'live'", citySlug);
  if (!city) return {};
  const centre = await first(env, "SELECT * FROM klay_centres WHERE city_id = ? AND slug = ? AND status = 'live'", city.id, centreSlug);
  return { city, centre };
}

// GET /api/klay/cities/:city/:centre
export async function centrePage(request, env, citySlug, centreSlug) {
  await expireHolds(env);
  const { city, centre } = await liveCentre(env, citySlug, centreSlug);
  if (!centre) return fail('Centre not found', 404);
  const progs = await programmesFor(env, [centre.id]);
  return ok({
    city: { id: city.id, slug: city.slug, name: city.name },
    centre: shapeCentre(centre, progs, city.slug),
    programmes: progs,
  });
}

// GET /api/klay/cities/:city/:centre/:programme
export async function programmePage(request, env, citySlug, centreSlug, progSlug) {
  await expireHolds(env);
  const { city, centre } = await liveCentre(env, citySlug, centreSlug);
  if (!centre) return fail('Centre not found', 404);
  const progs = await programmesFor(env, [centre.id]);
  const prog = progs.find((p) => p.slug === progSlug);
  if (!prog) return fail('Club not found', 404);
  const row = await first(env, 'SELECT coach_id, what_to_bring, format_note FROM klay_programmes WHERE id = ?', prog.id);
  // The coach card shows only a verified coach (name & qualifications come from onboarding).
  const coach = row?.coach_id
    ? await first(env, "SELECT id, name, qualifications, quote, rating FROM klay_coaches WHERE id = ? AND status = 'verified'", row.coach_id)
    : null;
  const plans = await all(env, "SELECT id, kind, label, subtitle, sessions, months, price, discount_pct, takes_seat FROM klay_plans WHERE programme_id = ? AND status = 'live' ORDER BY sort_order", prog.id);
  return ok({
    city: { id: city.id, slug: city.slug, name: city.name },
    centre: shapeCentre(centre, progs, city.slug),
    programme: { ...prog, what_to_bring: row?.what_to_bring || '', format_note: row?.format_note || '' },
    coach: coach ? { ...coach, initials: coach.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() } : null,
    plans,
    also_here: progs.filter((p) => p.id !== prog.id).map((p) => ({ slug: p.slug, name: p.name, schedule_label: p.batches[0]?.days_label || '', tagline: p.club.tagline, color: p.club.color })),
  });
}

// ------------------------------------------------------------ funnel events
const EVENTS = new Set(['page_view', 'centre_view', 'booking_start', 'paid']);
export async function trackEvent(request, env) {
  const b = await body(request);
  if (!EVENTS.has(b.event) || b.event === 'paid') return ok(); // 'paid' is written server-side only
  await run(env, 'INSERT INTO klay_events (id, event, session_id, city_id, centre_id, programme_id, created_at) VALUES (?,?,?,?,?,?,?)',
    newId('kev'), b.event, String(b.session_id || '').slice(0, 64) || null, b.city_id || null, b.centre_id || null, b.programme_id || null, nowIso());
  return ok();
}

// ------------------------------------------------------------ bookings
const PHONE_RE = /^[6-9]\d{9}$/;
function cleanPhone(p) { return String(p || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, ''); }

async function confirmBooking(env, bookingId, paymentId) {
  const t = nowIso();
  await run(env, "UPDATE klay_bookings SET status = 'confirmed', razorpay_payment_id = COALESCE(?, razorpay_payment_id), confirmed_at = ?, hold_expires_at = NULL, updated_at = ? WHERE id = ?",
    paymentId || null, t, t, bookingId);
  const k = await first(env, 'SELECT * FROM klay_bookings WHERE id = ?', bookingId);
  await run(env, 'INSERT INTO klay_events (id, event, session_id, city_id, centre_id, programme_id, created_at) VALUES (?,?,?,?,?,?,?)',
    newId('kev'), 'paid', null, k.city_id, k.centre_id, k.programme_id, t);
  await notifyConfirmed(env, k);
  return k;
}

async function notifyConfirmed(env, k) {
  try {
    if (!k.parent_email) return;
    const p = await first(env, `SELECT p.name, c.name AS centre FROM klay_programmes p JOIN klay_centres c ON c.id = p.centre_id WHERE p.id = ?`, k.programme_id);
    const b = await first(env, 'SELECT days, start_time, end_time FROM klay_batches WHERE id = ?', k.batch_id);
    const when = b ? `${daysLabel(b.days)} · ${timeRange(b.start_time, b.end_time)}` : '';
    await sendEmail(env, {
      to: k.parent_email,
      subject: `Booked: ${p?.name || 'KLAY club'} at ${p?.centre || 'KLAY'} (${k.reference})`,
      text: `Hi ${k.parent_name},\n\n${k.child_name} is booked into ${p?.name} at ${p?.centre}.\nBatch: ${when}\nPlan: ${k.plan_kind}\nReference: ${k.reference}\n\nKlub House by KLAY · powered by Kuddl Kin`,
    });
  } catch (e) { console.warn('klay confirm email failed', e?.message); }
}

// POST /api/klay/bookings — hold a seat (10 min) and start payment, or confirm a free demo.
export async function createBooking(request, env) {
  await expireHolds(env);
  const b = await body(request);
  const phone = cleanPhone(b.parent_phone);
  if (!b.batch_id || !b.plan_id) return fail('Pick a batch and a plan');
  if (!String(b.parent_name || '').trim()) return fail("Enter the parent's name");
  if (!PHONE_RE.test(phone)) return fail('Enter a valid 10-digit mobile number');
  if (b.parent_email && !/^\S+@\S+\.\S+$/.test(b.parent_email)) return fail('Enter a valid email');
  if (!String(b.child_name || '').trim()) return fail("Enter the child's name");
  if (!b.consent) return fail('Please give parental consent to continue');

  const batch = await first(env, "SELECT * FROM klay_batches WHERE id = ? AND status = 'live'", b.batch_id);
  if (!batch) return fail('This batch is no longer available', 404);
  const prog = await first(env, `SELECT p.*, c.city_id, c.status AS centre_status FROM klay_programmes p JOIN klay_centres c ON c.id = p.centre_id WHERE p.id = ?`, batch.programme_id);
  if (!prog || prog.status !== 'live' || prog.centre_status !== 'live') return fail('This club is not taking bookings', 404);
  const plan = await first(env, "SELECT * FROM klay_plans WHERE id = ? AND programme_id = ? AND status = 'live'", b.plan_id, prog.id);
  if (!plan) return fail('This plan is no longer available', 404);
  const age = b.child_age === '' || b.child_age == null ? null : Number(b.child_age);
  if (age != null && (!Number.isFinite(age) || age < 0 || age > 18)) return fail("Enter the child's age in years");

  const t = nowIso();
  const id = newId('kbk');
  const reference = `KLAY-${shortCode(6)}`;
  const free = Number(plan.price) <= 0;
  const takesSeat = plan.takes_seat ? 1 : 0;
  const holdUntil = new Date(Date.now() + HOLD_MINUTES * 60000).toISOString();

  // Atomic seat check: the row is inserted only if a seat is still free.
  // Two parents racing for the last seat can't both get it.
  const res = await run(env, `
    INSERT INTO klay_bookings (id, reference, programme_id, batch_id, plan_id, centre_id, city_id, plan_kind, takes_seat,
      parent_name, parent_phone, parent_email, child_name, child_age, customer_id, amount, status, hold_expires_at,
      consent_at, source, created_at, updated_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'online',?,?
    WHERE ? = 0 OR (
      SELECT b.capacity - b.booked_offline - (
        SELECT COUNT(*) FROM klay_bookings k WHERE k.batch_id = b.id AND k.takes_seat = 1
          AND (k.status = 'confirmed' OR (k.status = 'held' AND k.hold_expires_at >= ?))
      ) FROM klay_batches b WHERE b.id = ?
    ) > 0`,
    id, reference, prog.id, batch.id, plan.id, prog.centre_id, prog.city_id, plan.kind, takesSeat,
    String(b.parent_name).trim().slice(0, 80), phone, b.parent_email ? String(b.parent_email).trim().slice(0, 120) : null,
    String(b.child_name).trim().slice(0, 80), age, b.customer_id || null, Number(plan.price) || 0,
    'held', holdUntil, t, t, t,
    takesSeat, t, batch.id);
  if (!res?.meta?.changes) {
    return fail('This batch is full. Join the waitlist and the centre will call you when a seat opens.', 409, { full: true });
  }

  if (free) {
    const k = await confirmBooking(env, id, null);
    return ok({ booking: { id, reference: k.reference, status: 'confirmed', amount: 0 } });
  }
  try {
    const order = await razorpayOrder(env, Number(plan.price), reference);
    await run(env, 'UPDATE klay_bookings SET razorpay_order_id = ?, updated_at = ? WHERE id = ?', order.id, nowIso(), id);
    return ok({
      booking: { id, reference, status: 'held', amount: Number(plan.price), hold_expires_at: holdUntil },
      payment: { key: env.RAZORPAY_KEY_ID, order_id: order.id, amount: order.amount, currency: order.currency, name: 'Klub House by KLAY', description: `${prog.name} · ${plan.label}` },
    });
  } catch (e) {
    await run(env, "UPDATE klay_bookings SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE id = ?", nowIso(), nowIso(), id);
    return fail(e.message || 'Could not start payment', 502);
  }
}

// POST /api/klay/bookings/verify
export async function verifyBooking(request, env) {
  const b = await body(request);
  const k = await first(env, 'SELECT * FROM klay_bookings WHERE id = ?', b.booking_id);
  if (!k) return fail('Booking not found', 404);
  if (k.status === 'confirmed') return ok({ booking: { id: k.id, reference: k.reference, status: k.status } });
  if (!k.razorpay_order_id || k.razorpay_order_id !== b.razorpay_order_id) return fail('Payment does not match this booking');
  if (!(await razorpaySignatureOk(env, b.razorpay_order_id, b.razorpay_payment_id, b.razorpay_signature))) {
    return fail('Payment could not be verified', 400);
  }
  const stillHeld = k.status === 'held' && k.hold_expires_at >= nowIso();
  if (!stillHeld) {
    // Hold ran out while paying: confirm only if a seat is still free, else refund.
    const s = (await seatMap(env, [k.batch_id]))[k.batch_id];
    if (k.takes_seat && (!s || s.left <= 0)) {
      const refunded = await razorpayRefund(env, b.razorpay_payment_id);
      await run(env, "UPDATE klay_bookings SET status = 'cancelled', razorpay_payment_id = ?, cancelled_at = ?, updated_at = ? WHERE id = ?",
        b.razorpay_payment_id, nowIso(), nowIso(), k.id);
      return fail(refunded
        ? 'Your seat hold expired and the batch filled up. Your payment is being refunded.'
        : 'Your seat hold expired and the batch filled up. We will refund your payment.', 409, { refunded });
    }
  }
  const done = await confirmBooking(env, k.id, b.razorpay_payment_id);
  return ok({ booking: { id: done.id, reference: done.reference, status: done.status } });
}

// POST /api/klay/bookings/:id/release — parent closed checkout; free the seat now.
export async function releaseBooking(request, env, id) {
  await run(env, "UPDATE klay_bookings SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE id = ? AND status = 'held'", nowIso(), nowIso(), id);
  return ok();
}

// GET /api/klay/bookings/:reference?phone=
export async function getBooking(request, env, reference) {
  const phone = cleanPhone(new URL(request.url).searchParams.get('phone'));
  const k = await first(env, `
    SELECT k.*, p.name AS programme_name, p.slug AS programme_slug, c.name AS centre_name, c.slug AS centre_slug, ci.slug AS city_slug,
           b.days, b.start_time, b.end_time, pl.label AS plan_label
    FROM klay_bookings k JOIN klay_programmes p ON p.id = k.programme_id JOIN klay_centres c ON c.id = k.centre_id
    JOIN klay_cities ci ON ci.id = k.city_id JOIN klay_batches b ON b.id = k.batch_id JOIN klay_plans pl ON pl.id = k.plan_id
    WHERE k.reference = ?`, reference);
  if (!k || k.parent_phone !== phone) return fail('Booking not found', 404);
  return ok({ booking: {
    reference: k.reference, status: k.status, amount: k.amount, plan: k.plan_label, plan_kind: k.plan_kind,
    child_name: k.child_name, programme: k.programme_name, centre: k.centre_name,
    schedule: `${daysLabel(k.days)} · ${timeRange(k.start_time, k.end_time)}`,
    link: `/klay/${k.city_slug}/${k.centre_slug}/${k.programme_slug}`,
  } });
}

// POST /api/klay/waitlist
export async function joinWaitlist(request, env) {
  const b = await body(request);
  const phone = cleanPhone(b.parent_phone);
  if (!b.batch_id) return fail('Pick a batch');
  if (!String(b.parent_name || '').trim()) return fail("Enter the parent's name");
  if (!PHONE_RE.test(phone)) return fail('Enter a valid 10-digit mobile number');
  const batch = await first(env, 'SELECT id, programme_id FROM klay_batches WHERE id = ?', b.batch_id);
  if (!batch) return fail('Batch not found', 404);
  const dup = await first(env, "SELECT id FROM klay_waitlist WHERE batch_id = ? AND parent_phone = ? AND status = 'waiting'", batch.id, phone);
  if (!dup) {
    await run(env, 'INSERT INTO klay_waitlist (id, batch_id, programme_id, parent_name, parent_phone, parent_email, child_name, status, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      newId('kwl'), batch.id, batch.programme_id, String(b.parent_name).trim().slice(0, 80), phone,
      b.parent_email ? String(b.parent_email).slice(0, 120) : null, b.child_name ? String(b.child_name).slice(0, 80) : null, 'waiting', nowIso());
  }
  return ok({ message: "You're on the waitlist. The centre will call you when a seat opens." });
}

// GET /api/klay/certificates/:no — public certificate verification
export async function certificate(request, env, no) {
  const a = await first(env, `
    SELECT a.*, k.child_name, p.name AS programme, c.name AS centre, ci.name AS city
    FROM klay_level_awards a JOIN klay_bookings k ON k.id = a.booking_id JOIN klay_programmes p ON p.id = a.programme_id
    JOIN klay_centres c ON c.id = k.centre_id JOIN klay_cities ci ON ci.id = k.city_id WHERE a.certificate_no = ?`, no);
  if (!a) return fail('Certificate not found', 404);
  return ok({ certificate: {
    certificate_no: a.certificate_no, child_name: a.child_name, level_code: a.level_code, level_name: a.level_name,
    programme: a.programme, centre: a.centre, city: a.city, awarded_at: a.awarded_at,
  } });
}

// ------------------------------------------------------------ self-serve onboarding
// POST /api/klay/onboard/register — a centre signs itself up. Creates the
// centre (status 'onboarding') and a Centre Director login. It goes live only
// after a City Manager / HQ approves the submitted onboarding form.
export async function registerCentre(request, env) {
  const b = await body(request);
  const name = String(b.centre_name || '').trim();
  const cityName = String(b.city || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  const phone = cleanPhone(b.phone);
  if (name.length < 3) return fail('Enter the centre name');
  if (cityName.length < 2) return fail('Enter the city');
  if (!String(b.director_name || '').trim()) return fail('Enter your name');
  if (!PHONE_RE.test(phone)) return fail('Enter a valid 10-digit mobile number');
  if (!/^\S+@\S+\.\S+$/.test(email)) return fail('Enter a valid email');
  if (String(b.password || '').length < 8) return fail('Choose a password of at least 8 characters');
  if (!b.agree) return fail('Please accept the partner terms');
  if (await first(env, 'SELECT id FROM klay_staff WHERE email = ?', email)) return fail('An account with this email already exists. Log in instead.', 409);

  const t = nowIso();
  const citySlug = slugify(cityName);
  let city = await first(env, 'SELECT * FROM klay_cities WHERE slug = ?', citySlug);
  if (!city) {
    // A new city stays hidden until HQ switches it on (it has no live centre yet anyway).
    city = { id: newId('kcy'), slug: citySlug, name: cityName };
    await run(env, 'INSERT INTO klay_cities (id, slug, name, status, sort_order, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
      city.id, city.slug, city.name, 'hidden', 99, t, t);
  }
  const area = String(b.area || '').trim();
  let slug = slugify(area || name.replace(/^klay\s+/i, ''));
  if (await first(env, 'SELECT id FROM klay_centres WHERE city_id = ? AND slug = ?', city.id, slug)) slug = `${slug}-${shortCode(3).toLowerCase()}`;
  const centreId = newId('kce');
  await run(env, `INSERT INTO klay_centres (id, city_id, slug, name, area, address, pincode, hours_note, director_name, director_phone, director_email, status, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    centreId, city.id, slug, name, area || null, String(b.address || '').trim() || null, String(b.pincode || '').trim() || null,
    'after-school, from 4 PM', String(b.director_name).trim(), phone, email, 'onboarding', t, t);
  const staffId = newId('kst');
  await run(env, `INSERT INTO klay_staff (id, name, email, phone, role, city_id, centre_id, password_hash, status, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    staffId, String(b.director_name).trim(), email, phone, 'centre', city.id, centreId, await hashPassword(String(b.password)), 'active', t, t);
  await audit(env, { id: staffId, role: 'centre' }, 'centre.register', 'centre', centreId, { name, city: city.name });
  return ok({ message: 'Centre registered. Log in to add your programmes and coaches.', centre_id: centreId });
}
