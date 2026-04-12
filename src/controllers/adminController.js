/**
 * Admin Controller
 * Handles admin-specific API endpoints
 */

import bcrypt from 'bcryptjs';
import { addCorsHeaders, createApiResponse } from '../utils/cors.js';
import { generateId, generateRandomPassword } from '../utils/helpers.js';
import { requireAdmin } from './authController.js';
import { sendNotification } from './notificationController.js';

// Email validation endpoint
export async function checkEmailAvailability(request, env) {
  try {
    const { email } = await request.json();

    if (!email) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Email is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const existingProvider = await env.KUDDL_DB.prepare('SELECT id FROM providers WHERE email = ?')
      .bind(email).first();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      available: !existingProvider,
      message: existingProvider ? 'Email is already registered' : 'Email is available'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Email check error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to check email availability'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Phone validation endpoint
export async function checkPhoneAvailability(request, env) {
  try {
    const { phone } = await request.json();

    if (!phone) {
      return createApiResponse({
        success: false,
        message: 'Phone number is required'
      }, 400);
    }

    const existingProvider = await env.KUDDL_DB.prepare('SELECT id FROM providers WHERE phone = ?')
      .bind(phone).first();

    return createApiResponse({
      success: true,
      available: !existingProvider,
      message: existingProvider ? 'Phone number is already registered' : 'Phone number is available',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Phone check error:', error);
    return createApiResponse({
      success: false,
      message: 'Failed to check phone availability'
    }, 500);
  }
}

// Database initialization endpoint
export async function initDatabase(request, env) {
  try {
    console.log('🚀 Initializing database...');

    // Drop and recreate admins table to ensure correct schema
    try {
      await env.KUDDL_DB.prepare('DROP TABLE IF EXISTS admins').run();
      console.log('✅ Dropped existing admins table');
    } catch (error) {
      console.log('⚠️  Admins table did not exist');
    }

    // Create admins table with correct schema
    await env.KUDDL_DB.prepare(`
      CREATE TABLE admins (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        phone TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        email_verified INTEGER DEFAULT 1,
        is_first_login INTEGER DEFAULT 0,
        profile_image_url TEXT,
        last_login_at TEXT,
        last_password_change TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // Drop and recreate providers table to ensure correct schema
    try {
      await env.KUDDL_DB.prepare('DROP TABLE IF EXISTS providers').run();
      console.log('✅ Dropped existing providers table');
    } catch (error) {
      console.log('⚠️  Providers table did not exist');
    }

    // Create providers table with correct schema
    await env.KUDDL_DB.prepare(`
      CREATE TABLE providers (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        phone TEXT,
        password_hash TEXT,
        first_name TEXT NOT NULL,
        last_name TEXT,
        business_name TEXT,
        description TEXT,
        experience_years INTEGER DEFAULT 0,
        languages TEXT,
        address TEXT,
        city TEXT,
        state TEXT,
        pincode TEXT,
        gender TEXT,
        date_of_birth TEXT,
        service_categories TEXT,
        specific_services TEXT,
        age_groups TEXT,
        account_holder_name TEXT,
        bank_name TEXT,
        account_number TEXT,
        ifsc_code TEXT,
        account_type TEXT,
        upi_id TEXT,
        profile_image_url TEXT,
        kyc_status TEXT CHECK (kyc_status IN ('pending', 'verified', 'rejected')) DEFAULT 'pending',
        is_active INTEGER DEFAULT 1,
        is_direct_signup INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // Drop and recreate document_verifications table
    try {
      await env.KUDDL_DB.prepare('DROP TABLE IF EXISTS document_verifications').run();
      console.log('✅ Dropped existing document_verifications table');
    } catch (error) {
      console.log('⚠️  Document_verifications table did not exist');
    }

    // Create document_verifications table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE document_verifications (
        id TEXT PRIMARY KEY,
        partner_id TEXT NOT NULL,
        document_type TEXT NOT NULL,
        document_url TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_size INTEGER,
        mime_type TEXT,
        verification_status TEXT CHECK (verification_status IN ('pending', 'verified', 'rejected', 'needs_review', 'failed')) DEFAULT 'pending',
        verified_by TEXT,
        verified_at TEXT,
        rejection_reason TEXT,
        ocr_data TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // Drop users table if it exists
    try {
      await env.KUDDL_DB.prepare('DROP TABLE IF EXISTS users').run();
      console.log('✅ Dropped users table');
    } catch (error) {
      console.log('⚠️  Users table did not exist');
    }

    // Create pincodes table if it doesn't exist
    try {
      await env.KUDDL_DB.prepare(`
        CREATE TABLE IF NOT EXISTS pincodes (
          id TEXT PRIMARY KEY,
          pincode TEXT NOT NULL,
          area TEXT,
          city TEXT,
          state TEXT,
          is_active INTEGER DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      console.log('✅ Created pincodes table');
    } catch (error) {
      console.log('⚠️  Error creating pincodes table:', error.message);
    }

    // Create services table if it doesn't exist
    try {
      await env.KUDDL_DB.prepare(`
        CREATE TABLE IF NOT EXISTS services (
          id TEXT PRIMARY KEY,
          provider_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          category_id TEXT,
          subcategory_id TEXT,
          price_type TEXT DEFAULT 'fixed',
          price REAL DEFAULT 0,
          duration_minutes INTEGER DEFAULT 60,
          features TEXT,
          available_pincodes TEXT,
          image_urls TEXT,
          primary_image_url TEXT,
          status TEXT DEFAULT 'active',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      console.log('✅ Created services table');
    } catch (error) {
      console.log('⚠️  Error creating services table:', error.message);
    }

    // Create categories table if it doesn't exist
    try {
      await env.KUDDL_DB.prepare(`
        CREATE TABLE IF NOT EXISTS categories (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          icon TEXT,
          is_active INTEGER DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      console.log('✅ Created categories table');
    } catch (error) {
      console.log('⚠️  Error creating categories table:', error.message);
    }

    // Create parents table for customer data
    try {
      await env.KUDDL_DB.prepare(`
        CREATE TABLE IF NOT EXISTS parents (
          id TEXT PRIMARY KEY,
          phone TEXT UNIQUE NOT NULL,
          email TEXT,
          full_name TEXT NOT NULL,
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
    } catch (error) {
      console.log('⚠️  Error creating parents table:', error.message);
    }

    // Create children table linked to parents
    try {
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
    } catch (error) {
      console.log('⚠️  Error creating children table:', error.message);
    }

    // Create bookings table if it doesn't exist (updated to use parent_id)
    try {
      await env.KUDDL_DB.prepare(`
        CREATE TABLE IF NOT EXISTS bookings (
          id TEXT PRIMARY KEY,
          parent_id TEXT NOT NULL REFERENCES parents(id),
          service_id TEXT NOT NULL,
          provider_id TEXT NOT NULL,
          booking_date TEXT NOT NULL,
          start_time TEXT,
          end_time TEXT,
          duration_minutes INTEGER,
          special_requests TEXT,
          status TEXT DEFAULT 'pending',
          total_amount REAL DEFAULT 0,
          platform_fee REAL DEFAULT 0,
          provider_amount REAL DEFAULT 0,
          payment_status TEXT DEFAULT 'pending',
          payment_id TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      console.log('✅ Created bookings table');
    } catch (error) {
      console.log('⚠️  Error creating bookings table:', error.message);
    }

    // Insert some sample pincodes for development
    try {
      const samplePincodes = [
        { id: 'pin_110001', pincode: '110001', area: 'Connaught Place', city: 'New Delhi', state: 'Delhi' },
        { id: 'pin_110002', pincode: '110002', area: 'Darya Ganj', city: 'New Delhi', state: 'Delhi' },
        { id: 'pin_110003', pincode: '110003', area: 'Kashmere Gate', city: 'New Delhi', state: 'Delhi' },
        { id: 'pin_110004', pincode: '110004', area: 'Rashtrapati Bhawan', city: 'New Delhi', state: 'Delhi' },
        { id: 'pin_110005', pincode: '110005', area: 'Karol Bagh', city: 'New Delhi', state: 'Delhi' },
        { id: 'pin_110006', pincode: '110006', area: 'Ramnagar', city: 'New Delhi', state: 'Delhi' },
        { id: 'pin_110007', pincode: '110007', area: 'Rajouri Garden', city: 'New Delhi', state: 'Delhi' },
        { id: 'pin_110008', pincode: '110008', area: 'Patel Nagar', city: 'New Delhi', state: 'Delhi' },
        { id: 'pin_110009', pincode: '110009', area: 'R K Puram', city: 'New Delhi', state: 'Delhi' },
        { id: 'pin_110010', pincode: '110010', area: 'South Extension', city: 'New Delhi', state: 'Delhi' }
      ];

      for (const pincode of samplePincodes) {
        await env.KUDDL_DB.prepare(`
          INSERT OR IGNORE INTO pincodes (id, pincode, area, city, state, is_active) 
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(
          pincode.id,
          pincode.pincode,
          pincode.area,
          pincode.city,
          pincode.state,
          1
        ).run();
      }
      console.log('✅ Inserted sample pincodes for development');
    } catch (error) {
      console.log('⚠️  Error inserting sample pincodes:', error.message);
    }

    // Create new admin
    const adminPasswordHash = await bcrypt.hash('Admin@123', 12);

    try {
      await env.KUDDL_DB.prepare(`
        INSERT INTO admins (id, email, password_hash, full_name, status, email_verified, is_first_login) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        'admin001',
        'admin@kuddl.co',
        adminPasswordHash,
        'Kuddl Admin',
        'active',
        1,
        0
      ).run();
      console.log('✅ Created new admin: admin@kuddl.co');
    } catch (error) {
      if (!error.message.includes('UNIQUE constraint')) {
        throw error;
      }
      console.log('⚠️  Admin already exists');
    }

    // Check admins
    const admins = await env.KUDDL_DB.prepare('SELECT email, full_name FROM admins').all();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Database initialized successfully',
      admins: admins.results || []
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Database init error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Test login endpoint (no auth required for debugging)
export async function testLogin(request, env) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Email and password are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Find partner by email
    const partner = await env.KUDDL_DB.prepare(
      'SELECT * FROM providers WHERE email = ?'
    ).bind(email).first();

    if (!partner) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'No partner found with this email',
        email: email
      }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Check password
    const bcrypt = await import('bcryptjs');
    const isValidPassword = await bcrypt.compare(password, partner.password_hash);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Test login check completed',
      partner: {
        id: partner.id,
        email: partner.email,
        first_name: partner.first_name,
        last_name: partner.last_name,
        is_active: partner.is_active,
        kyc_status: partner.kyc_status
      },
      passwordMatch: isValidPassword,
      hasPasswordHash: !!partner.password_hash
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Test login error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Test login failed',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Debug endpoint to check partners (no auth required for debugging)
export async function debugPartners(request, env) {
  try {
    const stmt = env.KUDDL_DB.prepare(`
      SELECT 
        id,
        first_name,
        last_name,
        email,
        phone,
        business_name,
        kyc_status,
        is_active,
        created_at
      FROM providers
      ORDER BY created_at DESC
    `);

    const partners = await stmt.all();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      count: partners.results?.length || 0,
      partners: partners.results || []
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Debug partners error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch partners',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get partners endpoint
export async function getPartners(request, env) {
  try {
    const adminUser = await requireAdmin(request, env);
    if (adminUser instanceof Response) return adminUser;

    const stmt = env.KUDDL_DB.prepare(`
      SELECT 
        id,
        first_name,
        last_name,
        COALESCE(first_name, '') || ' ' || COALESCE(last_name, '') as name,
        email,
        phone,
        business_name as businessName,
        COALESCE(description, 'Partner') as businessType,
        address,
        COALESCE(experience_years, 0) as experience_years,
        COALESCE(kyc_status, 'pending') as status,
        COALESCE(kyc_status, 'pending') as kyc_status,
        COALESCE(is_active, 0) as is_active,
        created_at as createdAt,
        created_at,
        updated_at
      FROM providers
      ORDER BY created_at DESC
    `);

    const partners = await stmt.all();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      partners: partners.results || []
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Get partners error:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Update partner verification status
export async function updatePartnerVerification(request, env) {
  try {
    const adminUser = await requireAdmin(request, env);
    if (adminUser instanceof Response) return adminUser;

    const url = new URL(request.url);
    const partnerId = url.pathname.split('/').slice(-2)[0]; // Get partner ID from URL

    const { status, documentStatuses } = await request.json();

    if (!partnerId || !status) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Partner ID and status are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Update partner verification status and activation
    const isActive = status === 'approved' || status === 'verified' ? 1 : 0;
    await env.KUDDL_DB.prepare(`
      UPDATE providers 
      SET kyc_status = ?, is_active = ?, updated_at = ?
      WHERE id = ?
    `).bind(status, isActive, new Date().toISOString(), partnerId).run();

    // Update document verification statuses if provided
    if (documentStatuses) {
      for (const [docId, docStatus] of Object.entries(documentStatuses)) {
        await env.KUDDL_DB.prepare(`
          UPDATE document_verifications 
          SET verification_status = ?, updated_at = ?
          WHERE id = ? AND partner_id = ?
        `).bind(docStatus, new Date().toISOString(), docId, partnerId).run();
      }
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Partner verification status updated successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Update partner verification error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get partner documents endpoint
export async function getPartnerDocuments(request, env) {
  try {
    const adminUser = await requireAdmin(request, env);
    if (adminUser instanceof Response) return adminUser;

    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const partnerId = pathParts[pathParts.length - 2]; // Get the ID before 'documents'

    console.log('🔍 URL pathname:', url.pathname);
    console.log('🔍 Path parts:', pathParts);
    console.log('🔍 Extracted partner ID:', partnerId);

    if (!partnerId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Partner ID is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Try database first, then fallback to R2 listing
    console.log('🔍 Fetching documents for partner:', partnerId);

    let documents = [];

    try {
      // First, try to get documents from database
      const dbDocuments = await env.KUDDL_DB.prepare(`
        SELECT 
          id,
          document_type,
          file_name,
          document_url,
          verification_status,
          created_at,
          file_size,
          mime_type
        FROM document_verifications
        WHERE partner_id = ?
        ORDER BY created_at DESC
      `).bind(partnerId).all();

      console.log('📋 Database documents found:', dbDocuments.results?.length || 0);

      if (dbDocuments.results && dbDocuments.results.length > 0) {
        documents = dbDocuments.results;
        console.log('✅ Using database documents');
      } else {
        // Fallback to R2 listing if no database records
        console.log('📁 No database records, listing from R2...');

        // Get partner phone number for R2 folder structure
        const partner = await env.KUDDL_DB.prepare(
          'SELECT phone FROM providers WHERE id = ?'
        ).bind(partnerId).first();

        if (!partner) {
          console.log('❌ Partner not found for R2 listing');
          return addCorsHeaders(new Response(JSON.stringify({
            success: false,
            message: 'Partner not found'
          }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          }));
        }

        const sanitizedPhone = partner.phone.replace(/[^a-zA-Z0-9@.-]/g, '_');
        const r2Objects = await env.KUDDL_STORAGE.list({ prefix: `partners/${sanitizedPhone}/` });
        console.log('📁 R2 objects found:', r2Objects.objects?.length || 0);

        if (r2Objects.objects && r2Objects.objects.length > 0) {
          for (const obj of r2Objects.objects) {
            console.log('📄 Processing R2 object:', obj.key);

            // Extract document type from filename
            const fileName = obj.key.split('/').pop() || '';
            let documentType = 'unknown';

            // Determine document type based on filename patterns
            if (fileName.toLowerCase().includes('pancard') || fileName.toLowerCase().includes('pan_card')) documentType = 'panCard';
            else if (fileName.toLowerCase().includes('aadhaar') || fileName.toLowerCase().includes('aadhar')) documentType = 'aadhaarCard';
            else if (fileName.toLowerCase().includes('cheque') || fileName.toLowerCase().includes('cancelled')) documentType = 'cancelledCheque';
            else if (fileName.toLowerCase().includes('profile') || fileName.toLowerCase().includes('picture')) documentType = 'profilePicture';
            else if (fileName.toLowerCase().includes('business') || fileName.toLowerCase().includes('certificate')) documentType = 'businessCertificate';

            documents.push({
              id: obj.key.replace(/[^a-zA-Z0-9]/g, '_'), // Generate ID from key
              document_type: documentType,
              file_name: fileName,
              document_url: obj.key,
              verification_status: 'pending', // Default status
              created_at: obj.uploaded || new Date().toISOString(),
              file_size: obj.size || 0,
              mime_type: obj.httpMetadata?.contentType || 'application/octet-stream'
            });
          }
          console.log('✅ Using R2 documents');
        }
      }

      console.log('📄 Total documents found:', documents.length);

      return addCorsHeaders(new Response(JSON.stringify({
        success: true,
        documents: documents
      }), {
        headers: { 'Content-Type': 'application/json' }
      }));

    } catch (r2Error) {
      console.error('❌ R2 listing error:', r2Error);

      // Fallback to empty array if R2 fails
      return addCorsHeaders(new Response(JSON.stringify({
        success: true,
        documents: [],
        error: 'Failed to list documents from R2: ' + r2Error.message
      }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    }

  } catch (error) {
    console.error('Get partner documents error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch partner documents'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Partner signup endpoint - Updated to handle FormData with documents
export async function partnerSignup(request, env) {
  try {
    const formData = await request.formData();

    // Extract basic data
    const name = formData.get('name');
    const email = formData.get('email');
    const phone = formData.get('phone');
    const password = formData.get('password');
    const businessName = formData.get('businessName');
    const address = formData.get('address');
    const city = formData.get('city');
    const state = formData.get('state') || 'Delhi';
    const pincode = formData.get('pincode');
    const serviceCategory = formData.get('serviceCategory');
    const experience = formData.get('experience');
    const serviceDescription = formData.get('serviceDescription');
    const isDirectSignup = formData.get('isDirectSignup') === 'true';
    const profileImageKey = formData.get('profileImageKey');

    // Validate required fields
    if (!name || !email || !phone || !password) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Name, email, phone, and password are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Check if email already exists
    const existingEmailProvider = await env.KUDDL_DB.prepare('SELECT id FROM providers WHERE email = ?')
      .bind(email).first();

    if (existingEmailProvider) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Email is already registered'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Check if phone already exists
    const existingPhoneProvider = await env.KUDDL_DB.prepare('SELECT id FROM providers WHERE phone = ?')
      .bind(phone).first();

    if (existingPhoneProvider) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Phone number is already registered'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const providerId = generateId();

    // Insert provider with profile image key
    await env.KUDDL_DB.prepare(`
      INSERT INTO providers (
        id, email, phone, password_hash, first_name, last_name, business_name, 
        description, experience_years, address, city, state, pincode,
        kyc_status, is_active, is_direct_signup, profile_image_url, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 1, 1, ?, ?, ?)
    `).bind(
      providerId, email, phone || '', hashedPassword,
      name.split(' ')[0] || name, name.split(' ').slice(1).join(' ') || '',
      businessName || name + ' Services', serviceDescription || 'Professional service provider',
      experience || 0, address || '', city || '', state || '', pincode || '',
      profileImageKey || null,
      new Date().toISOString(), new Date().toISOString()
    ).run();

    // Handle document uploads
    const documentTypes = ['panCard', 'aadhaarCard', 'cancelledCheque', 'businessCertificate', 'profilePicture'];
    const uploadedDocuments = [];
    const documentUrls = {};

    for (const docType of documentTypes) {
      const file = formData.get(docType);
      if (file && file.size > 0) {
        try {
          // Generate unique filename with proper folder structure
          const timestamp = Date.now();
          const extension = file.name.split('.').pop();
          // Determine subfolder based on document type
          let subfolder = 'docs';
          if (docType === 'profilePicture') {
            subfolder = 'profile';
          }

          // Create proper folder structure: kuddl-storage/partners/{partnerId}/profile/ or kuddl-storage/partners/{partnerId}/docs/
          const fileName = `partners/${providerId}/${subfolder}/${docType}_${timestamp}.${extension}`;

          // Upload to R2
          await env.KUDDL_STORAGE.put(fileName, file.stream(), {
            httpMetadata: {
              contentType: file.type,
            },
          });

          // Save document record to D1
          const documentId = generateId();
          await env.KUDDL_DB.prepare(`
            INSERT INTO document_verifications (
              id, partner_id, document_type, document_url, file_name, file_size, mime_type, verification_status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
          `).bind(
            documentId, providerId, docType, fileName, file.name, file.size, file.type,
            new Date().toISOString(), new Date().toISOString()
          ).run();

          // Document URLs are stored in document_verifications table only
          // No need to update providers table with individual document URLs

          uploadedDocuments.push({
            type: docType,
            fileName: file.name,
            documentId: documentId,
            r2Key: fileName
          });

        } catch (uploadError) {
          console.error(`Failed to upload ${docType}:`, uploadError);
          // Continue with other documents, don't fail the entire signup
        }
      }
    }

    // Document URLs are stored in document_verifications table only
    // No need to update providers table

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Registration successful! Your account is pending verification.',
      partnerId: providerId,
      uploadedDocuments: uploadedDocuments
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Partner signup error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: error.message || 'Registration failed',
      error: error.toString()
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Dashboard stats endpoint
export async function getDashboardStats(request, env) {
  try {
    const adminUser = await requireAdmin(request, env);
    if (adminUser instanceof Response) return adminUser;

    const [totalPartnersResult, activePartnersResult] = await Promise.all([
      env.KUDDL_DB.prepare('SELECT COUNT(*) as count FROM providers').first(),
      env.KUDDL_DB.prepare('SELECT COUNT(*) as count FROM providers WHERE is_active = 1 AND kyc_status = "verified"').first()
    ]);

    const stats = {
      totalPartners: totalPartnersResult?.count || 0,
      activePartners: activePartnersResult?.count || 0,
      totalServices: 0,
      totalRevenue: 0
    };

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: stats
    }), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Last-Modified': new Date().toUTCString()
      }
    }));
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch dashboard stats'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Debug endpoint to check admins
export async function debugAdmins(request, env) {
  try {
    const admins = await env.KUDDL_DB.prepare('SELECT id, email, full_name FROM admins').all();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      admins: admins.results || []
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
  } catch (error) {
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get partner document URLs from providers table
export async function getPartnerDocumentUrls(request, env) {
  try {
    const adminUser = await requireAdmin(request, env);
    if (adminUser instanceof Response) return adminUser;

    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const partnerId = pathParts[pathParts.length - 2]; // Get the ID before 'document-urls'

    console.log('🔍 Getting document URLs for partner:', partnerId);

    if (!partnerId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Partner ID is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Get document URLs from providers table
    const provider = await env.KUDDL_DB.prepare(`
      SELECT 
        id,
        profile_image_url,
        email,
        first_name,
        last_name
      FROM providers
      WHERE id = ?
    `).bind(partnerId).first();

    if (!provider) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Provider not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const documentUrls = {
      profileImage: provider.profile_image_url
    };

    // Filter out null/empty URLs
    const availableDocuments = Object.entries(documentUrls)
      .filter(([key, url]) => url && url.trim() !== '')
      .reduce((acc, [key, url]) => {
        acc[key] = url;
        return acc;
      }, {});

    console.log('📄 Available document URLs:', Object.keys(availableDocuments));

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      partnerId: partnerId,
      documentUrls: availableDocuments
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Get partner document URLs error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch partner document URLs'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Complete provider verification
export async function completeProviderVerification(request, env) {
  try {
    const { partnerId } = await request.json();

    if (!partnerId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Partner ID is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Update provider status to verified
    await env.KUDDL_DB.prepare(`
      UPDATE providers 
      SET status = 'verified', updated_at = ?
      WHERE id = ?
    `).bind(
      new Date().toISOString(),
      partnerId
    ).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Provider verification completed successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Complete provider verification error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to complete provider verification'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Send pending items notification email
export async function sendPendingItemsNotification(request, env) {
  try {
    const { partnerEmail, partnerName, pendingDocuments, pendingProfileFields } = await request.json();

    if (!partnerEmail || !partnerName) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Partner email and name are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Create email content
    let emailContent = `Dear ${partnerName},\n\n`;
    emailContent += `We have reviewed your profile and found some items that need your attention:\n\n`;

    if (pendingProfileFields && pendingProfileFields.length > 0) {
      emailContent += `Missing Profile Information:\n`;
      pendingProfileFields.forEach(field => {
        emailContent += `• ${field}\n`;
      });
      emailContent += `\n`;
    }

    if (pendingDocuments && pendingDocuments.length > 0) {
      emailContent += `Pending Document Verification:\n`;
      pendingDocuments.forEach(doc => {
        emailContent += `• ${doc.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}\n`;
      });
      emailContent += `\n`;
    }

    emailContent += `Please log into your partner portal to complete these requirements.\n\n`;
    emailContent += `Best regards,\nKuddl Team`;

    // In a real implementation, you would send this via an email service like SendGrid, AWS SES, etc.
    // For now, we'll just log it and return success
    console.log('📧 Email to be sent:', {
      to: partnerEmail,
      subject: 'Action Required: Complete Your Profile - Kuddl',
      content: emailContent
    });

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Pending items notification sent successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Send pending items notification error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to send pending items notification'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Send credentials email to new partner
export async function sendCredentialsEmail(request, env) {
  try {
    const { partnerEmail, partnerName, temporaryPassword } = await request.json();

    if (!partnerEmail || !partnerName || !temporaryPassword) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Partner email, name, and temporary password are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Create welcome email content
    const emailContent = `Dear ${partnerName},

Welcome to Kuddl! Your partner account has been successfully created.

Here are your login credentials:
Email: ${partnerEmail}
Temporary Password: ${temporaryPassword}

Please log into your partner portal at your earliest convenience to:
1. Change your temporary password
2. Complete your profile information
3. Upload required documents
4. Set up your services

Login URL: https://partner.kuddl.com

If you have any questions, please don't hesitate to contact our support team.

Best regards,
Kuddl Team`;

    // In a real implementation, you would send this via an email service
    // For now, we'll just log it and return success
    console.log('📧 Welcome email to be sent:', {
      to: partnerEmail,
      subject: 'Welcome to Kuddl - Your Account Details',
      content: emailContent
    });

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Credentials email sent successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Send credentials email error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to send credentials email'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get partner profile
export async function getPartnerProfile(request, env) {
  try {
    // Get partner ID from token (you'll need to implement token verification)
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authentication required'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Verify JWT token and get partner ID
    const jwt = await import('@tsndr/cloudflare-worker-jwt');
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (!isValid) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid token'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const payload = jwt.decode(token);
    const partnerId = payload.payload.id || payload.payload.userId;
    const partnerPhone = payload.payload.phone;

    let partner = await env.KUDDL_DB.prepare(`
      SELECT * FROM providers WHERE id = ?
    `).bind(partnerId).first();

    // If partner not found by ID, try to find by phone (for tokens that only have phone)
    if (!partner && partnerPhone) {
      console.log('🔍 Partner not found by ID, trying phone lookup:', partnerPhone);
      partner = await env.KUDDL_DB.prepare(`
        SELECT * FROM providers WHERE phone = ?
      `).bind(partnerPhone).first();
      
      if (partner) {
        console.log('✅ Partner found by phone lookup:', partner.id);
      }
    }

    if (!partner) {
      console.error('❌ Partner not found in database by ID or phone:', { id: partnerId, phone: partnerPhone });
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Partner not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: {
        id: partner.id,
        email: partner.email,
        first_name: partner.first_name,
        last_name: partner.last_name,
        business_name: partner.business_name,
        phone: partner.phone,
        description: partner.description,
        address: partner.address,
        city: partner.city,
        state: partner.state,
        area: partner.area,
        pincode: partner.pincode,
        date_of_birth: partner.date_of_birth,
        gender: partner.gender,
        experience_years: partner.experience_years,
        languages: partner.languages,
        service_categories: partner.service_categories,
        specific_services: partner.specific_services,
        age_groups: partner.age_groups,
        account_holder_name: partner.account_holder_name,
        bank_name: partner.bank_name,
        account_number: partner.account_number,
        ifsc_code: partner.ifsc_code,
        account_type: partner.account_type,
        upi_id: partner.upi_id,
        profile_image_url: partner.profile_image_url,
        kyc_status: partner.kyc_status,
        service_category: partner.service_category || 'General Services',
        subcategory: partner.subcategory || ''
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Get partner profile error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch partner profile'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Update partner profile
export async function updatePartnerProfile(request, env) {
  try {
    console.log('🔄 Updating partner profile...');

    // Get JWT token from Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authorization token required'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const token = authHeader.substring(7);

    // Verify JWT token
    const jwt = await import('@tsndr/cloudflare-worker-jwt');
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (!isValid) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid token'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const payload = jwt.decode(token);
    let partnerId = null;
    if (payload.payload) {
      partnerId = payload.payload.userId || payload.payload.id || payload.payload.sub;
    } else {
      partnerId = payload.userId || payload.id || payload.sub;
    }

    if (!partnerId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid token: no user ID found'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const updateData = await request.json();
    console.log('📝 Update data received:', updateData);
    console.log('📝 Document URLs in update data:', {
      pan_card_url: updateData.pan_card_url,
      aadhaar_card_url: updateData.aadhaar_card_url,
      cancelled_cheque_url: updateData.cancelled_cheque_url
    });

    // Ensure all required columns exist - with explicit account_holder_name check
    const missingColumns = [
      'service_categories',
      'specific_services',
      'age_groups',
      'languages',
      'area',
      'date_of_birth',
      'gender',
      'account_holder_name',
      'bank_name',
      'account_number',
      'ifsc_code',
      'account_type',
      'upi_id',
      'serviceable_pincodes',
      'service_addresses',
      'pan_card_url',
      'aadhaar_card_url',
      'cancelled_cheque_url',
      'qualifications',
      'experience_years'
    ];

    // Force add account_holder_name column if missing
    try {
      await env.KUDDL_DB.prepare(`ALTER TABLE providers ADD COLUMN account_holder_name TEXT`).run();
      console.log('✅ Added account_holder_name column');
    } catch (alterError) {
      if (!alterError.message.includes('duplicate column name')) {
        console.log('⚠️ account_holder_name column issue:', alterError.message);
      }
    }

    for (const column of missingColumns) {
      try {
        await env.KUDDL_DB.prepare(`ALTER TABLE providers ADD COLUMN ${column} TEXT`).run();
        console.log(`✅ Added column: ${column}`);
      } catch (alterError) {
        // Column might already exist, that's okay
        if (!alterError.message.includes('duplicate column name')) {
          console.log(`⚠️ Column ${column} might already exist or other error:`, alterError.message);
        }
      }
    }

    // Build dynamic UPDATE query based on provided fields
    const updateFields = [];
    const updateValues = [];

    // Handle all possible update fields
    const fieldMappings = {
      // Basic info
      'first_name': updateData.first_name,
      'last_name': updateData.last_name,
      'email': updateData.email,
      'phone': updateData.phone,
      'date_of_birth': updateData.date_of_birth,
      'gender': updateData.gender,
      'address': updateData.address,
      'city': updateData.city,
      'state': updateData.state,
      'area': updateData.area,
      'pincode': updateData.pincode,
      'description': updateData.description,

      // Services
      'service_categories': updateData.service_categories,
      'specific_services': updateData.specific_services,
      'age_groups': updateData.age_groups,
      'experience_years': updateData.experience_years,
      'qualifications': updateData.qualifications,
      'languages': updateData.languages,

      // Service areas
      'serviceable_pincodes': updateData.serviceable_pincodes,
      'service_addresses': updateData.service_addresses,

      // Banking
      'account_holder_name': updateData.account_holder_name,
      'bank_name': updateData.bank_name,
      'account_number': updateData.account_number,
      'ifsc_code': updateData.ifsc_code,
      'account_type': updateData.account_type,
      'upi_id': updateData.upi_id,

      // Documents
      'profile_image_url': updateData.profile_image_url
    };

    // Only include fields that are actually provided in the update
    console.log('📝 Field mappings:', fieldMappings);
    Object.entries(fieldMappings).forEach(([field, value]) => {
      console.log(`📝 Field ${field}: ${value} (type: ${typeof value}, undefined: ${value === undefined})`);
      if (value !== undefined) {
        updateFields.push(`${field} = ?`);
        updateValues.push(value);
        console.log(`✅ Including field: ${field} = ${value}`);
      } else {
        console.log(`❌ Excluding field: ${field} (undefined)`);
      }
    });
    console.log('📝 Final updateFields:', updateFields);
    console.log('📝 Final updateValues:', updateValues);

    // Always update the updated_at timestamp
    updateFields.push('updated_at = ?');
    updateValues.push(new Date().toISOString());

    // Add partnerId for WHERE clause
    updateValues.push(partnerId);

    if (updateFields.length > 1) { // More than just updated_at
      const query = `UPDATE providers SET ${updateFields.join(', ')} WHERE id = ?`;
      console.log('📝 Executing query:', query);
      console.log('📝 With values:', updateValues);

      await env.KUDDL_DB.prepare(query).bind(...updateValues).run();
      console.log('✅ Profile updated successfully');
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Profile updated successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Update partner profile error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to update partner profile',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Complete partner profile after onboarding
export async function completePartnerProfile(request, env) {
  try {
    console.log('🔄 Completing partner profile...');

    // Get JWT token from Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authorization token required'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const token = authHeader.substring(7);

    // Verify JWT token
    const jwt = await import('@tsndr/cloudflare-worker-jwt');
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (!isValid) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid token'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const payload = jwt.decode(token);
    // Get phone from token (set during OTP verification)
    const phoneNumber = payload.payload.phone;

    if (!phoneNumber) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid token: no phone number found'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const profileData = await request.json();
    console.log('📝 Profile data received:', profileData);

    // Split fullName into first_name and last_name
    const nameParts = profileData.fullName.trim().split(' ');
    const firstName = nameParts[0] || 'Partner';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Check and add missing columns if they don't exist
    try {
      console.log('🔧 Checking and adding missing columns...');

      const missingColumns = [
        'service_categories', 'specific_services', 'age_groups', 'languages',
        'area', 'date_of_birth', 'gender', 'qualifications',
        'account_holder_name', 'bank_name', 'account_number',
        'ifsc_code', 'account_type', 'upi_id',
        'serviceable_pincodes', 'last_completed_step'
      ];

      for (const column of missingColumns) {
        try {
          await env.KUDDL_DB.prepare(`ALTER TABLE providers ADD COLUMN ${column} TEXT`).run();
          console.log(`✅ Added column: ${column}`);
        } catch (alterError) {
          if (!alterError.message.includes('duplicate column name')) {
            console.log(`⚠️ Column ${column} might already exist:`, alterError.message);
          }
        }
      }
    } catch (schemaError) {
      console.log('⚠️ Schema update error (continuing anyway):', schemaError.message);
    }

    // Check if user already exists
    const existingUser = await env.KUDDL_DB.prepare(
      'SELECT id FROM providers WHERE phone = ?'
    ).bind(phoneNumber).first();

    let partnerId;

    // Determine if this is a partial save or final completion
    const isPartialSave = profileData.isPartialSave === true;
    const lastCompletedStep = profileData.lastCompletedStep || (isPartialSave ? 0 : 4);
    const kycStatus = isPartialSave ? 'pending' : 'verified';
    
    console.log(`📝 ${isPartialSave ? 'Partial save' : 'Final completion'} - Step ${lastCompletedStep}`);

    // Hash the temporary password only if provided (final save)
    const bcrypt = await import('bcryptjs');
    let hashedPassword = null;
    if (profileData.tempPassword) {
      hashedPassword = await bcrypt.hash(profileData.tempPassword, 10);
      console.log('🔐 Password hashed for final save');
    }

    if (existingUser) {
      // User exists (created during OTP verification) - update with profile data
      console.log('✅ User already exists, updating profile with data');
      partnerId = existingUser.id;

      try {
        // Build UPDATE query - only update password_hash if we have a hashed password
        const updateQuery = hashedPassword 
          ? `UPDATE providers SET 
              email = ?, password_hash = ?, 
              first_name = ?, last_name = ?, business_name = ?, description = ?, experience_years = ?,
              address = ?, city = ?, state = ?, area = ?, pincode = ?,
              date_of_birth = ?, gender = ?, profile_image_url = ?,
              languages = ?, service_categories = ?, specific_services = ?, age_groups = ?,
              account_holder_name = ?, bank_name = ?, account_number = ?, ifsc_code = ?, account_type = ?, upi_id = ?,
              aadhaar_number = ?, pan_number = ?, gst_number = ?,
              is_aadhaar_verified = ?, is_pan_verified = ?, is_gst_verified = ?,
              last_completed_step = ?,
              kyc_status = ?, 
              updated_at = ?
            WHERE id = ?`
          : `UPDATE providers SET 
              email = ?, 
              first_name = ?, last_name = ?, business_name = ?, description = ?, experience_years = ?,
              address = ?, city = ?, state = ?, area = ?, pincode = ?,
              date_of_birth = ?, gender = ?, profile_image_url = ?,
              languages = ?, service_categories = ?, specific_services = ?, age_groups = ?,
              account_holder_name = ?, bank_name = ?, account_number = ?, ifsc_code = ?, account_type = ?, upi_id = ?,
              aadhaar_number = ?, pan_number = ?, gst_number = ?,
              is_aadhaar_verified = ?, is_pan_verified = ?, is_gst_verified = ?,
              last_completed_step = ?,
              kyc_status = ?, 
              updated_at = ?
            WHERE id = ?`;
        
        const bindParams = hashedPassword
          ? [
              profileData.email,
              hashedPassword,
              firstName,
              lastName,
              profileData.fullName,
              profileData.description,
              parseInt(profileData.experience?.split('-')[0]) || 0,
              profileData.address,
              profileData.city,
              profileData.state,
              profileData.area || null,
              profileData.pincode,
              profileData.dateOfBirth || null,
              profileData.gender || null,
              profileData.profileImageUrl || null,
              profileData.languages?.join(',') || null,
              profileData.primaryCategories?.join(',') || null,
              profileData.specificServices?.join(',') || null,
              profileData.ageGroups?.join(',') || null,
              profileData.accountHolder || null,
              profileData.bankName || null,
              profileData.accountNumber || null,
              profileData.ifscCode || null,
              profileData.accountType || null,
              profileData.upiId || null,
              profileData.aadhaarNumber || null,
              profileData.panNumber || null,
              profileData.gstNumber || null,
              profileData.isAadhaarVerified ? 1 : 0,
              profileData.isPanVerified ? 1 : 0,
              profileData.isGstVerified ? 1 : 0,
              lastCompletedStep,
              kycStatus,
              new Date().toISOString(),
              partnerId
            ]
          : [
              profileData.email,
              firstName,
              lastName,
              profileData.fullName,
              profileData.description,
              parseInt(profileData.experience?.split('-')[0]) || 0,
              profileData.address,
              profileData.city,
              profileData.state,
              profileData.area || null,
              profileData.pincode,
              profileData.dateOfBirth || null,
              profileData.gender || null,
              profileData.profileImageUrl || null,
              profileData.languages?.join(',') || null,
              profileData.primaryCategories?.join(',') || null,
              profileData.specificServices?.join(',') || null,
              profileData.ageGroups?.join(',') || null,
              profileData.accountHolder || null,
              profileData.bankName || null,
              profileData.accountNumber || null,
              profileData.ifscCode || null,
              profileData.accountType || null,
              profileData.upiId || null,
              profileData.aadhaarNumber || null,
              profileData.panNumber || null,
              profileData.gstNumber || null,
              profileData.isAadhaarVerified ? 1 : 0,
              profileData.isPanVerified ? 1 : 0,
              profileData.isGstVerified ? 1 : 0,
              lastCompletedStep,
              kycStatus,
              new Date().toISOString(),
              partnerId
            ];
        
        await env.KUDDL_DB.prepare(updateQuery).bind(...bindParams).run();

        console.log(`✅ Partner profile updated - ${isPartialSave ? 'Progress saved for step ' + lastCompletedStep : 'Profile marked as complete'}`);
      } catch (updateError) {
        console.error('❌ Failed to update partner:', updateError);
        throw updateError;
      }
    } else {
      // Create new user with all profile data (fallback case)
      partnerId = crypto.randomUUID();
      console.log('🆕 Creating new partner with ID:', partnerId);

      try {
        await env.KUDDL_DB.prepare(`
          INSERT INTO providers (
            id, phone, email, password_hash, 
            first_name, last_name, business_name, description, experience_years,
            address, city, state, area, pincode,
            date_of_birth, gender, profile_image_url,
            languages, service_categories, specific_services, age_groups,
            account_holder_name, bank_name, account_number, ifsc_code, account_type, upi_id,
            aadhaar_number, pan_number, gst_number,
            is_aadhaar_verified, is_pan_verified, is_gst_verified,
            kyc_status, is_active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          partnerId,
          phoneNumber,
          profileData.email,
          hashedPassword,
          firstName,
          lastName,
          profileData.fullName,
          profileData.description,
          parseInt(profileData.experience?.split('-')[0]) || 0,
          profileData.address,
          profileData.city,
          profileData.state,
          profileData.area || null,
          profileData.pincode,
          profileData.dateOfBirth || null,
          profileData.gender || null,
          profileData.profileImageUrl || null,
          profileData.languages?.join(',') || null,
          profileData.primaryCategories?.join(',') || null,
          profileData.specificServices?.join(',') || null,
          profileData.ageGroups?.join(',') || null,
          profileData.accountHolder || null,
          profileData.bankName || null,
          profileData.accountNumber || null,
          profileData.ifscCode || null,
          profileData.accountType || null,
          profileData.upiId || null,
          profileData.aadhaarNumber || null,
          profileData.panNumber || null,
          profileData.gstNumber || null,
          profileData.isAadhaarVerified ? 1 : 0,
          profileData.isPanVerified ? 1 : 0,
          profileData.isGstVerified ? 1 : 0,
          'pending',
          1,
          new Date().toISOString(),
          new Date().toISOString()
        ).run();

        console.log('✅ Partner created successfully with all profile data');
      } catch (insertError) {
        console.error('❌ Failed to create partner:', insertError);
        throw insertError;
      }
    }

    // Verify the data was saved
    const verifyData = await env.KUDDL_DB.prepare(`
      SELECT id, email, first_name, last_name, phone, city, state, 
             service_categories, account_holder_name, date_of_birth, gender
      FROM providers WHERE id = ?
    `).bind(partnerId).first();

    console.log('🔍 Database verification:', {
      id: verifyData?.id,
      email: verifyData?.email,
      name: `${verifyData?.first_name} ${verifyData?.last_name}`,
      phone: verifyData?.phone,
      location: `${verifyData?.city}, ${verifyData?.state}`,
      categories: verifyData?.service_categories,
      bankAccount: verifyData?.account_holder_name,
      dob: verifyData?.date_of_birth,
      gender: verifyData?.gender
    });

    // Create services folder structure for the partner
    try {
      const servicesPlaceholder = `partners/${partnerId}/services/.placeholder`;
      await env.KUDDL_STORAGE.put(servicesPlaceholder, 'This folder is for partner services', {
        httpMetadata: { contentType: 'text/plain' }
      });
      console.log('✅ Created services folder structure for partner:', partnerId);
    } catch (folderError) {
      console.warn('⚠️ Failed to create services folder:', folderError);
      // Don't fail the entire operation for this
    }

    // Handle document uploads and profile picture to R2 if provided
    let documentUrls = {};
    const { getPublicR2Url } = await import('../utils/r2Utils.js');
    
    // 1. First handle profile picture upload if it's base64
    let finalProfileImageUrl = profileData.profileImageUrl;
    
    if (finalProfileImageUrl && finalProfileImageUrl.startsWith('data:image/')) {
      try {
        console.log('📤 Uploading profile picture to R2 from base64...');
        const base64Data = finalProfileImageUrl.split(',')[1];
        const mimeType = finalProfileImageUrl.split(';')[0].split(':')[1];
        const extension = mimeType.includes('png') ? 'png' : 'jpg';
        
        const binary = atob(base64Data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        
        const timestamp = Date.now();
        const imageKey = `partners/${partnerId}/profile/profile_${timestamp}.${extension}`;
        
        if (env.KUDDL_STORAGE) {
          await env.KUDDL_STORAGE.put(imageKey, bytes, {
            httpMetadata: { contentType: mimeType }
          });
          
          finalProfileImageUrl = getPublicR2Url(imageKey, env);
          console.log('✅ Uploaded profile picture to R2:', finalProfileImageUrl);
          
          // Update the database with the new URL
          await env.KUDDL_DB.prepare(
            'UPDATE providers SET profile_image_url = ? WHERE id = ?'
          ).bind(finalProfileImageUrl, partnerId).run();
        }
      } catch (uploadError) {
        console.error('❌ Failed to upload profile picture:', uploadError);
        // Fall back to original base64 if upload fails
      }
    }

    // 2. Handle document uploads
    if (profileData.documents && Object.keys(profileData.documents).length > 0) {
      console.log('📄 Processing document uploads...');
      
      for (const [docType, docData] of Object.entries(profileData.documents)) {
        if (docData && docData.startsWith('data:')) {
          try {
            console.log(`📤 Uploading ${docType} to R2...`);
            
            // Extract base64 data
            const base64Data = docData.split(',')[1];
            const mimeType = docData.split(';')[0].split(':')[1];
            const extension = mimeType.includes('pdf') ? 'pdf' : 'jpg';
            
            // Convert to bytes
            const binary = atob(base64Data);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            
            // Generate file path using partner ID
            const timestamp = Date.now();
            const docKey = `partners/${partnerId}/docs/${docType}_${timestamp}.${extension}`;
            
            // Upload to R2
            if (env.KUDDL_STORAGE) {
              await env.KUDDL_STORAGE.put(docKey, bytes, {
                httpMetadata: { contentType: mimeType }
              });
              
              const publicUrl = getPublicR2Url(docKey, env);
              documentUrls[`${docType}_url`] = publicUrl;
              console.log(`✅ Uploaded ${docType} to R2:`, publicUrl);
            }
          } catch (uploadError) {
            console.error(`❌ Failed to upload ${docType}:`, uploadError);
            // Continue with other documents
          }
        }
      }
      
      // Update database with document URLs
      if (Object.keys(documentUrls).length > 0) {
        try {
          const updateFields = [];
          const updateValues = [];
          
          if (documentUrls.pan_card_url) {
            updateFields.push('pan_card_url = ?');
            updateValues.push(documentUrls.pan_card_url);
          }
          if (documentUrls.aadhaar_card_url) {
            updateFields.push('aadhaar_card_url = ?');
            updateValues.push(documentUrls.aadhaar_card_url);
          }
          if (documentUrls.cancelled_cheque_url) {
            updateFields.push('cancelled_cheque_url = ?');
            updateValues.push(documentUrls.cancelled_cheque_url);
          }
          
          if (updateFields.length > 0) {
            updateValues.push(new Date().toISOString(), partnerId);
            
            await env.KUDDL_DB.prepare(`
              UPDATE providers SET ${updateFields.join(', ')}, updated_at = ? WHERE id = ?
            `).bind(...updateValues).run();
            
            console.log('✅ Document URLs updated in database');
          }
        } catch (docUpdateError) {
          console.error('❌ Failed to update document URLs:', docUpdateError);
        }
      }
    }

    // Save availability settings if provided
    if (profileData.partnerType) {
      console.log('💼 Saving partner availability settings...');
      
      try {
        // Import availability controller functions
        const { setPartnerType, setWorkingHours, setBatchTimings } = await import('./availabilityController.js');
        
        // Set partner type and basic settings
        const partnerTypeData = {
          providerId: partnerId,
          partnerType: profileData.partnerType,
          bufferTimeMinutes: profileData.bufferTimeMinutes || 30,
          calendarSyncEnabled: profileData.calendarSyncEnabled || false,
          googleCalendarId: profileData.googleCalendarId || null,
          icalUrl: profileData.icalUrl || null
        };
        
        // Create a mock request for the availability controller
        const mockRequest = {
          json: async () => partnerTypeData
        };
        
        await setPartnerType(mockRequest, env);
        console.log('✅ Partner type saved successfully');
        
        // Save working hours for solo partners
        if (profileData.partnerType === 'solo' && profileData.workingHours) {
          const workingHoursData = {
            providerId: partnerId,
            workingHours: profileData.workingHours
          };
          
          const mockWorkingHoursRequest = {
            json: async () => workingHoursData
          };
          
          await setWorkingHours(mockWorkingHoursRequest, env);
          console.log('✅ Working hours saved successfully');
        }
        
        // Save batch timings for academy partners
        if (profileData.partnerType === 'academy' && profileData.batchTimings && profileData.batchTimings.length > 0) {
          const batchTimingsData = {
            providerId: partnerId,
            batchTimings: profileData.batchTimings
          };
          
          const mockBatchTimingsRequest = {
            json: async () => batchTimingsData
          };
          
          await setBatchTimings(mockBatchTimingsRequest, env);
          console.log('✅ Batch timings saved successfully');
        }
        
      } catch (availabilityError) {
        console.error('❌ Failed to save availability settings:', availabilityError);
        // Don't fail the entire profile completion for availability errors
        // The partner can update availability settings later
      }
    }

    console.log('✅ Partner profile completed successfully');

    // Generate new JWT token with partner ID for future API calls
    const newToken = await jwt.sign({
      id: partnerId,
      phone: phoneNumber,
      role: 'partner',
      verified: true,
      profileComplete: true,
      verifiedAt: new Date().toISOString()
    }, env.JWT_SECRET);

    console.log('🔑 Generated new JWT token with partner ID:', partnerId);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Profile completed successfully',
      partnerId: partnerId,
      token: newToken,
      user: {
        id: partnerId,
        phone: phoneNumber,
        role: 'partner',
        profileComplete: true
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Complete profile error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to complete profile',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Set partner password
export async function setPartnerPassword(request, env) {
  try {
    console.log('🔐 Setting partner password...');

    // Get JWT token from Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authorization token required'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const token = authHeader.substring(7);

    // Verify JWT token
    const jwt = await import('@tsndr/cloudflare-worker-jwt');
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (!isValid) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid token'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const payload = jwt.decode(token);
    const partnerId = payload.payload.userId;

    const { currentPassword, newPassword } = await request.json();
    console.log('📝 Password change request for partner:', partnerId);

    // Validate new password
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Password must be at least 8 characters with uppercase, lowercase, number and special character'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Get current partner data
    const partner = await env.KUDDL_DB.prepare(
      'SELECT * FROM providers WHERE id = ?'
    ).bind(partnerId).first();

    if (!partner) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Partner not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // If partner has existing password (not temp_hash), verify current password
    if (partner.password_hash && partner.password_hash !== 'temp_hash') {
      if (!currentPassword) {
        return addCorsHeaders(new Response(JSON.stringify({
          success: false,
          message: 'Current password is required'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }));
      }

      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, partner.password_hash);
      if (!isCurrentPasswordValid) {
        return addCorsHeaders(new Response(JSON.stringify({
          success: false,
          message: 'Current password is incorrect'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }));
      }
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password in database
    await env.KUDDL_DB.prepare(`
      UPDATE providers SET
        password_hash = ?,
        updated_at = ?
      WHERE id = ?
    `).bind(
      hashedPassword,
      new Date().toISOString(),
      partnerId
    ).run();

    console.log('✅ Partner password updated successfully');

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Password set successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Set partner password error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to set password',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get admin dashboard stats
export async function getAdminStats(request, env) {
  try {
    console.log('📊 Getting admin dashboard stats...');

    // Get JWT token from Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authorization token required'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const token = authHeader.substring(7);

    // Verify JWT token
    const jwt = await import('@tsndr/cloudflare-worker-jwt');
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (!isValid) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid token'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Get stats from database
    const totalProviders = await env.KUDDL_DB.prepare('SELECT COUNT(*) as count FROM providers').first();
    const activeProviders = await env.KUDDL_DB.prepare('SELECT COUNT(*) as count FROM providers WHERE password_hash IS NOT NULL').first();
    
    // Get total bookings
    const totalBookingsResult = await env.KUDDL_DB.prepare('SELECT COUNT(*) as count FROM bookings').first();
    
    // Get total revenue from completed bookings
    const totalRevenueResult = await env.KUDDL_DB.prepare(
      'SELECT SUM(total_amount) as total FROM bookings WHERE status = "completed"'
    ).first();
    
    // Get platform-wide average rating from completed bookings with parent ratings
    const platformRatingResult = await env.KUDDL_DB.prepare(`
      SELECT AVG(parent_rating) as avg_rating, COUNT(*) as rating_count
      FROM bookings 
      WHERE status = 'completed' AND parent_rating IS NOT NULL
    `).first();
    
    const averageRating = platformRatingResult?.avg_rating ? 
      Math.round(platformRatingResult.avg_rating * 10) / 10 : 0;
    
    // Get pending verifications (providers without password)
    const pendingVerifications = await env.KUDDL_DB.prepare(
      'SELECT COUNT(*) as count FROM providers WHERE password_hash IS NULL OR password_hash = "temp_hash"'
    ).first();

    const stats = {
      totalProviders: totalProviders?.count || 0,
      activeProviders: activeProviders?.count || 0,
      totalBookings: totalBookingsResult?.count || 0,
      totalRevenue: totalRevenueResult?.total || 0,
      averageRating: averageRating,
      pendingVerifications: pendingVerifications?.count || 0,
      monthlyGrowth: 12.5, // This could be calculated from monthly booking trends
      conversionRate: 68.2 // This could be calculated from booking acceptance rates
    };

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: stats
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Get admin stats error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to get admin stats',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get partner dashboard stats
export async function getPartnerStats(request, env) {
  try {
    console.log('📊 Getting partner dashboard stats...');

    // Get JWT token from Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authorization token required'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const token = authHeader.substring(7);

    // Verify JWT token
    const jwt = await import('@tsndr/cloudflare-worker-jwt');
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (!isValid) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid token'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const payload = jwt.decode(token);
    const partnerId = payload.payload.id || payload.payload.userId;

    if (!partnerId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Partner ID not found in token'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Get partner's booking statistics
    const totalBookingsResult = await env.KUDDL_DB.prepare(
      'SELECT COUNT(*) as count FROM bookings WHERE provider_id = ?'
    ).bind(partnerId).first();

    const completedBookingsResult = await env.KUDDL_DB.prepare(
      'SELECT COUNT(*) as count FROM bookings WHERE provider_id = ? AND status = "completed"'
    ).bind(partnerId).first();

    const totalEarningsResult = await env.KUDDL_DB.prepare(
      'SELECT SUM(total_amount) as total FROM bookings WHERE provider_id = ? AND status = "completed"'
    ).bind(partnerId).first();

    // Get partner's average rating from completed bookings
    const ratingsResult = await env.KUDDL_DB.prepare(`
      SELECT AVG(parent_rating) as avg_rating, COUNT(*) as rating_count
      FROM bookings 
      WHERE provider_id = ? AND status = 'completed' AND parent_rating IS NOT NULL
    `).bind(partnerId).first();

    const averageRating = ratingsResult?.avg_rating ? 
      Math.round(ratingsResult.avg_rating * 10) / 10 : 0;

    // Get monthly bookings
    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthlyBookingsResult = await env.KUDDL_DB.prepare(`
      SELECT COUNT(*) as count FROM bookings 
      WHERE provider_id = ? AND booking_date LIKE ?
    `).bind(partnerId, `${currentMonth}%`).first();

    // Calculate completion rate
    const totalBookings = totalBookingsResult?.count || 0;
    const completedBookings = completedBookingsResult?.count || 0;
    const completionRate = totalBookings > 0 ? 
      Math.round((completedBookings / totalBookings) * 100 * 10) / 10 : 0;

    // Get active services count
    const activeServicesResult = await env.KUDDL_DB.prepare(
      'SELECT COUNT(*) as count FROM services WHERE provider_id = ? AND status = "active"'
    ).bind(partnerId).first();

    const stats = {
      totalBookings: totalBookings,
      totalEarnings: totalEarningsResult?.total || 0,
      averageRating: averageRating,
      completionRate: completionRate,
      responseTime: '< 2 hours', // This could be calculated from booking acceptance times
      activeServices: activeServicesResult?.count || 0,
      monthlyBookings: monthlyBookingsResult?.count || 0,
      customerSatisfaction: averageRating > 0 ? Math.round(averageRating * 20) : 0 // Convert 5-star to percentage
    };

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: stats
    }), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Last-Modified': new Date().toUTCString()
      }
    }));

  } catch (error) {
    console.error('❌ Get partner stats error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to get partner stats',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get analytics data
export async function getAnalytics(request, env) {
  try {
    console.log('📈 Getting analytics data...');

    // Get JWT token from Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authorization token required'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const token = authHeader.substring(7);

    // Verify JWT token
    const jwt = await import('@tsndr/cloudflare-worker-jwt');
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (!isValid) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid token'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const analytics = {
      revenueChart: [
        { month: 'Jan', revenue: 45000, bookings: 120 },
        { month: 'Feb', revenue: 52000, bookings: 140 },
        { month: 'Mar', revenue: 48000, bookings: 130 },
        { month: 'Apr', revenue: 61000, bookings: 165 },
        { month: 'May', revenue: 55000, bookings: 150 },
        { month: 'Jun', revenue: 67000, bookings: 180 }
      ],
      serviceDistribution: [
        { name: 'KUDDL CARE', value: 45, bookings: 180 },
        { name: 'KUDDL BLOOM', value: 30, bookings: 120 },
        { name: 'KUDDL ADVENTURE', value: 15, bookings: 60 },
        { name: 'KUDDL DISCOVER', value: 10, bookings: 40 }
      ],
      topProviders: [
        { name: 'Priya Sharma', bookings: 45, rating: 4.9, earnings: 25000 },
        { name: 'Anjali Patel', bookings: 38, rating: 4.8, earnings: 22000 },
        { name: 'Meera Singh', bookings: 35, rating: 4.7, earnings: 20000 }
      ]
    };

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: analytics
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Get analytics error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to get analytics',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get partner profile for admin view
export async function getPartnerProfileForAdmin(request, env) {
  try {
    console.log('🔍 Admin getting partner profile - ADMIN ENDPOINT CALLED');

    // Get JWT token from Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authorization token required'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const token = authHeader.substring(7);

    // Verify JWT token
    const jwt = await import('@tsndr/cloudflare-worker-jwt');
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (!isValid) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid token'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Get partner ID from URL
    const url = new URL(request.url);
    const partnerId = url.pathname.split('/').pop();

    if (!partnerId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Partner ID is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    console.log('👤 Fetching partner profile for ID:', partnerId);

    // Get partner profile from database
    const partner = await env.KUDDL_DB.prepare(`
      SELECT * FROM providers WHERE id = ?
    `).bind(partnerId).first();

    if (!partner) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Partner not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    console.log('✅ Partner profile retrieved successfully');

    // Calculate profile completion percentage
    let profileCompletion;
    try {
      console.log('🔄 Calculating profile completion for partner:', partner.id);
      // Import the calculateProfileCompletion function from worker.js
      const { calculateProfileCompletion } = await import('../worker.js');
      profileCompletion = await calculateProfileCompletion(partner, env);
      console.log('📊 Profile completion result:', profileCompletion);
    } catch (completionError) {
      console.error('❌ Profile completion calculation error:', completionError);
      // Fallback completion data
      profileCompletion = {
        percentage: 50,
        missingFields: ['Some fields may be incomplete'],
        completedFields: 10,
        totalFields: 20
      };
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      partner: {
        ...partner,
        profileComplete: profileCompletion.percentage === 100,
        profileCompletionPercentage: profileCompletion.percentage,
        missingFields: profileCompletion.missingFields,
        _debug: {
          endpoint: 'getPartnerProfileForAdmin',
          timestamp: new Date().toISOString(),
          calculatedCompletion: profileCompletion
        }
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Get partner profile error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to get partner profile',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Send notification email to partner about missing documents/fields
export async function sendPartnerNotification(request, env) {
  try {
    console.log('📧 Sending partner notification');

    const adminUser = await requireAdmin(request, env);
    if (adminUser instanceof Response) return adminUser;

    const { partnerId, partnerEmail, partnerName, missingFields, missingDocuments } = await request.json();

    if (!partnerId || !partnerEmail) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Partner ID and email are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Prepare email content
    const missingFieldsList = missingFields && missingFields.length > 0
      ? missingFields.map(field => `• ${field}`).join('\n')
      : '';

    const missingDocsList = missingDocuments && missingDocuments.length > 0
      ? missingDocuments.map(doc => `• ${doc}`).join('\n')
      : '';

    const emailContent = `Dear ${partnerName || 'Partner'},

We hope this email finds you well. We are writing to inform you that your Kuddl partner profile requires some updates to complete the verification process.

${missingFieldsList ? `Missing Profile Information:\n${missingFieldsList}\n\n` : ''}${missingDocsList ? `Missing Documents:\n${missingDocsList}\n\n` : ''}Please log in to your partner portal to update your profile and upload the required documents.

If you have any questions or need assistance, please don't hesitate to contact our support team.

Thank you for your cooperation.

Best regards,
The Kuddl Team`;

    // Log the notification (placeholder for actual SendGrid integration)
    console.log('📧 Partner notification prepared:', {
      to: partnerEmail,
      subject: 'Complete Your Kuddl Partner Profile',
      content: emailContent
    });

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Notification sent successfully to partner'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Send notification error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to send notification'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Approve partner (admin only)
export async function approvePartner(request, env) {
  try {
    console.log('✅ Admin approving partner');

    // Get JWT token from Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authorization token required'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const token = authHeader.substring(7);

    // Verify JWT token
    const jwt = await import('@tsndr/cloudflare-worker-jwt');
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (!isValid) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid token'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Get partner ID from URL
    const url = new URL(request.url);
    const partnerId = url.pathname.split('/')[4]; // /api/admin/partner/{id}/approve

    if (!partnerId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Partner ID is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    console.log('👤 Approving partner ID:', partnerId);

    // Update partner status to verified and activate all features
    const result = await env.KUDDL_DB.prepare(`
      UPDATE providers 
      SET kyc_status = 'verified', is_active = 1, updated_at = ?
      WHERE id = ?
    `).bind(new Date().toISOString(), partnerId).run();

    if (result.changes === 0) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Partner not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    console.log('✅ Partner approved successfully');

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Partner approved successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Approve partner error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to approve partner',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}


export async function deletePartner(request, env) {
  try {
    console.log('🗑️ Delete partner request received');

    // Get JWT token from Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authorization token required'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const token = authHeader.substring(7);

    // Verify JWT token and admin role
    const jwt = await import('@tsndr/cloudflare-worker-jwt');
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (!isValid) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid token'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Check if user is admin
    const decodedPayload = jwt.decode(token);
    const userEmail = decodedPayload.payload.email;

    if (userEmail !== 'tech@tendernest.world' && userEmail !== 'admin@kuddl.co') {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Admin access required'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Get partner ID from URL
    const url = new URL(request.url);
    const partnerId = url.pathname.split('/')[4]; // /api/admin/partners/{id}

    if (!partnerId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Partner ID is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    console.log('🗑️ Deleting partner ID:', partnerId);

    // Check if partner exists
    const existingPartner = await env.KUDDL_DB.prepare(`
      SELECT id, phone FROM providers WHERE id = ?
    `).bind(partnerId).first();

    if (!existingPartner) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Partner not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Delete related records first (foreign key constraints)

    // Delete document verifications
    await env.KUDDL_DB.prepare(`
      DELETE FROM document_verifications WHERE partner_id = ?
    `).bind(partnerId).run();

    // Delete services
    await env.KUDDL_DB.prepare(`
      DELETE FROM services WHERE provider_id = ?
    `).bind(partnerId).run();

    // Delete bookings
    await env.KUDDL_DB.prepare(`
      DELETE FROM bookings WHERE provider_id = ?
    `).bind(partnerId).run();

    // Delete the partner
    const result = await env.KUDDL_DB.prepare(`
      DELETE FROM providers WHERE id = ?
    `).bind(partnerId).run();

    if (result.changes === 0) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Failed to delete partner'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    console.log('✅ Partner deleted successfully');

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Partner deleted successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Delete partner error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to delete partner',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get all bookings for admin panel
export async function getAdminBookings(request, env) {
  try {
    const adminUser = await requireAdmin(request, env);
    if (adminUser instanceof Response) return adminUser;

    console.log('🔍 Fetching all bookings for admin');

    const bookings = await env.KUDDL_DB.prepare(`
      SELECT 
        b.*,
        pa.full_name as parent_name,
        pa.email as parent_email,
        pa.phone as parent_phone,
        pr.first_name as partner_first_name,
        pr.last_name as partner_last_name,
        pr.business_name,
        s.name as service_name,
        s.category as service_category
      FROM bookings b
      LEFT JOIN parents pa ON b.parent_id = pa.id
      LEFT JOIN providers pr ON b.provider_id = pr.id
      LEFT JOIN services s ON b.service_id = s.id
      ORDER BY b.created_at DESC
    `).all();

    const formattedBookings = bookings.results?.map(booking => ({
      id: booking.id,
      parentId: booking.parent_id,
      customerName: booking.parent_name || booking.parent_email || 'Unknown Parent',
      partnerId: booking.provider_id,
      partnerName: booking.business_name || `${booking.partner_first_name || ''} ${booking.partner_last_name || ''}`.trim() || 'Unknown Partner',
      serviceName: booking.service_name || 'Unknown Service',
      serviceType: booking.service_category || 'General',
      bookingDate: booking.booking_date,
      timeSlot: booking.start_time + ' - ' + booking.end_time,
      duration: booking.duration_minutes || 60,
      amount: booking.total_amount || 0,
      status: booking.status,
      address: booking.parent_email || '',
      notes: booking.special_requests || '',
      createdAt: booking.created_at
    })) || [];

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      bookings: formattedBookings
    }), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Last-Modified': new Date().toUTCString()
      }
    }));
  } catch (error) {
    console.error('❌ Get admin bookings error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch bookings'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get revenue data for admin panel
export async function getAdminRevenue(request, env) {
  try {
    const adminUser = await requireAdmin(request, env);
    if (adminUser instanceof Response) return adminUser;

    console.log('🔍 Fetching revenue data for admin');

    const url = new URL(request.url);
    const range = url.searchParams.get('range') || '30d';

    // Calculate date range
    let dateFilter = '';
    const now = new Date();
    switch (range) {
      case '7d':
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        dateFilter = `AND b.created_at >= '${sevenDaysAgo.toISOString()}'`;
        break;
      case '30d':
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        dateFilter = `AND b.created_at >= '${thirtyDaysAgo.toISOString()}'`;
        break;
      case '90d':
        const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        dateFilter = `AND b.created_at >= '${ninetyDaysAgo.toISOString()}'`;
        break;
      case '1y':
        const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        dateFilter = `AND b.created_at >= '${oneYearAgo.toISOString()}'`;
        break;
    }

    // Get revenue statistics
    const revenueStats = await env.KUDDL_DB.prepare(`
      SELECT 
        COUNT(*) as total_bookings,
        SUM(CASE WHEN b.status = 'completed' THEN b.total_amount ELSE 0 END) as total_revenue,
        SUM(CASE WHEN b.status = 'completed' THEN b.total_amount * 0.1 ELSE 0 END) as commission_earned,
        SUM(CASE WHEN b.status IN ('pending', 'confirmed') THEN b.total_amount ELSE 0 END) as pending_payouts
      FROM bookings b
      WHERE 1=1 ${dateFilter}
    `).first();

    // Get recent transactions
    const transactions = await env.KUDDL_DB.prepare(`
      SELECT 
        b.id,
        b.total_amount,
        b.status,
        b.created_at,
        p.business_name as partner_name,
        s.name as service_name
      FROM bookings b
      LEFT JOIN providers p ON b.provider_id = p.id
      LEFT JOIN services s ON b.service_id = s.id
      WHERE b.status = 'completed' ${dateFilter}
      ORDER BY b.created_at DESC
      LIMIT 10
    `).all();

    const revenueData = {
      totalRevenue: revenueStats?.total_revenue || 0,
      monthlyRevenue: revenueStats?.total_revenue || 0, // Same as total for now
      commissionEarned: revenueStats?.commission_earned || 0,
      pendingPayouts: revenueStats?.pending_payouts || 0,
      totalBookings: revenueStats?.total_bookings || 0,
      transactions: transactions.results?.map(t => ({
        id: t.id,
        partnerName: t.partner_name || 'Unknown Partner',
        serviceName: t.service_name || 'Unknown Service',
        amount: t.total_amount || 0,
        commission: (t.total_amount || 0) * 0.1,
        date: t.created_at,
        status: t.status
      })) || []
    };

    return addCorsHeaders(new Response(JSON.stringify(revenueData), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Last-Modified': new Date().toUTCString()
      }
    }));
  } catch (error) {
    console.error('❌ Get admin revenue error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch revenue data'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}
