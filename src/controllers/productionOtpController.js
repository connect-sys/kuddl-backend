/**
 * Production OTP Controller
 * Handles OTP generation, storage in D1, and verification using Twilio SMS
 */

import { addCorsHeaders } from '../utils/cors.js';
import jwt from '@tsndr/cloudflare-worker-jwt';

// Generate 6-digit OTP
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Create OTP verifications table
export async function createOtpVerificationsTable(request, env) {
  try {
    console.log('🔧 Creating otp_verifications table...');

    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS otp_verifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT NOT NULL,
        otp TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        attempts INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        used_at INTEGER
      )
    `).run();

    // Add indexes for better performance
    await env.KUDDL_DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_otp_verifications_phone ON otp_verifications(phone)
    `).run();

    await env.KUDDL_DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_otp_verifications_otp ON otp_verifications(otp)
    `).run();

    console.log('✅ otp_verifications table created successfully');

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'OTP verifications table created successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Failed to create otp_verifications table:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to create otp_verifications table',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Send OTP via Twilio SMS
export async function sendProductionOTP(request, env) {
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

    // Generate OTP
    const otp = generateOtp();
    const expiry = Math.floor(Date.now() / 1000) + 300; // 5 minutes from now

    // Delete any existing OTP for this phone number
    await env.KUDDL_DB.prepare(
      'DELETE FROM otp_verifications WHERE phone = ?'
    ).bind(formattedPhone).run();

    // Store new OTP in database
    await env.KUDDL_DB.prepare(
      'INSERT INTO otp_verifications (phone, otp, expires_at, purpose) VALUES (?, ?, ?, ?)'
    ).bind(formattedPhone, otp, expiry, 'login').run();

    // Send SMS via Twilio (with fallback for testing)
    try {
      const twilioAccountSid = env.TWILIO_ACCOUNT_SID;
      const twilioAuthToken = env.TWILIO_AUTH_TOKEN;
      const messagingServiceSid = env.TWILIO_MESSAGING_SERVICE_SID;

      // Check if we're in test mode or if Twilio credentials are missing
      const isTestMode = env.TWILIO_TEST_MODE === 'true';
      const hasValidCredentials = twilioAccountSid && twilioAuthToken && messagingServiceSid;

      if (isTestMode || !hasValidCredentials) {
        console.log('🔧 Test mode or missing Twilio credentials - OTP stored but SMS not sent');
        console.log(`📱 OTP for ${formattedPhone}: ${otp}`);

        return addCorsHeaders(new Response(JSON.stringify({
          success: true,
          message: 'OTP sent successfully',
          developmentMode: true,
          otp: otp // Only include OTP in test mode for testing
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }));
      }

      const auth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);

      const body = new URLSearchParams({
        MessagingServiceSid: messagingServiceSid,
        To: formattedPhone,
        Body: `Kuddl by TenderNest: Your OTP is ${otp}. Valid for 5 minutes.`
      });

      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Twilio SMS API error:', error);
        throw new Error(`Twilio SMS API error: ${error}`);
      }

      const result = await response.json();
      console.log('✅ SMS sent successfully:', result.sid);

    } catch (smsError) {
      console.error('Failed to send SMS:', smsError);

      // Delete the OTP from database if SMS failed
      await env.KUDDL_DB.prepare(
        'DELETE FROM otp_verifications WHERE phone = ? AND otp = ?'
      ).bind(formattedPhone, otp).run();

      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Failed to send OTP SMS. Please try again.',
        error: smsError.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'OTP sent successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Error sending production OTP:', error);
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

// Verify OTP from D1 database
export async function verifyProductionOTP(request, env) {
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

    // Get OTP record from database
    const record = await env.KUDDL_DB.prepare(
      'SELECT * FROM otp_verifications WHERE phone = ? ORDER BY created_at DESC LIMIT 1'
    ).bind(formattedPhone).first();

    if (!record) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'OTP not found or expired'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const now = Math.floor(Date.now() / 1000);

    // Check if OTP is expired
    if (record.expires_at < now) {
      // Delete expired OTP
      await env.KUDDL_DB.prepare(
        'DELETE FROM otp_verifications WHERE id = ?'
      ).bind(record.id).run();

      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'OTP expired'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Check if too many attempts
    if (record.attempts >= 5) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Too many attempts. Please request a new OTP.'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Check if OTP matches
    if (record.otp !== otp) {
      // Increment attempts
      await env.KUDDL_DB.prepare(
        'UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = ?'
      ).bind(record.id).run();

      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid OTP'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // OTP is valid - delete the record
    await env.KUDDL_DB.prepare(
      'DELETE FROM otp_verifications WHERE id = ?'
    ).bind(record.id).run();

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
        console.log('⚠️ Parents table does not exist, creating it...');
        await env.KUDDL_DB.prepare(`
          CREATE TABLE IF NOT EXISTS parents (
            id TEXT PRIMARY KEY,
            phone TEXT UNIQUE NOT NULL,
            full_name TEXT,
            email TEXT,
            address TEXT,
            city TEXT,
            state TEXT,
            pincode TEXT,
            alternate_contact_name TEXT,
            alternate_contact_phone TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )
        `).run();
      }

      // Check if parent already exists
      const existingParent = await env.KUDDL_DB.prepare(
        'SELECT id FROM parents WHERE phone = ?'
      ).bind(formattedPhone).first();

      if (existingParent) {
        parentId = existingParent.id;
        console.log('✅ Using existing parent ID:', parentId);
      } else {
        // Create new parent record
        parentId = crypto.randomUUID();
        const now = new Date().toISOString();

        await env.KUDDL_DB.prepare(`
          INSERT INTO parents (id, phone, full_name, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
        `).bind(parentId, formattedPhone, 'User', now, now).run();

        console.log('✅ Created new parent record with ID:', parentId);
      }

    } catch (dbError) {
      console.error('Database error during parent creation:', dbError);
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'OTP verified but failed to create user record. Please try again.',
        error: dbError.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Generate JWT token (properly signed with jwt.sign so jwt.verify works)
    const token = await jwt.sign({
      id: parentId,
      phone: formattedPhone,
      role: 'customer',
      exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days
    }, env.JWT_SECRET);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'OTP verified successfully',
      token: token,
      user: {
        id: parentId,
        phone: formattedPhone,
        first_name: 'User',
        last_name: '',
        email: '',
        role: 'customer'
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Error verifying production OTP:', error);
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

// Send OTP for Partner Portal (production)
export async function sendPartnerProductionOTP(request, env) {
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

    console.log('📱 Sending partner production OTP to:', formattedPhone);

    // Generate OTP
    const otp = generateOtp();
    const expiry = Math.floor(Date.now() / 1000) + 300; // 5 minutes from now

    // Delete any existing OTP for this phone number
    await env.KUDDL_DB.prepare(
      'DELETE FROM otp_verifications WHERE phone = ?'
    ).bind(formattedPhone).run();

    // Store new OTP in database
    await env.KUDDL_DB.prepare(
      'INSERT INTO otp_verifications (phone, otp, expires_at, purpose) VALUES (?, ?, ?, ?)'
    ).bind(formattedPhone, otp, expiry, 'partner_login').run();

    // Send SMS via Twilio (with fallback for testing)
    try {
      const twilioAccountSid = env.TWILIO_ACCOUNT_SID;
      const twilioAuthToken = env.TWILIO_AUTH_TOKEN;
      const messagingServiceSid = env.TWILIO_MESSAGING_SERVICE_SID;

      // Check if we're in test mode or if Twilio credentials are missing
      const isTestMode = env.TWILIO_TEST_MODE === 'true';
      const hasValidCredentials = twilioAccountSid && twilioAuthToken && messagingServiceSid;

      if (isTestMode || !hasValidCredentials) {
        console.log('🔧 Test mode or missing Twilio credentials - Partner OTP stored but SMS not sent');
        console.log(`📱 Partner OTP for ${formattedPhone}: ${otp}`);

        return addCorsHeaders(new Response(JSON.stringify({
          success: true,
          message: 'OTP sent successfully',
          developmentMode: true,
          otp: otp // Only include OTP in test mode for testing
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }));
      }

      const auth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);

      const body = new URLSearchParams({
        MessagingServiceSid: messagingServiceSid,
        To: formattedPhone,
        Body: `Kuddl Partner by TenderNest: Your OTP is ${otp}. Valid for 5 minutes.`
      });

      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Twilio SMS API error:', error);
        throw new Error(`Twilio SMS API error: ${error}`);
      }

      const result = await response.json();
      console.log('✅ Partner SMS sent successfully:', result.sid);

    } catch (smsError) {
      console.error('Failed to send partner SMS:', smsError);

      // Delete the OTP from database if SMS failed
      await env.KUDDL_DB.prepare(
        'DELETE FROM otp_verifications WHERE phone = ? AND otp = ?'
      ).bind(formattedPhone, otp).run();

      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Failed to send OTP SMS. Please try again.',
        error: smsError.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'OTP sent successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Error sending partner production OTP:', error);
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

// Verify OTP for Partner Registration (production)
export async function verifyPartnerProductionOTP(request, env) {
  try {
    const { phoneNumber, otp, selectedCategories } = await request.json();

    console.log('Partner production OTP verification request:', { phoneNumber, otp: otp ? '***' : 'missing' });

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

    // Get OTP record from database
    const record = await env.KUDDL_DB.prepare(
      'SELECT * FROM otp_verifications WHERE phone = ? ORDER BY created_at DESC LIMIT 1'
    ).bind(formattedPhone).first();

    if (!record) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'OTP not found or expired'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const now = Math.floor(Date.now() / 1000);

    // Check if OTP is expired
    if (record.expires_at < now) {
      await env.KUDDL_DB.prepare(
        'DELETE FROM otp_verifications WHERE id = ?'
      ).bind(record.id).run();

      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'OTP expired'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Check if too many attempts
    if (record.attempts >= 5) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Too many attempts. Please request a new OTP.'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Check if OTP matches
    if (record.otp !== otp) {
      await env.KUDDL_DB.prepare(
        'UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = ?'
      ).bind(record.id).run();

      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid OTP'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // OTP is valid - delete the record
    await env.KUDDL_DB.prepare(
      'DELETE FROM otp_verifications WHERE id = ?'
    ).bind(record.id).run();

    console.log('✅ Partner OTP verified successfully for phone:', formattedPhone);

    // Create or get provider record
    let providerId;
    let isNewUser = false;
    let providerData = null;

    try {
      // Check if provider already exists
      const existingProvider = await env.KUDDL_DB.prepare(
        'SELECT * FROM providers WHERE phone = ?'
      ).bind(formattedPhone).first();

      if (existingProvider) {
        providerId = existingProvider.id;
        providerData = existingProvider;
        console.log('✅ Using existing provider ID:', providerId);
      } else {
        // Create new provider record
        providerId = crypto.randomUUID();
        isNewUser = true;
        const now = new Date().toISOString();

        await env.KUDDL_DB.prepare(`
          INSERT INTO providers (id, phone, email, name, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
          providerId,
          formattedPhone,
          null,
          'Partner',
          1,
          now,
          now
        ).run();

        providerData = {
          id: providerId,
          phone: formattedPhone,
          email: null,
          name: 'Partner'
        };
        console.log('✅ Created new provider record with ID:', providerId);
      }

    } catch (dbError) {
      console.error('Database error during provider creation:', dbError);
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Database error during registration',
        error: dbError.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Generate JWT tokens for provider
    const accessToken = await jwt.sign({
      id: providerId,
      email: providerData.email,
      phone: formattedPhone,
      role: 'partner',
      type: 'access',
      exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days
    }, env.JWT_SECRET);

    const refreshToken = await jwt.sign({
      id: providerId,
      type: 'refresh',
      exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days
    }, env.JWT_SECRET);

    // Calculate profile completion for partners based on essential fields
    const hasEssentialFields = providerData.first_name &&
      providerData.email &&
      providerData.service_categories &&
      providerData.account_holder_name &&
      providerData.account_number;

    // Remove password if it exists
    const { password_hash, ...userWithoutPassword } = providerData;

    const user = {
      ...userWithoutPassword,
      role: 'partner',
      name: `${providerData.first_name || ''} ${providerData.last_name || ''}`.trim(),
      kyc_status: providerData.kyc_status || 'pending',
      profileComplete: !!hasEssentialFields,
      profileCompletionPercentage: hasEssentialFields ? 100 : 50,
      missingFields: hasEssentialFields ? [] : ['Some essential fields missing']
    };

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'OTP verified successfully',
      token: accessToken,
      refreshToken: refreshToken,
      user: user,
      isNewUser: isNewUser
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Error verifying partner production OTP:', error);
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
