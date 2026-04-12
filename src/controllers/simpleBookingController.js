/**
 * Simplified Booking Controller for Testing Parent/Children Creation
 */

import { addCorsHeaders } from '../utils/cors.js';
import { generateId } from '../utils/helpers.js';
import { sendNotification } from './notificationController.js';
import jwt from '@tsndr/cloudflare-worker-jwt';

export async function createSimpleBooking(request, env) {
  try {
    console.log('🚀 Starting simple booking creation test');
    
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
          }
        }
      }
    } catch (e) {
      console.error('❌ Token verification failed:', e.message);
    }

    const {
      serviceId, 
      providerId, 
      selectedDate, 
      startTime,
      endTime,
      parentDetails,
      children,
      totalAmount
    } = await request.json();

    console.log('📝 Request data:', {
      serviceId,
      providerId,
      parentDetails,
      childrenCount: children?.length || 0,
      parentId
    });

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
          console.log('🆕 Creating new parent with ID:', parentId);
          
          await env.KUDDL_DB.prepare(`
            INSERT INTO parents (
              id, phone, full_name, email, address, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `).bind(
            parentId,
            formattedPhone,
            parentDetails.fullName || 'Parent User',
            parentDetails.email || '',
            parentDetails.address || '',
            new Date().toISOString(),
            new Date().toISOString()
          ).run();
          console.log('✅ Created new parent with phone:', parentId);
        }
      } catch (phoneError) {
        console.error('❌ Failed to create/find parent by phone:', phoneError);
        return addCorsHeaders(new Response(JSON.stringify({
          success: false,
          message: 'Failed to create parent profile: ' + phoneError.message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }));
      }
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
                special_needs, allergies, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    }

    // Create a simple booking record with parent_id
    const bookingId = generateId();
    const bookingDetails = {
      parentDetails,
      children: children || [],
      specialInstructions: ''
    };

    console.log('🔍 About to create booking with values:', {
      bookingId,
      serviceId,
      parentId,
      providerId,
      selectedDate,
      startTime,
      endTime,
      totalAmount
    });

    try {
      await env.KUDDL_DB.prepare(`
        INSERT INTO bookings (
          id, service_id, parent_id, provider_id, booking_date, selected_date, start_time, end_time,
          duration_minutes, special_requests, status, total_amount, platform_fee, provider_amount, payment_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        bookingId, serviceId, parentId, providerId, selectedDate, selectedDate, startTime, endTime,
        120, // 2 hours duration
        JSON.stringify(bookingDetails), 
        'pending', 
        totalAmount || 1000, 
        (totalAmount || 1000) * 0.05, 
        (totalAmount || 1000) * 0.95,
        'pending', 
        new Date().toISOString(), 
        new Date().toISOString()
      ).run();

      console.log('✅ Booking created successfully with parent_id:', parentId);

      // Send notification to partner about new booking
      try {
        await sendNotification(env, env.io, {
          type: 'booking_created',
          recipientId: 'provider_123', // Using default provider for simple booking
          recipientType: 'partner',
          senderId: parentId,
          senderType: 'customer',
          customData: {
            service_name: 'Test Service',
            booking_date: new Date().toISOString().split('T')[0],
            booking_time: '10:00',
            booking_id: bookingId,
            customer_name: parentDetails?.fullName || 'Test Customer'
          },
          actionUrl: `/bookings/${bookingId}`
        });
        console.log('✅ Simple booking notification sent to partner');
      } catch (notificationError) {
        console.error('❌ Failed to send simple booking notification:', notificationError);
      }

      return addCorsHeaders(new Response(JSON.stringify({
        success: true,
        message: 'Simple booking created successfully',
        data: {
          bookingId: bookingId,
          parentId: parentId,
          childrenProcessed: children?.length || 0,
          parentCreated: !!parentId
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      }));

    } catch (bookingError) {
      console.error('❌ Failed to create booking:', bookingError);
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Failed to create booking: ' + bookingError.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

  } catch (error) {
    console.error('❌ Simple booking creation error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}
