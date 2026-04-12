/**
 * Profile Progress Database Controller
 * Handles database table creation for profile progress tracking
 */

import { addCorsHeaders } from '../utils/cors.js';

/**
 * Create profile_progress table
 * POST /api/database/create-profile-progress-table
 */
export async function createProfileProgressTable(request, env) {
  try {
    // Create profile_progress table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS profile_progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT NOT NULL UNIQUE,
        progress_data TEXT NOT NULL,
        last_completed_step INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // Create index on phone for faster lookups
    await env.KUDDL_DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_profile_progress_phone 
      ON profile_progress(phone)
    `).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Profile progress table created successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Create profile progress table error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to create profile progress table',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

/**
 * Check if profile_progress table exists
 * GET /api/database/check-profile-progress-table
 */
export async function checkProfileProgressTable(request, env) {
  try {
    const result = await env.KUDDL_DB.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='profile_progress'
    `).first();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      exists: !!result,
      message: result ? 'Table exists' : 'Table does not exist'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Check profile progress table error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to check table',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}
