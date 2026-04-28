/**
 * Parent Controller
 * Handles parent-related API endpoints for customer portal
 */

import { addCorsHeaders } from '../utils/cors.js';
import { generateId } from '../utils/helpers.js';
import jwt from '@tsndr/cloudflare-worker-jwt';

// Get parent profile
export async function getParentProfile(request, env) {
  try {
    console.log('🔍 Get parent profile API called');
    let parentId = null;
    let tokenId = null;
    let tokenPhone = null;
    
    // Extract token payload
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const decoded = jwt.decode(token);
        if (decoded && decoded.payload) {
          tokenId = decoded.payload.id;
          tokenPhone = decoded.payload.phone;
          console.log('🔍 Token decoded: id=', tokenId, 'phone=', tokenPhone);
        }
      } catch (e) {
        console.log('⚠️ Token decode failed:', e.message);
      }
    }
    
    // Also try to get phone from request body (POST requests)
    let bodyPhone = null;
    if (request.method === 'POST') {
      try {
        const requestData = await request.json();
        bodyPhone = requestData.phone;
      } catch (e) { /* no body */ }
    }
    
    // Resolve phone number
    let phone = tokenPhone || bodyPhone;
    if (!phone && tokenId) {
      const parentRow = await env.KUDDL_DB.prepare(`SELECT phone FROM parents WHERE id = ?`).bind(tokenId).first();
      if (parentRow) phone = parentRow.phone;
    }
    
    const phoneDigits = phone ? phone.replace(/\D/g, '') : '';
    const phone10 = phoneDigits.length > 10 ? phoneDigits.slice(-10) : phoneDigits;
    
    // Find parent by phone (get the one with most data)
    if (phone10) {
      const parentRow = await env.KUDDL_DB.prepare(`
        SELECT id FROM parents 
        WHERE phone LIKE ? OR phone LIKE ? OR phone = ?
        ORDER BY created_at ASC LIMIT 1
      `).bind(`%${phone10}`, phone10, phone || '').first();
      if (parentRow) parentId = parentRow.id;
    }
    
    // Fallback: try tokenId directly
    if (!parentId && tokenId) {
      const parentRow = await env.KUDDL_DB.prepare(`SELECT id FROM parents WHERE id = ?`).bind(tokenId).first();
      if (parentRow) parentId = parentRow.id;
    }
    
    if (!parentId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Parent not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Get parent profile
    const parent = await env.KUDDL_DB.prepare(`
      SELECT * FROM parents WHERE id = ?
    `).bind(parentId).first();

    if (!parent) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Parent profile not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Get children for this parent (native table)
    const childrenRes = await env.KUDDL_DB.prepare(`
      SELECT * FROM children WHERE parent_id = ? ORDER BY created_at DESC
    `).bind(parentId).all();
    const nativeChildren = childrenRes.results || [];

    // Build full set of IDs (parents + users) for customer_children lookup
    let customerIdsForCC = [parentId];
    try {
      const parentPhone = parent.phone;
      if (parentPhone) {
        const digits = parentPhone.replace(/\D/g, '');
        const p10 = digits.length > 10 ? digits.slice(-10) : digits;
        const userRows = await env.KUDDL_DB.prepare(`
          SELECT id FROM users WHERE phone LIKE ? OR phone LIKE ? OR phone = ?
        `).bind(`%${p10}`, p10, parentPhone).all();
        for (const r of (userRows.results || [])) {
          if (!customerIdsForCC.includes(r.id)) customerIdsForCC.push(r.id);
        }
      }
    } catch (e) { /* users table lookup */ }

    // Also get children from web portal (customer_children table)
    let webChildren = [];
    try {
      const ccPH = customerIdsForCC.map(() => '?').join(',');
      const ccRes = await env.KUDDL_DB.prepare(`
        SELECT id, customer_id AS parent_id, name, gender, date_of_birth,
               NULL AS age, NULL AS medical_conditions, NULL AS bedtime,
               NULL AS special_needs, NULL AS allergies,
               NULL AS dietary_restrictions, NULL AS preferences,
               profile_picture AS profile_image, created_at, updated_at
        FROM customer_children WHERE customer_id IN (${ccPH}) ORDER BY created_at DESC
      `).bind(...customerIdsForCC).all();
      webChildren = ccRes.results || [];
    } catch (e) { /* table may not exist */ }

    const seenIds = new Set(nativeChildren.map(c => c.id));
    const mergedChildren = [
      ...nativeChildren,
      ...webChildren.filter(c => !seenIds.has(c.id)),
    ];

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: {
        parent,
        children: mergedChildren
      }
    }), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    }));

  } catch (error) {
    console.error('Get parent profile error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to get parent profile'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get parent children
export async function getParentChildren(request, env) {
  try {
    let parentId = null;
    let tokenId = null;
    let tokenPhone = null;
    
    // Extract token payload
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const decoded = jwt.decode(token);
        if (decoded && decoded.payload) {
          tokenId = decoded.payload.id;
          tokenPhone = decoded.payload.phone;
        }
      } catch (e) {
        console.log('⚠️ Token decode failed:', e.message);
      }
    }
    
    if (!tokenId && !tokenPhone) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Parent authentication required'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Resolve phone number from token
    let phone = tokenPhone;
    if (!phone && tokenId) {
      const parentRow = await env.KUDDL_DB.prepare(`SELECT phone FROM parents WHERE id = ?`).bind(tokenId).first();
      if (parentRow) phone = parentRow.phone;
    }
    
    const phoneDigits = phone ? phone.replace(/\D/g, '') : '';
    const phone10 = phoneDigits.length > 10 ? phoneDigits.slice(-10) : phoneDigits;

    if (!phone10 && !tokenId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'No parent profile found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Find ALL parent IDs for this phone (from parents table – OTP-based mobile/web)
    let allParentIds = [];
    if (phone10) {
      const parentRows = await env.KUDDL_DB.prepare(`
        SELECT id FROM parents WHERE phone LIKE ? OR phone LIKE ? OR phone = ?
      `).bind(`%${phone10}`, phone10, phone || '').all();
      allParentIds = (parentRows.results || []).map(r => r.id);
    }
    if (tokenId && !allParentIds.includes(tokenId)) {
      allParentIds.push(tokenId);
    }

    // Also find IDs from users table (email/password web login) matched by same phone
    // customer_children.customer_id may reference users.id, not parents.id
    let allCustomerIds = [...allParentIds];
    try {
      if (phone10) {
        const userRows = await env.KUDDL_DB.prepare(`
          SELECT id FROM users WHERE phone LIKE ? OR phone LIKE ? OR phone = ?
        `).bind(`%${phone10}`, phone10, phone || '').all();
        for (const r of (userRows.results || [])) {
          if (!allCustomerIds.includes(r.id)) allCustomerIds.push(r.id);
        }
      }
    } catch (e) {
      console.log('users table lookup skipped:', e.message);
    }

    if (allParentIds.length === 0 && allCustomerIds.length === 0) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: true,
        children: []
      }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    console.log('✅ Fetching children for parent IDs:', allParentIds, 'customer IDs:', allCustomerIds);

    // Query native children table (mobile/parent flow)
    let nativeChildren = [];
    if (allParentIds.length > 0) {
      const placeholders = allParentIds.map(() => '?').join(',');
      const childrenRes = await env.KUDDL_DB.prepare(`
        SELECT * FROM children WHERE parent_id IN (${placeholders}) ORDER BY created_at DESC
      `).bind(...allParentIds).all();
      nativeChildren = childrenRes.results || [];
    }

    // Query customer_children table using ALL possible customer IDs (OTP + email/password)
    let webChildren = [];
    try {
      const ccPlaceholders = allCustomerIds.map(() => '?').join(',');
      const ccRes = await env.KUDDL_DB.prepare(`
        SELECT id, customer_id AS parent_id, name, gender, date_of_birth,
               NULL AS age, NULL AS medical_conditions, NULL AS bedtime,
               NULL AS special_needs, NULL AS allergies,
               NULL AS dietary_restrictions, NULL AS preferences,
               profile_picture AS profile_image, created_at, updated_at
        FROM customer_children
        WHERE customer_id IN (${ccPlaceholders})
        ORDER BY created_at DESC
      `).bind(...allCustomerIds).all();
      webChildren = ccRes.results || [];
    } catch (e) {
      console.log('customer_children query skipped:', e.message);
    }

    // Merge – native records take precedence; skip web duplicates by id
    const seenIds = new Set(nativeChildren.map(c => c.id));
    const merged = [
      ...nativeChildren,
      ...webChildren.filter(c => !seenIds.has(c.id)),
    ];

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      children: merged
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Get parent children error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch children'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Update parent profile
export async function updateParentProfile(request, env) {
  try {
    console.log('🔍 Parent Profile Update API called');
    const updateData = await request.json();
    console.log('🔍 Update data received:', updateData);
    
    let parentId = null;
    
    // Primary method: Find/create parent by phone number (no token required)
    if (updateData.phone) {
      console.log('🔍 Processing phone:', updateData.phone);
      const formattedPhone = updateData.phone.replace(/\D/g, '');
      
      // Normalize phone number - remove country code if present to match existing data
      let normalizedPhone = formattedPhone;
      if (normalizedPhone.startsWith('91') && normalizedPhone.length === 12) {
        normalizedPhone = normalizedPhone.substring(2); // Remove 91 prefix
      }
      
      console.log('🔍 Using normalized phone:', normalizedPhone);
      
      // Find existing parent first
      const existingParent = await env.KUDDL_DB.prepare(`
        SELECT id FROM parents WHERE phone = ?
      `).bind(normalizedPhone).first();
      
      if (existingParent) {
        parentId = existingParent.id;
        console.log('✅ Found existing parent:', parentId);
        // Continue to UPDATE section to update existing parent
      } else {
        // Create new parent only if none exists
        parentId = generateId();
        console.log('🆕 Creating new parent with ID:', parentId);
        
        await env.KUDDL_DB.prepare(`
          INSERT INTO parents (
            id, phone, full_name, email, address, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
          parentId,
          normalizedPhone,
          updateData.full_name || updateData.fullName || updateData.name || 'Parent User',
          updateData.email || '',
          updateData.address || '',
          new Date().toISOString(),
          new Date().toISOString()
        ).run();
        
        console.log('✅ Created new parent:', parentId);
      }
    }
    
    // Fallback: Try JWT token if phone method failed
    if (!parentId) {
      const authHeader = request.headers.get('Authorization');
      console.log('🔄 Fallback to token authentication');
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        console.log('🔍 Token extracted:', token.substring(0, 50) + '...');
        
        try {
          const isValid = await jwt.verify(token, env.JWT_SECRET);
          if (isValid) {
            const decoded = jwt.decode(token);
            parentId = decoded.payload.id;
            console.log('✅ Got parent ID from token:', parentId);
          }
        } catch (tokenError) {
          console.log('⚠️ Token validation failed:', tokenError.message);
        }
      }
    }
    
    if (!parentId) {
      console.log('❌ No parent ID found via phone or token');
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Phone number is required to update profile'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Update parent profile (excluding phone to avoid UNIQUE constraint issues)
    const parentUpdates = {};
    if (updateData.fullname || updateData.fullName || updateData.name) parentUpdates.fullname = updateData.fullname || updateData.fullName || updateData.name;
    if (updateData.email) parentUpdates.email = updateData.email;
    if (updateData.gender) parentUpdates.gender = updateData.gender;
    if (updateData.date_of_birth) parentUpdates.date_of_birth = updateData.date_of_birth;
    if (updateData.profile_picture) parentUpdates.profile_picture = updateData.profile_picture;
    // Skip phone update to avoid UNIQUE constraint conflicts
    if (updateData.address) parentUpdates.address = updateData.address;
    if (updateData.city) parentUpdates.city = updateData.city;
    if (updateData.state) parentUpdates.state = updateData.state;
    if (updateData.pincode) parentUpdates.pincode = updateData.pincode;
    if (updateData.country) parentUpdates.country = updateData.country;
    if (updateData.alternate_contact_name || updateData.alternateContactName) parentUpdates.alternate_contact_name = updateData.alternate_contact_name || updateData.alternateContactName;
    if (updateData.alternate_contact_phone || updateData.alternateContactPhone) parentUpdates.alternate_contact_phone = updateData.alternate_contact_phone || updateData.alternateContactPhone;

    console.log('🔍 Parent updates to apply:', parentUpdates);
    
    if (Object.keys(parentUpdates).length > 0) {
      const setClause = Object.keys(parentUpdates).map(k => `${k} = ?`).join(', ');
      const values = [...Object.values(parentUpdates), new Date().toISOString(), parentId];
      
      console.log('🔍 SQL Update query:', `UPDATE parents SET ${setClause}, updated_at = ? WHERE id = ?`);
      console.log('🔍 SQL Update values:', values);
      
      const result = await env.KUDDL_DB.prepare(`
        UPDATE parents SET ${setClause}, updated_at = ? WHERE id = ?
      `).bind(...values).run();
      
      console.log('✅ Database update result:', result);
    } else {
      console.log('ℹ️ No updates to apply - parent profile already exists');
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Parent profile updated successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Update parent profile error:', error);
    console.error('❌ Error details:', error.message);
    console.error('❌ Error stack:', error.stack);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to update parent profile: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Add child
export async function addChild(request, env) {
  try {
    console.log('🚀 Starting addChild function...');
    
    // Check children table structure
    try {
      const tableInfo = await env.KUDDL_DB.prepare(`PRAGMA table_info(children)`).all();
      console.log('📋 Children table structure:', JSON.stringify(tableInfo, null, 2));
      const columns = (tableInfo.results || tableInfo).map(col => col.name);
      console.log('📋 Column names:', columns.join(', '));
    } catch (tableError) {
      console.error('❌ Error checking table structure:', tableError);
    }
    
    // Get authenticated parent from token
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ No authorization header');
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authorization token required'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const token = authHeader.substring(7);
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    
    if (!isValid) {
      console.log('❌ Invalid token');
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid token'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const decoded = jwt.decode(token);
    const parentId = decoded.payload.id;
    console.log('👤 Parent ID:', parentId);
    
    const childData = await request.json();
    console.log('📝 Received child data:', JSON.stringify(childData, null, 2));

    // Validate required fields (age is derived from DOB if not provided)
    const childName = childData.name || childData.full_name;
    if (!childName) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Child name is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Keep DOB in DD-MM-YYYY format as received
    let dobForDB = childData.dateOfBirth || childData.date_of_birth;

    // Calculate age from dateOfBirth if age not explicitly provided
    // Age should be INTEGER (years only)
    let ageValue = childData.age || null;
    if (!ageValue && dobForDB) {
      // Parse DD-MM-YYYY format
      let dob;
      if (dobForDB.includes('-')) {
        const parts = dobForDB.split('-');
        if (parts.length === 3 && parts[0].length === 2) {
          // DD-MM-YYYY format
          dob = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
        } else {
          dob = new Date(dobForDB);
        }
      } else {
        dob = new Date(dobForDB);
      }
      
      if (!isNaN(dob.getTime())) {
        const now = new Date();
        let years = now.getFullYear() - dob.getFullYear();
        const mDiff = now.getMonth() - dob.getMonth();
        if (mDiff < 0 || (mDiff === 0 && now.getDate() < dob.getDate())) years--;
        ageValue = Math.max(years, 0); // INTEGER only
      }
    }

    const childId = generateId();
    
    console.log('💾 Inserting child:', { 
      childId, 
      parentId, 
      childName, 
      ageValue, 
      dobForDB,
      gender: childData.gender,
      medicalConditions: childData.medicalConditions,
      bedtime: childData.bedtime,
      dietaryRestrictions: childData.dietaryRestrictions,
      specialNeeds: childData.specialNeeds,
      allergies: childData.allergies,
      profile_picture: childData.profile_picture
    });
    
    try {
      await env.KUDDL_DB.prepare(`
        INSERT INTO children (
          id, parent_id, name, date_of_birth, gender, 
          medical_conditions, allergies, dietary_restrictions,
          special_needs, bedtime, profile_picture,
          is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        childId, 
        parentId, 
        childName, 
        dobForDB || null,
        childData.gender || null,
        childData.medicalConditions || null,
        childData.allergies || null,
        childData.dietaryRestrictions || null,
        childData.specialNeeds || null,
        childData.bedtime || null,
        childData.profile_picture || null,
        1, // is_active
        new Date().toISOString(), 
        new Date().toISOString()
      ).run();
      
      console.log('✅ Child inserted successfully');
    } catch (dbError) {
      console.error('❌ Database insert error:', dbError);
      console.error('❌ Error message:', dbError.message);
      console.error('❌ Error stack:', dbError.stack);
      throw dbError;
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Child added successfully',
      childId
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Add child error:', error);
    console.error('❌ Error message:', error.message);
    console.error('❌ Error stack:', error.stack);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to add child',
      error: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get parent bookings
export async function getParentBookings(request, env) {
  try {
    let parentId = null;
    let tokenId = null;
    let tokenPhone = null;
    
    // Extract token payload
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      // Try proper JWT verification first, then fallback to decode
      try {
        const decoded = jwt.decode(token);
        if (decoded && decoded.payload) {
          tokenId = decoded.payload.id;
          tokenPhone = decoded.payload.phone;
          console.log('🔍 Bookings - Token decoded: id=', tokenId, 'phone=', tokenPhone);
        }
      } catch (e) {
        console.log('⚠️ Token decode failed:', e.message);
      }
    }
    
    if (!tokenId && !tokenPhone) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Parent authentication required'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Resolve phone number from token
    let phone = tokenPhone;
    
    // If we have tokenId, find the phone from parents table
    if (!phone && tokenId) {
      const parentRow = await env.KUDDL_DB.prepare(`SELECT phone FROM parents WHERE id = ?`).bind(tokenId).first();
      if (parentRow) phone = parentRow.phone;
    }
    
    // Clean phone to digits only for matching
    const phoneDigits = phone ? phone.replace(/\D/g, '') : '';
    // Get last 10 digits for matching (strip country code)
    const phone10 = phoneDigits.length > 10 ? phoneDigits.slice(-10) : phoneDigits;
    
    console.log('🔍 Resolved phone digits:', phone10, 'from tokenId:', tokenId, 'tokenPhone:', tokenPhone);

    if (!phone10 && !tokenId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'No parent profile found for this account'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Find ALL parent IDs for this phone number (handles duplicate parent records)
    let allParentIds = [];
    
    if (phone10) {
      const parentRows = await env.KUDDL_DB.prepare(`
        SELECT id, phone FROM parents 
        WHERE phone LIKE ? OR phone LIKE ? OR phone = ?
      `).bind(`%${phone10}`, phone10, phone || '').all();
      
      allParentIds = (parentRows.results || []).map(r => r.id);
      console.log('🔍 Found parent IDs by phone:', allParentIds);
    }
    
    // Also add tokenId itself in case it's used directly as parent_id in bookings
    if (tokenId && !allParentIds.includes(tokenId)) {
      allParentIds.push(tokenId);
    }

    if (allParentIds.length === 0) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'No parent profile found for this account'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Use the first parent_id as the primary one
    parentId = allParentIds[0];

    console.log('🔍 Fetching bookings for parent IDs:', allParentIds);
    
    // Build query for all parent IDs
    const placeholders = allParentIds.map(() => '?').join(',');
    const bookings = await env.KUDDL_DB.prepare(`
      SELECT 
        b.*,
        s.name as service_name,
        pr.business_name,
        pr.name as provider_name,
        bo.otp_code,
        bo.status as otp_status,
        bo.expires_at as otp_expires_at
      FROM bookings b
      LEFT JOIN services s ON b.service_id = s.id
      LEFT JOIN providers pr ON b.provider_id = pr.id
      LEFT JOIN booking_otps bo ON b.id = bo.booking_id
      WHERE b.parent_id IN (${placeholders})
      ORDER BY b.created_at DESC
    `).bind(...allParentIds).all();
    
    console.log('🔍 Bookings query result:', bookings);
    console.log('🔍 Number of bookings found:', bookings.results?.length || 0);

    // Get children for all parent IDs
    const children = await env.KUDDL_DB.prepare(`
      SELECT * FROM children WHERE parent_id IN (${placeholders})
    `).bind(...allParentIds).all();

    const formattedBookings = bookings.results?.map(booking => {
      let bookingDetails = {};
      try {
        bookingDetails = JSON.parse(booking.special_requests || '{}');
      } catch (e) {
        bookingDetails = { specialInstructions: booking.special_requests };
      }

      return {
        id: booking.id,
        serviceId: booking.service_id,
        serviceName: booking.service_name || 'Unknown Service',
        serviceCategory: 'General', // Default category since column doesn't exist
        providerId: booking.provider_id,
        providerName: booking.business_name || booking.provider_name || 'Unknown Provider',
        bookingDate: booking.booking_date,
        startTime: booking.start_time,
        endTime: booking.end_time,
        duration: booking.duration_minutes,
        totalAmount: booking.total_amount,
        status: booking.status,
        paymentStatus: booking.payment_status,
        otpCode: booking.otp_code,
        otpStatus: booking.otp_status,
        otpExpiresAt: booking.otp_expires_at,
        bookingDetails,
        children: bookingDetails.children || [],
        createdAt: booking.created_at
      };
    }) || [];

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: {
        bookings: formattedBookings,
        children: children.results || []
      }
    }), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    }));

  } catch (error) {
    console.error('❌ Get parent bookings error:', error);
    console.error('❌ Error details:', error.message);
    console.error('❌ Error stack:', error.stack);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to get bookings: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Combined dashboard - returns profile + bookings + children in one call
export async function getParentDashboard(request, env) {
  try {
    let tokenId = null;
    let tokenPhone = null;
    
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const decoded = jwt.decode(token);
        if (decoded && decoded.payload) {
          tokenId = decoded.payload.id;
          tokenPhone = decoded.payload.phone;
        }
      } catch (e) { console.log('Token decode failed:', e.message); }
    }

    if (!tokenId && !tokenPhone) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false, message: 'Authentication required'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    // Resolve phone
    let phone = tokenPhone;
    if (!phone && tokenId) {
      const row = await env.KUDDL_DB.prepare(`SELECT phone FROM parents WHERE id = ?`).bind(tokenId).first();
      if (row) phone = row.phone;
    }

    const phoneDigits = phone ? phone.replace(/\D/g, '') : '';
    const phone10 = phoneDigits.length > 10 ? phoneDigits.slice(-10) : phoneDigits;

    // Find ALL parent IDs across parents, bookings, and children tables
    // Use phone variants to catch all formats: 8740863229, 918740863229, +918740863229
    let allParentIds = new Set();
    
    if (phone10) {
      const v1 = phone10;           // 8740863229
      const v2 = `91${phone10}`;    // 918740863229
      const v3 = `+91${phone10}`;   // +918740863229

      // From parents table
      const pRows = await env.KUDDL_DB.prepare(
        `SELECT id FROM parents WHERE phone = ? OR phone = ? OR phone = ? OR phone LIKE ?`
      ).bind(v1, v2, v3, `%${v1}`).all();
      (pRows.results || []).forEach(r => allParentIds.add(r.id));

      // From bookings table (parent_id may reference a deleted parent)
      const bRows = await env.KUDDL_DB.prepare(
        `SELECT DISTINCT parent_id FROM bookings WHERE parent_id IN 
         (SELECT id FROM parents WHERE phone = ? OR phone = ? OR phone = ? OR phone LIKE ?)`
      ).bind(v1, v2, v3, `%${v1}`).all();
      (bRows.results || []).forEach(r => allParentIds.add(r.parent_id));

      // From children table
      const cRows = await env.KUDDL_DB.prepare(
        `SELECT DISTINCT parent_id FROM children WHERE parent_id IN 
         (SELECT id FROM parents WHERE phone = ? OR phone = ? OR phone = ? OR phone LIKE ?)`
      ).bind(v1, v2, v3, `%${v1}`).all();
      (cRows.results || []).forEach(r => allParentIds.add(r.parent_id));
    }
    if (tokenId) allParentIds.add(tokenId);

    const parentIdArray = [...allParentIds];
    console.log('🔍 Dashboard: resolved parent IDs:', parentIdArray, 'phone10:', phone10);

    // Get parent profile (first existing parent with this phone)
    let parentProfile = null;
    if (phone10) {
      parentProfile = await env.KUDDL_DB.prepare(
        `SELECT * FROM parents WHERE phone = ? OR phone = ? OR phone = ? OR phone LIKE ? ORDER BY created_at ASC LIMIT 1`
      ).bind(phone10, `91${phone10}`, `+91${phone10}`, `%${phone10}`).first();
    }
    if (!parentProfile && tokenId) {
      parentProfile = await env.KUDDL_DB.prepare(`SELECT * FROM parents WHERE id = ?`).bind(tokenId).first();
    }

    // Get bookings and children for all resolved parent IDs
    let bookingsList = [];
    let childrenList = [];
    
    if (parentIdArray.length > 0) {
      const ph = parentIdArray.map(() => '?').join(',');
      
      const bResult = await env.KUDDL_DB.prepare(`
        SELECT b.*, s.name as service_name, pr.business_name,
               pr.name as provider_name
        FROM bookings b
        LEFT JOIN services s ON b.service_id = s.id
        LEFT JOIN providers pr ON b.provider_id = pr.id
        WHERE b.parent_id IN (${ph})
        ORDER BY b.created_at DESC
      `).bind(...parentIdArray).all();
      bookingsList = bResult.results || [];

      const cResult = await env.KUDDL_DB.prepare(
        `SELECT * FROM children WHERE parent_id IN (${ph}) ORDER BY created_at DESC`
      ).bind(...parentIdArray).all();
      childrenList = cResult.results || [];
    }

    // Fetch OTPs for all bookings
    const bookingIds = bookingsList.map(b => b.id);
    let otpMap = {};
    if (bookingIds.length > 0) {
      try {
        const otpPh = bookingIds.map(() => '?').join(',');
        const otpResult = await env.KUDDL_DB.prepare(
          `SELECT booking_id, otp_code, status as otp_status, expires_at 
           FROM booking_otps WHERE booking_id IN (${otpPh}) ORDER BY created_at DESC`
        ).bind(...bookingIds).all();
        for (const otp of (otpResult.results || [])) {
          if (!otpMap[otp.booking_id]) {
            otpMap[otp.booking_id] = otp;
          }
        }
      } catch (e) {
        console.log('OTP lookup skipped (table may not exist):', e.message);
      }
    }

    // Format bookings with OTP (only for future/today bookings)
    const today = new Date().toISOString().split('T')[0];
    const formattedBookings = bookingsList.map(b => {
      const bookingDate = b.booking_date || b.selected_date;
      const isFutureBooking = bookingDate >= today;
      const otp = (isFutureBooking && otpMap[b.id]) ? otpMap[b.id] : null;
      return {
        id: b.id,
        service_id: b.service_id,
        service_name: b.service_name || 'Service',
        provider_name: b.business_name || (b.provider_first_name ? `${b.provider_first_name} ${b.provider_last_name || ''}`.trim() : 'Provider'),
        business_name: b.business_name,
        booking_date: bookingDate,
        start_time: b.start_time,
        end_time: b.end_time,
        status: b.status,
        total_amount: b.total_amount,
        payment_status: b.payment_status,
        special_requests: b.special_requests,
        created_at: b.created_at,
        otp_code: otp ? otp.otp_code : null,
        otp_status: otp ? otp.otp_status : null,
        otp_expires_at: otp ? otp.expires_at : null
      };
    });

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: {
        parent: parentProfile || null,
        bookings: formattedBookings,
        children: childrenList
      }
    }), { headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('Dashboard error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false, message: 'Failed to load dashboard: ' + error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}
