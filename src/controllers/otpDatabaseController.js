/**
 * OTP Database Controller
 * Creates database tables for OTP system and refund requests
 */

import { addCorsHeaders } from '../utils/cors.js';

// Create OTP and refund related tables
export async function createOTPTables(request, env) {
  try {
    console.log('🔧 Creating OTP and refund related tables...');

    // Create booking_otps table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS booking_otps (
        id TEXT PRIMARY KEY,
        booking_id TEXT NOT NULL,
        parent_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        otp_code TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active', -- active, used, expired
        expires_at TEXT NOT NULL,
        used_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (booking_id) REFERENCES bookings(id),
        FOREIGN KEY (parent_id) REFERENCES parents(id),
        FOREIGN KEY (provider_id) REFERENCES providers(id)
      )
    `).run();

    // Create refund_requests table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS refund_requests (
        id TEXT PRIMARY KEY,
        booking_id TEXT NOT NULL,
        parent_id TEXT NOT NULL,
        amount REAL NOT NULL,
        reason TEXT,
        status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected, processed
        requested_at TEXT NOT NULL,
        processed_at TEXT,
        processed_by TEXT,
        refund_transaction_id TEXT,
        admin_notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (booking_id) REFERENCES bookings(id),
        FOREIGN KEY (parent_id) REFERENCES parents(id)
      )
    `).run();

    // Create payout_transactions table (if not exists)
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS payout_transactions (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        booking_id TEXT NOT NULL,
        amount REAL NOT NULL,
        commission_amount REAL NOT NULL,
        gst_amount REAL NOT NULL,
        net_amount REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending', -- pending, processed, failed
        scheduled_payout_date TEXT NOT NULL,
        processed_at TEXT,
        transaction_reference TEXT,
        failure_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (provider_id) REFERENCES providers(id),
        FOREIGN KEY (booking_id) REFERENCES bookings(id)
      )
    `).run();

    // Create provider_wallets table (if not exists)
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS provider_wallets (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL UNIQUE,
        available_amount REAL NOT NULL DEFAULT 0,
        pending_amount REAL NOT NULL DEFAULT 0,
        total_earned REAL NOT NULL DEFAULT 0,
        total_withdrawn REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (provider_id) REFERENCES providers(id)
      )
    `).run();

    // Add indexes for better performance
    await env.KUDDL_DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_booking_otps_booking_id ON booking_otps(booking_id)
    `).run();

    await env.KUDDL_DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_booking_otps_otp_code ON booking_otps(otp_code)
    `).run();

    await env.KUDDL_DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_refund_requests_booking_id ON refund_requests(booking_id)
    `).run();

    await env.KUDDL_DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_refund_requests_status ON refund_requests(status)
    `).run();

    await env.KUDDL_DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_payout_transactions_provider_id ON payout_transactions(provider_id)
    `).run();

    await env.KUDDL_DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_payout_transactions_status ON payout_transactions(status)
    `).run();

    console.log('✅ OTP and refund tables created successfully');

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'OTP and refund tables created successfully',
      tables: [
        'booking_otps',
        'refund_requests', 
        'payout_transactions',
        'provider_wallets'
      ]
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Failed to create OTP tables:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to create OTP tables',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Update bookings table to support new statuses and fields
export async function updateBookingsTableForOTP(request, env) {
  try {
    console.log('🔧 Updating bookings table for OTP support...');

    // Add new columns to bookings table
    const alterQueries = [
      `ALTER TABLE bookings ADD COLUMN service_started_at TEXT`,
      `ALTER TABLE bookings ADD COLUMN parent_rating INTEGER`,
      `ALTER TABLE bookings ADD COLUMN parent_feedback TEXT`,
      `ALTER TABLE bookings ADD COLUMN cancellation_reason TEXT`,
      `ALTER TABLE bookings ADD COLUMN cancelled_by TEXT`,
      `ALTER TABLE bookings ADD COLUMN cancelled_at TEXT`
    ];

    for (const query of alterQueries) {
      try {
        await env.KUDDL_DB.prepare(query).run();
      } catch (error) {
        // Column might already exist, ignore error
        console.log(`Column might already exist: ${error.message}`);
      }
    }

    console.log('✅ Bookings table updated for OTP support');

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Bookings table updated for OTP support'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Failed to update bookings table:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to update bookings table',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}
