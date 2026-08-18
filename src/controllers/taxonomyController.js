/**
 * Taxonomy endpoint — the single source of truth for category / sub-category
 * lists, served to BOTH the partner forms (Step-1 inheritance dropdown) and
 * the customer filters (sub-category chips). Everything comes from
 * src/config/taxonomy.js so the lists never drift between clients.
 *
 * GET /api/taxonomy                → full taxonomy
 * GET /api/taxonomy?module=BLOOM   → one module's sub-categories
 * GET /api/taxonomy?partnerModules=BLOOM,CARE → inheritance-filtered
 */

import { addCorsHeaders } from '../utils/cors.js';
import taxonomy from '../config/taxonomy.js';

export function buildTaxonomyResponse(url) {
  const params = url && url.searchParams ? url.searchParams : new URLSearchParams();
  const moduleKey = (params.get('module') || '').toUpperCase();
  const partnerModules = (params.get('partnerModules') || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  if (partnerModules.length) {
    return { success: true, subcategories: taxonomy.allowedSubcategoriesForPartner(partnerModules) };
  }
  if (moduleKey) {
    return {
      success: true,
      module: moduleKey,
      subcategories: taxonomy.SUBCATEGORIES[moduleKey] || [],
    };
  }
  return {
    success: true,
    modules: taxonomy.MODULES,
    subcategories: taxonomy.SUBCATEGORIES,
    careTitles: taxonomy.CARE_TITLES,
  };
}

export async function getTaxonomy(request, env) {
  try {
    const url = new URL(request.url);
    const moduleKey = (url.searchParams.get('module') || '').toUpperCase();
    const partnerModules = url.searchParams.get('partnerModules');

    // For a single-module customer request, serve the canonical {id, label}
    // pairs straight from the `subcategories` table — the SAME source the
    // customer cards resolve against (Build Spec v3 · C3), so a filter chip and
    // its matching cards never drift. `subcategories` (labels) stays for
    // back-compat; `items` carries the ids for id-based matching.
    if (moduleKey && !partnerModules && env && env.KUDDL_DB) {
      try {
        const res = await env.KUDDL_DB
          .prepare("SELECT id, name FROM subcategories WHERE LOWER(id) LIKE ? ORDER BY name")
          .bind(moduleKey.toLowerCase() + '_%').all();
        const rows = (res && res.results) || [];
        if (rows.length) {
          return addCorsHeaders(new Response(JSON.stringify({
            success: true,
            module: moduleKey,
            items: rows.map((r) => ({ id: r.id, label: r.name })),
            subcategories: rows.map((r) => r.name),
          }), { headers: { 'Content-Type': 'application/json' } }));
        }
      } catch { /* fall through to the static config below */ }
    }

    const body = buildTaxonomyResponse(url);
    return addCorsHeaders(new Response(JSON.stringify(body), {
      headers: { 'Content-Type': 'application/json' },
    }));
  } catch (error) {
    return addCorsHeaders(new Response(JSON.stringify({
      success: false, message: 'Failed to load taxonomy', error: error.message,
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}
