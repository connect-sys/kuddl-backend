/**
 * Migration — add the structured Adventure pricing column to `services`.
 *
 * `adventure_pricing` is a single JSON blob holding the party money shape
 * (Customer Spec §05): { variants:[{label,price,note}], add_ons:[{label,price}],
 * setup_questions:[…], age_min, age_max, capacity, space }. Parties have NO
 * batches and NO monthly plans; the read path parses this and feeds
 * assembleAdventure(). One additive column keeps the change low-risk.
 *
 * Idempotent. Route: GET/POST /api/admin/migrate/adventure-service-columns
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

export async function addAdventureServiceColumns(request, env) {
  try {
    const results = [];
    results.push(await addColumn(env, 'services', 'adventure_pricing', 'TEXT'));
    return addCorsHeaders(new Response(JSON.stringify({
      success: true, message: 'Adventure service columns ensured', results,
    }), { headers: { 'Content-Type': 'application/json' } }));
  } catch (error) {
    console.error('❌ Error adding adventure service columns:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false, message: 'Failed to add adventure service columns', error: error.message,
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}
