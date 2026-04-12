/**
 * Debug Controller
 * Debug database and OTP issues
 */

import { addCorsHeaders } from '../utils/cors.js';

export async function debugOtpTable(request, env) {
  try {
    console.log('🔍 Debugging OTP table...');

    // Check if table exists
    const tableExists = await env.KUDDL_DB.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='otp_verifications'
    `).first();

    if (!tableExists) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'otp_verifications table does not exist'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Get table schema
    const schema = await env.KUDDL_DB.prepare(`
      PRAGMA table_info(otp_verifications)
    `).all();

    // Get all records
    const records = await env.KUDDL_DB.prepare(`
      SELECT * FROM otp_verifications ORDER BY created_at DESC LIMIT 5
    `).all();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      tableExists: !!tableExists,
      schema: schema.results,
      records: records.results,
      recordCount: records.results.length
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Debug error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Debug failed',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

export async function recreateOtpTable(request, env) {
  try {
    console.log('🔧 Recreating OTP table...');

    // Drop existing table
    await env.KUDDL_DB.prepare(`DROP TABLE IF EXISTS otp_verifications`).run();

    // Create new table with correct schema
    await env.KUDDL_DB.prepare(`
      CREATE TABLE otp_verifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT NOT NULL,
        otp TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        attempts INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        used_at INTEGER
      )
    `).run();

    // Add indexes
    await env.KUDDL_DB.prepare(`
      CREATE INDEX idx_otp_verifications_phone ON otp_verifications(phone)
    `).run();

    await env.KUDDL_DB.prepare(`
      CREATE INDEX idx_otp_verifications_otp ON otp_verifications(otp)
    `).run();

    console.log('✅ OTP table recreated successfully');

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'OTP table recreated successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Recreate table error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to recreate table',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}
