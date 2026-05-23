// Service Type Registry Controller
// Single source of truth for the 18 partner service types.
// v3.0 (Apr 2026): adds title_placeholder, pricing_units, and category-block expansion.

import { addCorsHeaders } from '../utils/cors.js';
import {
  CATEGORY_BLOCKS,
  PRICING_UNIT_CATALOGUE,
  TRIAL_TOGGLE_SERVICE_TYPES,
  SERVICE_AREA_ZONES,
  AGE_BRACKETS
} from '../config/categoryBlocks.js';

const json = (body, status = 200) =>
  addCorsHeaders(new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  }));

const safeParseJson = (str, fallback) => {
  try { return JSON.parse(str); } catch { return fallback; }
};

const parseRow = (row) => ({
  id: row.id,
  label: row.label,
  category: row.category,
  title_placeholder: row.title_placeholder || '',
  description_placeholder: row.description_placeholder || '',
  pricing_units: row.pricing_units ? safeParseJson(row.pricing_units, []) : [],
  fields: row.fields_config ? safeParseJson(row.fields_config, {}) : {},
  search_keywords: row.search_keywords ? safeParseJson(row.search_keywords, []) : [],
  sort_order: row.sort_order ?? 0
});

// Expand a registry row into the full config the Add Service form consumes:
//   - 9 universal core fields (driven by frontend, but pricing-unit options come from registry)
//   - category-specific blocks (canonical in CATEGORY_BLOCKS)
//   - trial toggle visibility flag (per spec Deliverable 5)
const expandConfig = (row) => {
  const base = parseRow(row);
  const blocks = CATEGORY_BLOCKS[base.category] || [];

  const pricingUnitOptions = base.pricing_units
    .map((value) => {
      const meta = PRICING_UNIT_CATALOGUE[value];
      return meta ? { value, label: meta.label, hint: meta.hint } : null;
    })
    .filter(Boolean);

  return {
    ...base,
    blocks,
    pricing_unit_options: pricingUnitOptions,
    show_trial_toggle: TRIAL_TOGGLE_SERVICE_TYPES.has(base.id),
    age_brackets: AGE_BRACKETS,
    service_area_zones: SERVICE_AREA_ZONES
  };
};

// GET /api/service-types/search?q=
export const searchServiceTypes = async (request, env) => {
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();

    const result = await env.KUDDL_DB.prepare(
      `SELECT * FROM service_type_registry WHERE is_active = 1 ORDER BY sort_order ASC, label ASC`
    ).all();
    const rows = (result.results || []).map(parseRow);

    if (!q) {
      return json({ success: true, data: rows.slice(0, 8) });
    }

    const prefix = [];
    const substring = [];
    const keyword = [];

    for (const row of rows) {
      const label = row.label.toLowerCase();
      if (label.startsWith(q)) {
        prefix.push(row);
      } else if (label.includes(q)) {
        substring.push(row);
      } else if (row.search_keywords.some((k) => String(k).toLowerCase().includes(q))) {
        keyword.push(row);
      }
    }

    const merged = [...prefix, ...substring, ...keyword].slice(0, 8);
    return json({ success: true, data: merged });
  } catch (error) {
    console.error('searchServiceTypes error:', error);
    return json({ success: false, message: 'Failed to search service types', error: error.message }, 500);
  }
};

// GET /api/service-types — full list (lite, no blocks expansion).
export const listServiceTypes = async (request, env) => {
  try {
    const url = new URL(request.url);
    const category = url.searchParams.get('category');

    let query = `SELECT * FROM service_type_registry WHERE is_active = 1`;
    const binds = [];
    if (category) {
      query += ` AND category = ?`;
      binds.push(category.toLowerCase());
    }
    query += ` ORDER BY sort_order ASC, label ASC`;

    const result = await env.KUDDL_DB.prepare(query).bind(...binds).all();
    const rows = (result.results || []).map(parseRow);
    return json({ success: true, data: rows });
  } catch (error) {
    console.error('listServiceTypes error:', error);
    return json({ success: false, message: 'Failed to list service types', error: error.message }, 500);
  }
};

// GET /api/service-types/:id/config — fully expanded config for the Add Service form.
export const getServiceTypeConfig = async (request, env) => {
  try {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const id = parts[parts.length - 2] === 'service-types' ? parts[parts.length - 1] : parts[parts.length - 2];

    const row = await env.KUDDL_DB.prepare(
      `SELECT * FROM service_type_registry WHERE id = ? AND is_active = 1`
    ).bind(id).first();

    if (!row) {
      return json({ success: false, message: 'Service type not found' }, 404);
    }

    return json({ success: true, data: expandConfig(row) });
  } catch (error) {
    console.error('getServiceTypeConfig error:', error);
    return json({ success: false, message: 'Failed to load service type config', error: error.message }, 500);
  }
};

// POST /api/service-types/setup — creates the table, runs the seed, ensures new columns, adds providers.service_types.
export const setupServiceTypeRegistry = async (request, env) => {
  try {
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS service_type_registry (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        category TEXT NOT NULL,
        title_placeholder TEXT,
        description_placeholder TEXT,
        pricing_units TEXT,
        fields_config TEXT,
        search_keywords TEXT,
        is_active BOOLEAN DEFAULT true,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await env.KUDDL_DB.prepare(
      `CREATE INDEX IF NOT EXISTS idx_service_type_registry_category ON service_type_registry(category)`
    ).run();
    await env.KUDDL_DB.prepare(
      `CREATE INDEX IF NOT EXISTS idx_service_type_registry_active ON service_type_registry(is_active)`
    ).run();

    // Add columns introduced in v3 if missing.
    for (const col of ['title_placeholder TEXT', 'pricing_units TEXT']) {
      try {
        await env.KUDDL_DB.prepare(`ALTER TABLE service_type_registry ADD COLUMN ${col}`).run();
      } catch (e) { /* already exists */ }
    }

    // Add service_types column to providers if missing.
    try {
      await env.KUDDL_DB.prepare(`ALTER TABLE providers ADD COLUMN service_types TEXT`).run();
    } catch (e) { /* already exists */ }

    return json({ success: true, message: 'service_type_registry ready. Run the seed SQL next.' });
  } catch (error) {
    console.error('setupServiceTypeRegistry error:', error);
    return json({ success: false, message: 'Setup failed', error: error.message }, 500);
  }
};

// Maps category code → ABCD category label stored on providers.service_categories (comma-separated).
export const CATEGORY_LABEL = {
  adventure: 'Adventure',
  bloom: 'Bloom',
  care: 'Care',
  discover: 'Discover'
};

// Helper used by registration flow to compute ABCD tags from selected service type IDs.
export const deriveCategoriesFromServiceTypes = async (env, serviceTypeIds) => {
  if (!serviceTypeIds || serviceTypeIds.length === 0) return [];
  const placeholders = serviceTypeIds.map(() => '?').join(',');
  const result = await env.KUDDL_DB.prepare(
    `SELECT DISTINCT category FROM service_type_registry WHERE id IN (${placeholders}) AND is_active = 1`
  ).bind(...serviceTypeIds).all();
  const rows = result.results || [];
  return rows.map((r) => CATEGORY_LABEL[r.category]).filter(Boolean);
};
