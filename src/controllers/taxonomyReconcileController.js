/**
 * Taxonomy reconciliation (Screen H migration task) — DRY-RUN BY DEFAULT.
 *
 * Brings the live `subcategories` + `services` data in line with the
 * canonical Screen-H lists:
 *   1. Rename old labels → canonical ("Tech Classes" → "Coding & Tech").
 *   2. Unpublish services under REMOVED sub-categories (planners, decorators,
 *      cakes) — Core Volume §01: deferred, not deleted.
 *   3. Unpublish Care services that must never exist (daycare/nanny/etc).
 *
 * SAFE: with no query flag it only REPORTS the plan (changes it *would* make).
 * Pass ?apply=true (or {"apply":true} in the body) to actually mutate.
 * Idempotent — re-running after apply reports an empty plan.
 *
 * Route: GET/POST /api/admin/migrate/taxonomy-reconcile[?apply=true]
 */

import { addCorsHeaders } from '../utils/cors.js';
import taxonomy from '../config/taxonomy.js';

function json(body, status = 200) {
  return addCorsHeaders(new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  }));
}

async function tableColumns(env, table) {
  try {
    const info = await env.KUDDL_DB.prepare(`PRAGMA table_info(${table})`).all();
    return (info.results || []).map((c) => c.name);
  } catch {
    return [];
  }
}

export async function reconcileTaxonomy(request, env) {
  try {
    const url = new URL(request.url);
    let apply = url.searchParams.get('apply') === 'true';
    if (!apply && request.method === 'POST') {
      try { const b = await request.json(); apply = b && b.apply === true; } catch { /* no body */ }
    }

    const subCols = await tableColumns(env, 'subcategories');
    const svcCols = await tableColumns(env, 'services');
    if (!subCols.includes('name')) return json({ success: false, message: 'subcategories table/columns not found' }, 500);

    const subs = (await env.KUDDL_DB.prepare('SELECT * FROM subcategories').all()).results || [];

    const plan = { renames: [], unpublishSubcategories: [], careForbidden: [] };
    const removedSubIds = [];

    for (const s of subs) {
      const name = s.name;
      const canonicalRename = taxonomy.SUBCATEGORY_RENAMES[String(name).trim()];
      if (canonicalRename && canonicalRename !== name) {
        plan.renames.push({ id: s.id, from: name, to: canonicalRename });
      }
      if (taxonomy.isRemovedSubcategory(name)) {
        plan.unpublishSubcategories.push({ id: s.id, name });
        removedSubIds.push(s.id);
      }
      if (taxonomy.isCareForbidden(name)) {
        plan.careForbidden.push({ id: s.id, name });
        removedSubIds.push(s.id);
      }
    }

    // Count services that would be unpublished (only if services links by subcategory_id)
    let affectedServices = 0;
    if (removedSubIds.length && svcCols.includes('subcategory_id')) {
      const placeholders = removedSubIds.map(() => '?').join(',');
      const row = await env.KUDDL_DB
        .prepare(`SELECT COUNT(*) AS n FROM services WHERE subcategory_id IN (${placeholders})`)
        .bind(...removedSubIds).first();
      affectedServices = (row && row.n) || 0;
    }

    if (!apply) {
      return json({
        success: true, dryRun: true,
        message: 'DRY RUN — no changes made. Re-run with ?apply=true to apply.',
        plan, affectedServices,
      });
    }

    // ── APPLY ──
    const applied = { renames: 0, servicesUnpublished: 0, subcategoriesDeactivated: 0 };
    for (const r of plan.renames) {
      await env.KUDDL_DB.prepare('UPDATE subcategories SET name = ? WHERE id = ?').bind(r.to, r.id).run();
      applied.renames++;
    }
    if (removedSubIds.length) {
      const placeholders = removedSubIds.map(() => '?').join(',');
      if (svcCols.includes('subcategory_id')) {
        // Unpublish — deferred, not deleted. ('inactive' is the value the live
        // services.status CHECK allows; 'archived' is rejected by the constraint.)
        const setStatus = svcCols.includes('status') ? "status = 'inactive'" : null;
        const setActive = svcCols.includes('is_active') ? 'is_active = 0' : null;
        const setClause = [setStatus, setActive].filter(Boolean).join(', ');
        if (setClause) {
          const res = await env.KUDDL_DB
            .prepare(`UPDATE services SET ${setClause} WHERE subcategory_id IN (${placeholders})`)
            .bind(...removedSubIds).run();
          applied.servicesUnpublished = (res.meta && res.meta.changes) || 0;
        }
      }
      if (subCols.includes('is_active')) {
        const res = await env.KUDDL_DB
          .prepare(`UPDATE subcategories SET is_active = 0 WHERE id IN (${placeholders})`)
          .bind(...removedSubIds).run();
        applied.subcategoriesDeactivated = (res.meta && res.meta.changes) || 0;
      }
    }

    return json({ success: true, dryRun: false, message: 'Taxonomy reconciled.', applied, plan });
  } catch (error) {
    console.error('❌ taxonomy reconcile error:', error);
    return json({ success: false, message: 'Reconcile failed', error: error.message }, 500);
  }
}
