/**
 * Adventure service (parties) — the customer read API.
 * Fetches the raw service + provider, parses the `adventure_pricing` JSON, and
 * returns EXACTLY what a parent sees (real values only; incomplete listings
 * flagged, never rendered blank). Parties have NO batches.
 *
 * GET /api/adventure/service/:id
 * GET /api/adventure/services[?subcategory=magician]
 */

import { addCorsHeaders } from '../utils/cors.js';
import { assembleAdventure } from '../utils/adventureShape.js';

const json = (body, status = 200) =>
  addCorsHeaders(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

function parseJson(val, fallback) {
  if (val == null) return fallback;
  if (typeof val !== 'string') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

/**
 * Pure mapper: raw DB rows → assembleAdventure() input. Everything party-shaped
 * (variants, add-ons, setup questions, ages/capacity/space) lives inside the
 * single `adventure_pricing` JSON — kept separate so it's unit-testable.
 */
export function mapRowsToAdventureRaw(serviceRow = {}, providerRow = {}) {
  const ap = parseJson(serviceRow.adventure_pricing, {}) || {};
  return {
    service: {
      id: serviceRow.id,
      name: serviceRow.name,
      subcategory_label: serviceRow.subcategory_label,
      primary_image_url: serviceRow.primary_image_url,
      gallery_images: parseJson(serviceRow.image_urls, []),
      locality: serviceRow.city,
      created_at: serviceRow.created_at,
    },
    provider: {
      business_name: providerRow.business_name,
      experience_years: providerRow.experience_years,
      city: providerRow.city,
      area: providerRow.area,
      cancellation_policy: providerRow.cancellation_policy,
    },
    variants: ap.variants || [],
    add_ons: ap.add_ons || [],
    setup_questions: ap.setup_questions || [],
    service_type: ap.service_type,
    type_details: ap.type_details,
    travel_included: ap.travel_included,
    travel_radius_km: ap.travel_radius_km,
    age_min: ap.age_min,
    age_max: ap.age_max,
    capacity: ap.capacity,
    space: ap.space,
    review_count: providerRow.total_reviews || serviceRow.review_count || 0,
    rating: providerRow.average_rating,
  };
}

export async function getAdventureServiceDetail(request, env) {
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

    const shaped = assembleAdventure(mapRowsToAdventureRaw(service, provider));
    return json({ success: true, data: shaped });
  } catch (error) {
    console.error('getAdventureServiceDetail error:', error);
    return json({ success: false, message: 'Failed to load service', error: error.message }, 500);
  }
}

export async function getAdventureServiceList(request, env) {
  try {
    const url = new URL(request.url);
    const subcat = (url.searchParams.get('subcategory') || '').trim().toLowerCase();

    // Only Adventure services carry adventure_pricing → precise, safe filter.
    const svcRes = await env.KUDDL_DB
      .prepare("SELECT * FROM services WHERE status = 'active' AND adventure_pricing IS NOT NULL ORDER BY created_at DESC LIMIT 60")
      .all().catch(() => ({ results: [] }));
    const services = svcRes.results || [];
    if (!services.length) return json({ success: true, data: [] });

    const providerIds = [...new Set(services.map((s) => s.provider_id).filter(Boolean))];
    const providersById = {};
    if (providerIds.length) {
      const pRes = await env.KUDDL_DB
        .prepare(`SELECT * FROM providers WHERE id IN (${providerIds.map(() => '?').join(',')})`)
        .bind(...providerIds).all().catch(() => ({ results: [] }));
      for (const p of pRes.results || []) providersById[p.id] = p;
    }

    const cards = services
      .map((s) => assembleAdventure(mapRowsToAdventureRaw(s, providersById[s.provider_id] || {})))
      .filter((c) => !c.incomplete)
      .filter((c) => !subcat || String(c.subcategory || '').toLowerCase() === subcat);

    return json({ success: true, data: cards });
  } catch (error) {
    console.error('getAdventureServiceList error:', error);
    return json({ success: false, message: 'Failed to load services', error: error.message }, 500);
  }
}
