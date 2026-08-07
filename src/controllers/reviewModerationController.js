/**
 * Review moderation — Care partner reviews are HELD for approval before they
 * publish or count toward a rating (Customer §07.4 / Partner Screen G rule 4).
 * Non-Care reviews stay auto-approved. Only 'approved' reviews feed the average.
 *
 * GET/POST /api/admin/migrate/review-status-column   (idempotent)
 * POST     /api/admin/reviews/:id/approve
 */

import { addCorsHeaders } from '../utils/cors.js';

const json = (body, status = 200) =>
  addCorsHeaders(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

export async function ensureReviewStatusColumn(request, env) {
  try {
    // Create the table if it's missing (some envs never had it), with status.
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS customer_reviews (
        id TEXT PRIMARY KEY,
        customer_id TEXT,
        provider_id TEXT,
        booking_id TEXT,
        rating REAL,
        review_text TEXT,
        status TEXT DEFAULT 'approved',
        created_at TEXT DEFAULT (datetime('now'))
      )
    `).run();
    // Add the column for pre-existing tables (no-op if already present).
    try {
      await env.KUDDL_DB.prepare("ALTER TABLE customer_reviews ADD COLUMN status TEXT DEFAULT 'approved'").run();
    } catch (e) {
      if (!String(e.message || '').toLowerCase().includes('duplicate column name')) throw e;
    }
    return json({ success: true, message: 'customer_reviews table + status ensured' });
  } catch (error) {
    console.error('❌ ensureReviewStatusColumn error:', error);
    return json({ success: false, message: 'Failed to ensure review status column', error: error.message }, 500);
  }
}

/** True when the provider offers any Care service (has care_pricing). */
export async function isCareProvider(env, providerId) {
  try {
    const row = await env.KUDDL_DB.prepare(
      'SELECT COUNT(*) AS n FROM services WHERE provider_id = ? AND care_pricing IS NOT NULL'
    ).bind(providerId).first();
    return (row?.n || 0) > 0;
  } catch {
    return false;
  }
}

/** Recompute a provider's average_rating from APPROVED reviews only. */
export async function recomputeProviderRating(env, providerId) {
  const res = await env.KUDDL_DB.prepare(
    "SELECT AVG(rating) AS avg_rating, COUNT(*) AS n FROM customer_reviews WHERE provider_id = ? AND COALESCE(status,'approved') = 'approved'"
  ).bind(providerId).first().catch(() => null);
  await env.KUDDL_DB.prepare('UPDATE providers SET average_rating = ?, total_reviews = ? WHERE id = ?')
    .bind(res?.avg_rating ?? null, res?.n || 0, providerId).run().catch(() => {});
  return { average: res?.avg_rating ?? null, count: res?.n || 0 };
}

export async function approveReview(request, env) {
  try {
    const id = new URL(request.url).pathname.split('/').slice(-2)[0]; // /reviews/:id/approve
    const review = await env.KUDDL_DB.prepare('SELECT * FROM customer_reviews WHERE id = ?').bind(id).first();
    if (!review) return json({ success: false, message: 'Review not found' }, 404);

    await env.KUDDL_DB.prepare("UPDATE customer_reviews SET status = 'approved' WHERE id = ?").bind(id).run();
    const rating = await recomputeProviderRating(env, review.provider_id);
    return json({ success: true, message: 'Review approved', rating });
  } catch (error) {
    console.error('approveReview error:', error);
    return json({ success: false, message: 'Failed to approve review', error: error.message }, 500);
  }
}
