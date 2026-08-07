/**
 * Migration — add the Partner Registration (Form 1 / Screen A) columns the
 * PRD requires but the live `providers` table lacks: a partner-level parent-
 * facing cancellation policy, Instagram/website, the Google-imported venue
 * address, and the Google place id. Latitude/longitude already have their own
 * migration (addProviderCoordinatesController) — re-run here idempotently so a
 * single call brings a DB fully up to the Screen-A shape.
 *
 * Idempotent: safe to run multiple times (each ADD COLUMN tolerates
 * "duplicate column name"). Trigger via GET/POST /api/admin/migrate/partner-prd-columns.
 */

import { addCorsHeaders } from '../utils/cors.js';

async function addColumn(env, table, column, type) {
  try {
    await env.KUDDL_DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
    return `added ${column}`;
  } catch (error) {
    if (error.message && error.message.toLowerCase().includes('duplicate column name')) {
      return `${column} already exists`;
    }
    throw error;
  }
}

export async function addPartnerPrdColumns(request, env) {
  try {
    const results = [];
    // Geocode (parent sees exact pin only after confirmation — Customer Spec §01 rule 8)
    results.push(await addColumn(env, 'providers', 'latitude', 'REAL'));
    results.push(await addColumn(env, 'providers', 'longitude', 'REAL'));
    // Google venue import (Screen A "Venue address" — auto-fills address + pin + photos)
    results.push(await addColumn(env, 'providers', 'venue_address', 'TEXT'));
    results.push(await addColumn(env, 'providers', 'google_place_id', 'TEXT'));
    // Explicit parent-facing cancellation policy (Screen A — no longer defaults to Flexible)
    // Values: flexible_24h | moderate_48h | strict_7d
    results.push(await addColumn(env, 'providers', 'cancellation_policy', 'TEXT'));
    // Instagram / website (Screen A — used by ops to build the listing; never shown to parents)
    results.push(await addColumn(env, 'providers', 'instagram_handle', 'TEXT'));

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Partner PRD columns ensured on providers table',
      results,
    }), { headers: { 'Content-Type': 'application/json' } }));
  } catch (error) {
    console.error('❌ Error adding partner PRD columns:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to add partner PRD columns',
      error: error.message,
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}
