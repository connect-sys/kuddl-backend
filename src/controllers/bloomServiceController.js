/**
 * Bloom service detail — the customer read API.
 * Fetches the raw service + provider + batches, maps them into the shape
 * assembleBloom() expects, and returns EXACTLY what a parent sees (real
 * values only; incomplete listings flagged, never rendered blank).
 *
 * GET /api/bloom/service/:id
 */

import { addCorsHeaders } from '../utils/cors.js';
import { assembleBloom } from '../utils/bloomShape.js';

const json = (body, status = 200) =>
  addCorsHeaders(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

function parseJson(val, fallback) {
  if (val == null) return fallback;
  if (typeof val !== 'string') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

/**
 * id → display name from the canonical `subcategories` table (Build Spec v3 ·
 * C3). One vocabulary: the same table feeds the customer filter chips, so a
 * service's label always equals its filter chip. Returns {} on any failure.
 */
async function loadSubcategoryNames(env, ids = []) {
  const uniq = [...new Set((ids || []).filter(Boolean))];
  if (!uniq.length) return {};
  const res = await env.KUDDL_DB
    .prepare(`SELECT id, name FROM subcategories WHERE id IN (${uniq.map(() => '?').join(',')})`)
    .bind(...uniq).all().catch(() => ({ results: [] }));
  const map = {};
  for (const r of res.results || []) map[r.id] = r.name;
  return map;
}

/**
 * Pure mapper: raw DB rows → assembleBloom() input. Kept separate so it can
 * be unit-tested without the worker/DB. Bloom batches live in the shared
 * `batches` table; their time/days/dates live inside the `schedule` JSON.
 */
export function mapRowsToBloomRaw(serviceRow = {}, providerRow = {}, batchRows = [], holidays = []) {
  const bp = parseJson(serviceRow.bloom_pricing, {}) || {};
  const feat = parseJson(serviceRow.features, {}) || {};
  const batches = (batchRows || []).map((b) => {
    const sched = parseJson(b.schedule, {}) || {};
    return {
      age_min: b.age_min,
      age_max: b.age_max,
      open_above: sched.open_above,
      time_of_day: sched.time_of_day,
      // The wizard writes `recurrence_days` (see BloomBatchStep's
      // scheduleFromBatch); `days` was a stale key that never matched, which
      // silently zeroed out every batch's derived session count.
      days: sched.recurrence_days || sched.days,
      start_time: sched.start_time,
      end_time: sched.end_time,
      start_date: sched.start_date,
      end_date: sched.end_date,
      skip_dates: sched.skip_dates || [],
      seats: b.total_seats,
      booked_count: b.booked_seats,
      mode: b.mode,
      // Legacy batches (created before bloom_pricing existed) carry their own
      // real price directly — assembleBloom() falls back to it when the
      // service has no structured monthly_plans.
      price: b.price,
      price_type: b.price_type,
      // Bloom v3 · Part A: price + frequency + class type live on the batch.
      // sessions may be null on older rows → assembleBloom falls back to the
      // service-level sessions_per_month. Per-session is derived, never stored.
      sessions_per_month: b.sessions_per_month ?? null,
      class_type: b.class_type || 'group',
      schedule_type: b.schedule_type || (b.class_type === 'solo' ? 'fixed' : 'fixed'),
    };
  });
  return {
    service: {
      id: serviceRow.id,
      name: serviceRow.name,
      mode: serviceRow.mode || (batchRows[0] && batchRows[0].mode),
      subcategory_label: serviceRow.subcategory_label,
      languages: serviceRow.languages,
      // C10 — a curated/designer thumbnail (features.curated_thumbnail_url, set
      // by admin) OVERRIDES the default AI cover per service, on card + detail.
      primary_image_url: feat.curated_thumbnail_url || serviceRow.primary_image_url,
      gallery_images: parseJson(serviceRow.image_urls, []),
      locality: serviceRow.city,
      created_at: serviceRow.created_at,
      // v3 · C1 — the 3 description boxes (what/who/why) are stored combined
      // in `description`, double-newline separated; assembleBloom splits them.
      description: serviceRow.description || null,
      // v3 · C3 — canonical sub-category id + resolved label.
      subcategory_id: serviceRow.subcategory_id || null,
    },
    provider: {
      business_name: providerRow.business_name,
      experience_years: providerRow.experience_years,
      city: providerRow.city,
      area: providerRow.area,
      cancellation_policy: providerRow.cancellation_policy,
      // Real coordinates only when the partner has set them (Google venue
      // import) — "nearest first" sorting has nothing to fabricate a
      // distance from otherwise.
      latitude: providerRow.latitude != null ? Number(providerRow.latitude) : null,
      longitude: providerRow.longitude != null ? Number(providerRow.longitude) : null,
    },
    trial: bp.trial || null,
    monthly_plans: bp.monthly_plans || [],
    registration_fee: bp.registration_fee,
    // v3 · C16 — prerequisites/inclusions render before payment.
    what_to_bring: feat.what_to_bring || bp.what_to_bring || null,
    whats_included: feat.whats_included || feat.included || bp.whats_included || null,
    batches,
    review_count: providerRow.total_reviews || serviceRow.review_count || 0,
    rating: providerRow.average_rating,
    holidays,
  };
}

/**
 * Bloom listing grid — the customer read API for Screen 2 (the 8-slot card).
 * Returns an array of assembleBloom shapes (same shape the detail uses), so the
 * card and the detail page render from ONE source of truth. Incomplete listings
 * (missing name / plan / real batch) are skipped — the grid never shows blanks.
 *
 * GET /api/bloom/services[?subcategory=dance]
 */
export async function getBloomServiceList(request, env) {
  try {
    const url = new URL(request.url);
    const subcat = (url.searchParams.get('subcategory') || '').trim().toLowerCase();

    // Bloom services either carry structured bloom_pricing (current wizard) or,
    // for services created before that existed, are just tagged with the Bloom
    // category — assembleBloom() falls back to their real batch pricing so
    // these aren't silently excluded.
    const svcRes = await env.KUDDL_DB
      .prepare("SELECT * FROM services WHERE status = 'active' AND (bloom_pricing IS NOT NULL OR LOWER(category_id) LIKE '%bloom%') ORDER BY created_at DESC LIMIT 60")
      .all().catch(() => ({ results: [] }));
    const services = svcRes.results || [];
    if (!services.length) return json({ success: true, data: [] });

    // Batch-load providers and batches (avoid N+1).
    const providerIds = [...new Set(services.map((s) => s.provider_id).filter(Boolean))];
    const serviceIds = services.map((s) => s.id);

    const providersById = {};
    if (providerIds.length) {
      const pRes = await env.KUDDL_DB
        .prepare(`SELECT * FROM providers WHERE id IN (${providerIds.map(() => '?').join(',')})`)
        .bind(...providerIds).all().catch(() => ({ results: [] }));
      for (const p of pRes.results || []) providersById[p.id] = p;
    }

    const batchesByService = {};
    if (serviceIds.length) {
      const bRes = await env.KUDDL_DB
        .prepare(`SELECT * FROM batches WHERE parent_type = 'service' AND status != 'archived' AND parent_id IN (${serviceIds.map(() => '?').join(',')})`)
        .bind(...serviceIds).all().catch(() => ({ results: [] }));
      for (const b of bRes.results || []) (batchesByService[b.parent_id] ||= []).push(b);
    }

    // Canonical sub-category label from the `subcategories` table — one shared
    // vocabulary matched by stored id (Build Spec v3 · C3), so a service's chip
    // label always equals the filter chip label.
    const subcatNameById = await loadSubcategoryNames(env, services.map((s) => s.subcategory_id));

    const cards = services
      .map((s) => {
        if (s.subcategory_id && subcatNameById[s.subcategory_id]) s.subcategory_label = subcatNameById[s.subcategory_id];
        const raw = mapRowsToBloomRaw(s, providersById[s.provider_id] || {}, batchesByService[s.id] || []);
        return assembleBloom(raw);
      })
      // Grid shows only render-ready listings; incomplete ones are flagged
      // elsewhere for ops, never shown blank to a parent.
      .filter((c) => !c.incomplete)
      .filter((c) => !subcat || String(c.subcategory || '').toLowerCase() === subcat);

    return json({ success: true, data: cards });
  } catch (error) {
    console.error('getBloomServiceList error:', error);
    return json({ success: false, message: 'Failed to load services', error: error.message }, 500);
  }
}

export async function getBloomServiceDetail(request, env) {
  try {
    const id = new URL(request.url).pathname.split('/').pop();
    if (!id) return json({ success: false, message: 'service id required' }, 400);

    const service = await env.KUDDL_DB
      .prepare('SELECT * FROM services WHERE id = ? AND status = ?')
      .bind(id, 'active').first();
    if (!service) return json({ success: false, message: 'Service not found' }, 404);

    const provider = await env.KUDDL_DB
      .prepare('SELECT * FROM providers WHERE id = ?')
      .bind(service.provider_id).first() || {};

    const batchesRes = await env.KUDDL_DB
      .prepare("SELECT * FROM batches WHERE parent_type = 'service' AND parent_id = ? AND status != 'archived'")
      .bind(id).all().catch(() => ({ results: [] }));

    // Canonical sub-category label (C3).
    if (service.subcategory_id) {
      const names = await loadSubcategoryNames(env, [service.subcategory_id]);
      if (names[service.subcategory_id]) service.subcategory_label = names[service.subcategory_id];
    }

    const raw = mapRowsToBloomRaw(service, provider, batchesRes.results || []);
    const shaped = assembleBloom(raw);

    // Honour the "no blanks" rule — an incomplete listing is flagged, not hidden
    // here (ops needs to see it); the customer clients skip incomplete ones.
    return json({ success: true, data: shaped });
  } catch (error) {
    console.error('getBloomServiceDetail error:', error);
    return json({ success: false, message: 'Failed to load service', error: error.message }, 500);
  }
}
