import { addCorsHeaders } from '../utils/cors.js';

function generateId() {
  return crypto.randomUUID();
}

// Generate 4-digit OTP
function generateOTP() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Initialize booking lifecycle when booking is created
export async function initializeBookingLifecycle(request, env) {
  try {
    const { bookingId, providerId, parentId } = await request.json();

    if (!bookingId || !providerId || !parentId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Booking ID, provider ID, and parent ID are required'
      }), { status: 400 }));
    }

    // Generate OTP for the booking
    const otpCode = generateOTP();
    const lifecycleId = generateId();

    // Create booking lifecycle entry
    await env.KUDDL_DB.prepare(`
      INSERT INTO booking_lifecycle (
        id, booking_id, status, otp_code, created_at, updated_at
      ) VALUES (?, ?, 'pending', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(lifecycleId, bookingId, otpCode).run();

    // Check if partner has auto-accept enabled
    const partnerProfile = await env.KUDDL_DB.prepare(`
      SELECT auto_accept_bookings FROM partner_operational_profiles WHERE provider_id = ?
    `).bind(providerId).first();

    let finalStatus = 'pending';
    if (partnerProfile?.auto_accept_bookings) {
      // Auto-accept the booking
      await env.KUDDL_DB.prepare(`
        UPDATE booking_lifecycle SET status = 'accepted', updated_at = CURRENT_TIMESTAMP
        WHERE booking_id = ?
      `).bind(bookingId).run();
      
      finalStatus = 'accepted';
      
      // Send confirmation notifications
      await sendBookingNotification(env, bookingId, 'booking_confirmed', {
        recipientType: 'parent',
        recipientId: parentId,
        otpCode: otpCode
      });
    } else {
      // Send booking request to partner (15-minute window)
      await sendBookingNotification(env, bookingId, 'booking_request', {
        recipientType: 'partner',
        recipientId: providerId,
        expiresIn: 15 * 60 * 1000 // 15 minutes in milliseconds
      });

      // Schedule auto-cancellation after 2 hours if no response
      await scheduleAutoCancellation(env, bookingId, 2 * 60 * 60 * 1000); // 2 hours
    }

    console.log(`✅ Booking lifecycle initialized for ${bookingId} with status: ${finalStatus}`);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Booking lifecycle initialized',
      data: {
        lifecycleId,
        bookingId,
        status: finalStatus,
        otpCode: otpCode,
        autoAccepted: partnerProfile?.auto_accept_bookings || false
      }
    })));

  } catch (error) {
    console.error('❌ Initialize booking lifecycle error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to initialize booking lifecycle: ' + error.message
    }), { status: 500 }));
  }
}

// Partner accepts or declines booking
export async function respondToBooking(request, env) {
  try {
    const { bookingId, providerId, response, reason } = await request.json();

    if (!bookingId || !providerId || !response) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Booking ID, provider ID, and response are required'
      }), { status: 400 }));
    }

    if (!['accept', 'decline'].includes(response)) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Response must be either "accept" or "decline"'
      }), { status: 400 }));
    }

    // Check if booking is still pending
    const lifecycle = await env.KUDDL_DB.prepare(`
      SELECT * FROM booking_lifecycle WHERE booking_id = ?
    `).bind(bookingId).first();

    if (!lifecycle) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Booking lifecycle not found'
      }), { status: 404 }));
    }

    if (lifecycle.status !== 'pending') {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: `Booking is already ${lifecycle.status}`
      }), { status: 400 }));
    }

    const newStatus = response === 'accept' ? 'accepted' : 'declined';
    
    // Update booking lifecycle
    await env.KUDDL_DB.prepare(`
      UPDATE booking_lifecycle 
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE booking_id = ?
    `).bind(newStatus, bookingId).run();

    // Get booking details for notifications
    const booking = await env.KUDDL_DB.prepare(`
      SELECT * FROM bookings WHERE id = ?
    `).bind(bookingId).first();

    if (response === 'accept') {
      // Send confirmation to parent
      await sendBookingNotification(env, bookingId, 'booking_confirmed', {
        recipientType: 'parent',
        recipientId: booking.parent_id,
        otpCode: lifecycle.otp_code
      });

      // Update partner response rate (positive)
      await updatePartnerResponseRate(env, providerId, true);
      
      console.log(`✅ Booking ${bookingId} accepted by partner ${providerId}`);
    } else {
      // Send decline notification to parent
      await sendBookingNotification(env, bookingId, 'booking_declined', {
        recipientType: 'parent',
        recipientId: booking.parent_id,
        reason: reason || 'Partner is not available'
      });

      // Update partner response rate (negative)
      await updatePartnerResponseRate(env, providerId, false);

      // Initiate refund process
      await initiateRefund(env, bookingId, 'partner_declined');
      
      console.log(`❌ Booking ${bookingId} declined by partner ${providerId}`);
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: `Booking ${response}ed successfully`,
      data: {
        bookingId,
        status: newStatus,
        response,
        reason: reason || null
      }
    })));

  } catch (error) {
    console.error('❌ Respond to booking error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to respond to booking: ' + error.message
    }), { status: 500 }));
  }
}

// Partner checks in at location
export async function partnerCheckIn(request, env) {
  try {
    const { bookingId, providerId, latitude, longitude, notes } = await request.json();

    if (!bookingId || !providerId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Booking ID and provider ID are required'
      }), { status: 400 }));
    }

    // Verify booking is accepted
    const lifecycle = await env.KUDDL_DB.prepare(`
      SELECT * FROM booking_lifecycle WHERE booking_id = ?
    `).bind(bookingId).first();

    if (!lifecycle || lifecycle.status !== 'accepted') {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Booking must be accepted before check-in'
      }), { status: 400 }));
    }

    // Update lifecycle with check-in details
    await env.KUDDL_DB.prepare(`
      UPDATE booking_lifecycle 
      SET status = 'in_progress', 
          partner_location_lat = ?, 
          partner_location_lng = ?, 
          check_in_time = CURRENT_TIMESTAMP,
          partner_notes = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE booking_id = ?
    `).bind(latitude, longitude, notes, bookingId).run();

    // Get booking details
    const booking = await env.KUDDL_DB.prepare(`
      SELECT * FROM bookings WHERE id = ?
    `).bind(bookingId).first();

    // Send "partner on way" notification to parent
    await sendBookingNotification(env, bookingId, 'partner_on_way', {
      recipientType: 'parent',
      recipientId: booking.parent_id,
      partnerLocation: { latitude, longitude },
      estimatedArrival: '15 minutes'
    });

    console.log(`✅ Partner ${providerId} checked in for booking ${bookingId}`);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Check-in successful',
      data: {
        bookingId,
        status: 'in_progress',
        checkInTime: new Date().toISOString(),
        location: { latitude, longitude }
      }
    })));

  } catch (error) {
    console.error('❌ Partner check-in error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to check-in: ' + error.message
    }), { status: 500 }));
  }
}

// Partner marks booking as completed
export async function markBookingCompleted(request, env) {
  try {
    const { bookingId, providerId, otpCode, codAmountReceived, notes } = await request.json();

    if (!bookingId || !providerId || !otpCode) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Booking ID, provider ID, and OTP code are required'
      }), { status: 400 }));
    }

    // Verify OTP
    const lifecycle = await env.KUDDL_DB.prepare(`
      SELECT * FROM booking_lifecycle WHERE booking_id = ? AND otp_code = ?
    `).bind(bookingId, otpCode).first();

    if (!lifecycle) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid OTP code'
      }), { status: 400 }));
    }

    if (lifecycle.status !== 'in_progress') {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Booking must be in progress to mark as completed'
      }), { status: 400 }));
    }

    // Update lifecycle to completed
    await env.KUDDL_DB.prepare(`
      UPDATE booking_lifecycle 
      SET status = 'completed',
          completion_time = CURRENT_TIMESTAMP,
          cod_amount_received = ?,
          partner_notes = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE booking_id = ?
    `).bind(codAmountReceived || null, notes, bookingId).run();

    // Get booking details for payout calculation
    const booking = await env.KUDDL_DB.prepare(`
      SELECT * FROM bookings WHERE id = ?
    `).bind(bookingId).first();

    // Calculate payout amounts
    const totalAmount = codAmountReceived || booking.total_amount;
    const commissionRate = 0.10; // 10%
    const gstRate = 0.18; // 18% on commission
    const commissionAmount = totalAmount * commissionRate;
    const gstAmount = commissionAmount * gstRate;
    const netAmount = totalAmount - commissionAmount - gstAmount;

    // Create payout transaction
    const payoutId = generateId();
    const scheduledPayoutDate = new Date();
    scheduledPayoutDate.setDate(scheduledPayoutDate.getDate() + 3); // T+3

    await env.KUDDL_DB.prepare(`
      INSERT INTO payout_transactions (
        id, provider_id, booking_id, amount, commission_amount, gst_amount, 
        net_amount, status, scheduled_payout_date, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
      payoutId, providerId, bookingId, totalAmount, commissionAmount, 
      gstAmount, netAmount, scheduledPayoutDate.toISOString()
    ).run();

    // Update partner wallet pending amount
    await env.KUDDL_DB.prepare(`
      UPDATE partner_wallets 
      SET pending_amount = pending_amount + ?, updated_at = CURRENT_TIMESTAMP
      WHERE provider_id = ?
    `).bind(netAmount, providerId).run();

    // Send completion notifications
    await sendBookingNotification(env, bookingId, 'booking_completed', {
      recipientType: 'parent',
      recipientId: booking.parent_id,
      requestReview: true
    });

    console.log(`✅ Booking ${bookingId} marked as completed by partner ${providerId}`);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Booking marked as completed successfully',
      data: {
        bookingId,
        status: 'completed',
        completionTime: new Date().toISOString(),
        payout: {
          totalAmount,
          commissionAmount,
          gstAmount,
          netAmount,
          scheduledPayoutDate: scheduledPayoutDate.toISOString()
        }
      }
    })));

  } catch (error) {
    console.error('❌ Mark booking completed error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to mark booking as completed: ' + error.message
    }), { status: 500 }));
  }
}

// Get booking lifecycle status
export async function getBookingLifecycle(request, env) {
  try {
    const url = new URL(request.url);
    const bookingId = url.searchParams.get('bookingId');

    if (!bookingId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Booking ID is required'
      }), { status: 400 }));
    }

    const lifecycle = await env.KUDDL_DB.prepare(`
      SELECT bl.*, b.booking_date, b.start_time, b.end_time, b.total_amount,
             p.business_name as partner_name, par.full_name as parent_name
      FROM booking_lifecycle bl
      JOIN bookings b ON bl.booking_id = b.id
      LEFT JOIN providers p ON b.provider_id = p.id
      LEFT JOIN parents par ON b.parent_id = par.id
      WHERE bl.booking_id = ?
    `).bind(bookingId).first();

    if (!lifecycle) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Booking lifecycle not found'
      }), { status: 404 }));
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: lifecycle
    })));

  } catch (error) {
    console.error('❌ Get booking lifecycle error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to get booking lifecycle: ' + error.message
    }), { status: 500 }));
  }
}

// Helper function to send booking notifications
async function sendBookingNotification(env, bookingId, messageType, options) {
  try {
    const notificationId = generateId();
    
    let messageContent = '';
    let channel = 'whatsapp'; // Default to WhatsApp-first strategy
    
    switch (messageType) {
      case 'booking_request':
        messageContent = `New booking request! Please accept or decline within 15 minutes.`;
        break;
      case 'booking_confirmed':
        messageContent = `Booking confirmed! Your OTP is: ${options.otpCode}. Partner will arrive soon.`;
        break;
      case 'booking_declined':
        messageContent = `Booking declined. Reason: ${options.reason}. Full refund will be processed.`;
        break;
      case 'partner_on_way':
        messageContent = `Your partner is on the way! ETA: ${options.estimatedArrival}. Keep your OTP ready.`;
        break;
      case 'booking_completed':
        messageContent = `Service completed successfully! Please rate your experience.`;
        break;
    }

    await env.KUDDL_DB.prepare(`
      INSERT INTO notification_log (
        id, booking_id, recipient_type, recipient_id, channel, 
        message_type, message_content, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
    `).bind(
      notificationId, bookingId, options.recipientType, options.recipientId,
      channel, messageType, messageContent
    ).run();

    console.log(`📱 Notification queued: ${messageType} for ${options.recipientType} ${options.recipientId}`);
    
  } catch (error) {
    console.error('❌ Send notification error:', error);
  }
}

// Helper function to update partner response rate
async function updatePartnerResponseRate(env, providerId, isPositive) {
  try {
    const profile = await env.KUDDL_DB.prepare(`
      SELECT response_rate FROM partner_operational_profiles WHERE provider_id = ?
    `).bind(providerId).first();

    if (profile) {
      // Simple response rate calculation (can be enhanced with more sophisticated logic)
      const currentRate = profile.response_rate || 100.0;
      const adjustment = isPositive ? 0.5 : -2.0; // Penalize declines more than reward accepts
      const newRate = Math.max(0, Math.min(100, currentRate + adjustment));

      await env.KUDDL_DB.prepare(`
        UPDATE partner_operational_profiles 
        SET response_rate = ?, updated_at = CURRENT_TIMESTAMP
        WHERE provider_id = ?
      `).bind(newRate, providerId).run();

      console.log(`📊 Partner ${providerId} response rate updated to ${newRate}%`);
    }
  } catch (error) {
    console.error('❌ Update response rate error:', error);
  }
}

// Helper function to schedule auto-cancellation
async function scheduleAutoCancellation(env, bookingId, delayMs) {
  // In a production environment, this would use a job queue or scheduled task
  // For now, we'll implement a simple check mechanism
  console.log(`⏰ Auto-cancellation scheduled for booking ${bookingId} in ${delayMs}ms`);
  
  // This would typically be handled by a background job processor
  // For demonstration, we're just logging the intent
}

// Helper function to initiate refund
async function initiateRefund(env, bookingId, reason) {
  try {
    // Update booking status to cancelled
    await env.KUDDL_DB.prepare(`
      UPDATE bookings SET status = 'cancelled' WHERE id = ?
    `).bind(bookingId).run();

    // In production, integrate with payment gateway for actual refund
    console.log(`💰 Refund initiated for booking ${bookingId}, reason: ${reason}`);
    
  } catch (error) {
    console.error('❌ Initiate refund error:', error);
  }
}
