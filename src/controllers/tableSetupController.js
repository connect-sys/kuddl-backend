/**
 * Table Setup Controller - Create essential tables for testing
 */

import { addCorsHeaders } from '../utils/cors.js';

export async function createEssentialTables(request, env) {
  try {
    console.log('🔧 Creating essential database tables...');
    
    // Create bookings table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS bookings (
        id TEXT PRIMARY KEY,
        service_id TEXT,
        parent_id TEXT,
        provider_id TEXT,
        booking_date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        duration_minutes INTEGER,
        special_requests TEXT,
        status TEXT DEFAULT 'pending',
        total_amount REAL NOT NULL,
        platform_fee REAL DEFAULT 0,
        provider_amount REAL NOT NULL,
        payment_status TEXT DEFAULT 'pending',
        payment_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    console.log('✅ Created bookings table');

    // Create services table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS services (
        id TEXT PRIMARY KEY,
        provider_id TEXT,
        name TEXT NOT NULL,
        category_id TEXT,
        subcategory_id TEXT,
        description TEXT,
        price_per_hour REAL,
        min_duration_hours INTEGER DEFAULT 1,
        max_duration_hours INTEGER DEFAULT 8,
        age_groups TEXT,
        languages TEXT,
        experience_years INTEGER,
        availability TEXT,
        status TEXT DEFAULT 'active',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    console.log('✅ Created services table');

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Essential tables created successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Table creation error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to create tables: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}
