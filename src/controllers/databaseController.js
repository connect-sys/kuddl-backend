/**
 * Database Controller
 * Handles database management operations
 */

import bcrypt from 'bcryptjs';
import { addCorsHeaders } from '../utils/cors.js';

// Delhi pincode data with city names
const DELHI_PINCODES = [
  { pincode: '110002', area: 'Ajmeri Gate Extension', city: 'New Delhi' },
  { pincode: '110002', area: 'A G C R', city: 'New Delhi' },
  { pincode: '110002', area: 'Ansari Road', city: 'New Delhi' },
  { pincode: '110003', area: 'Aliganj', city: 'New Delhi' },
  { pincode: '110005', area: 'Anand Parbat', city: 'New Delhi' },
  { pincode: '110005', area: 'Anand Nagar', city: 'New Delhi' },
  { pincode: '110010', area: 'Army Base', city: 'New Delhi' },
  { pincode: '110010', area: 'A P S Colony', city: 'New Delhi' },
  { pincode: '110010', area: 'A F Palam', city: 'New Delhi' },
  { pincode: '110016', area: 'Ashram', city: 'New Delhi' },
  { pincode: '110018', area: 'Ashok Nagar', city: 'New Delhi' },
  { pincode: '110021', area: 'Ashoka Hotel', city: 'New Delhi' },
  { pincode: '110021', area: 'Anand Niketan', city: 'New Delhi' },
  { pincode: '110024', area: 'Amar Colony', city: 'New Delhi' },
  { pincode: '110033', area: 'Adarsh Nagar', city: 'New Delhi' },
  { pincode: '110033', area: 'A T Mills', city: 'New Delhi' },
  { pincode: '110034', area: 'Anandvas Shakurpur', city: 'New Delhi' },
  { pincode: '110036', area: 'Alipur', city: 'New Delhi' },
  { pincode: '110038', area: 'A F Rajokari', city: 'New Delhi' },
  { pincode: '110045', area: 'Ambrohi', city: 'New Delhi' },
  { pincode: '110047', area: 'Arjan Garh', city: 'New Delhi' },
  { pincode: '110049', area: 'Asian Games Village', city: 'New Delhi' },
  { pincode: '110049', area: 'Andrews Ganj', city: 'New Delhi' },
  { pincode: '110051', area: 'Azad Nagar', city: 'New Delhi' },
  { pincode: '110051', area: 'Anarkali', city: 'New Delhi' },
  { pincode: '110052', area: 'Ashok Vihar H O', city: 'New Delhi' },
  { pincode: '110055', area: 'Amrit Kaur Market', city: 'New Delhi' },
  { pincode: '110062', area: 'Ambedkar Nagar', city: 'New Delhi' },
  { pincode: '110005', area: 'Bank Street', city: 'New Delhi' },
  { pincode: '110006', area: 'Bara Tooti', city: 'New Delhi' },
  { pincode: '110007', area: 'Birla Lines', city: 'New Delhi' },
  { pincode: '110010', area: 'Bazar Road', city: 'New Delhi' },
  { pincode: '110032', area: 'Bhola Nath Nagar', city: 'New Delhi' },
  { pincode: '110032', area: 'Balbir Nagar', city: 'New Delhi' },
  { pincode: '110033', area: 'Bhaiparma Nand Nagar', city: 'New Delhi' },
  { pincode: '110039', area: 'Bawana', city: 'New Delhi' },
  { pincode: '110041', area: 'Budh Nagar', city: 'New Delhi' },
  { pincode: '110042', area: 'Badli', city: 'New Delhi' },
  { pincode: '110044', area: 'Badarpur T P Station', city: 'New Delhi' },
  { pincode: '110044', area: 'Badarpur', city: 'New Delhi' },
  { pincode: '110045', area: 'Bakrola', city: 'New Delhi' },
  { pincode: '110052', area: 'Bharat Nagar', city: 'New Delhi' },
  { pincode: '110053', area: 'Bhajanpuri', city: 'New Delhi' },
  { pincode: '110053', area: 'Brahampuri', city: 'New Delhi' },
  { pincode: '110061', area: 'Bijwasan', city: 'New Delhi' },
  { pincode: '110062', area: 'B S F Camp Tigri', city: 'New Delhi' },
  { pincode: '110096', area: 'Bhajan Pura', city: 'New Delhi' },
  { pincode: '110001', area: 'Connaught Place', city: 'New Delhi' },
  { pincode: '110001', area: 'Constitution House', city: 'New Delhi' },
  { pincode: '110006', area: 'Chawri Bazar', city: 'New Delhi' },
  { pincode: '110006', area: 'Chandni Chowk', city: 'New Delhi' },
  { pincode: '110007', area: 'C C Institute', city: 'New Delhi' },
  { pincode: '110010', area: 'Central Ordinance', city: 'New Delhi' },
  { pincode: '110010', area: 'Central Vehicle', city: 'New Delhi' },
  { pincode: '110012', area: 'Central Tractor', city: 'New Delhi' },
  { pincode: '110015', area: 'Central Kirti Nagar', city: 'New Delhi' },
  { pincode: '110018', area: 'Chand Nagar', city: 'New Delhi' },
  { pincode: '110020', area: 'C R R I', city: 'New Delhi' },
  { pincode: '110021', area: 'Chankyapuri', city: 'New Delhi' },
  { pincode: '110054', area: 'Civil Lines', city: 'New Delhi' },
  { pincode: '110054', area: 'C R P F Camp', city: 'New Delhi' },
  { pincode: '110071', area: 'Chhawla', city: 'New Delhi' },
  { pincode: '110094', area: 'Chilla Villege', city: 'New Delhi' }
];

// Complete database reset and initialization
// Clean providers table (remove ALL providers - make it completely empty)
export async function cleanProviders(request, env) {
  try {
    console.log('🧹 Completely emptying providers table...');
    
    // Delete ALL providers - make table completely empty
    await env.KUDDL_DB.prepare(`DELETE FROM providers`).run();
    
    console.log('✅ Providers table is now completely empty');
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Providers table completely emptied',
      providers_count: 0
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
  } catch (error) {
    console.error('❌ Error cleaning providers:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to clean providers table',
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

export async function initializeDatabase(env) {
  try {
    console.log('🔧 Initializing database...');
    
    // Check if database is already initialized
    const checkTables = await env.KUDDL_DB.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name IN (
        'users', 'providers', 'services', 'bookings', 'categories',
        'customer_profiles', 'provider_availability', 'partner_profiles', 'admin_logs',
        'app_settings', 'promo_code_usage', 'promo_codes', 'saved_providers',
        'chat_messages', 'availability_exceptions', 'payments', 'document_verifications',
        'pincodes', 'payment_orders'
      )
    `).all();
    
    if (checkTables.results && checkTables.results.length >= 15) {
      console.log('✅ Database already initialized');
      return { success: true, message: 'Database already initialized' };
    }

    // Define tables to drop
    const tablesToDrop = [
      'reviews', 'notifications', 'children', 'customer_profiles', 
      'provider_availability', 'bookings', 'services', 'providers', 
      'categories', 'users', 'admins', 'partner_profiles', 'document_verifications',
      'pincodes', 'payment_orders'
    ];

    // Get existing tables
    const existingTables = await env.KUDDL_DB.prepare(`
      SELECT name FROM sqlite_master WHERE type='table'
    `).all();

    // Force drop users table specifically
    try {
      await env.KUDDL_DB.prepare('DROP TABLE IF EXISTS users').run();
      console.log('✅ Force dropped users table');
    } catch (error) {
      console.log('⚠️  Users table did not exist or could not be dropped');
    }

    for (const tableName of tablesToDrop) {
      try {
        await env.KUDDL_DB.prepare(`DROP TABLE IF EXISTS ${tableName}`).run();
        console.log(`✅ Dropped table: ${tableName}`);
      } catch (error) {
        console.log(`⚠️  Could not drop table ${tableName}: ${error.message}`);
      }
    }

    // Also drop any remaining tables found in the database
    for (const table of existingTables.results || []) {
      if (!tablesToDrop.includes(table.name)) {
        try {
          await env.KUDDL_DB.prepare(`DROP TABLE IF EXISTS "${table.name}"`).run();
          console.log(`✅ Dropped remaining table: ${table.name}`);
        } catch (error) {
          console.log(`⚠️  Could not drop table ${table.name}: ${error.message}`);
        }
      }
    }

    // Wait for drops to complete
    console.log('🔄 Creating new schema...');

    // 1. Pincodes table (standalone)
    await env.KUDDL_DB.prepare(`
      CREATE TABLE pincodes (
        id TEXT PRIMARY KEY,
        pincode TEXT NOT NULL,
        area TEXT NOT NULL,
        city TEXT NOT NULL,
        state TEXT DEFAULT 'Delhi',
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    console.log('✅ Created pincodes table');

    // 2. Users table (for customers)
    await env.KUDDL_DB.prepare(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        phone TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        role TEXT CHECK (role IN ('customer', 'admin')) DEFAULT 'customer',
        status TEXT CHECK (status IN ('active', 'inactive', 'suspended')) DEFAULT 'active',
        email_verified INTEGER DEFAULT 0,
        phone_verified INTEGER DEFAULT 0,
        profile_image_url TEXT,
        date_of_birth TEXT,
        gender TEXT,
        address TEXT,
        city TEXT,
        state TEXT,
        pincode TEXT,
        last_login_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    console.log('✅ Created users table');

    // 3. Categories table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        module TEXT,
        icon TEXT,
        icon_url TEXT,
        parent_id TEXT REFERENCES categories(id),
        sort_order INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    console.log('✅ Created categories table');

    // 4. Providers table (standalone - no users dependency)
    await env.KUDDL_DB.prepare(`
      CREATE TABLE providers (
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
        service_addresses TEXT,
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
    `).run();
    console.log('✅ Created providers table');

    // 4.5. Admins table (standalone)
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
    console.log('✅ Created admins table');

    // 5. Services table (depends on providers and categories)
    await env.KUDDL_DB.prepare(`
      CREATE TABLE services (
        id TEXT PRIMARY KEY,
        provider_id TEXT REFERENCES providers(id) ON DELETE CASCADE,
        category_id TEXT REFERENCES categories(id),
        subcategory_id TEXT,
        name TEXT NOT NULL,
        description TEXT,
        price_type TEXT CHECK (price_type IN ('hourly', 'daily', 'fixed', 'package')) DEFAULT 'hourly',
        price REAL NOT NULL,
        duration_minutes INTEGER,
        age_group_min INTEGER,
        age_group_max INTEGER,
        max_children INTEGER DEFAULT 1,
        special_requirements TEXT,
        cancellation_policy TEXT,
        images TEXT,
        features TEXT,
        available_pincodes TEXT,
        status TEXT CHECK (status IN ('active', 'inactive', 'draft')) DEFAULT 'active',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    console.log('✅ Created services table');

    // 5. Bookings table (depends on services, users, providers)
    await env.KUDDL_DB.prepare(`
      CREATE TABLE bookings (
        id TEXT PRIMARY KEY,
        service_id TEXT REFERENCES services(id),
        customer_id TEXT REFERENCES users(id),
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
    console.log('✅ Created bookings table');

    // 6. Payment orders table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE payment_orders (
        id TEXT PRIMARY KEY,
        amount INTEGER NOT NULL,
        currency TEXT DEFAULT 'INR',
        status TEXT CHECK (status IN ('created', 'completed', 'failed')) DEFAULT 'created',
        payment_id TEXT,
        booking_id TEXT REFERENCES bookings(id),
        signature TEXT,
        razorpay_payment_id TEXT,
        razorpay_order_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    console.log('✅ Created payment_orders table');

    // 7. Additional supporting tables
    await env.KUDDL_DB.prepare(`
      CREATE TABLE provider_availability (
        id TEXT PRIMARY KEY,
        provider_id TEXT REFERENCES providers(id) ON DELETE CASCADE,
        day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6),
        start_time TEXT,
        end_time TEXT,
        is_available INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    console.log('✅ Created provider_availability table');

    await env.KUDDL_DB.prepare(`
      CREATE TABLE customer_profiles (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        family_size INTEGER,
        children_count INTEGER DEFAULT 0,
        preferred_languages TEXT,
        emergency_contact_name TEXT,
        emergency_contact_phone TEXT,
        special_instructions TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    console.log('✅ Created customer_profiles table');

    await env.KUDDL_DB.prepare(`
      CREATE TABLE children (
        id TEXT PRIMARY KEY,
        customer_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        age INTEGER NOT NULL,
        gender TEXT,
        special_needs TEXT,
        allergies TEXT,
        preferences TEXT,
        medical_conditions TEXT,
        bedtime TEXT,
        dietary_restrictions TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    console.log('✅ Created children table');

    await env.KUDDL_DB.prepare(`
      CREATE TABLE notifications (
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
    console.log('✅ Created notifications table');

    await env.KUDDL_DB.prepare(`
      CREATE TABLE reviews (
        id TEXT PRIMARY KEY,
        booking_id TEXT REFERENCES bookings(id),
        customer_id TEXT REFERENCES users(id),
        provider_id TEXT REFERENCES providers(id),
        service_id TEXT REFERENCES services(id),
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
    console.log('✅ Created reviews table');

    // Document verifications table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE document_verifications (
        id TEXT PRIMARY KEY,
        partner_id TEXT REFERENCES providers(id) ON DELETE CASCADE,
        document_type TEXT NOT NULL,
        document_url TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_size INTEGER,
        mime_type TEXT,
        verification_status TEXT CHECK (verification_status IN ('pending', 'verified', 'rejected', 'needs_review', 'failed')) DEFAULT 'pending',
        ocr_data TEXT,
        rejection_reason TEXT,
        verified_by TEXT,
        verified_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    console.log('✅ Created document_verifications table');

    // Create indexes
    await env.KUDDL_DB.prepare('CREATE INDEX idx_providers_email ON providers(email)').run();
    await env.KUDDL_DB.prepare('CREATE INDEX idx_providers_kyc_status ON providers(kyc_status)').run();
    await env.KUDDL_DB.prepare('CREATE INDEX idx_services_provider_id ON services(provider_id)').run();
    await env.KUDDL_DB.prepare('CREATE INDEX idx_bookings_provider_id ON bookings(provider_id)').run();
    console.log('✅ Created indexes');

    // Keep providers table empty as requested
    console.log('✅ Providers table kept empty as requested');

    // Create single admin credential in admins table
    const adminPasswordHash = await bcrypt.hash('Admin@123', 12);
    await env.KUDDL_DB.prepare(`
      INSERT INTO admins (id, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).bind(
      'admin001',
      'admin@kuddl.co',
      adminPasswordHash,
      'Kuddl',
      'Admin',
      'admin',
      new Date().toISOString(),
      new Date().toISOString()
    ).run();
    console.log('✅ Created single admin credential');

    // Insert default categories
    const categories = [
      { id: 'cat_care', name: 'Kuddl Care', description: 'Nannies, caregivers, and child support services', module: 'CARE', icon: 'heart' },
      { id: 'cat_bloom', name: 'Kuddl Bloom', description: 'Developmental play and early learning', module: 'BLOOM', icon: 'sprout' },
      { id: 'cat_events', name: 'Kuddl Adventure', description: 'Parties, events, and celebrations', module: 'EVENTS', icon: 'party-popper' },
      { id: 'cat_discover', name: 'Kuddl Discover', description: 'Workshops, hobbies, and activities', module: 'DISCOVER', icon: 'compass' }
    ];

    for (const category of categories) {
      await env.KUDDL_DB.prepare(`
        INSERT INTO categories (id, name, description, module, icon, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        category.id, 
        category.name, 
        category.description, 
        category.module,
        category.icon,
        categories.indexOf(category), 
        new Date().toISOString()
      ).run();
    }
    console.log('✅ Created default Kuddl categories');

    // Insert pincode data
    console.log('🔄 Inserting pincode data...');
    for (const pincodeData of DELHI_PINCODES) {
      try {
        await env.KUDDL_DB.prepare(`
          INSERT INTO pincodes (id, pincode, area, city, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).bind(
          `pin_${pincodeData.pincode}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          pincodeData.pincode,
          pincodeData.area,
          pincodeData.city,
          new Date().toISOString()
        ).run();
      } catch (error) {
        // Continue if duplicate
      }
    }
    console.log('✅ Inserted pincode data');

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Database reset and initialized successfully with PRD schema',
      admin: {
        email: 'admin@kuddl.co',
        password: 'Admin@123'
      },
      providers_table: 'empty',
      features: [
        'Complete user management system',
        'Provider profiles and services',
        'Advanced booking system',
        'Payment integration ready',
        'Notification system',
        'Category management',
        'Customer profiles and children',
        'Provider availability management'
      ],
      tables_created: [
        'pincodes', 'users', 'categories', 'providers', 'admins', 'services', 'bookings',
        'payment_orders', 'provider_availability', 'customer_profiles', 'children',
        'notifications', 'reviews'
      ]
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Database reset error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to reset database',
      error: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Create parents and children tables
export async function createParentsAndChildrenTables(request, env) {
  try {
    console.log('Creating parents and children tables...');

    // Drop existing tables if they exist to avoid conflicts
    try {
      await env.KUDDL_DB.prepare(`DROP TABLE IF EXISTS children`).run();
      await env.KUDDL_DB.prepare(`DROP TABLE IF EXISTS parents`).run();
    } catch (error) {
      console.log('Tables might not exist, continuing...');
    }

    // Create parents table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE parents (
        id TEXT PRIMARY KEY,
        phone TEXT UNIQUE NOT NULL,
        email TEXT,
        full_name TEXT,
        address TEXT,
        alternate_contact_name TEXT,
        alternate_contact_phone TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // Create children table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE children (
        id TEXT PRIMARY KEY,
        parent_id TEXT NOT NULL,
        name TEXT NOT NULL,
        age INTEGER,
        date_of_birth TEXT,
        gender TEXT,
        medical_conditions TEXT,
        bedtime TEXT,
        special_needs TEXT,
        allergies TEXT,
        dietary_restrictions TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // Add parent_id column to bookings table if it doesn't exist
    try {
      await env.KUDDL_DB.prepare(`
        ALTER TABLE bookings ADD COLUMN parent_id TEXT
      `).run();
    } catch (error) {
      // Column might already exist, ignore error
      console.log('parent_id column might already exist in bookings table');
    }

    // Insert a dummy parent for testing
    const dummyParentId = crypto.randomUUID();
    const dummyChildId = crypto.randomUUID();

    await env.KUDDL_DB.prepare(`
      INSERT OR REPLACE INTO parents (
        id, phone, email, full_name, address, alternate_contact_name, alternate_contact_phone
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      dummyParentId,
      '+919876543210',
      'test.parent@example.com',
      'Test Parent',
      '123 Test Street, Test City, Test State',
      'Emergency Contact',
      '+919876543211'
    ).run();

    await env.KUDDL_DB.prepare(`
      INSERT OR REPLACE INTO children (
        id, parent_id, name, age, gender, medical_conditions, bedtime, special_needs, allergies
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      dummyChildId,
      dummyParentId,
      'Test Child',
      5,
      'Male',
      'None',
      '8:00 PM',
      'None',
      'None'
    ).run();

    console.log('✅ Parents and children tables created successfully');

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Parents and children tables created successfully',
      tables: ['parents', 'children'],
      dummyData: {
        parentId: dummyParentId,
        childId: dummyChildId
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Failed to create parents and children tables:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to create parents and children tables',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Add Haryana and UP pincode data
export async function addServiceStatePincodes(request, env) {
  try {
    console.log('Adding Haryana and Uttar Pradesh pincode data...');

    // Haryana major cities data
    const haryanaData = [
      { pincode: '122001', area: 'Sector 1', city: 'Gurugram', state: 'Haryana' },
      { pincode: '122002', area: 'Sector 4', city: 'Gurugram', state: 'Haryana' },
      { pincode: '122003', area: 'Sector 9', city: 'Gurugram', state: 'Haryana' },
      { pincode: '122004', area: 'Sector 15', city: 'Gurugram', state: 'Haryana' },
      { pincode: '122005', area: 'Sector 23', city: 'Gurugram', state: 'Haryana' },
      { pincode: '122006', area: 'Sector 31', city: 'Gurugram', state: 'Haryana' },
      { pincode: '122007', area: 'Sector 43', city: 'Gurugram', state: 'Haryana' },
      { pincode: '122008', area: 'Sector 51', city: 'Gurugram', state: 'Haryana' },
      { pincode: '122009', area: 'Sector 56', city: 'Gurugram', state: 'Haryana' },
      { pincode: '122010', area: 'Sector 62', city: 'Gurugram', state: 'Haryana' },
      { pincode: '122011', area: 'Sector 68', city: 'Gurugram', state: 'Haryana' },
      { pincode: '122015', area: 'DLF Phase 1', city: 'Gurugram', state: 'Haryana' },
      { pincode: '122016', area: 'DLF Phase 2', city: 'Gurugram', state: 'Haryana' },
      { pincode: '122017', area: 'DLF Phase 3', city: 'Gurugram', state: 'Haryana' },
      { pincode: '122018', area: 'DLF Phase 4', city: 'Gurugram', state: 'Haryana' },
      { pincode: '122019', area: 'DLF Phase 5', city: 'Gurugram', state: 'Haryana' },
      { pincode: '122022', area: 'Sohna Road', city: 'Gurugram', state: 'Haryana' },
      { pincode: '122050', area: 'Golf Course Road', city: 'Gurugram', state: 'Haryana' },
      { pincode: '122051', area: 'MG Road', city: 'Gurugram', state: 'Haryana' },
      { pincode: '122413', area: 'Rewari Road', city: 'Gurugram', state: 'Haryana' },
      { pincode: '121001', area: 'Model Town', city: 'Faridabad', state: 'Haryana' },
      { pincode: '121002', area: 'New Industrial Town', city: 'Faridabad', state: 'Haryana' },
      { pincode: '121003', area: 'Sector 12', city: 'Faridabad', state: 'Haryana' },
      { pincode: '121004', area: 'Sector 16', city: 'Faridabad', state: 'Haryana' },
      { pincode: '121005', area: 'Sector 21', city: 'Faridabad', state: 'Haryana' },
      { pincode: '132001', area: 'Civil Lines', city: 'Karnal', state: 'Haryana' },
      { pincode: '124001', area: 'Model Town', city: 'Rohtak', state: 'Haryana' },
      { pincode: '125001', area: 'Railway Road', city: 'Hisar', state: 'Haryana' },
      { pincode: '134001', area: 'Sector 1', city: 'Ambala', state: 'Haryana' },
      { pincode: '136001', area: 'Model Town', city: 'Kaithal', state: 'Haryana' }
    ];

    // Uttar Pradesh major cities data
    const upData = [
      { pincode: '201301', area: 'Sector 1', city: 'Noida', state: 'Uttar Pradesh' },
      { pincode: '201302', area: 'Sector 15', city: 'Noida', state: 'Uttar Pradesh' },
      { pincode: '201303', area: 'Sector 19', city: 'Noida', state: 'Uttar Pradesh' },
      { pincode: '201304', area: 'Sector 27', city: 'Noida', state: 'Uttar Pradesh' },
      { pincode: '201305', area: 'Sector 37', city: 'Noida', state: 'Uttar Pradesh' },
      { pincode: '201306', area: 'Sector 50', city: 'Noida', state: 'Uttar Pradesh' },
      { pincode: '201307', area: 'Sector 62', city: 'Noida', state: 'Uttar Pradesh' },
      { pincode: '201308', area: 'Sector 75', city: 'Noida', state: 'Uttar Pradesh' },
      { pincode: '201309', area: 'Sector 104', city: 'Noida', state: 'Uttar Pradesh' },
      { pincode: '201310', area: 'Sector 126', city: 'Noida', state: 'Uttar Pradesh' },
      { pincode: '201012', area: 'Raj Nagar', city: 'Ghaziabad', state: 'Uttar Pradesh' },
      { pincode: '201001', area: 'Civil Lines', city: 'Ghaziabad', state: 'Uttar Pradesh' },
      { pincode: '201002', area: 'Kavi Nagar', city: 'Ghaziabad', state: 'Uttar Pradesh' },
      { pincode: '201003', area: 'Lohia Nagar', city: 'Ghaziabad', state: 'Uttar Pradesh' },
      { pincode: '201004', area: 'Vaishali', city: 'Ghaziabad', state: 'Uttar Pradesh' },
      { pincode: '201005', area: 'Indirapuram', city: 'Ghaziabad', state: 'Uttar Pradesh' },
      { pincode: '201009', area: 'Crossings Republik', city: 'Ghaziabad', state: 'Uttar Pradesh' },
      { pincode: '201014', area: 'Vasundhara', city: 'Ghaziabad', state: 'Uttar Pradesh' },
      { pincode: '226001', area: 'Hazratganj', city: 'Lucknow', state: 'Uttar Pradesh' },
      { pincode: '226002', area: 'Aminabad', city: 'Lucknow', state: 'Uttar Pradesh' },
      { pincode: '226003', area: 'Chowk', city: 'Lucknow', state: 'Uttar Pradesh' },
      { pincode: '226004', area: 'Gomti Nagar', city: 'Lucknow', state: 'Uttar Pradesh' },
      { pincode: '226005', area: 'Indira Nagar', city: 'Lucknow', state: 'Uttar Pradesh' },
      { pincode: '226010', area: 'Aliganj', city: 'Lucknow', state: 'Uttar Pradesh' },
      { pincode: '226016', area: 'Mahanagar', city: 'Lucknow', state: 'Uttar Pradesh' },
      { pincode: '226020', area: 'Jankipuram', city: 'Lucknow', state: 'Uttar Pradesh' },
      { pincode: '282001', area: 'Civil Lines', city: 'Agra', state: 'Uttar Pradesh' },
      { pincode: '282002', area: 'Sadar', city: 'Agra', state: 'Uttar Pradesh' },
      { pincode: '282003', area: 'Kamla Nagar', city: 'Agra', state: 'Uttar Pradesh' },
      { pincode: '282005', area: 'Dayalbagh', city: 'Agra', state: 'Uttar Pradesh' }
    ];

    const allData = [...haryanaData, ...upData];

    // Insert data in batches
    for (const data of allData) {
      await env.KUDDL_DB.prepare(`
        INSERT OR REPLACE INTO pincodes (pincode, area, city, state) 
        VALUES (?, ?, ?, ?)
      `).bind(data.pincode, data.area, data.city, data.state).run();
    }

    console.log('✅ Added', allData.length, 'pincode entries for Haryana and UP');

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Successfully added Haryana and UP pincode data',
      added: allData.length,
      states: ['Haryana', 'Uttar Pradesh']
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Failed to create parents and children tables:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to create parents and children tables',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}
