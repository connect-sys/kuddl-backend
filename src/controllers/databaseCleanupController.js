import { addCorsHeaders } from '../utils/cors.js';

function generateId() {
  return crypto.randomUUID();
}

// Clean up database and create only essential tables
export async function cleanupAndCreateEssentialTables(request, env) {
  try {
    console.log('🧹 Starting database cleanup and essential table creation...');

    // List of tables to keep (essential for the platform)
    const essentialTables = [
      'providers',
      'services', 
      'bookings',
      'parents',
      'children',
      'categories',
      'subcategories',
      'users',
      'notifications',
      'reviews',
      // Partner availability tables (simplified)
      'partner_types',
      'partner_working_hours',
      'partner_batch_timings',
      'partner_availability'
    ];

    // Get all existing tables
    const tablesResult = await env.KUDDL_DB.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `).all();

    const existingTables = tablesResult.results.map(row => row.name);
    console.log('📋 Existing tables:', existingTables);

    // Drop unnecessary tables
    const tablesToDrop = existingTables.filter(table => !essentialTables.includes(table));
    console.log('🗑️ Tables to drop:', tablesToDrop);

    for (const table of tablesToDrop) {
      try {
        await env.KUDDL_DB.prepare(`DROP TABLE IF EXISTS ${table}`).run();
        console.log(`✅ Dropped table: ${table}`);
      } catch (error) {
        console.log(`⚠️ Could not drop table ${table}:`, error.message);
      }
    }

    // Create essential partner availability tables
    console.log('🔧 Creating essential partner availability tables...');

    // 1. Partner Types Table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS partner_types (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL UNIQUE,
        partner_type TEXT CHECK (partner_type IN ('solo', 'academy')) NOT NULL DEFAULT 'solo',
        buffer_time_minutes INTEGER DEFAULT 30,
        calendar_sync_enabled INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
      )
    `).run();
    console.log('✅ Created partner_types table');

    // 2. Partner Working Hours Table (for Solo Partners)
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS partner_working_hours (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
        is_available INTEGER DEFAULT 1,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        break_start_time TEXT,
        break_end_time TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE,
        UNIQUE(provider_id, day_of_week)
      )
    `).run();
    console.log('✅ Created partner_working_hours table');

    // 3. Partner Batch Timings Table (for Academy Partners)
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS partner_batch_timings (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        batch_name TEXT NOT NULL,
        day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        max_capacity INTEGER DEFAULT 10,
        current_bookings INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
      )
    `).run();
    console.log('✅ Created partner_batch_timings table');

    // 4. Partner Availability Table (JSON backup for compatibility)
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS partner_availability (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id TEXT NOT NULL UNIQUE,
        working_hours TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
      )
    `).run();
    console.log('✅ Created partner_availability table');

    // Create indexes for better performance
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_partner_types_provider ON partner_types(provider_id)').run();
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_working_hours_provider ON partner_working_hours(provider_id)').run();
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_working_hours_day ON partner_working_hours(day_of_week)').run();
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_batch_timings_provider ON partner_batch_timings(provider_id)').run();
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_batch_timings_day ON partner_batch_timings(day_of_week)').run();
    console.log('✅ Created indexes for availability tables');

    // Get final table count
    const finalTablesResult = await env.KUDDL_DB.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `).all();
    const finalTables = finalTablesResult.results.map(row => row.name);

    console.log('✅ Database cleanup completed successfully');
    console.log('📊 Final tables:', finalTables);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Database cleanup and essential table creation completed successfully',
      data: {
        tablesDropped: tablesToDrop.length,
        droppedTables: tablesToDrop,
        finalTables: finalTables,
        essentialTablesCreated: [
          'partner_types',
          'partner_working_hours', 
          'partner_batch_timings',
          'partner_availability'
        ]
      }
    })));

  } catch (error) {
    console.error('❌ Database cleanup error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to cleanup database: ' + error.message,
      error: error.stack
    }), { status: 500 }));
  }
}

// Fix bookings table - remove users FK reference
export async function fixBookingsTable(request, env) {
  try {
    console.log('🔧 Fixing bookings table - removing users FK reference...');

    // Step 0: Disable foreign keys and backup dependent tables
    await env.KUDDL_DB.prepare(`PRAGMA foreign_keys = OFF`).run();
    console.log('✅ Disabled foreign keys');

    // Backup dependent tables data
    const dependentTables = ['booking_lifecycle', 'payment_orders', 'payout_transactions', 'reviews', 'notification_log'];
    const backups = {};
    for (const table of dependentTables) {
      try {
        const result = await env.KUDDL_DB.prepare(`SELECT * FROM ${table}`).all();
        backups[table] = result.results || [];
        console.log(`📋 Backed up ${backups[table].length} rows from ${table}`);
      } catch (e) {
        backups[table] = [];
        console.log(`⚠️ Could not backup ${table}: ${e.message}`);
      }
    }

    // Drop dependent tables
    for (const table of dependentTables) {
      try {
        await env.KUDDL_DB.prepare(`DROP TABLE IF EXISTS ${table}`).run();
        console.log(`✅ Dropped dependent table: ${table}`);
      } catch (e) {
        console.log(`⚠️ Could not drop ${table}: ${e.message}`);
      }
    }

    // Step 1: Check if bookings table exists and get existing data
    let existingBookings = [];
    try {
      const result = await env.KUDDL_DB.prepare(`SELECT * FROM bookings`).all();
      existingBookings = result.results || [];
      console.log(`📋 Found ${existingBookings.length} existing bookings to preserve`);
    } catch (e) {
      console.log('⚠️ No existing bookings table or empty');
    }

    // Step 2: Drop the old bookings table
    await env.KUDDL_DB.prepare(`DROP TABLE IF EXISTS bookings`).run();
    console.log('✅ Dropped old bookings table');

    // Step 3: Create new bookings table with correct schema (no users FK)
    await env.KUDDL_DB.prepare(`
      CREATE TABLE bookings (
        id TEXT PRIMARY KEY,
        service_id TEXT,
        parent_id TEXT,
        provider_id TEXT,
        booking_date TEXT NOT NULL,
        selected_date TEXT,
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
        parent_rating INTEGER,
        parent_feedback TEXT,
        provider_response TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    console.log('✅ Created new bookings table with correct schema');

    // Step 4: Re-insert existing bookings
    let restored = 0;
    for (const booking of existingBookings) {
      try {
        await env.KUDDL_DB.prepare(`
          INSERT INTO bookings (
            id, service_id, parent_id, provider_id, booking_date, selected_date,
            start_time, end_time, duration_minutes, number_of_children, children_ages,
            special_requests, status, total_amount, platform_fee, provider_amount,
            payment_status, payment_id, refund_amount, cancellation_reason,
            cancelled_by, cancelled_at, confirmed_at, completed_at,
            parent_rating, parent_feedback, provider_response,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          booking.id,
          booking.service_id || null,
          booking.parent_id || booking.customer_id || null,
          booking.provider_id || null,
          booking.booking_date,
          booking.selected_date || booking.booking_date,
          booking.start_time,
          booking.end_time,
          booking.duration_minutes || null,
          booking.number_of_children || 1,
          booking.children_ages || null,
          booking.special_requests || null,
          booking.status || 'pending',
          booking.total_amount || 0,
          booking.platform_fee || 0,
          booking.provider_amount || 0,
          booking.payment_status || 'pending',
          booking.payment_id || null,
          booking.refund_amount || 0,
          booking.cancellation_reason || null,
          booking.cancelled_by || null,
          booking.cancelled_at || null,
          booking.confirmed_at || null,
          booking.completed_at || null,
          booking.parent_rating || null,
          booking.parent_feedback || null,
          booking.provider_response || null,
          booking.created_at || new Date().toISOString(),
          booking.updated_at || new Date().toISOString()
        ).run();
        restored++;
      } catch (insertError) {
        console.error(`⚠️ Failed to restore booking ${booking.id}:`, insertError.message);
      }
    }

    console.log(`✅ Restored ${restored}/${existingBookings.length} bookings`);

    // Step 5: Create indexes
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_bookings_parent ON bookings(parent_id)').run();
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_bookings_provider ON bookings(provider_id)').run();
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(booking_date)').run();
    console.log('✅ Created bookings indexes');

    // Step 6: Recreate dependent tables (without users FK references)
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS booking_lifecycle (
        id TEXT PRIMARY KEY,
        booking_id TEXT NOT NULL,
        status TEXT NOT NULL,
        changed_by TEXT,
        changed_by_type TEXT,
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    console.log('✅ Recreated booking_lifecycle table');

    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS payment_orders (
        id TEXT PRIMARY KEY,
        amount INTEGER NOT NULL,
        currency TEXT DEFAULT 'INR',
        status TEXT CHECK (status IN ('created', 'completed', 'failed')) DEFAULT 'created',
        payment_id TEXT,
        booking_id TEXT,
        signature TEXT,
        razorpay_payment_id TEXT,
        razorpay_order_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    console.log('✅ Recreated payment_orders table');

    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS payout_transactions (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        booking_id TEXT,
        amount REAL NOT NULL,
        commission_amount REAL NOT NULL,
        gst_amount REAL DEFAULT 0.0,
        net_amount REAL NOT NULL,
        status TEXT DEFAULT 'pending',
        razorpay_payout_id TEXT,
        scheduled_payout_date TEXT,
        actual_payout_date TEXT,
        failure_reason TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    console.log('✅ Recreated payout_transactions table');

    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY,
        booking_id TEXT,
        customer_id TEXT,
        provider_id TEXT,
        service_id TEXT,
        rating INTEGER CHECK (rating BETWEEN 1 AND 5) NOT NULL,
        review_text TEXT,
        images TEXT,
        is_anonymous INTEGER DEFAULT 0,
        is_verified INTEGER DEFAULT 1,
        provider_response TEXT,
        provider_responded_at TEXT,
        is_reported INTEGER DEFAULT 0,
        report_reason TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    console.log('✅ Recreated reviews table');

    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS notification_log (
        id TEXT PRIMARY KEY,
        booking_id TEXT,
        recipient_type TEXT,
        recipient_id TEXT,
        notification_type TEXT,
        channel TEXT,
        status TEXT DEFAULT 'sent',
        message TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    console.log('✅ Recreated notification_log table');

    // Step 7: Restore dependent table data
    for (const table of dependentTables) {
      const rows = backups[table] || [];
      let restoredRows = 0;
      for (const row of rows) {
        try {
          const columns = Object.keys(row);
          const placeholders = columns.map(() => '?').join(', ');
          const values = columns.map(col => row[col]);
          await env.KUDDL_DB.prepare(
            `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`
          ).bind(...values).run();
          restoredRows++;
        } catch (e) {
          console.log(`⚠️ Could not restore row in ${table}: ${e.message}`);
        }
      }
      if (rows.length > 0) {
        console.log(`✅ Restored ${restoredRows}/${rows.length} rows in ${table}`);
      }
    }

    // Step 8: Re-enable foreign keys
    await env.KUDDL_DB.prepare(`PRAGMA foreign_keys = ON`).run();
    console.log('✅ Re-enabled foreign keys');

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Bookings table fixed successfully',
      data: {
        existingBookings: existingBookings.length,
        restoredBookings: restored,
        schema: 'Removed users FK reference, using parent_id instead of customer_id'
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Fix bookings table error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fix bookings table: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Debug: inspect bookings and parents data
export async function debugBookingsData(request, env) {
  try {
    const bookings = await env.KUDDL_DB.prepare(`SELECT id, parent_id, booking_date, start_time, end_time, status FROM bookings ORDER BY created_at DESC LIMIT 20`).all();
    const parents = await env.KUDDL_DB.prepare(`SELECT id, phone, full_name FROM parents`).all();
    const children = await env.KUDDL_DB.prepare(`SELECT id, parent_id, name FROM children`).all();
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: {
        bookings: bookings.results || [],
        parents: parents.results || [],
        children: children.results || []
      }
    }), { headers: { 'Content-Type': 'application/json' } }));
  } catch (error) {
    return addCorsHeaders(new Response(JSON.stringify({ success: false, message: error.message }), { status: 500 }));
  }
}

// Fix orphaned bookings - re-create missing parent records
export async function fixOrphanedBookings(request, env) {
  try {
    // Find all parent_ids in bookings that don't exist in parents table
    const orphaned = await env.KUDDL_DB.prepare(`
      SELECT DISTINCT b.parent_id FROM bookings b 
      LEFT JOIN parents p ON b.parent_id = p.id 
      WHERE p.id IS NULL
    `).all();

    const fixed = [];
    for (const row of (orphaned.results || [])) {
      const pid = row.parent_id;
      // Try to find the phone from children or special_requests
      let phone = null;
      const child = await env.KUDDL_DB.prepare(
        `SELECT parent_id FROM children WHERE parent_id = ? LIMIT 1`
      ).bind(pid).first();
      
      // Check if any existing parent has bookings that share children with this parent_id
      const booking = await env.KUDDL_DB.prepare(
        `SELECT special_requests FROM bookings WHERE parent_id = ? LIMIT 1`
      ).bind(pid).first();
      
      if (booking && booking.special_requests) {
        try {
          const sr = JSON.parse(booking.special_requests);
          if (sr.parentDetails && sr.parentDetails.phone) {
            phone = sr.parentDetails.phone.replace(/\D/g, '');
            if (phone.length > 10) phone = phone.slice(-10);
          }
        } catch (e) { /* ignore */ }
      }

      // Find an existing parent with the same phone to update bookings
      if (phone) {
        const existingParent = await env.KUDDL_DB.prepare(
          `SELECT id FROM parents WHERE phone = ? OR phone = ? OR phone = ? OR phone LIKE ? LIMIT 1`
        ).bind(phone, `91${phone}`, `+91${phone}`, `%${phone}`).first();
        
        if (existingParent) {
          // Update bookings to point to existing parent
          await env.KUDDL_DB.prepare(
            `UPDATE bookings SET parent_id = ? WHERE parent_id = ?`
          ).bind(existingParent.id, pid).run();
          // Update children too
          await env.KUDDL_DB.prepare(
            `UPDATE children SET parent_id = ? WHERE parent_id = ?`
          ).bind(existingParent.id, pid).run();
          fixed.push({ old: pid, new: existingParent.id, phone });
        }
      }
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      orphaned: (orphaned.results || []).length,
      fixed: fixed
    }), { headers: { 'Content-Type': 'application/json' } }));
  } catch (error) {
    return addCorsHeaders(new Response(JSON.stringify({
      success: false, message: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// Add missing service tracking columns to bookings table
export async function addServiceTrackingColumns(request, env) {
  try {
    const results = [];

    // Add service_started_at column
    try {
      await env.KUDDL_DB.prepare(`ALTER TABLE bookings ADD COLUMN service_started_at TEXT`).run();
      results.push('Added service_started_at column');
    } catch (e) {
      if (e.message.includes('duplicate column')) {
        results.push('service_started_at already exists');
      } else {
        results.push(`service_started_at error: ${e.message}`);
      }
    }

    // Add service_completed_at column
    try {
      await env.KUDDL_DB.prepare(`ALTER TABLE bookings ADD COLUMN service_completed_at TEXT`).run();
      results.push('Added service_completed_at column');
    } catch (e) {
      if (e.message.includes('duplicate column')) {
        results.push('service_completed_at already exists');
      } else {
        results.push(`service_completed_at error: ${e.message}`);
      }
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Service tracking columns migration complete',
      results
    }), { headers: { 'Content-Type': 'application/json' } }));
  } catch (error) {
    return addCorsHeaders(new Response(JSON.stringify({
      success: false, message: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// Get current database schema
export async function getDatabaseSchema(request, env) {
  try {
    const tablesResult = await env.KUDDL_DB.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name
    `).all();

    const tables = [];
    for (const table of tablesResult.results) {
      const schemaResult = await env.KUDDL_DB.prepare(`
        SELECT sql FROM sqlite_master WHERE type='table' AND name = ?
      `).bind(table.name).first();
      
      tables.push({
        name: table.name,
        schema: schemaResult?.sql || 'No schema found'
      });
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: {
        tableCount: tables.length,
        tables: tables
      }
    })));

  } catch (error) {
    console.error('❌ Get database schema error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to get database schema: ' + error.message
    }), { status: 500 }));
  }
}
