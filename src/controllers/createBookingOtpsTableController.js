import { addCorsHeaders } from '../utils/cors.js';

/**
 * Create booking_otps table if it doesn't exist
 */
export async function createBookingOtpsTable(request, env) {
  try {
    console.log('🔄 Creating booking_otps table...');

    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS booking_otps (
        id TEXT PRIMARY KEY,
        booking_id TEXT NOT NULL,
        parent_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        otp_code TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT NOT NULL,
        verified_at TEXT,
        used_at TEXT,
        FOREIGN KEY (booking_id) REFERENCES bookings(id),
        FOREIGN KEY (parent_id) REFERENCES parents(id),
        FOREIGN KEY (provider_id) REFERENCES providers(id)
      )
    `).run();

    console.log('✅ booking_otps table created successfully');

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'booking_otps table created successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Error creating booking_otps table:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to create booking_otps table',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}
