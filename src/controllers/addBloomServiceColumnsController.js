/**
 * Migration — add the structured Bloom pricing column to `services`.
 *
 * `bloom_pricing` is a single JSON blob holding the Bloom money shape
 * (Partner Mockups Screen C): { trial:{offered,price,how}, monthly_plans:[
 * {sessions_per_month,price_per_month}], registration_fee, makeup_policy }.
 * One additive column keeps the change low-risk; the read path parses it and
 * feeds assembleBloom(). Bloom BATCHES reuse the existing `batches` table
 * (Camp Architecture v2) — no new batch table.
 *
 * Idempotent. Route: GET/POST /api/admin/migrate/bloom-service-columns
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

export async function addBloomServiceColumns(request, env) {
  try {
    const results = [];
    results.push(await addColumn(env, 'services', 'bloom_pricing', 'TEXT'));
    return addCorsHeaders(new Response(JSON.stringify({
      success: true, message: 'Bloom service columns ensured', results,
    }), { headers: { 'Content-Type': 'application/json' } }));
  } catch (error) {
    console.error('❌ Error adding bloom service columns:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false, message: 'Failed to add bloom service columns', error: error.message,
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}
