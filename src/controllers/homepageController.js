/**
 * Homepage rails (Customer Spec §02) — config-driven, so the team can change a
 * rail without a code release. Each rail = { title, subtitle, service_ids[],
 * sort_order }. Max 4 active rails. Resolves the ids to lightweight cards.
 *
 * GET /api/homepage/rails
 * GET/POST /api/admin/migrate/homepage-rails-table   (idempotent + seeds 2)
 */

import { addCorsHeaders } from '../utils/cors.js';
import { generateId } from '../utils/helpers.js';

const json = (body, status = 200) =>
  addCorsHeaders(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

function parseJson(v, f) { try { return typeof v === 'string' ? JSON.parse(v) : (v || f); } catch { return f; } }

export async function ensureHomepageRailsTable(request, env) {
  try {
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS homepage_rails (
        id TEXT PRIMARY KEY,
        title TEXT,
        subtitle TEXT,
        service_ids TEXT,
        sort_order INTEGER DEFAULT 0,
        active INTEGER DEFAULT 1,
        created_at TEXT,
        updated_at TEXT
      )
    `).run();

    // Seed two starter rails only if the table is empty (idempotent).
    const count = await env.KUDDL_DB.prepare('SELECT COUNT(*) AS n FROM homepage_rails').first();
    if ((count?.n || 0) === 0) {
      const now = new Date().toISOString();
      const seed = [
        { title: 'Trials near you', subtitle: 'Classes offering a trial, nearest first', ids: ['svc_bloom_demo_1'], sort: 1 },
        { title: 'This weekend', subtitle: 'Date-relevant parties & events', ids: ['svc_adv_demo_1'], sort: 2 },
      ];
      for (const r of seed) {
        await env.KUDDL_DB.prepare(
          'INSERT INTO homepage_rails (id, title, subtitle, service_ids, sort_order, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)'
        ).bind(generateId(), r.title, r.subtitle, JSON.stringify(r.ids), r.sort, now, now).run();
      }
    }
    return json({ success: true, message: 'homepage_rails table ensured (+ seeded if empty)' });
  } catch (error) {
    console.error('❌ ensureHomepageRailsTable error:', error);
    return json({ success: false, message: 'Failed to ensure homepage_rails table', error: error.message }, 500);
  }
}

export async function getHomepageRails(request, env) {
  try {
    const railsRes = await env.KUDDL_DB.prepare('SELECT * FROM homepage_rails WHERE active = 1 ORDER BY sort_order LIMIT 4')
      .all().catch(() => ({ results: [] }));
    const rails = railsRes.results || [];

    // Collect every referenced service id, resolve in one query.
    const allIds = [...new Set(rails.flatMap((r) => parseJson(r.service_ids, [])))].filter(Boolean);
    const byId = {};
    if (allIds.length) {
      const svcRes = await env.KUDDL_DB.prepare(
        `SELECT id, name, primary_image_url, price, price_type FROM services WHERE status = 'active' AND id IN (${allIds.map(() => '?').join(',')})`
      ).bind(...allIds).all().catch(() => ({ results: [] }));
      for (const s of svcRes.results || []) byId[s.id] = s;
    }

    const data = rails.map((r) => ({
      title: r.title,
      subtitle: r.subtitle,
      services: parseJson(r.service_ids, []).map((id) => byId[id]).filter(Boolean),
    })).filter((r) => r.services.length > 0); // never render an empty rail

    return json({ success: true, data });
  } catch (error) {
    console.error('getHomepageRails error:', error);
    return json({ success: false, message: 'Failed to load rails', error: error.message }, 500);
  }
}
