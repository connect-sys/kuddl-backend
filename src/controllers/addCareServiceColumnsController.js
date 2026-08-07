/**
 * Migration — add the structured Care pricing column to `services`.
 *
 * `care_pricing` is a single JSON blob (Customer Spec §07): { session_price,
 * session_duration_minutes, packages:[{label,sessions,price}], claimed_title,
 * registration_number, age_min, age_max, mode }. The read path parses it and
 * feeds assembleCare(); the protected-title gate uses the provider's verified
 * state (never partner-typed). One additive column keeps the change low-risk.
 *
 * Idempotent. Route: GET/POST /api/admin/migrate/care-service-columns
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

export async function addCareServiceColumns(request, env) {
  try {
    const results = [];
    results.push(await addColumn(env, 'services', 'care_pricing', 'TEXT'));
    return addCorsHeaders(new Response(JSON.stringify({
      success: true, message: 'Care service columns ensured', results,
    }), { headers: { 'Content-Type': 'application/json' } }));
  } catch (error) {
    console.error('❌ Error adding care service columns:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false, message: 'Failed to add care service columns', error: error.message,
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}
