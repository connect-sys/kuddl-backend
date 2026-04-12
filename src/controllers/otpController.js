import TwilioService from '../utils/twilioService.js';
import jwt from '@tsndr/cloudflare-worker-jwt';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function addCorsHeaders(response) {
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

// Send OTP to phone number
export async function sendOTP(request, env) {
  try {
    const { phoneNumber, isSignup } = await request.json();

    if (!phoneNumber) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Phone number is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Format phone number to E.164 format
    const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+91${phoneNumber}`;

    // Check if phone number already exists in database (only for signup)
    if (isSignup) {
      try {
        // Check parents table for customer signups
        const existingParent = await env.KUDDL_DB.prepare(
          'SELECT id, full_name FROM parents WHERE phone = ?'
        ).bind(formattedPhone).first();

        if (existingParent) {
          console.log('⚠️ Phone number already registered in parents table:', formattedPhone);
          return addCorsHeaders(new Response(JSON.stringify({
            success: false,
            message: 'Phone number already registered. Please login instead.',
            alreadyRegistered: true
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          }));
        }

        // Also check providers table to avoid conflicts with partner signups
        const existingProvider = await env.KUDDL_DB.prepare(
          'SELECT id, email FROM providers WHERE phone = ?'
        ).bind(formattedPhone).first();

        if (existingProvider) {
          console.log('⚠️ Phone number already registered as provider:', formattedPhone);
          return addCorsHeaders(new Response(JSON.stringify({
            success: false,
            message: 'Phone number already registered as a partner. Please use a different number for customer signup.',
            alreadyRegistered: true
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          }));
        }
      } catch (dbError) {
        console.error('Database check error:', dbError);
        // Continue with OTP send even if DB check fails
      }
    }

    // Send OTP via Twilio Verify
    const twilioService = new TwilioService(env);
    const result = await twilioService.sendOTP(formattedPhone);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'OTP sent successfully',
      verificationSid: result.sid,
      // In test mode, include a hint about the OTP
      ...(env.TWILIO_TEST_MODE === 'true' && {
        testMode: true,
        hint: 'In test mode, use any 6-digit code'
      })
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Error sending OTP:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to send OTP',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Verify OTP
export async function verifyOTP(request, env) {
  try {
    const { phoneNumber, otp } = await request.json();

    if (!phoneNumber || !otp) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Phone number and OTP are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Format phone number to E.164 format
    const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+91${phoneNumber}`;

    // Verify OTP via Twilio Verify
    const twilioService = new TwilioService(env);
    const verificationResult = await twilioService.verifyOTP(formattedPhone, otp);

    if (verificationResult.status !== 'approved') {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid OTP'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    console.log('✅ OTP verified successfully for phone:', formattedPhone);

    // Create parent record in database immediately after OTP verification
    let parentId;
    try {
      // First check if parents table exists
      console.log('🔍 Checking if parents table exists...');
      const tableCheck = await env.KUDDL_DB.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='parents'
      `).first();
      
      if (!tableCheck) {
        console.log('⚠️ Parents table does not exist, creating it now...');
        
        // Create parents table automatically
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
        
        // Also create children table
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
        
        console.log('✅ Created parents and children tables automatically');
      }
      console.log('✅ Parents table exists');

      // Check if parent already exists
      const existingParent = await env.KUDDL_DB.prepare(
        'SELECT id FROM parents WHERE phone = ?'
      ).bind(formattedPhone).first();

      if (existingParent) {
        parentId = existingParent.id;
        console.log('✅ Parent already exists with ID:', parentId);
      } else {
        // Create new parent record with minimal data
        parentId = crypto.randomUUID();
        console.log('🆕 Creating new parent with ID:', parentId);
        console.log('🆕 Parent data to insert:', {
          id: parentId,
          phone: formattedPhone,
          full_name: 'Parent User'
        });

        // Create parent in parents table
        await env.KUDDL_DB.prepare(`
          INSERT INTO parents (
            id, phone, full_name, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?)
        `).bind(
          parentId,
          formattedPhone,
          'Parent User',
          new Date().toISOString(),
          new Date().toISOString()
        ).run();

        console.log('✅ Created parent in parents table');
      }
    } catch (dbError) {
      console.error('❌ Database error during parent creation:', dbError);
      console.error('❌ Database error details:', {
        message: dbError.message,
        stack: dbError.stack,
        name: dbError.name,
        phone: formattedPhone,
        parentId: parentId
      });
      
      // Check if it's a duplicate phone error
      if (dbError.message && dbError.message.includes('UNIQUE constraint failed')) {
        console.log('🔍 Duplicate phone detected, trying to find existing parent...');
        try {
          const existingParent = await env.KUDDL_DB.prepare(
            'SELECT id FROM parents WHERE phone = ?'
          ).bind(formattedPhone).first();
          
          if (existingParent) {
            parentId = existingParent.id;
            console.log('✅ Found existing parent with duplicate phone:', parentId);
          } else {
            console.error('❌ Duplicate error but no existing parent found');
            return addCorsHeaders(new Response(JSON.stringify({
              success: false,
              message: 'Database consistency error. Please try again.',
              error: 'Duplicate phone constraint failed but parent not found'
            }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' }
            }));
          }
        } catch (findError) {
          console.error('❌ Error finding existing parent:', findError);
          return addCorsHeaders(new Response(JSON.stringify({
            success: false,
            message: 'Database error during parent lookup',
            error: findError.message
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          }));
        }
      } else {
        return addCorsHeaders(new Response(JSON.stringify({
          success: false,
          message: 'Failed to create parent record',
          error: dbError.message,
          details: 'Database insertion failed during OTP verification'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }));
      }
    }

    // Generate JWT token with parent ID and phone number
    const token = await jwt.sign({
      id: parentId,
      phone: formattedPhone,
      role: 'customer',
      verified: true,
      verifiedAt: new Date().toISOString()
    }, env.JWT_SECRET);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'OTP verified successfully',
      token,
      user: {
        id: parentId,
        phone: formattedPhone,
        role: 'customer',
        first_name: 'Parent User',
        last_name: '',
        email: ''
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Error verifying OTP:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to verify OTP',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Send OTP for Partner Portal (uses Twilio instead of Firebase)
export async function sendPartnerOTP(request, env) {
  try {
    const { phoneNumber } = await request.json();

    if (!phoneNumber) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Phone number is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Format phone number to E.164 format
    const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+91${phoneNumber}`;

    console.log('📱 Sending partner OTP to:', formattedPhone);

    // Send OTP via Twilio Verify
    const twilioService = new TwilioService(env);
    const result = await twilioService.sendOTP(formattedPhone);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'OTP sent successfully',
      verificationSid: result.sid
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Error sending partner OTP:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to send OTP. Please try again.',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Verify OTP for Partner Registration
export async function verifyPartnerOTP(request, env) {
  try {
    const { phoneNumber, otp, selectedCategories } = await request.json();

    console.log('Partner OTP verification request:', { phoneNumber, otp: otp ? '***' : 'missing' });

    if (!phoneNumber || !otp) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Phone number and OTP are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Normalize phone number
    const formattedPhone = phoneNumber.startsWith('+91') 
      ? phoneNumber 
      : `+91${phoneNumber.replace(/^\+?91?/, '')}`;

    console.log('Formatted phone for partner verification:', formattedPhone);

    // Verify OTP with Twilio
    const twilioService = new TwilioService(env);
    
    const verificationResult = await twilioService.verifyOTP(formattedPhone, otp);
    console.log('Partner OTP verification result:', verificationResult);

    if (verificationResult.status !== 'approved') {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid OTP'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    console.log('✅ Partner OTP verified successfully for phone:', formattedPhone);

    // Create or get provider record in database
    let providerId;
    let providerKycStatus = 'pending'; // Default for new providers
    
    try {
      // Check if provider already exists
      const existingProvider = await env.KUDDL_DB.prepare(`
        SELECT id, phone, email, kyc_status FROM providers WHERE phone = ?
      `).bind(formattedPhone).first();

      if (existingProvider) {
        console.log('✅ Existing provider found:', { id: existingProvider.id, phone: existingProvider.phone, kyc_status: existingProvider.kyc_status });
        providerId = existingProvider.id;
        providerKycStatus = existingProvider.kyc_status || 'pending';
      } else {
        // Create new provider record with UUID
        const newProviderId = crypto.randomUUID();
        console.log('🔄 Creating new provider record with ID:', newProviderId);
        
        // Prepare category data for database storage
        let serviceCategories = null;
        let specificServices = null;
        
        if (selectedCategories && selectedCategories.subcategories && selectedCategories.subcategories.length > 0) {
          console.log('🏷️ Saving selected categories for new provider:', selectedCategories);
          
          // Extract category name from title (e.g., "KUDDL ADVENTURE" -> "ADVENTURE")
          let categoryName = selectedCategories.mainCategory?.title || null;
          if (categoryName && categoryName.startsWith('KUDDL ')) {
            categoryName = categoryName.replace('KUDDL ', '');
          }
          
          // Store main category name (e.g., "ADVENTURE", "CARE", "BLOOM", "DISCOVER")
          serviceCategories = categoryName;
          
          // Store subcategories as comma-separated string
          specificServices = selectedCategories.subcategories.join(',');
          
          console.log('📝 Processed categories:', { serviceCategories, specificServices });
        }

        const insertResult = await env.KUDDL_DB.prepare(`
          INSERT INTO providers (id, phone, kyc_status, service_categories, specific_services, created_at, updated_at)
          VALUES (?, ?, 'pending', ?, ?, datetime('now'), datetime('now'))
        `).bind(newProviderId, formattedPhone, serviceCategories, specificServices).run();

        console.log('📊 Insert result:', { success: insertResult.success, changes: insertResult.meta?.changes });

        if (!insertResult.success) {
          console.error('❌ Failed to create provider record:', insertResult);
          return addCorsHeaders(new Response(JSON.stringify({
            success: false,
            message: 'Failed to create provider account'
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          }));
        }

        providerId = newProviderId;
        providerKycStatus = 'pending';
        console.log('✅ New provider created with ID:', providerId);
        
        // Verify the provider was actually created
        const verifyProvider = await env.KUDDL_DB.prepare(`
          SELECT id, phone, kyc_status FROM providers WHERE id = ?
        `).bind(providerId).first();
        console.log('✅ Provider verification query result:', verifyProvider);
      }

    } catch (dbError) {
      console.error('Database error during provider creation:', dbError);
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Database error during registration'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Generate JWT token for partner
    const token = await jwt.sign({
      id: providerId,
      phone: formattedPhone,
      role: 'partner',
      verifiedAt: new Date().toISOString()
    }, env.JWT_SECRET);

    console.log('✅ Partner token generated for ID:', providerId);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'OTP verified successfully',
      token,
      user: {
        id: providerId,
        phone: formattedPhone,
        role: 'partner',
        kyc_status: providerKycStatus,
        profileComplete: false
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Error verifying partner OTP:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to verify OTP',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}
