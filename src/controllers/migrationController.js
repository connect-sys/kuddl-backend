/**
 * Migration Controller
 * Handles database migrations and updates
 */

import { addCorsHeaders } from '../utils/cors.js';

export async function addOcrDataColumn(request, env) {
  try {
    console.log('🔧 Running migration: Add ocr_data column to document_verifications');
    
    // Check if column already exists
    const columnCheck = await env.KUDDL_DB.prepare(`
      PRAGMA table_info(document_verifications)
    `).all();
    
    const hasOcrData = columnCheck.results?.some(col => col.name === 'ocr_data');
    
    if (hasOcrData) {
      console.log('✅ ocr_data column already exists');
      return addCorsHeaders(new Response(JSON.stringify({
        success: true,
        message: 'ocr_data column already exists'
      }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    
    // Add the column
    await env.KUDDL_DB.prepare(`
      ALTER TABLE document_verifications ADD COLUMN ocr_data TEXT
    `).run();
    
    console.log('✅ Successfully added ocr_data column');
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Successfully added ocr_data column to document_verifications table'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Migration failed',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

export async function addRazorpayOrderIdColumn(request, env) {
  try {
    console.log('🔧 Running migration: Add razorpay_order_id column to payment_orders');
    
    // Check if column already exists
    const columnCheck = await env.KUDDL_DB.prepare(`
      PRAGMA table_info(payment_orders)
    `).all();
    
    const hasColumn = columnCheck.results?.some(col => col.name === 'razorpay_order_id');
    
    if (hasColumn) {
      console.log('✅ razorpay_order_id column already exists');
      return addCorsHeaders(new Response(JSON.stringify({
        success: true,
        message: 'razorpay_order_id column already exists'
      }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    
    // Add the column
    await env.KUDDL_DB.prepare(`
      ALTER TABLE payment_orders ADD COLUMN razorpay_order_id TEXT
    `).run();
    
    console.log('✅ Successfully added razorpay_order_id column');
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Successfully added razorpay_order_id column to payment_orders table'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Migration failed',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

export async function addTotalBookingsColumn(request, env) {
  try {
    console.log('🔧 Running migration: Add total_bookings column to providers');
    
    // Check if column already exists
    const columnCheck = await env.KUDDL_DB.prepare(`
      PRAGMA table_info(providers)
    `).all();
    
    const hasTotalBookings = columnCheck.results?.some(col => col.name === 'total_bookings');
    
    if (hasTotalBookings) {
      console.log('✅ total_bookings column already exists');
      return addCorsHeaders(new Response(JSON.stringify({
        success: true,
        message: 'total_bookings column already exists'
      }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    
    // Add the column
    await env.KUDDL_DB.prepare(`
      ALTER TABLE providers ADD COLUMN total_bookings INTEGER DEFAULT 0
    `).run();
    
    console.log('✅ Added total_bookings column to providers table');
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Successfully added total_bookings column to providers table'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Migration failed',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

export async function dropProviderColumns(request, env) {
  try {
    console.log('🔧 Running migration: Drop unused provider columns');
    
    const columnsToDrop = [
      'emergency_contact_name',
      'emergency_contact_phone',
      'bank_account_number',
      'bank_ifsc_code',
      'driving_license_url',
      'cancelled_cheque_url',
      'passport_url',
      'verification_documents',
      'service_area',
      'user_id'
    ];
    
    const results = [];
    
    for (const column of columnsToDrop) {
      try {
        // Check if column exists first to avoid error
        const columnCheck = await env.KUDDL_DB.prepare(`
          PRAGMA table_info(providers)
        `).all();
        
        const hasColumn = columnCheck.results?.some(col => col.name === column);
        
        if (hasColumn) {
          await env.KUDDL_DB.prepare(`
            ALTER TABLE providers DROP COLUMN ${column}
          `).run();
          results.push({ column, status: 'dropped' });
          console.log(`✅ Dropped column: ${column}`);
        } else {
          results.push({ column, status: 'skipped (not found)' });
          console.log(`⚠️ Column not found: ${column}`);
        }
      } catch (err) {
        console.error(`❌ Failed to drop ${column}:`, err);
        results.push({ column, status: 'failed', error: err.message });
      }
    }
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Provider columns cleanup completed',
      results
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Migration failed',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

export async function addProviderUserColumns(request, env) {
  try {
    console.log('🔧 Running migration: Add user columns to providers');
    
    const columnsToAdd = [
      { name: 'email', type: 'TEXT' },
      { name: 'phone', type: 'TEXT' },
      { name: 'password_hash', type: 'TEXT' },
      { name: 'first_name', type: 'TEXT' },
      { name: 'last_name', type: 'TEXT' },
      { name: 'city', type: 'TEXT' },
      { name: 'state', type: 'TEXT' },
      { name: 'pincode', type: 'TEXT' },
      { name: 'address', type: 'TEXT' },
      { name: 'profile_image_url', type: 'TEXT' }
    ];
    
    // Check existing columns
    const columnCheck = await env.KUDDL_DB.prepare(`
      PRAGMA table_info(providers)
    `).all();
    
    const existingColumns = columnCheck.results?.map(col => col.name) || [];
    const results = [];
    
    for (const col of columnsToAdd) {
      if (!existingColumns.includes(col.name)) {
        try {
          await env.KUDDL_DB.prepare(`
            ALTER TABLE providers ADD COLUMN ${col.name} ${col.type}
          `).run();
          console.log(`✅ Added column: ${col.name}`);
          results.push({ column: col.name, status: 'added' });
        } catch (err) {
          console.error(`❌ Failed to add ${col.name}:`, err);
          results.push({ column: col.name, status: 'failed', error: err.message });
        }
      } else {
        console.log(`ℹ️ Column already exists: ${col.name}`);
        results.push({ column: col.name, status: 'exists' });
      }
    }
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Provider user columns migration completed',
      results
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Migration failed',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

export async function checkTableSchema(request, env) {
  try {
    const tableName = new URL(request.url).searchParams.get('table') || 'document_verifications';
    
    const schema = await env.KUDDL_DB.prepare(`
      PRAGMA table_info(${tableName})
    `).all();
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      table: tableName,
      columns: schema.results
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
    
  } catch (error) {
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to check table schema',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

export async function recreateNotificationsTable(request, env) {
  try {
    console.log('🔧 Running migration: Recreate notifications table without FK');
    
    // 1. Rename existing table
    try {
      await env.KUDDL_DB.prepare('ALTER TABLE notifications RENAME TO notifications_old').run();
    } catch (e) {
      if (!e.message.includes('no such table')) {
        throw e;
      }
      console.log('⚠️ notifications table does not exist, creating new one');
    }

    // 2. Create new table without FK on user_id
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS notifications (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          data TEXT,
          is_read INTEGER DEFAULT 0,
          is_push_sent INTEGER DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // 3. Copy data if old table existed
    try {
      await env.KUDDL_DB.prepare(`
        INSERT INTO notifications (id, user_id, type, title, message, data, is_read, is_push_sent, created_at)
        SELECT id, user_id, type, title, message, data, is_read, is_push_sent, created_at
        FROM notifications_old
      `).run();
      
      // 4. Drop old table
      await env.KUDDL_DB.prepare('DROP TABLE notifications_old').run();
      console.log('✅ Data migrated and old table dropped');
    } catch (e) {
      console.log('ℹ️ No data to migrate or error migrating:', e.message);
    }
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Notifications table recreated successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Migration failed',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

export async function fixAdminsSchema(request, env) {
  try {
    console.log('🔧 Running migration: Fix admins table schema');
    
    // 1. Drop existing table
    await env.KUDDL_DB.prepare('DROP TABLE IF EXISTS admins').run();
    
    // 2. Create new table with correct schema
    await env.KUDDL_DB.prepare(`
      CREATE TABLE admins (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        role TEXT DEFAULT 'admin',
        is_active INTEGER DEFAULT 1,
        last_login_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // 3. Create default admin user
    const bcrypt = await import('bcryptjs');
    const adminPasswordHash = await bcrypt.hash('Tech@Tendernest@123', 12);
    
    await env.KUDDL_DB.prepare(`
      INSERT INTO admins (id, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'admin', 1, ?, ?)
    `).bind(
      'admin001',
      'tech@tendernest.world',
      adminPasswordHash,
      'Tech',
      'Admin',
      new Date().toISOString(),
      new Date().toISOString()
    ).run();
    
    console.log('✅ Admins table recreated and default admin inserted');
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Admins table schema fixed successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Migration failed',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

export async function createKycTable(request, env) {
  try {
    console.log('🔧 Running migration: Create provider_kyc table');
    
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS provider_kyc (
          id TEXT PRIMARY KEY,
          provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
          
          -- Aadhaar Details
          aadhaar_number_masked TEXT,
          aadhaar_status TEXT CHECK (aadhaar_status IN ('pending', 'verified', 'failed')) DEFAULT 'pending',
          aadhaar_reference_id TEXT,
          aadhaar_verified_at TEXT,
          
          -- PAN Details
          pan_number TEXT,
          pan_status TEXT CHECK (pan_status IN ('pending', 'verified', 'failed')) DEFAULT 'pending',
          pan_name TEXT,
          pan_verified_at TEXT,
          
          -- Bank Details
          bank_account_masked TEXT,
          ifsc_code TEXT,
          bank_status TEXT CHECK (bank_status IN ('pending', 'verified', 'failed')) DEFAULT 'pending',
          bank_beneficiary_name TEXT,
          bank_verified_at TEXT,
          
          -- Face Liveness
          face_liveness_status TEXT CHECK (face_liveness_status IN ('pending', 'verified', 'failed')) DEFAULT 'pending',
          face_liveness_score REAL,
          face_reference_id TEXT,
          face_verified_at TEXT,
          
          -- Overall Status
          overall_status TEXT CHECK (overall_status IN ('pending', 'in_progress', 'completed', 'rejected')) DEFAULT 'pending',
          
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          
          CONSTRAINT uk_provider_kyc UNIQUE (provider_id)
      )
    `).run();
    
    console.log('✅ provider_kyc table created successfully');

    // Add GST columns if they don't exist (for fresh installs that might use older schema definitions)
    // This ensures even if the CREATE TABLE above is old, we patch it immediately
    try {
        await env.KUDDL_DB.prepare("ALTER TABLE provider_kyc ADD COLUMN gst_number TEXT").run();
        await env.KUDDL_DB.prepare("ALTER TABLE provider_kyc ADD COLUMN gst_status TEXT CHECK (gst_status IN ('pending', 'verified', 'failed')) DEFAULT 'pending'").run();
        await env.KUDDL_DB.prepare("ALTER TABLE provider_kyc ADD COLUMN gst_verified_at TEXT").run();
    } catch (e) {
        // Ignore if columns exist
    }
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'provider_kyc table created successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Migration failed',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

export async function addGstColumnsToKyc(request, env) {
  try {
    console.log('🔧 Running migration: Add GST columns to provider_kyc');
    
    const columnsToAdd = [
      "ALTER TABLE provider_kyc ADD COLUMN gst_number TEXT",
      "ALTER TABLE provider_kyc ADD COLUMN gst_status TEXT CHECK (gst_status IN ('pending', 'verified', 'failed')) DEFAULT 'pending'",
      "ALTER TABLE provider_kyc ADD COLUMN gst_verified_at TEXT"
    ];
    
    for (const sql of columnsToAdd) {
      try {
        await env.KUDDL_DB.prepare(sql).run();
        console.log('✅ Added column:', sql);
      } catch (error) {
        if (error.message.includes('duplicate column name')) {
          console.log('⚠️ Column already exists:', sql);
        } else {
          console.error('❌ Error adding column:', sql, error.message);
        }
      }
    }
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'GST columns added to provider_kyc table'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Migration failed',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Create parents and children tables
export async function createParentsTables(request, env) {
  try {
    console.log('🔄 Creating parents and children tables...');

    // Create parents table for customer data
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS parents (
        id TEXT PRIMARY KEY,
        phone TEXT UNIQUE NOT NULL,
        email TEXT,
        name TEXT NOT NULL,
        address TEXT,
        city TEXT,
        state TEXT,
        pincode TEXT,
        alternate_contact_name TEXT,
        alternate_contact_phone TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    console.log('✅ Created parents table');

    // Create children table linked to parents
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS children (
        id TEXT PRIMARY KEY,
        parent_id TEXT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        date_of_birth TEXT,
        age INTEGER,
        gender TEXT,
        medical_conditions TEXT,
        bedtime TEXT,
        special_needs TEXT,
        allergies TEXT,
        dietary_restrictions TEXT,
        preferences TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    console.log('✅ Created children table');

    // Update bookings table to use parent_id if it doesn't already
    try {
      await env.KUDDL_DB.prepare(`
        ALTER TABLE bookings ADD COLUMN parent_id TEXT REFERENCES parents(id)
      `).run();
      console.log('✅ Added parent_id column to bookings table');
    } catch (alterError) {
      if (alterError.message.includes('duplicate column name')) {
        console.log('ℹ️ parent_id column already exists in bookings table');
      } else {
        console.log('⚠️ Could not add parent_id column:', alterError.message);
      }
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Successfully created parents and children tables'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Parents tables creation error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to create parents tables',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Migration to update bookings table to use parent_id instead of customer_id
export async function migrateBookingsToParentId(request, env) {
  try {
    console.log('🔧 Running migration: Update bookings table to use parent_id');
    
    // Check if parent_id column already exists
    const columnCheck = await env.KUDDL_DB.prepare(`
      PRAGMA table_info(bookings)
    `).all();
    
    const hasParentId = columnCheck.results?.some(col => col.name === 'parent_id');
    const hasCustomerId = columnCheck.results?.some(col => col.name === 'customer_id');
    
    if (hasParentId && !hasCustomerId) {
      console.log('✅ Bookings table already uses parent_id');
      return addCorsHeaders(new Response(JSON.stringify({
        success: true,
        message: 'Bookings table already uses parent_id'
      }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    
    // Create new bookings table with parent_id
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS bookings_new (
        id TEXT PRIMARY KEY,
        service_id TEXT REFERENCES services(id),
        parent_id TEXT REFERENCES parents(id),
        provider_id TEXT REFERENCES providers(id),
        booking_date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        duration_minutes INTEGER,
        number_of_children INTEGER DEFAULT 1,
        children_ages TEXT,
        special_requests TEXT,
        status TEXT CHECK (status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'rejected')) DEFAULT 'pending',
        total_amount REAL NOT NULL,
        platform_fee REAL DEFAULT 0,
        provider_amount REAL NOT NULL,
        payment_status TEXT CHECK (payment_status IN ('pending', 'paid', 'refunded', 'failed')) DEFAULT 'pending',
        payment_id TEXT,
        refund_amount REAL DEFAULT 0,
        cancellation_reason TEXT,
        cancelled_by TEXT,
        cancelled_at TEXT,
        confirmed_at TEXT,
        completed_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    
    // Copy existing data, mapping customer_id to parent_id
    if (hasCustomerId) {
      await env.KUDDL_DB.prepare(`
        INSERT INTO bookings_new SELECT 
          id, service_id, customer_id as parent_id, provider_id, booking_date, 
          start_time, end_time, duration_minutes, number_of_children, children_ages,
          special_requests, status, total_amount, platform_fee, provider_amount,
          payment_status, payment_id, refund_amount, cancellation_reason, 
          cancelled_by, cancelled_at, confirmed_at, completed_at, created_at, updated_at
        FROM bookings
      `).run();
    }
    
    // Drop old table and rename new one
    await env.KUDDL_DB.prepare(`DROP TABLE IF EXISTS bookings`).run();
    await env.KUDDL_DB.prepare(`ALTER TABLE bookings_new RENAME TO bookings`).run();
    
    console.log('✅ Successfully migrated bookings table to use parent_id');
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Successfully migrated bookings table to use parent_id'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
    
  } catch (error) {
    console.error('❌ Bookings migration failed:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Bookings migration failed',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Create partner availability tables
export async function addSelectedDateColumn(request, env) {
  try {
    console.log('🔧 Running migration: Add selected_date column to bookings table');
    
    // Check if column already exists
    const columnCheck = await env.KUDDL_DB.prepare(`
      PRAGMA table_info(bookings)
    `).all();
    
    const hasSelectedDate = columnCheck.results?.some(col => col.name === 'selected_date');
    
    if (hasSelectedDate) {
      console.log('✅ selected_date column already exists');
      return addCorsHeaders(new Response(JSON.stringify({
        success: true,
        message: 'selected_date column already exists'
      }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    
    // Add the column
    await env.KUDDL_DB.prepare(`
      ALTER TABLE bookings ADD COLUMN selected_date TEXT
    `).run();
    
    console.log('✅ Added selected_date column to bookings table');
    
    // Update existing rows to copy booking_date to selected_date
    await env.KUDDL_DB.prepare(`
      UPDATE bookings SET selected_date = booking_date WHERE selected_date IS NULL
    `).run();
    
    console.log('✅ Updated existing bookings with selected_date');
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Successfully added selected_date column to bookings table'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Migration failed',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

export async function createAvailabilityTables(request, env) {
  try {
    console.log('🔧 Creating partner availability tables...');

    // 1. Partner Types Table - to store partner type (Solo/Academy)
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS partner_types (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        partner_type TEXT CHECK (partner_type IN ('solo', 'academy')) NOT NULL DEFAULT 'solo',
        buffer_time_minutes INTEGER DEFAULT 30,
        calendar_sync_enabled INTEGER DEFAULT 0,
        google_calendar_id TEXT,
        ical_url TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uk_partner_type UNIQUE (provider_id)
      )
    `).run();
    console.log('✅ Created partner_types table');

    // 2. Working Hours Table - for Solo Partners
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS partner_working_hours (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday, 6=Saturday
        is_available INTEGER DEFAULT 1,
        start_time TEXT NOT NULL, -- Format: "HH:MM" (24-hour)
        end_time TEXT NOT NULL,   -- Format: "HH:MM" (24-hour)
        break_start_time TEXT,    -- Optional break time
        break_end_time TEXT,      -- Optional break time
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uk_provider_day UNIQUE (provider_id, day_of_week)
      )
    `).run();
    console.log('✅ Created partner_working_hours table');

    // 3. Batch Timings Table - for Big Academies
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS partner_batch_timings (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        batch_name TEXT NOT NULL, -- e.g., "Batch A", "Morning Batch"
        day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
        start_time TEXT NOT NULL, -- Format: "HH:MM" (24-hour)
        end_time TEXT NOT NULL,   -- Format: "HH:MM" (24-hour)
        max_capacity INTEGER DEFAULT 10,
        current_bookings INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    console.log('✅ Created partner_batch_timings table');

    // 4. Blocked Slots Table - for calendar sync and manual blocks
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS partner_blocked_slots (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        blocked_date TEXT NOT NULL, -- Format: "YYYY-MM-DD"
        start_time TEXT NOT NULL,   -- Format: "HH:MM" (24-hour)
        end_time TEXT NOT NULL,     -- Format: "HH:MM" (24-hour)
        reason TEXT, -- e.g., "Private booking", "Personal time", "Calendar sync"
        source TEXT CHECK (source IN ('manual', 'calendar_sync', 'booking')) DEFAULT 'manual',
        external_event_id TEXT, -- For calendar sync
        is_recurring INTEGER DEFAULT 0,
        recurrence_pattern TEXT, -- JSON for recurring patterns
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    console.log('✅ Created partner_blocked_slots table');

    // 5. Special Availability Table - for exceptions to regular schedule
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS partner_special_availability (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        special_date TEXT NOT NULL, -- Format: "YYYY-MM-DD"
        is_available INTEGER DEFAULT 1, -- 0 = not available, 1 = available
        start_time TEXT, -- Override start time for this date
        end_time TEXT,   -- Override end time for this date
        reason TEXT, -- e.g., "Holiday", "Special event", "Extended hours"
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uk_provider_special_date UNIQUE (provider_id, special_date)
      )
    `).run();
    console.log('✅ Created partner_special_availability table');

    // Create indexes for better performance
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_partner_types_provider ON partner_types(provider_id)').run();
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_working_hours_provider ON partner_working_hours(provider_id)').run();
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_working_hours_day ON partner_working_hours(day_of_week)').run();
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_batch_timings_provider ON partner_batch_timings(provider_id)').run();
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_batch_timings_day ON partner_batch_timings(day_of_week)').run();
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_blocked_slots_provider ON partner_blocked_slots(provider_id)').run();
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_blocked_slots_date ON partner_blocked_slots(blocked_date)').run();
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_special_availability_provider ON partner_special_availability(provider_id)').run();
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_special_availability_date ON partner_special_availability(special_date)').run();
    console.log('✅ Created indexes for availability tables');

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Partner availability tables created successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Failed to create availability tables:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to create availability tables',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}
