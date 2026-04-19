/**
 * OTP Service Controller
 * Handles OTP-based service start and completion flow (Urban Clap style)
 */

import { addCorsHeaders } from '../utils/cors.js';
import { generateId } from '../utils/helpers.js';
import { sendNotification } from './notificationController.js';

// Generate 6-digit OTP
export function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Shared helper: generate and store OTP for a confirmed booking
// Can be called from any code path that confirms a booking (acceptBooking, payment, auto-confirm)
export async function createOTPForBooking(env, bookingId, parentId, providerId) {
  try {
    // Check if OTP already exists for this booking
    const existing = await env.KUDDL_DB.prepare(
      'SELECT id FROM booking_otps WHERE booking_id = ?'
    ).bind(bookingId).first();
    if (existing) {
      console.log(`⚠️ OTP already exists for booking ${bookingId}, skipping`);
      return { success: true, alreadyExists: true };
    }

    const otpCode = generateOTP();
    const otpId = generateId();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await env.KUDDL_DB.prepare(`
      INSERT INTO booking_otps (
        id, booking_id, parent_id, provider_id, otp_code, 
        status, expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)
    `).bind(
      otpId, bookingId, parentId, providerId, otpCode,
      expiresAt.toISOString(), new Date().toISOString(), new Date().toISOString()
    ).run();

    // Send notification to parent
    try {
      const parentNotificationId = generateId();
      await env.KUDDL_DB.prepare(`
        INSERT INTO notifications (id, user_id, user_type, type, title, message, data, created_at)
        VALUES (?, ?, 'parent', 'booking_otp', 'Service OTP Generated', ?, ?, ?)
      `).bind(
        parentNotificationId, parentId,
        `Your booking is confirmed! Service OTP: ${otpCode}. Share this with your service provider when they arrive. Valid for 24 hours.`,
        JSON.stringify({ bookingId, otpCode, expiresAt: expiresAt.toISOString() }),
        new Date().toISOString()
      ).run();
    } catch (notifErr) {
      console.error('OTP notification error (non-fatal):', notifErr.message);
    }

    console.log(`✅ OTP ${otpCode} generated for booking ${bookingId}`);
    return { success: true, otpCode, expiresAt: expiresAt.toISOString() };
  } catch (error) {
    console.error(`❌ Failed to create OTP for booking ${bookingId}:`, error.message);
    return { success: false, error: error.message };
  }
}

// Generate OTP when booking is confirmed
export async function generateBookingOTP(request, env) {
  try {
    const { bookingId } = await request.json();

    if (!bookingId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Booking ID is required'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    // Get booking details
    const booking = await env.KUDDL_DB.prepare(`
      SELECT b.*, p.name as parent_name, p.phone as parent_phone,
             pr.business_name as partner_name, pr.phone as partner_phone
      FROM bookings b
      LEFT JOIN parents p ON b.parent_id = p.id
      LEFT JOIN providers pr ON b.provider_id = pr.id
      WHERE b.id = ? AND b.status = 'confirmed'
    `).bind(bookingId).first();

    if (!booking) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Booking not found or not confirmed'
      }), { status: 404, headers: { 'Content-Type': 'application/json' } }));
    }

    // Generate OTP
    const otpCode = generateOTP();
    const otpId = generateId();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // OTP valid for 24 hours

    // Store OTP in database
    await env.KUDDL_DB.prepare(`
      INSERT INTO booking_otps (
        id, booking_id, parent_id, provider_id, otp_code, 
        status, expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)
    `).bind(
      otpId, bookingId, booking.parent_id, booking.provider_id, otpCode,
      expiresAt.toISOString(), new Date().toISOString(), new Date().toISOString()
    ).run();

    // Send OTP to parent via notification/SMS
    const parentNotificationId = generateId();
    await env.KUDDL_DB.prepare(`
      INSERT INTO notifications (id, user_id, user_type, type, title, message, data, created_at)
      VALUES (?, ?, 'parent', 'booking_otp', 'Service OTP Generated', ?, ?, ?)
    `).bind(
      parentNotificationId, booking.parent_id,
      `Your service OTP is: ${otpCode}. Share this with your service provider when they arrive. Valid for 24 hours.`,
      JSON.stringify({ bookingId, otpCode, expiresAt: expiresAt.toISOString() }),
      new Date().toISOString()
    ).run();

    // Notify partner about OTP generation
    const partnerNotificationId = generateId();
    await env.KUDDL_DB.prepare(`
      INSERT INTO notifications (id, user_id, user_type, type, title, message, data, created_at)
      VALUES (?, ?, 'provider', 'booking_otp_ready', 'Service OTP Ready', ?, ?, ?)
    `).bind(
      partnerNotificationId, booking.provider_id,
      `OTP has been generated for your booking with ${booking.parent_name}. Ask the parent for the OTP to start the service.`,
      JSON.stringify({ bookingId, parentName: booking.parent_name }),
      new Date().toISOString()
    ).run();

    console.log(`✅ OTP ${otpCode} generated for booking ${bookingId}`);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'OTP generated successfully',
      data: {
        otpId,
        bookingId,
        expiresAt: expiresAt.toISOString()
      }
    }), { headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('❌ Generate booking OTP error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to generate OTP: ' + error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// Partner verifies OTP to start service
export async function verifyOTPAndStartService(request, env) {
  try {
    const { bookingId, providerId, otpCode } = await request.json();

    if (!bookingId || !providerId || !otpCode) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Booking ID, provider ID, and OTP code are required'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    // Get booking details for time check
    const bookingInfo = await env.KUDDL_DB.prepare(`
      SELECT booking_date, start_time FROM bookings WHERE id = ?
    `).bind(bookingId).first();

    if (!bookingInfo) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Booking not found'
      }), { status: 404, headers: { 'Content-Type': 'application/json' } }));
    }

    // Check if service can start (only within 15 minutes before start time)
    const now = new Date();
    const bookingDate = bookingInfo.booking_date; // YYYY-MM-DD
    const startTime = bookingInfo.start_time; // HH:MM
    const bookingStart = new Date(`${bookingDate}T${startTime}:00`);
    const diffMinutes = (bookingStart.getTime() - now.getTime()) / (1000 * 60);

    if (diffMinutes > 15) {
      const hours = Math.floor(diffMinutes / 60);
      const mins = Math.round(diffMinutes % 60);
      const timeMsg = hours > 0 ? `${hours}h ${mins}m` : `${mins} minutes`;
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: `Service cannot start yet. Booking starts in ${timeMsg}. You can start the service within 15 minutes of the scheduled time.`
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    // Verify OTP
    const otpRecord = await env.KUDDL_DB.prepare(`
      SELECT * FROM booking_otps 
      WHERE booking_id = ? AND provider_id = ? AND otp_code = ? 
      AND status = 'active' AND expires_at > ?
    `).bind(bookingId, providerId, otpCode, new Date().toISOString()).first();

    if (!otpRecord) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid or expired OTP'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    // Mark OTP as used and update booking status to 'in_progress'
    await env.KUDDL_DB.prepare(`
      UPDATE booking_otps 
      SET status = 'used', used_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(new Date().toISOString(), new Date().toISOString(), otpRecord.id).run();

    await env.KUDDL_DB.prepare(`
      UPDATE bookings 
      SET status = 'in_progress', service_started_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(new Date().toISOString(), new Date().toISOString(), bookingId).run();

    // Get booking details for notifications
    const booking = await env.KUDDL_DB.prepare(`
      SELECT b.*, p.name as parent_name, pr.business_name as partner_name
      FROM bookings b
      LEFT JOIN parents p ON b.parent_id = p.id
      LEFT JOIN providers pr ON b.provider_id = pr.id
      WHERE b.id = ?
    `).bind(bookingId).first();

    // Notify parent that service has started
    const parentNotificationId = generateId();
    await env.KUDDL_DB.prepare(`
      INSERT INTO notifications (id, user_id, user_type, type, title, message, data, created_at)
      VALUES (?, ?, 'parent', 'service_started', 'Service Started', ?, ?, ?)
    `).bind(
      parentNotificationId, booking.parent_id,
      `Your service with ${booking.partner_name} has started. You can mark it as completed once the service is finished.`,
      JSON.stringify({ bookingId, partnerName: booking.partner_name }),
      new Date().toISOString()
    ).run();

    console.log(`✅ Service started for booking ${bookingId} by provider ${providerId}`);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Service started successfully',
      data: {
        bookingId,
        status: 'in_progress',
        serviceStartedAt: new Date().toISOString()
      }
    }), { headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('❌ Verify OTP and start service error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to start service: ' + error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// Parent marks service as completed (final step)
export async function markServiceCompleted(request, env) {
  try {
    const { bookingId, parentId, rating, feedback } = await request.json();

    if (!bookingId || !parentId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Booking ID and parent ID are required'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    // Verify booking is in progress and belongs to parent
    const booking = await env.KUDDL_DB.prepare(`
      SELECT * FROM bookings 
      WHERE id = ? AND parent_id = ? AND status = 'in_progress'
    `).bind(bookingId, parentId).first();

    if (!booking) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Booking not found or not in progress'
      }), { status: 404, headers: { 'Content-Type': 'application/json' } }));
    }

    // Mark booking as completed
    await env.KUDDL_DB.prepare(`
      UPDATE bookings 
      SET status = 'completed', completed_at = ?, parent_rating = ?, parent_feedback = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      new Date().toISOString(), rating || null, feedback || null, 
      new Date().toISOString(), bookingId
    ).run();

    // Calculate payout for provider
    const totalAmount = booking.total_amount;
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `).bind(
      payoutId, booking.provider_id, bookingId, totalAmount, commissionAmount, 
      gstAmount, netAmount, scheduledPayoutDate.toISOString(),
      new Date().toISOString(), new Date().toISOString()
    ).run();

    // Update provider wallet pending amount
    await env.KUDDL_DB.prepare(`
      UPDATE provider_wallets 
      SET pending_amount = pending_amount + ?, updated_at = ?
      WHERE provider_id = ?
    `).bind(netAmount, new Date().toISOString(), booking.provider_id).run();

    // Notify provider about completion
    const providerNotificationId = generateId();
    await env.KUDDL_DB.prepare(`
      INSERT INTO notifications (id, user_id, user_type, type, title, message, data, created_at)
      VALUES (?, ?, 'provider', 'service_completed', 'Service Completed', ?, ?, ?)
    `).bind(
      providerNotificationId, booking.provider_id,
      `Your service has been marked as completed by the parent. Payout of ₹${netAmount} will be processed in 3 days.`,
      JSON.stringify({ bookingId, payoutAmount: netAmount, scheduledPayoutDate: scheduledPayoutDate.toISOString() }),
      new Date().toISOString()
    ).run();

    console.log(`✅ Service completed for booking ${bookingId} by parent ${parentId}`);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Service marked as completed successfully',
      data: {
        bookingId,
        status: 'completed',
        completedAt: new Date().toISOString(),
        payout: {
          totalAmount,
          commissionAmount,
          gstAmount,
          netAmount,
          scheduledPayoutDate: scheduledPayoutDate.toISOString()
        }
      }
    }), { headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('❌ Mark service completed error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to mark service as completed: ' + error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// Generate OTPs for all confirmed FUTURE bookings that don't have one
export async function generateMissingOTPs(request, env) {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Only select FUTURE bookings where parent and provider actually exist
    const confirmed = await env.KUDDL_DB.prepare(`
      SELECT b.id, b.parent_id, b.provider_id, b.booking_date
      FROM bookings b
      LEFT JOIN booking_otps bo ON b.id = bo.booking_id
      INNER JOIN providers pr ON b.provider_id = pr.id
      WHERE b.status = 'confirmed' AND bo.id IS NULL
      AND b.booking_date >= ?
    `).bind(today).all();

    // Also clean up OTPs for past bookings
    const cleanedUp = await env.KUDDL_DB.prepare(`
      DELETE FROM booking_otps WHERE booking_id IN (
        SELECT b.id FROM bookings b WHERE b.booking_date < ?
      )
    `).bind(today).run();
    console.log(`🧹 Cleaned up OTPs for past bookings: ${cleanedUp.meta?.changes || 0} removed`);

    const generated = [];
    const skipped = [];
    for (const b of (confirmed.results || [])) {
      try {
        const otpCode = generateOTP();
        const otpId = generateId();
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

        await env.KUDDL_DB.prepare(`
          INSERT INTO booking_otps (id, booking_id, parent_id, provider_id, otp_code, status, expires_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)
        `).bind(otpId, b.id, b.parent_id, b.provider_id, otpCode, expiresAt.toISOString(), new Date().toISOString(), new Date().toISOString()).run();
        generated.push({ bookingId: b.id, otpCode });
      } catch (e) {
        skipped.push({ bookingId: b.id, error: e.message });
      }
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: `Generated OTPs for ${generated.length} bookings, skipped ${skipped.length}`,
      data: { generated, skipped }
    }), { headers: { 'Content-Type': 'application/json' } }));
  } catch (error) {
    console.error('Generate missing OTPs error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false, message: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// Get OTP status for a booking
export async function getOTPStatus(request, env) {
  try {
    const url = new URL(request.url);
    const bookingId = url.searchParams.get('bookingId');

    if (!bookingId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Booking ID is required'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    const otpRecord = await env.KUDDL_DB.prepare(`
      SELECT bo.*, b.status as booking_status, b.service_started_at, b.completed_at
      FROM booking_otps bo
      JOIN bookings b ON bo.booking_id = b.id
      WHERE bo.booking_id = ?
      ORDER BY bo.created_at DESC
      LIMIT 1
    `).bind(bookingId).first();

    if (!otpRecord) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'No OTP found for this booking'
      }), { status: 404, headers: { 'Content-Type': 'application/json' } }));
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: {
        otpId: otpRecord.id,
        bookingId: otpRecord.booking_id,
        otpStatus: otpRecord.status,
        bookingStatus: otpRecord.booking_status,
        expiresAt: otpRecord.expires_at,
        usedAt: otpRecord.used_at,
        serviceStartedAt: otpRecord.service_started_at,
        completedAt: otpRecord.completed_at
      }
    }), { headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('❌ Get OTP status error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to get OTP status: ' + error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}
