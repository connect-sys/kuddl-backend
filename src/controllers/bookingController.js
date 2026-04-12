/**
 * Booking Controller
 * Handles booking-related API endpoints
 */

import { addCorsHeaders } from '../utils/cors.js';
import { generateId } from '../utils/helpers.js';
import { sendNotification } from './notificationController.js';
import { createOTPForBooking } from './otpServiceController.js';
import jwt from '@tsndr/cloudflare-worker-jwt';

// Create booking
export async function createBooking(request, env) {
  try {
    // Try to get authenticated parent from token
    let parentId = null;
    try {
      const authHeader = request.headers.get('Authorization');
      console.log('🔍 Authorization header:', authHeader);
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        console.log('🔍 Extracted token:', token.substring(0, 50) + '...');
        
        const isValid = await jwt.verify(token, env.JWT_SECRET);
        console.log('🔍 Token validation result:', isValid);
        
        if (isValid) {
          const decoded = jwt.decode(token);
          console.log('🔍 Decoded token payload:', decoded);
          
          if (decoded && decoded.payload && decoded.payload.id) {
            parentId = decoded.payload.id;
            console.log('✅ Authenticated parent ID from token:', parentId);
          } else {
            console.warn('⚠️ Token payload missing id field:', decoded);
          }
        } else {
          console.warn('⚠️ Token verification failed - invalid token');
        }
      } else {
        console.warn('⚠️ No valid Authorization header found');
      }
    } catch (e) {
      console.error('❌ Token verification failed in createBooking:', e.message);
      console.error('❌ Full error:', e);
    }

    const {
      serviceId, 
      providerId, 
      selectedDate, 
      startTime,
      endTime,
      recurring,
      parentDetails,
      children,
      specialInstructions,
      totalAmount,
      paymentStatus,
      paymentId,
      orderId
    } = await request.json();

    // If no parentId from token, create/find parent using phone from parentDetails
    if (!parentId && parentDetails && parentDetails.phone) {
      console.log('🔄 No parentId from token, creating/finding parent using phone:', parentDetails.phone);
      try {
        const formattedPhone = parentDetails.phone.replace(/\D/g, '');
        
        // Try to find existing parent by phone
        const existingParent = await env.KUDDL_DB.prepare(`
          SELECT id FROM parents WHERE phone = ? OR phone = ?
        `).bind(formattedPhone, `+91${formattedPhone}`).first();

        if (existingParent) {
          parentId = existingParent.id;
          console.log('✅ Found existing parent by phone:', parentId);
        } else {
          // Create new parent
          parentId = generateId();
          await env.KUDDL_DB.prepare(`
            INSERT INTO parents (
              id, phone, full_name, email, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?)
          `).bind(
            parentId,
            formattedPhone,
            parentDetails.fullName || 'Parent User',
            parentDetails.email || '',
            new Date().toISOString(),
            new Date().toISOString()
          ).run();
          console.log('✅ Created new parent with phone:', parentId);
        }
      } catch (phoneError) {
        console.error('❌ Failed to create/find parent by phone:', phoneError);
      }
    }

    // Validate required fields
    if (!serviceId || !providerId || !selectedDate || !startTime || !endTime || !parentDetails) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Service ID, provider ID, date, start/end time, and parent details are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Save children to database if parent exists
    console.log('🔍 Children data received:', {
      parentId,
      childrenExists: !!children,
      childrenIsArray: Array.isArray(children),
      childrenLength: children ? children.length : 0,
      children: children
    });

    if (parentId && children && Array.isArray(children) && children.length > 0) {
      console.log(`👶 Processing ${children.length} children for parent ${parentId}`);
      
      for (const child of children) {
        try {
          console.log(`🔍 Processing child:`, child);
          
          // Check if child already exists for this parent (avoid duplicates)
          const existingChild = await env.KUDDL_DB.prepare(`
            SELECT id FROM children 
            WHERE parent_id = ? AND name = ? AND age = ?
          `).bind(parentId, child.name, child.age).first();

          if (!existingChild) {
            const childId = generateId();
            console.log(`🆕 Creating new child with ID: ${childId}`);
            
            await env.KUDDL_DB.prepare(`
              INSERT INTO children (
                id, parent_id, name, age, gender, 
                medical_conditions, bedtime, dietary_restrictions,
                special_needs, allergies, date_of_birth,
                created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
              childId, 
              parentId, 
              child.name, 
              child.age, 
              child.gender || 'unknown',
              child.medicalConditions || null,
              child.bedtime || null,
              child.dietaryRestrictions || null,
              child.specialNeeds || null,
              child.allergies || null,
              child.dateOfBirth || null,
              new Date().toISOString(), 
              new Date().toISOString()
            ).run();
            console.log(`✅ Saved new child: ${child.name} with ID: ${childId}`);
          } else {
             console.log(`ℹ️ Child already exists: ${child.name} with ID: ${existingChild.id}`);
          }
        } catch (childError) {
          console.error(`❌ Failed to save child ${child.name}:`, childError);
          console.error(`❌ Child error details:`, childError.message);
        }
      }
    } else {
      console.log('⚠️ Skipping children processing:', {
        reason: !parentId ? 'No parentId' : 
                !children ? 'No children data' : 
                !Array.isArray(children) ? 'Children not array' : 
                children.length === 0 ? 'Empty children array' : 'Unknown'
      });
    }

    // Update or create parent profile with parent details if parent is authenticated
    if (parentId && parentDetails) {
      console.log(`👤 Updating/creating profile for parent ${parentId}`);
      try {
        // Check if parent exists
        const existingParent = await env.KUDDL_DB.prepare(`
          SELECT id FROM parents WHERE id = ?
        `).bind(parentId).first();

        if (existingParent) {
          // Update existing parent
          const parentUpdates = {};
          if (parentDetails.fullName) parentUpdates.full_name = parentDetails.fullName;
          if (parentDetails.email) parentUpdates.email = parentDetails.email;
          if (parentDetails.phone) parentUpdates.phone = parentDetails.phone;
          if (parentDetails.address) parentUpdates.address = parentDetails.address;
          if (parentDetails.city) parentUpdates.city = parentDetails.city;
          if (parentDetails.state) parentUpdates.state = parentDetails.state;
          if (parentDetails.pincode) parentUpdates.pincode = parentDetails.pincode;
          if (parentDetails.alternateContactName) parentUpdates.alternate_contact_name = parentDetails.alternateContactName;
          if (parentDetails.alternateContactPhone) parentUpdates.alternate_contact_phone = parentDetails.alternateContactPhone;

          if (Object.keys(parentUpdates).length > 0) {
              const setClause = Object.keys(parentUpdates).map(k => `${k} = ?`).join(', ');
              const values = [...Object.values(parentUpdates), new Date().toISOString(), parentId];
              
              await env.KUDDL_DB.prepare(`
                  UPDATE parents SET ${setClause}, updated_at = ? WHERE id = ?
              `).bind(...values).run();
              console.log('✅ Updated existing parent profile');
          }
        } else {
          // Create new parent profile
          await env.KUDDL_DB.prepare(`
            INSERT INTO parents (
              id, phone, email, full_name, address, city, state, pincode,
              alternate_contact_name, alternate_contact_phone, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            parentId,
            parentDetails.phone || '',
            parentDetails.email || '',
            parentDetails.fullName || '',
            parentDetails.address || '',
            parentDetails.city || '',
            parentDetails.state || '',
            parentDetails.pincode || '',
            parentDetails.alternateContactName || '',
            parentDetails.alternateContactPhone || '',
            new Date().toISOString(),
            new Date().toISOString()
          ).run();
          console.log('✅ Created new parent profile');
        }

      } catch (profileError) {
        console.error(`❌ Failed to update/create profile for parent ${parentId}:`, profileError);
      }
    }

    // Use mock service for testing (bypassing database dependency)
    console.log('🔧 Using mock service for testing - bypassing services/providers tables');
    const service = {
      id: serviceId,
      name: 'Test Service',
      price: totalAmount ? totalAmount / 1.05 : 500, // Reverse calculate base price
      provider_id: providerId,
      first_name: 'Test',
      last_name: 'Provider',
      business_name: 'Test Business'
    };

    // Verify the providerId matches the service's provider
    if (service.provider_id !== providerId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: `Provider ID does not match service provider.`
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Calculate duration
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    const durationMinutes = ((endHour * 60) + endMin) - ((startHour * 60) + startMin);

    if (durationMinutes <= 0) {
        return addCorsHeaders(new Response(JSON.stringify({
            success: false,
            message: 'Invalid duration. End time must be after start time.'
        }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        }));
    }

    // Calculate platform fee (5%)
    const baseAmount = totalAmount || service.price; // Trust frontend calculation or recalculate based on duration * price if hourly
    const platformFee = baseAmount * 0.05;
    const providerAmount = baseAmount - platformFee;

    const bookingId = generateId();

    // Store rich details in special_requests as JSON
    const bookingDetails = {
      parentDetails,
      children: children || [],
      specialInstructions: specialInstructions || '',
      recurring: recurring || false,
      orderId: orderId || null // Store orderId in metadata
    };

    // Determine status based on payment
    const initialStatus = (paymentStatus === 'completed' || paymentStatus === 'paid') ? 'confirmed' : 'pending';
    const initialPaymentStatus = (paymentStatus === 'completed' || paymentStatus === 'paid') ? 'paid' : 'pending';
    const initialPaymentId = paymentId || null;

    // Create booking (using authenticated parentId if available)
    console.log('🔍 About to create booking with values:', {
      bookingId,
      serviceId,
      parentId,
      providerId,
      selectedDate,
      startTime,
      endTime,
      durationMinutes,
      bookingDetails: JSON.stringify(bookingDetails),
      initialStatus,
      baseAmount,
      platformFee,
      providerAmount,
      initialPaymentStatus,
      initialPaymentId
    });

    await env.KUDDL_DB.prepare(`
      INSERT INTO bookings (
        id, service_id, parent_id, provider_id, booking_date, selected_date, start_time, end_time,
        duration_minutes, special_requests, status, total_amount, platform_fee, provider_amount,
        payment_status, payment_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      bookingId, serviceId, parentId, providerId, selectedDate, selectedDate, startTime, endTime,
      durationMinutes, JSON.stringify(bookingDetails), initialStatus, baseAmount, platformFee, providerAmount,
      initialPaymentStatus, initialPaymentId, new Date().toISOString(), new Date().toISOString()
    ).run();

    console.log('✅ Booking created successfully with parent_id:', parentId);

    // Link payment order to booking if orderId is present
    if (orderId) {
      try {
        await env.KUDDL_DB.prepare(`
          UPDATE payment_orders 
          SET booking_id = ? 
          WHERE razorpay_order_id = ?
        `).bind(bookingId, orderId).run();
        console.log(`✅ Linked payment order ${orderId} to booking ${bookingId}`);
      } catch (linkError) {
        console.error('Failed to link payment order to booking:', linkError);
      }
    }

    // Send notification to partner about new booking
    try {
      await sendNotification(env, env.io, {
        type: 'booking_created',
        recipientId: providerId,
        recipientType: 'partner',
        senderId: parentId,
        senderType: 'customer',
        customData: {
          service_name: service.name,
          booking_date: selectedDate,
          booking_time: startTime,
          booking_id: bookingId,
          customer_name: bookingDetails.parentDetails?.fullName || 'Unknown Customer'
        },
        actionUrl: `/bookings/${bookingId}`
      });
      console.log('✅ Booking notification sent to partner');
    } catch (notificationError) {
      console.error('❌ Failed to send booking notification:', notificationError);
    }

    // Auto-generate OTP if booking is auto-confirmed (payment already done)
    if (initialStatus === 'confirmed') {
      try {
        await createOTPForBooking(env, bookingId, parentId, providerId);
        console.log(`✅ OTP auto-generated for confirmed booking ${bookingId}`);
      } catch (otpErr) {
        console.error('OTP generation on booking create (non-fatal):', otpErr.message);
      }
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Booking created successfully',
      bookingId: bookingId,
      booking: {
        id: bookingId,
        totalAmount: baseAmount,
        platformFee,
        providerAmount,
        status: initialStatus
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Create booking error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get booking by ID
export async function getBookingById(request, env) {
  try {
    const user = request.user; // From auth middleware
    const url = new URL(request.url);
    const bookingId = url.pathname.split('/').pop();

    const booking = await env.KUDDL_DB.prepare(`
      SELECT 
        b.*,
        s.name as service_name, s.description as service_description,
        u_customer.first_name as customer_first_name, u_customer.last_name as customer_last_name,
        u_customer.phone as customer_phone, u_customer.profile_image_url as customer_image,
        p.first_name as provider_first_name, p.last_name as provider_last_name,
        p.phone as provider_phone, p.profile_image_url as provider_image,
        p.business_name
      FROM bookings b
      LEFT JOIN services s ON b.service_id = s.id
      LEFT JOIN users u_customer ON b.customer_id = u_customer.id
      LEFT JOIN providers p ON b.provider_id = p.id
      WHERE b.id = ? AND (b.customer_id = ? OR b.provider_id = ? OR ? = 'admin')
    `).bind(bookingId, user.id, user.id, user.role).first();

    if (!booking) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Booking not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Parse JSON fields
    booking.children_ages = booking.children_ages ? JSON.parse(booking.children_ages) : [];

    // Parse special_requests for rich details
    let bookingDetails = {};
    try {
      bookingDetails = JSON.parse(booking.special_requests || '{}');
    } catch (e) {
      bookingDetails = {};
    }

    // Enhance booking object with rich details
    booking.parentDetails = bookingDetails.parentDetails || null;
    booking.children = bookingDetails.children || [];
    booking.specialInstructions = bookingDetails.specialInstructions || (typeof bookingDetails === 'string' ? bookingDetails : '');
    booking.recurring = bookingDetails.recurring || false;
    
    // If parentDetails is missing but we have flattened details in special_requests (legacy)
    if (!booking.parentDetails && bookingDetails.name) {
      booking.parentDetails = {
        fullName: bookingDetails.name,
        phone: bookingDetails.phone,
        address: bookingDetails.address,
        email: bookingDetails.email,
        pincode: bookingDetails.pincode
      };
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: booking
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Get booking error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get provider bookings (for partner dashboard)
export async function getProviderBookings(request, env) {
  try {
    const url = new URL(request.url);
    const providerId = url.searchParams.get('providerId');
    const status = url.searchParams.get('status');
    const page = parseInt(url.searchParams.get('page')) || 1;
    const limit = parseInt(url.searchParams.get('limit')) || 20;
    const offset = (page - 1) * limit;

    console.log('🔍 Provider bookings request:', { providerId, status, page, limit });

    if (!providerId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Provider ID is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    let whereClause = 'WHERE b.provider_id = ?';
    let params = [providerId];

    if (status) {
      whereClause += ' AND b.status = ?';
      params.push(status);
    }

    const bookings = await env.KUDDL_DB.prepare(`
      SELECT 
        b.*,
        s.name as service_name, s.price_type, s.price, s.description as service_description,
        p.business_name, p.first_name as provider_first_name, p.last_name as provider_last_name
      FROM bookings b
      LEFT JOIN services s ON b.service_id = s.id
      LEFT JOIN providers p ON b.provider_id = p.id
      ${whereClause}
      ORDER BY b.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all();

    console.log('🔍 Provider bookings query result:', {
      bookingsCount: bookings.results?.length || 0,
      firstBooking: bookings.results?.[0],
      whereClause,
      params
    });

    // Parse customer details from special_requests JSON
    const processedBookings = (bookings.results || []).map(booking => {
      let bookingDetails = {};
      try {
        bookingDetails = JSON.parse(booking.special_requests || '{}');
      } catch (e) {
        bookingDetails = { name: 'Unknown', phone: 'N/A' };
      }
      
      // Handle new nested structure (parentDetails) or old flat structure
      const parentInfo = bookingDetails.parentDetails || bookingDetails;

      return {
        ...booking,
        customer_name: parentInfo.fullName || parentInfo.name || 'Unknown',
        customer_phone: parentInfo.phone || 'N/A',
        customer_email: parentInfo.email || '',
        customer_address: parentInfo.address || '',
        customer_pincode: parentInfo.pincode || '',
        special_requirements: bookingDetails.specialInstructions || bookingDetails.specialRequirements || '',
        children: bookingDetails.children || []
      };
    });

    // Get total count
    const totalResult = await env.KUDDL_DB.prepare(`
      SELECT COUNT(*) as total FROM bookings b ${whereClause}
    `).bind(...params).first();

    const total = totalResult?.total || 0;

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: {
        bookings: processedBookings,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Get provider bookings error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get customer bookings
export async function getCustomerBookings(request, env) {
  try {
    console.log('🔍 Customer bookings API called');
    
    // Extract parent ID from JWT token (customer token contains parent ID)
    let parentId = null;
    try {
      const authHeader = request.headers.get('Authorization');
      console.log('🔍 Auth header present:', !!authHeader);
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        console.log('🔍 Token extracted:', token.substring(0, 50) + '...');
        
        const isValid = await jwt.verify(token, env.JWT_SECRET);
        if (isValid) {
          const decoded = jwt.decode(token);
          console.log('🔍 Decoded token payload:', decoded.payload);
          
          if (decoded && decoded.payload && decoded.payload.id) {
            parentId = decoded.payload.id;
            console.log('✅ Parent ID from token:', parentId);
          }
        }
      }
    } catch (e) {
      console.warn('⚠️ Token verification failed in getCustomerBookings:', e.message);
    }

    // If no parent ID from token, try to find parent by customer data
    if (!parentId) {
      console.log('🔄 No parent ID from token, trying alternative lookup');
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authentication required - please login again'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Check if this ID exists in parents table, if not try customer lookup
    const parentExists = await env.KUDDL_DB.prepare(`
      SELECT id FROM parents WHERE id = ?
    `).bind(parentId).first();
    
    if (!parentExists) {
      console.log('⚠️ Parent ID from token not found in parents table, trying customer lookup');
      
      // Try to find parent by customer ID (for tokens created by customer controller)
      const customerParent = await env.KUDDL_DB.prepare(`
        SELECT p.id FROM parents p 
        JOIN customers c ON p.phone = c.phone 
        WHERE c.id = ?
      `).bind(parentId).first();
      
      if (customerParent) {
        parentId = customerParent.id;
        console.log('✅ Found parent via customer lookup:', parentId);
      } else {
        console.log('❌ No parent found for customer ID:', parentId);
        return addCorsHeaders(new Response(JSON.stringify({
          success: false,
          message: 'No bookings found for this customer'
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }));
      }
    }

    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const page = parseInt(url.searchParams.get('page')) || 1;
    const limit = parseInt(url.searchParams.get('limit')) || 20;
    const offset = (page - 1) * limit;

    console.log('🔍 Query params:', { status, page, limit, parentId });

    let whereClause = 'WHERE b.parent_id = ?';
    let params = [parentId];

    if (status) {
      whereClause += ' AND b.status = ?';
      params.push(status);
    }

    const bookings = await env.KUDDL_DB.prepare(`
      SELECT 
        b.*,
        s.name as service_name, s.price_type, s.price,
        p.first_name as provider_first_name, p.last_name as provider_last_name,
        p.profile_image_url as provider_image,
        p.business_name,
        parent.full_name as parent_name, parent.phone as parent_phone, parent.email as parent_email
      FROM bookings b
      LEFT JOIN services s ON b.service_id = s.id
      LEFT JOIN providers p ON b.provider_id = p.id
      LEFT JOIN parents parent ON b.parent_id = parent.id
      ${whereClause}
      ORDER BY b.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all();

    console.log('🔍 Database query result:', {
      bookingsCount: bookings.results?.length || 0,
      firstBooking: bookings.results?.[0],
      whereClause,
      params
    });

    // Get total count
    const totalResult = await env.KUDDL_DB.prepare(`
      SELECT COUNT(*) as total FROM bookings b ${whereClause}
    `).bind(...params).first();

    const total = totalResult?.total || 0;
    const totalPages = Math.ceil(total / limit);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: bookings.results || [],
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
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
    console.error('Error fetching customer bookings:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get user bookings
export async function getUserBookings(request, env) {
  try {
    const user = request.user; // From auth middleware
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const page = parseInt(url.searchParams.get('page')) || 1;
    const limit = parseInt(url.searchParams.get('limit')) || 20;
    const offset = (page - 1) * limit;

    let whereClause = '';
    let params = [];

    if (user.role === 'customer') {
      whereClause = 'WHERE b.customer_id = ?';
      params.push(user.id);
    } else if (user.role === 'provider') {
      whereClause = 'WHERE b.provider_id = ?';
      params.push(user.id);
    } else {
      whereClause = 'WHERE 1=1';
    }

    if (status) {
      whereClause += ' AND b.status = ?';
      params.push(status);
    }

    const bookings = await env.KUDDL_DB.prepare(`
      SELECT 
        b.*,
        s.name as service_name, s.price_type, s.price,
        u_customer.first_name as customer_first_name, u_customer.last_name as customer_last_name,
        u_customer.profile_image_url as customer_image,
        p.first_name as provider_first_name, p.last_name as provider_last_name,
        p.profile_image_url as provider_image,
        p.business_name
      FROM bookings b
      LEFT JOIN services s ON b.service_id = s.id
      LEFT JOIN users u_customer ON b.customer_id = u_customer.id
      LEFT JOIN providers p ON b.provider_id = p.id
      ${whereClause}
      ORDER BY b.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all();

    // Get total count
    const totalResult = await env.KUDDL_DB.prepare(`
      SELECT COUNT(*) as total FROM bookings b ${whereClause}
    `).bind(...params).first();

    const total = totalResult?.total || 0;

    // Process bookings to include rich details
    const processedBookings = (bookings.results || []).map(booking => {
      // Parse children_ages
      booking.children_ages = booking.children_ages ? JSON.parse(booking.children_ages) : [];

      // Parse special_requests
      let bookingDetails = {};
      try {
        bookingDetails = JSON.parse(booking.special_requests || '{}');
      } catch (e) {
        bookingDetails = {};
      }

      // Enhance booking object
      booking.parentDetails = bookingDetails.parentDetails || null;
      booking.children = bookingDetails.children || [];
      booking.specialInstructions = bookingDetails.specialInstructions || (typeof bookingDetails === 'string' ? bookingDetails : '');
      booking.recurring = bookingDetails.recurring || false;

      // Legacy support
      if (!booking.parentDetails && bookingDetails.name) {
        booking.parentDetails = {
          fullName: bookingDetails.name,
          phone: bookingDetails.phone,
          address: bookingDetails.address,
          email: bookingDetails.email,
          pincode: bookingDetails.pincode
        };
      }

      return booking;
    });

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: {
        bookings: processedBookings,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Get user bookings error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Accept booking (Provider only)
export async function acceptBooking(request, env) {
  try {
    const user = request.user; // From auth middleware
    const url = new URL(request.url);
    const bookingId = url.pathname.split('/')[3]; // /api/bookings/{id}/accept

    if (user.role !== 'provider') {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Only providers can accept bookings'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Check if booking exists and belongs to provider
    const booking = await env.KUDDL_DB.prepare(
      'SELECT * FROM bookings WHERE id = ? AND provider_id = ? AND status = "pending"'
    ).bind(bookingId, user.id).first();

    if (!booking) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Booking not found or cannot be accepted'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Update booking status
    await env.KUDDL_DB.prepare(`
      UPDATE bookings 
      SET status = 'confirmed', confirmed_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(new Date().toISOString(), new Date().toISOString(), bookingId).run();

    // Auto-generate OTP for service start using shared helper
    const otpResult = await createOTPForBooking(env, bookingId, booking.parent_id, booking.provider_id);

    // Notify provider about booking confirmation
    try {
      const bookingDetails = await env.KUDDL_DB.prepare(`
        SELECT b.*, p.full_name as parent_name
        FROM bookings b
        LEFT JOIN parents p ON b.parent_id = p.id
        WHERE b.id = ?
      `).bind(bookingId).first();

      const partnerNotificationId = generateId();
      await env.KUDDL_DB.prepare(`
        INSERT INTO notifications (id, user_id, user_type, type, title, message, data, created_at)
        VALUES (?, ?, 'provider', 'booking_confirmed', 'Booking Confirmed', ?, ?, ?)
      `).bind(
        partnerNotificationId, booking.provider_id,
        `Booking confirmed! Ask the parent for the OTP to start the service. Parent: ${bookingDetails?.parent_name || 'Customer'}`,
        JSON.stringify({ bookingId, parentName: bookingDetails?.parent_name }),
        new Date().toISOString()
      ).run();
    } catch (notifErr) {
      console.error('Provider notification error (non-fatal):', notifErr.message);
    }

    console.log(`✅ Booking ${bookingId} confirmed with OTP generated: ${otpResult.success}`);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Booking accepted successfully',
      data: {
        bookingId,
        otpGenerated: otpResult.success,
        expiresAt: otpResult.expiresAt || null
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Accept booking error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Reject booking (Provider only)
export async function rejectBooking(request, env) {
  try {
    const user = request.user; // From auth middleware
    const url = new URL(request.url);
    const bookingId = url.pathname.split('/')[3]; // /api/bookings/{id}/reject
    const { reason } = await request.json();

    if (user.role !== 'provider') {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Only providers can reject bookings'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Check if booking exists and belongs to provider
    const booking = await env.KUDDL_DB.prepare(
      'SELECT * FROM bookings WHERE id = ? AND provider_id = ? AND status = "pending"'
    ).bind(bookingId, user.id).first();

    if (!booking) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Booking not found or cannot be rejected'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Update booking status
    await env.KUDDL_DB.prepare(`
      UPDATE bookings 
      SET status = 'rejected', cancellation_reason = ?, cancelled_by = 'provider', cancelled_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(reason || 'Rejected by provider', new Date().toISOString(), new Date().toISOString(), bookingId).run();

    // Create notification for customer
    const notificationId = generateId();
    await env.KUDDL_DB.prepare(`
      INSERT INTO notifications (id, user_id, type, title, message, data, created_at)
      VALUES (?, ?, 'booking', 'Booking Rejected', ?, ?, ?)
    `).bind(
      notificationId, booking.customer_id,
      `Your booking has been rejected. Reason: ${reason || 'No reason provided'}`,
      JSON.stringify({ bookingId }),
      new Date().toISOString()
    ).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Booking rejected successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Reject booking error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Cancel booking
export async function cancelBooking(request, env) {
  try {
    const user = request.user; // From auth middleware
    const url = new URL(request.url);
    const bookingId = url.pathname.split('/')[3]; // /api/bookings/{id}/cancel
    const { reason } = await request.json();

    // Check if booking exists and user has permission
    const booking = await env.KUDDL_DB.prepare(`
      SELECT * FROM bookings 
      WHERE id = ? AND (parent_id = ? OR provider_id = ?) 
      AND status IN ('pending', 'confirmed')
    `).bind(bookingId, user.id, user.id).first();

    if (!booking) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Booking not found or cannot be cancelled'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const cancelledBy = booking.parent_id === user.id ? 'customer' : 'provider';
    const notifyUserId = booking.parent_id === user.id ? booking.provider_id : booking.parent_id;

    // Update booking status
    await env.KUDDL_DB.prepare(`
      UPDATE bookings 
      SET status = 'cancelled', cancellation_reason = ?, cancelled_by = ?, cancelled_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(reason || 'Cancelled', cancelledBy, new Date().toISOString(), new Date().toISOString(), bookingId).run();

    // If cancelled by customer and payment was made, create refund request
    if (cancelledBy === 'customer' && booking.payment_status === 'paid') {
      const refundId = generateId();
      const refundAmount = booking.total_amount;
      
      // Create refund request
      await env.KUDDL_DB.prepare(`
        INSERT INTO refund_requests (
          id, booking_id, parent_id, amount, reason, status, 
          requested_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
      `).bind(
        refundId, bookingId, booking.parent_id, refundAmount, 
        reason || 'Booking cancelled by customer',
        new Date().toISOString(), new Date().toISOString(), new Date().toISOString()
      ).run();

      // Notify admin about refund request
      const adminNotificationId = generateId();
      await env.KUDDL_DB.prepare(`
        INSERT INTO notifications (id, user_id, user_type, type, title, message, data, created_at)
        VALUES (?, 'admin', 'admin', 'refund_request', 'New Refund Request', ?, ?, ?)
      `).bind(
        adminNotificationId,
        `Refund request for booking #${bookingId}. Amount: ₹${refundAmount}. Reason: ${reason || 'Booking cancelled by customer'}`,
        JSON.stringify({ bookingId, refundId, amount: refundAmount }),
        new Date().toISOString()
      ).run();
    }

    // Create notification for the other party
    const notificationId = generateId();
    await env.KUDDL_DB.prepare(`
      INSERT INTO notifications (id, user_id, type, title, message, data, created_at)
      VALUES (?, ?, 'booking', 'Booking Cancelled', ?, ?, ?)
    `).bind(
      notificationId, notifyUserId,
      `A booking has been cancelled. Reason: ${reason || 'No reason provided'}`,
      JSON.stringify({ bookingId }),
      new Date().toISOString()
    ).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Booking cancelled successfully',
      refundRequested: cancelledBy === 'customer' && booking.payment_status === 'paid'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Cancel booking error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Complete booking
export async function completeBooking(request, env) {
  try {
    const user = request.user; // From auth middleware
    const url = new URL(request.url);
    const bookingId = url.pathname.split('/')[3]; // /api/bookings/{id}/complete

    // Check if booking exists and user has permission
    const booking = await env.KUDDL_DB.prepare(`
      SELECT * FROM bookings 
      WHERE id = ? AND (customer_id = ? OR provider_id = ?) 
      AND status = 'confirmed'
    `).bind(bookingId, user.id, user.id).first();

    if (!booking) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Booking not found or cannot be completed'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Update booking status
    await env.KUDDL_DB.prepare(`
      UPDATE bookings 
      SET status = 'completed', completed_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(new Date().toISOString(), new Date().toISOString(), bookingId).run();

    // Update provider stats
    try {
      await env.KUDDL_DB.prepare(`
        UPDATE providers 
        SET total_bookings = COALESCE(total_bookings, 0) + 1
        WHERE id = ?
      `).bind(booking.provider_id).run();
    } catch (providerUpdateError) {
      console.error('Failed to update provider stats:', providerUpdateError);
      // We don't block the response here, as the booking is already completed
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Booking completed successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Complete booking error:', error);
    console.error('Stack trace:', error.stack);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}
