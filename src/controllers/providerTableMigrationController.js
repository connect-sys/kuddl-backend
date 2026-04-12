/**
 * Provider Table Migration Controller - Remove specified columns
 */

import { addCorsHeaders } from '../utils/cors.js';

export async function restructureProviderTable(request, env) {
  try {
    console.log('🔧 Starting provider table restructuring...');

    // List of columns to remove
    const columnsToRemove = [
      'pan_card_url',
      'aadhaar_card_url', 
      'profile_picture_url',
      'service_addresses',
      'aadhaar_number_masked',
      'pan_verified',
      'aadhaar_verified',
      'cancelled_cheque_url',
      'kyc_request_id',
      'kyc_step',
      'face_liveness_score',
      'bank_account_masked'
    ];

    // First, get the current table structure
    const tableInfo = await env.KUDDL_DB.prepare("PRAGMA table_info(providers)").all();
    console.log('Current provider table columns:', tableInfo.results?.map(col => col.name) || []);

    // Check which columns actually exist in the table
    const existingColumns = tableInfo.results?.map(col => col.name) || [];
    const columnsToActuallyRemove = columnsToRemove.filter(col => existingColumns.includes(col));
    
    console.log('Columns to remove:', columnsToActuallyRemove);

    if (columnsToActuallyRemove.length === 0) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: true,
        message: 'No specified columns found in provider table - table may already be restructured',
        data: {
          requestedColumns: columnsToRemove,
          existingColumns: existingColumns,
          columnsRemoved: []
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Create new table without the unwanted columns
    const keepColumns = existingColumns.filter(col => !columnsToActuallyRemove.includes(col));
    
    // Build the new table schema
    const newTableSchema = `
      CREATE TABLE providers_new (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        phone TEXT,
        password_hash TEXT,
        first_name TEXT,
        last_name TEXT,
        business_name TEXT,
        description TEXT,
        city TEXT,
        state TEXT,
        area TEXT,
        pincode TEXT,
        address TEXT,
        date_of_birth TEXT,
        gender TEXT,
        experience_years INTEGER DEFAULT 0,
        qualifications TEXT,
        languages TEXT,
        service_categories TEXT,
        specific_services TEXT,
        age_groups TEXT,
        serviceable_pincodes TEXT,
        account_holder_name TEXT,
        bank_name TEXT,
        account_number TEXT,
        ifsc_code TEXT,
        account_type TEXT,
        upi_id TEXT,
        kyc_status TEXT CHECK (kyc_status IN ('pending', 'verified', 'rejected')) DEFAULT 'pending',
        verification_level INTEGER DEFAULT 1,
        average_rating REAL DEFAULT 0,
        total_bookings INTEGER DEFAULT 0,
        total_reviews INTEGER DEFAULT 0,
        commission_rate REAL DEFAULT 15.0,
        is_featured INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        response_time_minutes INTEGER DEFAULT 60,
        instant_booking_enabled INTEGER DEFAULT 0,
        profile_image_url TEXT,
        is_direct_signup INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Step 1: Create new table
    await env.KUDDL_DB.prepare(newTableSchema).run();
    console.log('✅ Created new providers table structure');

    // Step 2: Copy data from old table to new table (only keeping columns)
    const selectColumns = keepColumns.join(', ');
    await env.KUDDL_DB.prepare(`
      INSERT INTO providers_new (${selectColumns})
      SELECT ${selectColumns} FROM providers
    `).run();
    console.log('✅ Copied data to new table');

    // Step 3: Drop old table
    await env.KUDDL_DB.prepare('DROP TABLE providers').run();
    console.log('✅ Dropped old providers table');

    // Step 4: Rename new table to original name
    await env.KUDDL_DB.prepare('ALTER TABLE providers_new RENAME TO providers').run();
    console.log('✅ Renamed new table to providers');

    // Verify the final structure
    const finalTableInfo = await env.KUDDL_DB.prepare("PRAGMA table_info(providers)").all();
    const finalColumns = finalTableInfo.results?.map(col => col.name) || [];

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Provider table restructured successfully',
      data: {
        columnsRemoved: columnsToActuallyRemove,
        remainingColumns: finalColumns,
        totalColumnsRemoved: columnsToActuallyRemove.length,
        finalColumnCount: finalColumns.length
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Provider table restructuring error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to restructure provider table: ' + error.message,
      error: error.stack
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}
