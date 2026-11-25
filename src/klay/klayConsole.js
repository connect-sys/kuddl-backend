// =====================================================================
// KLAY module — management console API (HQ -> City -> Centre -> Coach).
// Every handler resolves the logged-in klay_staff row and scopes reads and
// writes to that role's slice. Every change is written to klay_audit_log.
// =====================================================================
import TwilioService from '../utils/twilioService.js';
import jwtLib from '@tsndr/cloudflare-worker-jwt';
import {
  ok, fail, json, body, nowIso, newId, shortCode, slugify, parseJson, all, first, run,
  hashPassword, verifyPassword, signStaffToken, staffFromRequest, publicStaff,
  centreScopeSql, canSeeCentre, canEditCentre, isApprover, audit,
  expireHolds, seatMap, normDays, daysLabel, timeRange, ageLabel, validTime,
  DOC_TYPES, DOC_LABELS, ROLES,
} from './klayCore.js';

const ROLE_LABEL = { hq: 'HQ Admin', city: 'City Manager', centre: 'Centre Director', coach: 'Coach' };

/** Wrap a handler so it only runs for an authenticated staff member. */
export function withStaff(handler, roles = ROLES) {
  return async (request, env, ...rest) => {
    const staff = await staffFromRequest(request, env);
    if (!staff) return fail('Please log in again', 401);
    if (!roles.includes(staff.role)) return fail('You do not have access to this', 403);
    return handler(request, env, staff, ...rest);
  };
}

// ------------------------------------------------------------ auth
export async function login(request, env) {
  const b = await body(request);
  const email = String(b.email || '').trim().toLowerCase();
  // HQ signs in with its normal Kuddl partner account; this is for the team.
  const s = await first(env, `SELECT s.* FROM klay_staff s JOIN klay_orgs o ON o.id = s.org_id
    WHERE s.email = ? AND s.role != 'hq' AND o.status = 'active'`, email);
  if (!s || s.status !== 'active' || !(await verifyPassword(String(b.password || ''), s.password_hash))) {
    return fail('Wrong email or password', 401);
  }
  await run(env, 'UPDATE klay_staff SET last_login_at = ? WHERE id = ?', nowIso(), s.id);
  return ok({ token: await signStaffToken(env, s), staff: await describeStaff(env, s) });
}

async function describeStaff(env, s) {
  const out = { ...publicStaff(s), role_label: ROLE_LABEL[s.role] };
  if (s.city_id) out.city = await first(env, 'SELECT id, slug, name FROM klay_cities WHERE id = ?', s.city_id);
  if (s.centre_id) out.centre = await first(env, 'SELECT id, slug, name, status, city_id FROM klay_centres WHERE id = ?', s.centre_id);
  if (s.org_id) {
    const o = await first(env, 'SELECT id, name, brand_name, plan_label, max_users, max_centres, status FROM klay_orgs WHERE id = ?', s.org_id);
    if (o) {
      const users = (await first(env, "SELECT COUNT(*) AS n FROM klay_staff WHERE org_id = ? AND role != 'hq' AND status = 'active'", o.id)).n;
      const centres = (await first(env, 'SELECT COUNT(*) AS n FROM klay_centres WHERE org_id = ?', o.id)).n;
      out.org = { ...o, users_used: users, centres_used: centres };
    }
  }
  return out;
}
export const me = withStaff(async (request, env, staff) => ok({ staff: await describeStaff(env, staff) }));

export const changePassword = withStaff(async (request, env, staff) => {
  const b = await body(request);
  if (!(await verifyPassword(String(b.current_password || ''), staff.password_hash))) return fail('Current password is wrong');
  if (String(b.new_password || '').length < 8) return fail('New password must be at least 8 characters');
  await run(env, 'UPDATE klay_staff SET password_hash = ?, updated_at = ? WHERE id = ?', await hashPassword(String(b.new_password)), nowIso(), staff.id);
  await audit(env, staff, 'staff.password', 'staff', staff.id);
  return ok();
});

// ------------------------------------------------------------ data loading
async function centresInScope(env, staff, { includeAll = false } = {}) {
  const sc = centreScopeSql(staff);
  const statusSql = includeAll ? '' : '';
  return all(env, `SELECT c.*, ci.name AS city_name, ci.slug AS city_slug FROM klay_centres c JOIN klay_cities ci ON ci.id = c.city_id WHERE ${sc.sql} ${statusSql} ORDER BY ci.name, c.name`, ...sc.binds);
}

/** Programmes + batches + seats for centre ids (any status). */
async function programmeTree(env, centreIds) {
  if (!centreIds.length) return [];
  const ph = centreIds.map(() => '?').join(',');
  const progs = await all(env, `
    SELECT p.*, cl.name AS club_name, cl.slug AS club_slug, cl.color, cl.icon, cl.category_label, cl.levels,
           co.name AS coach_name, co.status AS coach_status
    FROM klay_programmes p JOIN klay_clubs cl ON cl.id = p.club_id LEFT JOIN klay_coaches co ON co.id = p.coach_id
    WHERE p.centre_id IN (${ph}) ORDER BY cl.sort_order, p.name`, ...centreIds);
  if (!progs.length) return [];
  const pph = progs.map(() => '?').join(',');
  const pids = progs.map((p) => p.id);
  const batches = await all(env, `SELECT * FROM klay_batches WHERE programme_id IN (${pph}) ORDER BY start_time`, ...pids);
  const plans = await all(env, `SELECT * FROM klay_plans WHERE programme_id IN (${pph}) ORDER BY sort_order`, ...pids);
  const pendingPrices = await all(env, `SELECT ref_id, payload FROM klay_approvals WHERE type = 'price' AND status = 'pending' AND ref_id IN (SELECT id FROM klay_plans WHERE programme_id IN (${pph}))`, ...pids);
  const seats = await seatMap(env, batches.map((b) => b.id));
  return progs.map((p) => ({
    id: p.id, centre_id: p.centre_id, slug: p.slug, name: p.name, description: p.description, status: p.status,
    age_min: p.age_min, age_max: p.age_max, age_label: ageLabel(p.age_min, p.age_max),
    what_to_bring: p.what_to_bring, format_note: p.format_note,
    club: { id: p.club_id, name: p.club_name, slug: p.club_slug, color: p.color, icon: p.icon, category_label: p.category_label, levels: parseJson(p.levels, []) },
    coach: p.coach_id ? { id: p.coach_id, name: p.coach_name, status: p.coach_status } : null,
    batches: batches.filter((b) => b.programme_id === p.id).map((b) => ({
      id: b.id, days: normDays(b.days), days_label: daysLabel(b.days), start_time: b.start_time, end_time: b.end_time,
      time_label: timeRange(b.start_time, b.end_time), age_min: b.age_min, age_max: b.age_max, status: b.status,
      capacity: b.capacity, booked_offline: b.booked_offline, ...(seats[b.id] || {}),
    })),
    plans: plans.filter((pl) => pl.programme_id === p.id).map((pl) => {
      const pend = pendingPrices.find((x) => x.ref_id === pl.id);
      return { id: pl.id, kind: pl.kind, label: pl.label, subtitle: pl.subtitle, sessions: pl.sessions, months: pl.months,
        price: pl.price, discount_pct: pl.discount_pct, takes_seat: pl.takes_seat, status: pl.status,
        pending_price: pend ? parseJson(pend.payload, {}).new_price : null };
    }),
  }));
}

function centreStats(progs) {
  let capacity = 0, booked = 0, left = 0;
  for (const p of progs) {
    if (p.status !== 'live') continue;
    for (const b of p.batches) {
      if (b.status !== 'live') continue;
      capacity += b.capacity || 0; booked += b.booked || 0; left += b.left || 0;
    }
  }
  const occupancy = capacity ? Math.round((booked / capacity) * 100) : 0;
  return { clubs: progs.filter((p) => p.status === 'live').length, capacity, enrolled: booked, seats_open: left, occupancy };
}
function healthOf(c, st) {
  if (c.status !== 'live') return { key: c.status, label: c.status === 'pending' ? 'Awaiting approval' : c.status === 'onboarding' ? 'Onboarding' : 'Paused' };
  if (!st.capacity) return { key: 'empty', label: 'No batches yet' };
  if (st.occupancy >= 60) return { key: 'healthy', label: 'Healthy' };
  if (st.occupancy >= 30) return { key: 'watch', label: 'Low occupancy' };
  return { key: 'needs', label: 'Needs bookings' };
}

// ------------------------------------------------------------ overview
// GET /api/klay/console/overview — KPIs, cities, funnel, leaderboard (scoped)
export const overview = withStaff(async (request, env, staff) => {
  await expireHolds(env);
  const centres = await centresInScope(env, staff);
  const progs = await programmeTree(env, centres.map((c) => c.id));
  const rows = centres.map((c) => {
    const st = centreStats(progs.filter((p) => p.centre_id === c.id));
    return { id: c.id, name: c.name, area: c.area, city: c.city_name, city_id: c.city_id, city_slug: c.city_slug, slug: c.slug,
      director: c.director_name, status: c.status, ...st, health: healthOf(c, st) };
  });
  const live = rows.filter((r) => r.status === 'live');
  const tot = centreStats(progs.filter((p) => live.some((r) => r.id === p.centre_id)));
  const clubNames = [...new Set(progs.filter((p) => p.status === 'live' && live.some((r) => r.id === p.centre_id)).map((p) => p.club.name))];

  // Funnel (last 30 days), scoped to the visible centres / city.
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  let funnel = { page_view: 0, centre_view: 0, booking_start: 0, paid: 0 };
  const scopeSql = staff.role === 'centre' || staff.role === 'coach' ? 'centre_id = ?'
    : staff.role === 'city' ? 'centre_id IN (SELECT id FROM klay_centres WHERE org_id = ? AND city_id = ?)'
    : 'centre_id IN (SELECT id FROM klay_centres WHERE org_id = ?)';
  const scopeBind = staff.role === 'centre' || staff.role === 'coach' ? [staff.centre_id] : staff.role === 'city' ? [staff.org_id, staff.city_id] : [staff.org_id];
  const fr = await all(env, `SELECT event, COUNT(*) AS n FROM klay_events WHERE created_at >= ? AND (${scopeSql}) GROUP BY event`, since, ...scopeBind);
  for (const r of fr) funnel[r.event] = r.n;

  const coaches = await all(env, `SELECT co.status FROM klay_coaches co JOIN klay_centres c ON c.id = co.centre_id WHERE ${centreScopeSql(staff).sql}`, ...centreScopeSql(staff).binds);
  const byCity = {};
  for (const r of live) {
    byCity[r.city] = byCity[r.city] || { city: r.city, city_slug: r.city_slug, centres: 0, enrolled: 0 };
    byCity[r.city].centres += 1; byCity[r.city].enrolled += r.enrolled;
  }
  const pendingApprovals = isApprover(staff)
    ? (await first(env, `SELECT COUNT(*) AS n FROM klay_approvals WHERE status = 'pending' AND org_id = ? ${staff.role === 'city' ? 'AND city_id = ?' : ''}`, staff.org_id, ...(staff.role === 'city' ? [staff.city_id] : []))).n
    : 0;
  return ok({
    kpis: {
      centres_live: live.length, centre_names: live.map((r) => r.area || r.name),
      clubs: tot.clubs, club_names: clubNames,
      enrolled: tot.enrolled, seats_open: tot.seats_open, capacity: tot.capacity, occupancy: tot.occupancy,
      coaches: coaches.length, coaches_verified: coaches.filter((c) => c.status === 'verified').length,
      pending_approvals: pendingApprovals,
    },
    cities: Object.values(byCity),
    funnel,
    leaderboard: rows.sort((a, b) => b.occupancy - a.occupancy),
  });
});

// ------------------------------------------------------------ centres
export const listCentres = withStaff(async (request, env, staff) => {
  await expireHolds(env);
  const centres = await centresInScope(env, staff);
  const progs = await programmeTree(env, centres.map((c) => c.id));
  return ok({ centres: centres.map((c) => {
    const st = centreStats(progs.filter((p) => p.centre_id === c.id));
    return { ...c, ...st, health: healthOf(c, st) };
  }) });
});

export const getCentre = withStaff(async (request, env, staff, id) => {
  if (!(await canSeeCentre(env, staff, id))) return fail('Centre not found', 404);
  await expireHolds(env);
  const c = await first(env, 'SELECT c.*, ci.name AS city_name, ci.slug AS city_slug FROM klay_centres c JOIN klay_cities ci ON ci.id = c.city_id WHERE c.id = ?', id);
  let progs = await programmeTree(env, [id]);
  if (staff.role === 'coach') progs = progs.filter((p) => p.coach?.id === staff.coach_id);
  const coaches = await all(env, 'SELECT * FROM klay_coaches WHERE centre_id = ? ORDER BY name', id);
  const docs = coaches.length ? await all(env, `SELECT coach_id, doc_type, status FROM klay_coach_documents WHERE coach_id IN (${coaches.map(() => '?').join(',')})`, ...coaches.map((x) => x.id)) : [];
  const st = centreStats(progs);
  return ok({
    centre: { ...c, ...st, health: healthOf(c, st) },
    programmes: progs,
    coaches: coaches.map((co) => ({ ...co, docs: DOC_TYPES.map((t) => ({ doc_type: t, label: DOC_LABELS[t], status: docs.find((d) => d.coach_id === co.id && d.doc_type === t)?.status || 'missing' })) })),
    clubs: await all(env, 'SELECT id, slug, name, category_label, color, icon FROM klay_clubs ORDER BY sort_order, name'),
  });
});

const CENTRE_FIELDS = ['name', 'area', 'address', 'pincode', 'hours_note', 'director_name', 'director_phone', 'director_email', 'lat', 'lng'];
export const updateCentre = withStaff(async (request, env, staff, id) => {
  if (!(await canEditCentre(env, staff, id))) return fail('You cannot edit this centre', 403);
  const b = await body(request);
  const sets = []; const binds = [];
  for (const f of CENTRE_FIELDS) if (f in b) { sets.push(`${f} = ?`); binds.push(b[f] === '' ? null : b[f]); }
  if (isApprover(staff) && 'rating' in b) { sets.push('rating = ?'); binds.push(b.rating === '' ? null : Number(b.rating)); }
  if (isApprover(staff) && 'status' in b && ['live', 'paused'].includes(b.status)) {
    sets.push('status = ?'); binds.push(b.status);
    if (b.status === 'live') { sets.push('approved_at = ?', 'approved_by = ?'); binds.push(nowIso(), staff.id); }
  }
  if (!sets.length) return fail('Nothing to update');
  sets.push('updated_at = ?'); binds.push(nowIso());
  await run(env, `UPDATE klay_centres SET ${sets.join(', ')} WHERE id = ?`, ...binds, id);
  if (b.status === 'live') {
    // The city goes live with its first live centre.
    await run(env, "UPDATE klay_cities SET status = 'live', updated_at = ? WHERE id = (SELECT city_id FROM klay_centres WHERE id = ?)", nowIso(), id);
  }
  await audit(env, staff, 'centre.update', 'centre', id, b);
  return ok();
});

// POST /api/klay/console/centres — HQ / City Manager adds a centre directly.
export const createCentre = withStaff(async (request, env, staff) => {
  const b = await body(request);
  let cityId = staff.role === 'city' ? staff.city_id : b.city_id;
  const t = nowIso();
  if (!cityId && b.city_name) {
    const slug = slugify(b.city_name);
    const ex = await first(env, 'SELECT id FROM klay_cities WHERE slug = ?', slug);
    cityId = ex?.id || newId('kcy');
    if (!ex) await run(env, 'INSERT INTO klay_cities (id, slug, name, status, sort_order, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', cityId, slug, String(b.city_name).trim(), 'hidden', 99, t, t);
  }
  if (!cityId || !(await first(env, 'SELECT id FROM klay_cities WHERE id = ?', cityId))) return fail('Pick a city');
  if (String(b.name || '').trim().length < 3) return fail('Enter the centre name');
  const org = await first(env, 'SELECT max_centres FROM klay_orgs WHERE id = ?', staff.org_id);
  const used = (await first(env, 'SELECT COUNT(*) AS n FROM klay_centres WHERE org_id = ?', staff.org_id)).n;
  if (org && used >= org.max_centres) return fail(`Your plan allows ${org.max_centres} centre${org.max_centres === 1 ? '' : 's'}. Ask Kuddl to upgrade your plan to add more.`, 403, { limit: 'centres' });
  let slug = slugify(b.area || String(b.name).replace(/^klay\s+/i, ''));
  if (await first(env, 'SELECT id FROM klay_centres WHERE city_id = ? AND slug = ?', cityId, slug)) slug = `${slug}-${shortCode(3).toLowerCase()}`;
  const id = newId('kce');
  await run(env, `INSERT INTO klay_centres (id, city_id, slug, name, area, address, pincode, hours_note, director_name, director_phone, director_email, status, created_at, updated_at, org_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, cityId, slug, String(b.name).trim(), b.area || null, b.address || null, b.pincode || null,
    b.hours_note || 'after-school, from 4 PM', b.director_name || null, b.director_phone || null, b.director_email || null, 'onboarding', t, t, staff.org_id);
  await audit(env, staff, 'centre.create', 'centre', id, { name: b.name });
  return ok({ id });
}, ['hq', 'city']);

// POST /api/klay/console/centres/:id/submit — onboarding form "Submit & go live".
export const submitCentre = withStaff(async (request, env, staff, id) => {
  if (!(await canEditCentre(env, staff, id))) return fail('You cannot submit this centre', 403);
  const b = await body(request);
  if (!b.agree) return fail('Please accept the partner terms and DPDP data handling');
  const c = await first(env, 'SELECT * FROM klay_centres WHERE id = ?', id);
  const progs = await all(env, 'SELECT id FROM klay_programmes WHERE centre_id = ?', id);
  if (!progs.length) return fail('Add at least one programme first');
  const t = nowIso();
  if (isApprover(staff)) {
    await run(env, "UPDATE klay_centres SET status = 'live', agreement_signed_at = ?, agreement_signed_by = ?, submitted_at = ?, approved_at = ?, approved_by = ?, updated_at = ? WHERE id = ?", t, staff.id, t, t, staff.id, t, id);
    await run(env, "UPDATE klay_programmes SET status = 'live', approved_at = ?, approved_by = ? WHERE centre_id = ? AND status IN ('pending','draft')", t, staff.id, id);
    await run(env, "UPDATE klay_cities SET status = 'live', updated_at = ? WHERE id = ?", t, c.city_id);
  } else {
    await run(env, "UPDATE klay_centres SET status = CASE WHEN status = 'live' THEN 'live' ELSE 'pending' END, agreement_signed_at = ?, agreement_signed_by = ?, submitted_at = ?, updated_at = ? WHERE id = ?", t, staff.id, t, t, id);
    if (c.status !== 'live' && !(await first(env, "SELECT id FROM klay_approvals WHERE type = 'centre' AND ref_id = ? AND status = 'pending'", id))) {
      await run(env, 'INSERT INTO klay_approvals (id, type, ref_id, centre_id, city_id, payload, status, requested_by, created_at, org_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
        newId('kap'), 'centre', id, id, c.city_id, JSON.stringify({ name: c.name }), 'pending', staff.id, t, staff.org_id);
    }
  }
  await audit(env, staff, 'centre.submit', 'centre', id);
  return ok({ status: isApprover(staff) ? 'live' : (c.status === 'live' ? 'live' : 'pending') });
});

// ------------------------------------------------------------ programmes
function parseAge(v) { const n = v === '' || v == null ? null : Number(v); return Number.isFinite(n) ? n : null; }
function validateBatchInput(b) {
  const days = normDays(b.days);
  if (!days.length) return 'Pick at least one day';
  if (!validTime(b.start_time) || !validTime(b.end_time)) return 'Enter start and end times';
  if (b.end_time <= b.start_time) return 'End time must be after start time';
  const cap = Number(b.capacity);
  if (!Number.isInteger(cap) || cap < 1 || cap > 500) return 'Capacity must be between 1 and 500';
  const off = Number(b.booked_offline || 0);
  if (!Number.isInteger(off) || off < 0) return 'Enrolled count cannot be negative';
  if (off > cap) return 'Enrolled count cannot be more than capacity';
  return null;
}

// POST /api/klay/console/programmes — add a programme (+ first batch + plans)
export const createProgramme = withStaff(async (request, env, staff) => {
  const b = await body(request);
  if (!(await canEditCentre(env, staff, b.centre_id))) return fail('You cannot add programmes here', 403);
  const club = await first(env, 'SELECT * FROM klay_clubs WHERE id = ? OR slug = ?', b.club_id || '', b.club_slug || '');
  if (!club) return fail('Pick a club');
  const amin = parseAge(b.age_min), amax = parseAge(b.age_max);
  if (amin == null || amin < 0 || amin > 16) return fail('Enter the youngest age (0–16)');
  if (amax != null && (amax < amin || amax > 18)) return fail('Oldest age must be between youngest age and 18');
  const batchErr = validateBatchInput(b.batch || {});
  if (batchErr) return fail(batchErr);
  if (b.coach_id && !(await first(env, 'SELECT id FROM klay_coaches WHERE id = ? AND centre_id = ?', b.coach_id, b.centre_id))) return fail('Pick a coach from this centre');
  const name = String(b.name || club.name).trim();
  let slug = slugify(b.slug || name);
  if (await first(env, 'SELECT id FROM klay_programmes WHERE centre_id = ? AND slug = ?', b.centre_id, slug)) return fail(`"${name}" already exists at this centre`, 409);
  const centre = await first(env, 'SELECT * FROM klay_centres WHERE id = ?', b.centre_id);
  const t = nowIso();
  const id = newId('kpg');
  // Centre Directors' new programmes on a live centre wait for City Manager approval.
  const needsApproval = !isApprover(staff) && centre.status === 'live';
  const status = needsApproval ? 'pending' : (centre.status === 'live' ? 'live' : 'pending');
  await run(env, `INSERT INTO klay_programmes (id, centre_id, club_id, slug, name, description, age_min, age_max, coach_id, what_to_bring, format_note, status, created_by, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, b.centre_id, club.id, slug, name, b.description || club.tagline || null, amin, amax, b.coach_id || null,
    b.what_to_bring || null, b.format_note || '8 sessions a month · small batch · verified coach · certificate on each level', status, staff.id, t, t);
  const bt = b.batch;
  await run(env, 'INSERT INTO klay_batches (id, programme_id, days, start_time, end_time, age_min, age_max, capacity, booked_offline, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    newId('kbt'), id, JSON.stringify(normDays(bt.days)), bt.start_time, bt.end_time, amin, amax, Number(bt.capacity), Number(bt.booked_offline || 0), 'live', t, t);
  await createDefaultPlans(env, id, b.plans || {});
  if (needsApproval) {
    await run(env, 'INSERT INTO klay_approvals (id, type, ref_id, centre_id, city_id, payload, status, requested_by, created_at, org_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
      newId('kap'), 'programme', id, b.centre_id, centre.city_id, JSON.stringify({ name, centre: centre.name }), 'pending', staff.id, t, staff.org_id);
  }
  await audit(env, staff, 'programme.create', 'programme', id, { name, centre_id: b.centre_id, status });
  return ok({ id, status });
});

async function createDefaultPlans(env, programmeId, p) {
  const t = nowIso();
  const monthly = Math.max(0, Math.round(Number(p.monthly_price ?? 0)));
  const qDisc = Math.max(0, Math.min(50, Math.round(Number(p.quarterly_discount_pct ?? 10))));
  const quarterly = p.quarterly_price != null ? Math.round(Number(p.quarterly_price)) : Math.round(monthly * 3 * (1 - qDisc / 100));
  const sessions = Number(p.sessions_per_month || 8);
  const rows = [
    ['demo', 'Free demo', 'Try one class', 1, null, 0, 0, 0, 1],
    ['monthly', 'Monthly', `${sessions} sessions`, sessions, 1, monthly, 0, 1, 2],
    ['quarterly', 'Quarterly', `3 months · save ${qDisc}%`, sessions * 3, 3, quarterly, qDisc, 1, 3],
  ];
  for (const r of rows) {
    await run(env, `INSERT OR IGNORE INTO klay_plans (id, programme_id, kind, label, subtitle, sessions, months, price, discount_pct, takes_seat, status, sort_order, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, newId('kpl'), programmeId, r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], 'live', r[8], t, t);
  }
}

export const updateProgramme = withStaff(async (request, env, staff, id) => {
  const p = await first(env, 'SELECT * FROM klay_programmes WHERE id = ?', id);
  if (!p || !(await canEditCentre(env, staff, p.centre_id))) return fail('Programme not found', 404);
  const b = await body(request);
  const sets = []; const binds = [];
  for (const f of ['name', 'description', 'what_to_bring', 'format_note']) if (f in b) { sets.push(`${f} = ?`); binds.push(b[f] || null); }
  if ('age_min' in b || 'age_max' in b) {
    const amin = 'age_min' in b ? parseAge(b.age_min) : p.age_min;
    const amax = 'age_max' in b ? parseAge(b.age_max) : p.age_max;
    if (amin == null || amin < 0 || amin > 16) return fail('Enter the youngest age (0–16)');
    if (amax != null && (amax < amin || amax > 18)) return fail('Oldest age must be between youngest age and 18');
    sets.push('age_min = ?', 'age_max = ?'); binds.push(amin, amax);
  }
  if ('coach_id' in b) {
    if (b.coach_id && !(await first(env, 'SELECT id FROM klay_coaches WHERE id = ? AND centre_id = ?', b.coach_id, p.centre_id))) return fail('Pick a coach from this centre');
    sets.push('coach_id = ?'); binds.push(b.coach_id || null);
  }
  if ('status' in b) {
    if (b.status === 'paused' || (b.status === 'live' && p.status === 'paused' && p.approved_at)) { sets.push('status = ?'); binds.push(b.status); }
    else if (b.status === 'live' && isApprover(staff)) { sets.push('status = ?', 'approved_at = ?', 'approved_by = ?'); binds.push('live', nowIso(), staff.id); }
  }
  if (!sets.length) return fail('Nothing to update');
  sets.push('updated_at = ?'); binds.push(nowIso());
  await run(env, `UPDATE klay_programmes SET ${sets.join(', ')} WHERE id = ?`, ...binds, id);
  await audit(env, staff, 'programme.update', 'programme', id, b);
  return ok();
});

// ------------------------------------------------------------ batches & seats
export const createBatch = withStaff(async (request, env, staff) => {
  const b = await body(request);
  const p = await first(env, 'SELECT * FROM klay_programmes WHERE id = ?', b.programme_id);
  if (!p || !(await canEditCentre(env, staff, p.centre_id))) return fail('Programme not found', 404);
  const err = validateBatchInput(b);
  if (err) return fail(err);
  const id = newId('kbt'); const t = nowIso();
  await run(env, 'INSERT INTO klay_batches (id, programme_id, days, start_time, end_time, age_min, age_max, capacity, booked_offline, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    id, p.id, JSON.stringify(normDays(b.days)), b.start_time, b.end_time, parseAge(b.age_min) ?? p.age_min, parseAge(b.age_max) ?? p.age_max,
    Number(b.capacity), Number(b.booked_offline || 0), 'live', t, t);
  await audit(env, staff, 'batch.create', 'batch', id, b);
  return ok({ id });
});

// PUT /api/klay/console/batches/:id — capacity, manual booked count, reschedule.
export const updateBatch = withStaff(async (request, env, staff, id) => {
  const bt = await first(env, 'SELECT b.*, p.centre_id FROM klay_batches b JOIN klay_programmes p ON p.id = b.programme_id WHERE b.id = ?', id);
  if (!bt || !(await canEditCentre(env, staff, bt.centre_id))) return fail('Batch not found', 404);
  await expireHolds(env);
  const b = await body(request);
  const next = {
    days: 'days' in b ? normDays(b.days) : normDays(bt.days),
    start_time: b.start_time ?? bt.start_time,
    end_time: b.end_time ?? bt.end_time,
    capacity: 'capacity' in b ? Number(b.capacity) : bt.capacity,
    booked_offline: 'booked_offline' in b ? Number(b.booked_offline) : bt.booked_offline,
  };
  const err = validateBatchInput(next);
  if (err) return fail(err);
  // Never let capacity drop below seats already sold or held on the platform.
  const s = (await seatMap(env, [id]))[id] || { online: 0, held: 0 };
  if (next.booked_offline + s.online + s.held > next.capacity) {
    return fail(`Only ${Math.max(0, next.capacity - s.online - s.held)} seats can be marked as booked off-platform — ${s.online} are booked online${s.held ? ` and ${s.held} are being paid for right now` : ''}.`);
  }
  const t = nowIso();
  await run(env, `UPDATE klay_batches SET days = ?, start_time = ?, end_time = ?, capacity = ?, booked_offline = ?,
    age_min = COALESCE(?, age_min), age_max = COALESCE(?, age_max), status = COALESCE(?, status), updated_at = ? WHERE id = ?`,
    JSON.stringify(next.days), next.start_time, next.end_time, next.capacity, next.booked_offline,
    'age_min' in b ? parseAge(b.age_min) : null, 'age_max' in b ? parseAge(b.age_max) : null,
    ['live', 'paused'].includes(b.status) ? b.status : null, t, id);
  await audit(env, staff, 'batch.update', 'batch', id, { before: { days: normDays(bt.days), start_time: bt.start_time, capacity: bt.capacity, booked_offline: bt.booked_offline }, after: next });
  return ok({ seats: (await seatMap(env, [id]))[id] });
});

export const deleteBatch = withStaff(async (request, env, staff, id) => {
  const bt = await first(env, 'SELECT b.*, p.centre_id FROM klay_batches b JOIN klay_programmes p ON p.id = b.programme_id WHERE b.id = ?', id);
  if (!bt || !(await canEditCentre(env, staff, bt.centre_id))) return fail('Batch not found', 404);
  const used = await first(env, "SELECT COUNT(*) AS n FROM klay_bookings WHERE batch_id = ? AND status IN ('confirmed','held')", id);
  if (used.n > 0) return fail('This batch has bookings — pause it instead of deleting');
  const others = await first(env, 'SELECT COUNT(*) AS n FROM klay_batches WHERE programme_id = ? AND id != ?', bt.programme_id, id);
  if (!others.n) return fail('A programme needs at least one batch');
  await run(env, 'DELETE FROM klay_batches WHERE id = ?', id);
  await audit(env, staff, 'batch.delete', 'batch', id);
  return ok();
});

// ------------------------------------------------------------ plans / prices
// PUT /api/klay/console/plans/:id { price } — Centre: approval request; City/HQ: direct.
export const updatePlan = withStaff(async (request, env, staff, id) => {
  const pl = await first(env, 'SELECT pl.*, p.centre_id, c.city_id, c.status AS centre_status, p.status AS prog_status FROM klay_plans pl JOIN klay_programmes p ON p.id = pl.programme_id JOIN klay_centres c ON c.id = p.centre_id WHERE pl.id = ?', id);
  if (!pl || !(await canEditCentre(env, staff, pl.centre_id))) return fail('Plan not found', 404);
  const b = await body(request);
  const price = Math.round(Number(b.price));
  if (!Number.isFinite(price) || price < 0 || price > 500000) return fail('Enter a valid price');
  if (pl.kind === 'demo' && price !== 0) return fail('The demo class stays free');
  const t = nowIso();
  if (isApprover(staff) || pl.centre_status !== 'live') {
    await run(env, 'UPDATE klay_plans SET price = ?, updated_at = ? WHERE id = ?', price, t, id);
    await run(env, "UPDATE klay_approvals SET status = 'rejected', decided_by = ?, decided_at = ?, note = 'Superseded' WHERE type = 'price' AND ref_id = ? AND status = 'pending'", staff.id, t, id);
    await audit(env, staff, 'plan.price', 'plan', id, { from: pl.price, to: price });
    return ok({ applied: true });
  }
  await run(env, "UPDATE klay_approvals SET status = 'rejected', decided_by = ?, decided_at = ?, note = 'Superseded' WHERE type = 'price' AND ref_id = ? AND status = 'pending'", staff.id, t, id);
  await run(env, 'INSERT INTO klay_approvals (id, type, ref_id, centre_id, city_id, payload, status, requested_by, created_at, org_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
    newId('kap'), 'price', id, pl.centre_id, pl.city_id, JSON.stringify({ old_price: pl.price, new_price: price, plan: pl.label }), 'pending', staff.id, t, staff.org_id);
  await audit(env, staff, 'plan.price.request', 'plan', id, { from: pl.price, to: price });
  return ok({ applied: false, message: 'Price change sent to your City Manager for approval' });
});

// ------------------------------------------------------------ approvals
export const listApprovals = withStaff(async (request, env, staff) => {
  const status = new URL(request.url).searchParams.get('status') || 'pending';
  const sc = staff.role === 'hq' ? { sql: 'a.org_id = ?', binds: [staff.org_id] } : staff.role === 'city' ? { sql: 'a.org_id = ? AND a.city_id = ?', binds: [staff.org_id, staff.city_id] } : { sql: 'a.centre_id = ?', binds: [staff.centre_id] };
  const rows = await all(env, `SELECT a.*, c.name AS centre_name, s.name AS requested_by_name FROM klay_approvals a LEFT JOIN klay_centres c ON c.id = a.centre_id LEFT JOIN klay_staff s ON s.id = a.requested_by
    WHERE ${sc.sql} AND a.status = ? ORDER BY a.created_at DESC LIMIT 200`, ...sc.binds, status);
  return ok({ approvals: rows.map((r) => ({ ...r, payload: parseJson(r.payload, {}) })) });
}, ROLES.filter((r) => r !== 'coach'));

export const decideApproval = withStaff(async (request, env, staff, id) => {
  const a = await first(env, 'SELECT * FROM klay_approvals WHERE id = ?', id);
  if (!a || a.status !== 'pending') return fail('This request is no longer pending', 404);
  if (a.org_id !== staff.org_id) return fail('This request is no longer pending', 404);
  if (staff.role === 'city' && a.city_id !== staff.city_id) return fail('Not in your city', 403);
  const b = await body(request);
  const approve = b.decision === 'approve';
  const t = nowIso();
  if (approve) {
    if (a.type === 'programme') await run(env, "UPDATE klay_programmes SET status = 'live', approved_at = ?, approved_by = ?, updated_at = ? WHERE id = ?", t, staff.id, t, a.ref_id);
    if (a.type === 'price') await run(env, 'UPDATE klay_plans SET price = ?, updated_at = ? WHERE id = ?', Number(parseJson(a.payload, {}).new_price), t, a.ref_id);
    if (a.type === 'centre') {
      await run(env, "UPDATE klay_centres SET status = 'live', approved_at = ?, approved_by = ?, updated_at = ? WHERE id = ?", t, staff.id, t, a.ref_id);
      await run(env, "UPDATE klay_programmes SET status = 'live', approved_at = ?, approved_by = ? WHERE centre_id = ? AND status IN ('pending','draft')", t, staff.id, a.ref_id);
      await run(env, "UPDATE klay_cities SET status = 'live', updated_at = ? WHERE id = ?", t, a.city_id);
    }
  } else if (a.type === 'centre') {
    await run(env, "UPDATE klay_centres SET status = 'onboarding', updated_at = ? WHERE id = ?", t, a.ref_id);
  }
  await run(env, 'UPDATE klay_approvals SET status = ?, decided_by = ?, decided_at = ?, note = ? WHERE id = ?', approve ? 'approved' : 'rejected', staff.id, t, b.note || null, id);
  await audit(env, staff, `approval.${approve ? 'approve' : 'reject'}`, a.type, a.ref_id, { approval: id, note: b.note || null });
  return ok();
}, ['hq', 'city']);

// ------------------------------------------------------------ coaches & KYC
async function coachInScope(env, staff, id) {
  const co = await first(env, 'SELECT co.*, c.name AS centre_name, c.city_id, ci.name AS city_name FROM klay_coaches co JOIN klay_centres c ON c.id = co.centre_id JOIN klay_cities ci ON ci.id = c.city_id WHERE co.id = ?', id);
  if (!co) return null;
  if (staff.role === 'coach') return staff.coach_id === id ? co : null;
  return (await canSeeCentre(env, staff, co.centre_id)) ? co : null;
}

export const listCoaches = withStaff(async (request, env, staff) => {
  const sc = centreScopeSql(staff);
  let rows = await all(env, `SELECT co.*, c.name AS centre_name, ci.name AS city_name FROM klay_coaches co JOIN klay_centres c ON c.id = co.centre_id JOIN klay_cities ci ON ci.id = c.city_id WHERE ${sc.sql} ORDER BY co.name`, ...sc.binds);
  if (staff.role === 'coach') rows = rows.filter((r) => r.id === staff.coach_id);
  const docs = rows.length ? await all(env, `SELECT coach_id, doc_type, status FROM klay_coach_documents WHERE coach_id IN (${rows.map(() => '?').join(',')})`, ...rows.map((r) => r.id)) : [];
  return ok({ coaches: rows.map((r) => {
    const mine = docs.filter((d) => d.coach_id === r.id);
    return { ...r, docs_verified: mine.filter((d) => d.status === 'verified').length, docs_uploaded: mine.length, docs_total: DOC_TYPES.length };
  }) });
});

export const getCoach = withStaff(async (request, env, staff, id) => {
  const co = await coachInScope(env, staff, id);
  if (!co) return fail('Coach not found', 404);
  await expireHolds(env);
  const docs = await all(env, 'SELECT doc_type, status, file_name, uploaded_at, verified_at, note FROM klay_coach_documents WHERE coach_id = ?', id);
  const progs = (await programmeTree(env, [co.centre_id])).filter((p) => p.coach?.id === id);
  const students = progs.reduce((n, p) => n + p.batches.reduce((m, b) => m + (b.booked || 0), 0), 0);
  return ok({
    coach: co,
    documents: DOC_TYPES.map((t) => ({ doc_type: t, label: DOC_LABELS[t], ...(docs.find((d) => d.doc_type === t) || { status: 'missing' }) })),
    programmes: progs.map((p) => ({ id: p.id, name: p.name, age_label: p.age_label, batches: p.batches.map((b) => ({ id: b.id, days: b.days, days_label: b.days_label, time_label: b.time_label, start_time: b.start_time, booked: b.booked })) })),
    stats: { active_students: students, rating: co.rating, sessions_done: null, attendance: null },
  });
});

export const createCoach = withStaff(async (request, env, staff) => {
  const b = await body(request);
  const centreId = staff.role === 'centre' ? staff.centre_id : b.centre_id;
  if (!(await canEditCentre(env, staff, centreId))) return fail('You cannot add coaches here', 403);
  if (String(b.name || '').trim().length < 2) return fail("Enter the coach's name");
  const id = newId('kco'); const t = nowIso();
  await run(env, `INSERT INTO klay_coaches (id, centre_id, name, phone, email, qualifications, quote, status, joined_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    id, centreId, String(b.name).trim(), b.phone || null, b.email || null, b.qualifications || null, b.quote || null, 'pending', t, t, t);
  await audit(env, staff, 'coach.create', 'coach', id, { name: b.name });
  return ok({ id });
}, ['hq', 'city', 'centre']);

export const updateCoach = withStaff(async (request, env, staff, id) => {
  const co = await coachInScope(env, staff, id);
  if (!co || staff.role === 'coach') return fail('Coach not found', 404);
  const b = await body(request);
  const sets = []; const binds = [];
  for (const f of ['name', 'phone', 'email', 'qualifications', 'quote']) if (f in b) { sets.push(`${f} = ?`); binds.push(b[f] || null); }
  if (isApprover(staff) && 'rating' in b) { sets.push('rating = ?'); binds.push(b.rating === '' ? null : Number(b.rating)); }
  if ('status' in b && ['inactive', 'pending'].includes(b.status)) { sets.push('status = ?'); binds.push(b.status); }
  if (!sets.length) return fail('Nothing to update');
  sets.push('updated_at = ?'); binds.push(nowIso());
  await run(env, `UPDATE klay_coaches SET ${sets.join(', ')} WHERE id = ?`, ...binds, id);
  await audit(env, staff, 'coach.update', 'coach', id, b);
  return ok();
}, ['hq', 'city', 'centre']);

const MAX_DOC_BYTES = 8 * 1024 * 1024;
const DOC_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];
// POST /api/klay/console/coaches/:id/documents (multipart: doc_type, file)
export const uploadCoachDoc = withStaff(async (request, env, staff, id) => {
  const co = await coachInScope(env, staff, id);
  if (!co || staff.role === 'coach' && staff.coach_id !== id) return fail('Coach not found', 404);
  let form;
  try { form = await request.formData(); } catch { return fail('Upload a file'); }
  const docType = String(form.get('doc_type') || '');
  const file = form.get('file');
  if (!DOC_TYPES.includes(docType)) return fail('Unknown document type');
  if (!file || typeof file === 'string') return fail('Choose a file');
  if (file.size > MAX_DOC_BYTES) return fail('File is too large (max 8 MB)');
  if (file.type && !DOC_MIME.includes(file.type)) return fail('Upload a PDF or an image');
  const key = `klay/kyc/${id}/${docType}-${Date.now()}`;
  await env.KUDDL_STORAGE.put(key, file.stream(), { httpMetadata: { contentType: file.type || 'application/octet-stream' } });
  const t = nowIso();
  await run(env, `INSERT INTO klay_coach_documents (id, coach_id, doc_type, file_key, file_name, status, uploaded_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(coach_id, doc_type) DO UPDATE SET file_key = excluded.file_key, file_name = excluded.file_name, status = 'uploaded', note = NULL, uploaded_at = excluded.uploaded_at, verified_at = NULL, verified_by = NULL, updated_at = excluded.updated_at`,
    newId('kdc'), id, docType, key, String(file.name || docType).slice(0, 120), 'uploaded', t, t, t);
  await refreshCoachStatus(env, id);
  await audit(env, staff, 'coach.document.upload', 'coach', id, { doc_type: docType });
  return ok();
});

// GET /api/klay/console/coaches/:id/documents/:type — stream the private file (scoped)
export const viewCoachDoc = withStaff(async (request, env, staff, id, docType) => {
  const co = await coachInScope(env, staff, id);
  if (!co) return fail('Coach not found', 404);
  const d = await first(env, 'SELECT * FROM klay_coach_documents WHERE coach_id = ? AND doc_type = ?', id, docType);
  if (!d?.file_key) return fail('Document not uploaded', 404);
  const obj = await env.KUDDL_STORAGE.get(d.file_key);
  if (!obj) return fail('File missing', 404);
  await audit(env, staff, 'coach.document.view', 'coach', id, { doc_type: docType });
  return new Response(obj.body, { headers: {
    'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
    'Content-Disposition': `inline; filename="${String(d.file_name || docType).replace(/"/g, '')}"`,
    'Cache-Control': 'private, no-store', 'Access-Control-Allow-Origin': '*',
  } });
});

// PUT /api/klay/console/coaches/:id/documents/:type { status: verified|rejected, note }
export const reviewCoachDoc = withStaff(async (request, env, staff, id, docType) => {
  const co = await coachInScope(env, staff, id);
  if (!co) return fail('Coach not found', 404);
  const b = await body(request);
  if (!['verified', 'rejected'].includes(b.status)) return fail('Choose verify or reject');
  const d = await first(env, 'SELECT id FROM klay_coach_documents WHERE coach_id = ? AND doc_type = ?', id, docType);
  if (!d) return fail('Document not uploaded yet', 404);
  await run(env, 'UPDATE klay_coach_documents SET status = ?, note = ?, verified_at = ?, verified_by = ?, updated_at = ? WHERE id = ?',
    b.status, b.note || null, b.status === 'verified' ? nowIso() : null, staff.id, nowIso(), d.id);
  await refreshCoachStatus(env, id, staff.id);
  await audit(env, staff, `coach.document.${b.status}`, 'coach', id, { doc_type: docType, note: b.note || null });
  return ok();
}, ['hq', 'city']);

/** A coach is 'verified' once all six KYC items are verified. */
async function refreshCoachStatus(env, coachId, by) {
  const n = (await first(env, "SELECT COUNT(*) AS n FROM klay_coach_documents WHERE coach_id = ? AND status = 'verified'", coachId)).n;
  const co = await first(env, 'SELECT status FROM klay_coaches WHERE id = ?', coachId);
  if (co?.status === 'inactive') return;
  if (n >= DOC_TYPES.length && co.status !== 'verified') {
    await run(env, "UPDATE klay_coaches SET status = 'verified', verified_at = ?, verified_by = ?, updated_at = ? WHERE id = ?", nowIso(), by || null, nowIso(), coachId);
  } else if (n < DOC_TYPES.length && co.status === 'verified') {
    await run(env, "UPDATE klay_coaches SET status = 'pending', updated_at = ? WHERE id = ?", nowIso(), coachId);
  }
}

// ------------------------------------------------------------ bookings
function bookingScope(staff) {
  if (staff.role === 'hq') return { sql: 'k.centre_id IN (SELECT id FROM klay_centres WHERE org_id = ?)', binds: [staff.org_id] };
  if (staff.role === 'city') return { sql: 'k.centre_id IN (SELECT id FROM klay_centres WHERE org_id = ? AND city_id = ?)', binds: [staff.org_id, staff.city_id] };
  if (staff.role === 'coach') return { sql: 'p.coach_id = ?', binds: [staff.coach_id] };
  return { sql: 'k.centre_id = ?', binds: [staff.centre_id] };
}
async function bookingRows(env, staff, url) {
  const sc = bookingScope(staff);
  const q = url.searchParams;
  const where = [sc.sql, "k.status IN ('confirmed','cancelled')"]; const binds = [...sc.binds];
  if (q.get('status')) { where.push('k.status = ?'); binds.push(q.get('status')); }
  if (q.get('programme_id')) { where.push('k.programme_id = ?'); binds.push(q.get('programme_id')); }
  if (q.get('centre_id')) { where.push('k.centre_id = ?'); binds.push(q.get('centre_id')); }
  const rows = await all(env, `
    SELECT k.*, p.name AS programme, c.name AS centre, ci.name AS city, b.days, b.start_time, b.end_time, pl.label AS plan,
      (SELECT GROUP_CONCAT(level_code) FROM klay_level_awards a WHERE a.booking_id = k.id) AS levels
    FROM klay_bookings k JOIN klay_programmes p ON p.id = k.programme_id JOIN klay_centres c ON c.id = k.centre_id
    JOIN klay_cities ci ON ci.id = k.city_id JOIN klay_batches b ON b.id = k.batch_id JOIN klay_plans pl ON pl.id = k.plan_id
    WHERE ${where.join(' AND ')} ORDER BY k.created_at DESC LIMIT 1000`, ...binds);
  // Coaches see only the child's first name and the class (role-limited access).
  return rows.map((r) => {
    const out = { ...r, schedule: `${daysLabel(r.days)} · ${timeRange(r.start_time, r.end_time)}`, levels: r.levels ? r.levels.split(',') : [] };
    if (staff.role === 'coach') { out.parent_phone = null; out.parent_email = null; out.parent_name = null; out.amount = null; out.razorpay_payment_id = null; }
    return out;
  });
}
export const listBookings = withStaff(async (request, env, staff) => ok({ bookings: await bookingRows(env, staff, new URL(request.url)) }));

const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const exportBookings = withStaff(async (request, env, staff) => {
  const rows = await bookingRows(env, staff, new URL(request.url));
  const cols = [['reference', 'Reference'], ['created_at', 'Booked at'], ['status', 'Status'], ['city', 'City'], ['centre', 'Centre'], ['programme', 'Club'], ['schedule', 'Batch'],
    ['plan', 'Plan'], ['amount', 'Amount (INR)'], ['child_name', 'Child'], ['child_age', 'Age'], ['parent_name', 'Parent'], ['parent_phone', 'Phone'], ['parent_email', 'Email'], ['levels', 'Levels']];
  const csv = [cols.map((c) => c[1]).join(','), ...rows.map((r) => cols.map(([k]) => csvCell(Array.isArray(r[k]) ? r[k].join(' ') : r[k])).join(','))].join('\n');
  await audit(env, staff, 'bookings.export', 'bookings', null, { rows: rows.length });
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="klay-bookings-${new Date().toISOString().slice(0, 10)}.csv"`, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' } });
}, ['hq', 'city', 'centre']);

export const cancelBooking = withStaff(async (request, env, staff, id) => {
  const k = await first(env, 'SELECT * FROM klay_bookings WHERE id = ?', id);
  if (!k || !(await canEditCentre(env, staff, k.centre_id))) return fail('Booking not found', 404);
  if (k.status !== 'confirmed') return fail('Only confirmed bookings can be cancelled');
  await run(env, "UPDATE klay_bookings SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE id = ?", nowIso(), nowIso(), id);
  await audit(env, staff, 'booking.cancel', 'booking', id, { reference: k.reference, note: 'Refund, if any, is handled from the Razorpay dashboard' });
  return ok();
}, ['hq', 'city', 'centre']);

// POST /api/klay/console/bookings/:id/levels { level_code } — award a level + certificate
export const awardLevel = withStaff(async (request, env, staff, id) => {
  const k = await first(env, 'SELECT k.*, p.coach_id, cl.levels FROM klay_bookings k JOIN klay_programmes p ON p.id = k.programme_id JOIN klay_clubs cl ON cl.id = p.club_id WHERE k.id = ?', id);
  if (!k) return fail('Booking not found', 404);
  const allowed = staff.role === 'coach' ? k.coach_id === staff.coach_id : await canEditCentre(env, staff, k.centre_id);
  if (!allowed) return fail('Booking not found', 404);
  if (k.status !== 'confirmed') return fail('Only confirmed students can be awarded a level');
  const b = await body(request);
  const lvl = parseJson(k.levels, []).find((l) => l.code === b.level_code);
  if (!lvl) return fail('Pick a level');
  const no = `KLAY-C-${shortCode(8)}`;
  try {
    await run(env, 'INSERT INTO klay_level_awards (id, booking_id, programme_id, level_code, level_name, certificate_no, awarded_by, awarded_at) VALUES (?,?,?,?,?,?,?,?)',
      newId('kla'), id, k.programme_id, lvl.code, lvl.name, no, staff.id, nowIso());
  } catch { return fail('This level is already awarded', 409); }
  await audit(env, staff, 'level.award', 'booking', id, { level: lvl.code, certificate_no: no });
  return ok({ certificate_no: no });
});

export const listWaitlist = withStaff(async (request, env, staff) => {
  const sc = centreScopeSql(staff);
  const rows = await all(env, `SELECT w.*, p.name AS programme, c.name AS centre, b.days, b.start_time, b.end_time FROM klay_waitlist w
    JOIN klay_programmes p ON p.id = w.programme_id JOIN klay_centres c ON c.id = p.centre_id JOIN klay_batches b ON b.id = w.batch_id
    WHERE ${sc.sql} AND w.status = 'waiting' ORDER BY w.created_at`, ...sc.binds);
  return ok({ waitlist: rows.map((r) => ({ ...r, schedule: `${daysLabel(r.days)} · ${timeRange(r.start_time, r.end_time)}` })) });
}, ['hq', 'city', 'centre']);

export const updateWaitlist = withStaff(async (request, env, staff, id) => {
  const w = await first(env, 'SELECT w.*, p.centre_id FROM klay_waitlist w JOIN klay_programmes p ON p.id = w.programme_id WHERE w.id = ?', id);
  if (!w || !(await canEditCentre(env, staff, w.centre_id))) return fail('Not found', 404);
  const b = await body(request);
  if (!['notified', 'converted', 'removed'].includes(b.status)) return fail('Unknown status');
  await run(env, 'UPDATE klay_waitlist SET status = ? WHERE id = ?', b.status, id);
  await audit(env, staff, 'waitlist.update', 'waitlist', id, { status: b.status });
  return ok();
}, ['hq', 'city', 'centre']);

// ------------------------------------------------------------ revenue
export const revenue = withStaff(async (request, env, staff) => {
  const sc = bookingScope(staff);
  const rows = await all(env, `SELECT substr(k.confirmed_at, 1, 7) AS month, c.name AS centre, COUNT(*) AS bookings, SUM(k.amount) AS amount
    FROM klay_bookings k JOIN klay_programmes p ON p.id = k.programme_id JOIN klay_centres c ON c.id = k.centre_id
    WHERE ${sc.sql} AND k.status = 'confirmed' GROUP BY month, c.name ORDER BY month DESC`, ...sc.binds);
  const total = rows.reduce((n, r) => n + (r.amount || 0), 0);
  return ok({ rows, total });
}, ['hq', 'city', 'centre']);

// ------------------------------------------------------------ staff & cities (HQ / City)
export const listStaff = withStaff(async (request, env, staff) => {
  const where = staff.role === 'hq' ? 's.org_id = ?' : "s.org_id = ? AND s.city_id = ? AND s.role IN ('centre','coach')";
  const rows = await all(env, `SELECT s.*, ci.name AS city_name, c.name AS centre_name FROM klay_staff s LEFT JOIN klay_cities ci ON ci.id = s.city_id LEFT JOIN klay_centres c ON c.id = s.centre_id WHERE ${where} ORDER BY s.role, s.name`, ...(staff.role === 'hq' ? [staff.org_id] : [staff.org_id, staff.city_id]));
  return ok({ staff: rows.map((r) => ({ ...publicStaff(r), role_label: ROLE_LABEL[r.role] })) });
}, ['hq', 'city']);

export const createStaff = withStaff(async (request, env, staff) => {
  const b = await body(request);
  const role = String(b.role || '');
  const allowedRoles = staff.role === 'hq' ? ['city', 'centre', 'coach'] : ['centre', 'coach'];
  if (!allowedRoles.includes(role)) return fail('You cannot create this kind of account', 403);
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return fail('Enter a valid email');
  if (String(b.name || '').trim().length < 2) return fail('Enter a name');
  if (String(b.password || '').length < 8) return fail('Password must be at least 8 characters');
  const phone = String(b.phone || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  if (!/^[6-9]\d{9}$/.test(phone)) return fail('Enter a valid 10-digit mobile number (used for Phone OTP login)');
  if (await first(env, 'SELECT id FROM klay_staff WHERE email = ?', email)) return fail('This email already has an account', 409);
  if (await first(env, 'SELECT id FROM klay_staff WHERE phone = ?', phone)) return fail('This mobile number already has an account', 409);
  if (await first(env, 'SELECT id FROM providers WHERE phone = ? OR phone = ? OR email = ?', phone, `+91${phone}`, email)) {
    return fail('This mobile or email is already a Kuddl partner account — use a different one for this team member', 409);
  }
  const org = await first(env, 'SELECT max_users FROM klay_orgs WHERE id = ?', staff.org_id);
  const used = (await first(env, "SELECT COUNT(*) AS n FROM klay_staff WHERE org_id = ? AND role != 'hq' AND status = 'active'", staff.org_id)).n;
  if (org && used >= org.max_users) return fail(`Your plan includes ${org.max_users} team logins and all are in use. Disable one, or ask Kuddl to upgrade your plan.`, 403, { limit: 'users' });
  let cityId = null, centreId = null, coachId = null;
  if (role === 'city') {
    cityId = b.city_id;
    if (!(await first(env, 'SELECT id FROM klay_cities WHERE id = ?', cityId || ''))) return fail('Pick a city');
  }
  if (role === 'centre' || role === 'coach') {
    const c = await first(env, 'SELECT id, city_id FROM klay_centres WHERE id = ?', b.centre_id || '');
    if (!c || !(await canSeeCentre(env, staff, c.id))) return fail('Pick a centre');
    centreId = c.id; cityId = c.city_id;
  }
  if (role === 'coach') {
    const co = await first(env, 'SELECT id FROM klay_coaches WHERE id = ? AND centre_id = ?', b.coach_id || '', centreId);
    if (!co) return fail('Pick the coach this login belongs to');
    coachId = co.id;
  }
  const id = newId('kst'); const t = nowIso();
  await run(env, 'INSERT INTO klay_staff (id, name, email, phone, role, city_id, centre_id, coach_id, password_hash, status, created_at, updated_at, org_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    id, String(b.name).trim(), email, phone, role, cityId, centreId, coachId, await hashPassword(String(b.password)), 'active', t, t, staff.org_id);
  await audit(env, staff, 'staff.create', 'staff', id, { role, email });
  return ok({ id });
}, ['hq', 'city']);

export const updateStaff = withStaff(async (request, env, staff, id) => {
  const s = await first(env, 'SELECT * FROM klay_staff WHERE id = ?', id);
  if (!s || s.org_id !== staff.org_id || s.role === 'hq' || (staff.role === 'city' && (s.city_id !== staff.city_id || s.role === 'city'))) return fail('Not found', 404);
  if (s.id === staff.id) return fail('You cannot change your own account here');
  const b = await body(request);
  if (b.status === 'active' && s.status !== 'active') {
    const org = await first(env, 'SELECT max_users FROM klay_orgs WHERE id = ?', staff.org_id);
    const used = (await first(env, "SELECT COUNT(*) AS n FROM klay_staff WHERE org_id = ? AND role != 'hq' AND status = 'active'", staff.org_id)).n;
    if (org && used >= org.max_users) return fail(`All ${org.max_users} team logins on your plan are in use.`, 403, { limit: 'users' });
  }
  if (b.status && ['active', 'disabled'].includes(b.status)) await run(env, 'UPDATE klay_staff SET status = ?, updated_at = ? WHERE id = ?', b.status, nowIso(), id);
  if (b.password) {
    if (String(b.password).length < 8) return fail('Password must be at least 8 characters');
    await run(env, 'UPDATE klay_staff SET password_hash = ?, updated_at = ? WHERE id = ?', await hashPassword(String(b.password)), nowIso(), id);
  }
  await audit(env, staff, 'staff.update', 'staff', id, { status: b.status, password_reset: !!b.password });
  return ok();
}, ['hq', 'city']);

export const listCities = withStaff(async (request, env, staff) => {
  const rows = await all(env, `SELECT ci.*, (SELECT COUNT(*) FROM klay_centres c WHERE c.city_id = ci.id AND c.status = 'live') AS live_centres FROM klay_cities ci ORDER BY ci.sort_order, ci.name`);
  return ok({ cities: staff.role === 'hq' ? rows : rows.filter((r) => r.id === staff.city_id) });
});

export const createCity = withStaff(async (request, env, staff) => {
  const b = await body(request);
  const name = String(b.name || '').trim();
  if (name.length < 2) return fail('Enter the city name');
  const slug = slugify(name);
  if (await first(env, 'SELECT id FROM klay_cities WHERE slug = ?', slug)) return fail('This city already exists', 409);
  const id = newId('kcy'); const t = nowIso();
  await run(env, 'INSERT INTO klay_cities (id, slug, name, state, status, sort_order, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)', id, slug, name, b.state || null, 'hidden', 50, t, t);
  await audit(env, staff, 'city.create', 'city', id, { name });
  return ok({ id });
}, ['hq']);

export const listClubs = withStaff(async (request, env) => ok({ clubs: (await all(env, 'SELECT * FROM klay_clubs ORDER BY sort_order, name')).map((c) => ({ ...c, levels: parseJson(c.levels, []) })) }));

export const createClub = withStaff(async (request, env, staff) => {
  const b = await body(request);
  const name = String(b.name || '').trim();
  if (name.length < 2) return fail('Enter the club name');
  const slug = slugify(name);
  if (await first(env, 'SELECT id FROM klay_clubs WHERE slug = ?', slug)) return fail('This club already exists', 409);
  const levels = Array.isArray(b.levels) && b.levels.length ? b.levels : [{ code: 'L1', name: 'Explorer' }, { code: 'L2', name: 'Builder' }, { code: 'L3', name: 'Achiever' }, { code: 'SHOW', name: 'Showcase' }];
  const id = newId('kcl'); const t = nowIso();
  await run(env, 'INSERT INTO klay_clubs (id, slug, name, category_label, category_group, tagline, color, icon, levels, levels_note, sort_order, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    id, slug, name, b.category_label || name.toUpperCase(), b.category_group || null, b.tagline || null, b.color || '#7A8F9C', b.icon || 'star', JSON.stringify(levels), b.levels_note || null, 50, t, t);
  await audit(env, staff, 'club.create', 'club', id, { name });
  return ok({ id });
}, ['hq']);

export const auditLog = withStaff(async (request, env, staff) => {
  const rows = await all(env, `SELECT a.*, s.name AS staff_name FROM klay_audit_log a LEFT JOIN klay_staff s ON s.id = a.staff_id WHERE a.org_id = ? ORDER BY a.created_at DESC LIMIT 300`, staff.org_id);
  return ok({ entries: rows.map((r) => ({ ...r, detail: parseJson(r.detail, null) })) });
}, ['hq']);

export { json };

// ------------------------------------------------------------ team phone OTP
// Same Phone OTP tab as every partner. The login page first asks /otp/check;
// a KLAY team number then sends/verifies here (Twilio Verify), so it never
// reaches the partner OTP flow, which would create a new partner account.
const tenDigits = (p) => String(p || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
async function teamByPhone(env, phone) {
  return first(env, `SELECT s.* FROM klay_staff s JOIN klay_orgs o ON o.id = s.org_id
    WHERE s.phone = ? AND s.role != 'hq' AND s.status = 'active' AND o.status = 'active'`, tenDigits(phone));
}
export async function otpCheck(request, env) {
  const phone = new URL(request.url).searchParams.get('phone');
  return ok({ is_klay_team: !!(await teamByPhone(env, phone)) });
}
export async function otpSend(request, env) {
  const b = await body(request);
  const s = await teamByPhone(env, b.phone);
  if (!s) return fail('This number is not on a KLAY team', 404);
  try { await new TwilioService(env).sendOTP(`+91${tenDigits(b.phone)}`); }
  catch { return fail('Could not send the OTP. Please try again.', 502); }
  return ok({ message: 'OTP sent' });
}
export async function otpVerify(request, env) {
  const b = await body(request);
  const s = await teamByPhone(env, b.phone);
  if (!s) return fail('This number is not on a KLAY team', 404);
  let res;
  try { res = await new TwilioService(env).verifyOTP(`+91${tenDigits(b.phone)}`, String(b.otp || '')); }
  catch { return fail('Could not verify the OTP. Please try again.', 502); }
  if (res?.status !== 'approved') return fail('Invalid OTP', 400);
  await run(env, 'UPDATE klay_staff SET last_login_at = ? WHERE id = ?', nowIso(), s.id);
  return ok({ token: await signStaffToken(env, s), staff: await describeStaff(env, s) });
}

// ------------------------------------------------------------ Kuddl admin: org switch
// Admin turns a normal partner account into a KLAY-model (multi-centre) org
// and sets the subscription limits. Admin token = the partner portal admin login.
async function isAdmin(request, env) {
  const h = request.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return false;
  try {
    if (!(await jwtVerify(h.slice(7), env))) return false;
    return (jwtDecode(h.slice(7))?.payload || {}).role === 'admin';
  } catch { return false; }
}
const jwtVerify = (t, env) => jwtLib.verify(t, env.JWT_SECRET);
const jwtDecode = (t) => jwtLib.decode(t);

export async function adminGetOrg(request, env, providerId) {
  if (!(await isAdmin(request, env))) return fail('Admin only', 403);
  const o = await first(env, 'SELECT * FROM klay_orgs WHERE provider_id = ?', providerId);
  if (!o) return ok({ org: null });
  const users = (await first(env, "SELECT COUNT(*) AS n FROM klay_staff WHERE org_id = ? AND role != 'hq' AND status = 'active'", o.id)).n;
  const centres = (await first(env, 'SELECT COUNT(*) AS n FROM klay_centres WHERE org_id = ?', o.id)).n;
  return ok({ org: { ...o, users_used: users, centres_used: centres } });
}

export async function adminSetOrg(request, env, providerId) {
  if (!(await isAdmin(request, env))) return fail('Admin only', 403);
  const p = await first(env, 'SELECT id, email, phone, name, business_name FROM providers WHERE id = ?', providerId);
  if (!p) return fail('Partner not found', 404);
  const b = await body(request);
  const maxUsers = Math.max(0, Math.min(1000, Math.round(Number(b.max_users ?? 5))));
  const maxCentres = Math.max(1, Math.min(1000, Math.round(Number(b.max_centres ?? 1))));
  const name = String(b.name || p.business_name || 'KLAY').trim().slice(0, 80);
  const t = nowIso();
  let o = await first(env, 'SELECT * FROM klay_orgs WHERE provider_id = ?', providerId);
  if (!o) {
    o = { id: newId('korg') };
    await run(env, `INSERT INTO klay_orgs (id, provider_id, name, brand_name, status, plan_label, max_users, max_centres, enabled_by, enabled_at, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, o.id, providerId, name, b.brand_name || null, b.enabled === false ? 'disabled' : 'active',
      b.plan_label || null, maxUsers, maxCentres, 'admin', t, t, t);
  } else {
    await run(env, 'UPDATE klay_orgs SET name = ?, brand_name = COALESCE(?, brand_name), status = ?, plan_label = ?, max_users = ?, max_centres = ?, updated_at = ? WHERE id = ?',
      name, b.brand_name || null, b.enabled === false ? 'disabled' : 'active', b.plan_label || null, maxUsers, maxCentres, t, o.id);
  }
  // The HQ row that maps the partner account into the KLAY console.
  const hq = await first(env, "SELECT id FROM klay_staff WHERE provider_id = ? AND role = 'hq'", providerId);
  if (!hq) {
    const hqName = p.name || name;
    // Unusable random password: HQ always signs in through the partner login.
    const randomPw = [...crypto.getRandomValues(new Uint8Array(24))].map((x) => x.toString(16)).join('');
    await run(env, `INSERT INTO klay_staff (id, name, email, phone, role, password_hash, status, created_at, updated_at, org_id, provider_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`, newId('kst'), hqName, p.email || `${providerId}@partner.kuddl`, null, 'hq',
      await hashPassword(randomPw), 'active', t, t, o.id, providerId);
  }
  return adminGetOrg(request, env, providerId);
}
