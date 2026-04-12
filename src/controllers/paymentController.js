/**
 * Payment Controller
 * Handles payment-related operations with Razorpay integration
 */

import { addCorsHeaders } from '../utils/cors.js';
import { generateId } from '../utils/helpers.js';
import { createOTPForBooking } from './otpServiceController.js';

// Razorpay configuration is injected via env

// Helper to create Razorpay Order
async function createRazorpayOrderApi(amount, currency, env) {
  const keyId = env.RAZORPAY_KEY_ID;
  const keySecret = env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error('Razorpay credentials not configured');
  }

  const auth = btoa(`${keyId}:${keySecret}`);
  
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${auth}`
    },
    body: JSON.stringify({
      amount: Math.round(amount * 100), // Amount in paise, ensure integer
      currency: currency,
      receipt: `receipt_${Date.now()}`,
      payment_capture: 1
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.description || 'Failed to create Razorpay order');
  }

  return await response.json();
}

// Create payment order
export async function createPaymentOrder(request, env) {
  try {
    const { bookingId, amount, currency = 'INR' } = await request.json();

    if (!amount || amount <= 0) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Valid amount is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Verify booking exists if bookingId is provided
    if (bookingId) {
      const booking = await env.KUDDL_DB.prepare(
        'SELECT * FROM bookings WHERE id = ?'
      ).bind(bookingId).first();
  
      if (!booking) {
        return addCorsHeaders(new Response(JSON.stringify({
          success: false,
          message: 'Booking not found'
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }));
      }
    }

    // Create order with Razorpay
    let razorpayOrder;
    try {
      razorpayOrder = await createRazorpayOrderApi(amount, currency, env);
    } catch (razorpayError) {
      console.error('Razorpay order creation failed:', razorpayError);
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Payment gateway error: ' + razorpayError.message
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const orderId = razorpayOrder.id;

    // Store payment order in database with booking reference (nullable)
    const paymentOrderId = generateId();
    await env.KUDDL_DB.prepare(`
      INSERT INTO payment_orders (
        id, amount, currency, status, payment_id, booking_id, created_at, razorpay_order_id
      ) VALUES (?, ?, ?, 'created', ?, ?, ?, ?)
    `).bind(
      paymentOrderId,
      amount,
      currency,
      null, // payment_id is initially null
      bookingId || null,
      new Date().toISOString(),
      orderId
    ).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      orderId: orderId,
      amount: amount,
      currency: currency,
      key: env.RAZORPAY_KEY_ID,
      paymentOrderId: paymentOrderId
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Create payment order error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Helper to verify Razorpay signature
async function verifyRazorpaySignature(orderId, paymentId, signature, secret) {
  const text = `${orderId}|${paymentId}`;
  
  // Web Crypto API for HMAC SHA256
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(text);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  // We need to convert hex signature to buffer
  const signatureBuffer = new Uint8Array(
    signature.match(/[\da-f]{2}/gi).map(h => parseInt(h, 16))
  );

  const isValid = await crypto.subtle.verify(
    'HMAC',
    key,
    signatureBuffer,
    msgData
  );

  return isValid;
}

// Verify payment
export async function verifyPayment(request, env) {
  try {
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature,
      paymentOrderId 
    } = await request.json();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !paymentOrderId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Missing payment verification data'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Get payment order
    const paymentOrder = await env.KUDDL_DB.prepare(
      'SELECT * FROM payment_orders WHERE id = ?'
    ).bind(paymentOrderId).first();

    if (!paymentOrder) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Payment order not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Verify signature
    let isSignatureValid = false;
    try {
      isSignatureValid = await verifyRazorpaySignature(
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        env.RAZORPAY_KEY_SECRET
      );
    } catch (e) {
      console.error('Signature verification error:', e);
    }

    if (!isSignatureValid) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid payment signature'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Update payment order status
    await env.KUDDL_DB.prepare(`
      UPDATE payment_orders 
      SET status = 'completed', razorpay_payment_id = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      razorpay_payment_id,
      new Date().toISOString(),
      paymentOrderId
    ).run();

    // If there is a booking ID linked, update it
    if (paymentOrder.booking_id) {
       await env.KUDDL_DB.prepare(`
        UPDATE bookings 
        SET payment_status = 'paid', payment_id = ?, updated_at = ?
        WHERE id = ?
      `).bind(
        razorpay_payment_id,
        new Date().toISOString(),
        paymentOrder.booking_id
      ).run();
    }
    
    // Also check if bookingId was passed in body (legacy support)
    // ... (removed redundant check, rely on payment_orders link or handle if needed)

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Payment verified successfully',
      paymentId: razorpay_payment_id
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Verify payment error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Process payment (simplified for demo)
export async function processPayment(request, env) {
  try {
    const { 
      bookingId, 
      paymentMethod, 
      amount,
      promoCode 
    } = await request.json();

    if (!bookingId || !paymentMethod || !amount) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Booking ID, payment method, and amount are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Verify booking exists
    const booking = await env.KUDDL_DB.prepare(
      'SELECT * FROM bookings WHERE id = ?'
    ).bind(bookingId).first();

    if (!booking) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Booking not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Generate payment ID
    const paymentId = `payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create payment record
    const paymentOrderId = generateId();
    await env.KUDDL_DB.prepare(`
      INSERT INTO payment_orders (
        id, amount, currency, status, payment_id, signature, created_at, updated_at
      ) VALUES (?, ?, 'INR', 'completed', ?, ?, ?, ?)
    `).bind(
      paymentOrderId,
      amount,
      paymentId,
      'demo_signature',
      new Date().toISOString(),
      new Date().toISOString()
    ).run();

    // Update booking payment status
    await env.KUDDL_DB.prepare(`
      UPDATE bookings 
      SET payment_status = 'paid', payment_id = ?, status = 'confirmed', confirmed_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      paymentId,
      new Date().toISOString(),
      new Date().toISOString(),
      bookingId
    ).run();

    // Auto-generate OTP for the confirmed booking
    try {
      const booking = await env.KUDDL_DB.prepare(
        'SELECT parent_id, provider_id FROM bookings WHERE id = ?'
      ).bind(bookingId).first();
      if (booking) {
        await createOTPForBooking(env, bookingId, booking.parent_id, booking.provider_id);
      }
    } catch (otpErr) {
      console.error('OTP generation after payment (non-fatal):', otpErr.message);
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Payment processed successfully',
      paymentId: paymentId,
      bookingId: bookingId,
      status: 'completed'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Process payment error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get payment status
export async function getPaymentStatus(request, env) {
  try {
    const url = new URL(request.url);
    const bookingId = url.pathname.split('/').pop();

    const paymentOrder = await env.KUDDL_DB.prepare(
      'SELECT * FROM payment_orders WHERE booking_id = ? ORDER BY created_at DESC LIMIT 1'
    ).bind(bookingId).first();

    if (!paymentOrder) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'No payment found for this booking'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      payment: {
        id: paymentOrder.id,
        status: paymentOrder.status,
        amount: paymentOrder.amount,
        currency: paymentOrder.currency,
        razorpay_order_id: paymentOrder.razorpay_order_id,
        razorpay_payment_id: paymentOrder.razorpay_payment_id,
        created_at: paymentOrder.created_at
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Get payment status error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}
