/**
 * Care service (specialists) — the customer read API.
 * Parses the `care_pricing` JSON and returns EXACTLY what a parent sees
 * (assembleCare): person-title with the protected-title gate, hold→confirm
 * booking, NO urgency, no fake rating. Incomplete listings are flagged.
 *
 * The protected clinical title (§07.2) is gated on the PROVIDER's verified
 * state (admin-approved) + a registration number — never partner-typed.
 *
 * GET /api/care/service/:id
 * GET /api/care/services[?subcategory=speech-therapy]
 */

import { addCorsHeaders } from '../utils/cors.js';
import { assembleCare } from '../utils/careShape.js';

const json = (body, status = 200) =>
  addCorsHeaders(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

function parseJson(val, fallback) {
  if (val == null) return fallback;
  if (typeof val !== 'string') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

export function mapRowsToCareRaw(serviceRow = {}, providerRow = {}) {
  const cp = parseJson(serviceRow.care_pricing, {}) || {};
  return {
    service: {
      id: serviceRow.id,
      name: serviceRow.name,
      subcategory_label: serviceRow.subcategory_label,
      languages: serviceRow.languages,
      primary_image_url: serviceRow.primary_image_url,
      gallery_images: parseJson(serviceRow.image_urls, []),
      locality: serviceRow.city,
      mode: cp.mode,
      created_at: serviceRow.created_at,
    },
    provider: {
      business_name: providerRow.business_name,
      experience_years: providerRow.experience_years,
      city: providerRow.city,
      area: providerRow.area,
    },
    session_price: cp.session_price,
    session_duration_minutes: cp.session_duration_minutes,
    packages: cp.packages || [],
    claimed_title: cp.claimed_title,
    // Verification is authoritative from the provider record (admin-approved),
    // NOT from partner-submitted JSON — a partner cannot self-verify a title.
    credential_verified: !!providerRow.is_verified,
    registration_number: cp.registration_number,
    age_min: cp.age_min,
    age_max: cp.age_max,
    mode: cp.mode,
    confirm_window_hours: cp.confirm_window_hours,
    review_count: providerRow.total_reviews || serviceRow.review_count || 0,
    rating: providerRow.average_rating,
  };
}

export async function getCareServiceDetail(request, env) {
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

    return json({ success: true, data: assembleCare(mapRowsToCareRaw(service, provider)) });
  } catch (error) {
    console.error('getCareServiceDetail error:', error);
    return json({ success: false, message: 'Failed to load service', error: error.message }, 500);
  }
}

export async function getCareServiceList(request, env) {
  try {
    const url = new URL(request.url);
    const subcat = (url.searchParams.get('subcategory') || '').trim().toLowerCase();

    // Care services either carry structured care_pricing (current wizard) or,
    // for services created before that existed, are just tagged with the Care
    // category — assembleCare() flags them incomplete rather than silently
    // excluding them from the query entirely.
    const svcRes = await env.KUDDL_DB
      .prepare("SELECT * FROM services WHERE status = 'active' AND (care_pricing IS NOT NULL OR LOWER(category_id) LIKE '%care%') ORDER BY created_at DESC LIMIT 60")
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
      .map((s) => assembleCare(mapRowsToCareRaw(s, providersById[s.provider_id] || {})))
      .filter((c) => !c.incomplete)
      .filter((c) => !subcat || String(c.subcategory || '').toLowerCase() === subcat)
      // §07.5 — order by credential strength + experience (NOT distance).
      // Verified clinical credentials first, then more experience.
      .sort((a, b) => {
        if (a.credentialVerified !== b.credentialVerified) return a.credentialVerified ? -1 : 1;
        return (b.experienceYears || 0) - (a.experienceYears || 0);
      });

    return json({ success: true, data: cards });
  } catch (error) {
    console.error('getCareServiceList error:', error);
    return json({ success: false, message: 'Failed to load services', error: error.message }, 500);
  }
}
