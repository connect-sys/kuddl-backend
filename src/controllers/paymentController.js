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

    // Store a payment_orders row only when we already have a booking — the
    // column is NOT NULL and a FK to bookings(id). In the current flow the
    // booking is created AFTER a successful payment (and links back via
    // razorpay_order_id), so when there's no bookingId yet we skip this insert
    // and just return the Razorpay order to the client.
    const paymentOrderId = generateId();
    if (bookingId) {
      await env.KUDDL_DB.prepare(`
        INSERT INTO payment_orders (id, amount, currency, status, booking_id, created_at, razorpay_order_id)
        VALUES (?, ?, ?, 'created', ?, ?, ?)
      `).bind(paymentOrderId, amount, currency, bookingId, new Date().toISOString(), orderId).run();
    }

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

// Get the account's REAL enabled payment methods + full netbanking/wallet lists
// from Razorpay, so the custom checkout UI mirrors what the hosted popup offers.
// Razorpay's Methods API requires key_id:key_secret Basic Auth, so it MUST run
// here on the server — the secret is never sent to the browser.
export async function getPaymentMethods(request, env) {
  try {
    const keyId = env.RAZORPAY_KEY_ID;
    const keySecret = env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Razorpay credentials not configured'
      }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
    }

    const auth = btoa(`${keyId}:${keySecret}`);
    const resp = await fetch(`https://api.razorpay.com/v1/methods?key_id=${encodeURIComponent(keyId)}`, {
      headers: { 'Authorization': `Basic ${auth}` }
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: err.error?.description || 'Failed to fetch payment methods'
      }), { status: 502, headers: { 'Content-Type': 'application/json' } }));
    }

    const m = await resp.json();

    // Normalize into a stable shape the frontend can render directly.
    // netbanking → [{ code, name }]; wallet → [code]; booleans for the rest.
    const netbanking = m.netbanking && typeof m.netbanking === 'object'
      ? Object.entries(m.netbanking).map(([code, name]) => ({ code, name: String(name) }))
      : [];
    const wallet = m.wallet && typeof m.wallet === 'object'
      ? Object.entries(m.wallet).filter(([, on]) => !!on).map(([code]) => code)
      : (Array.isArray(m.wallet) ? m.wallet : []);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      key: keyId,
      methods: {
        upi: !!m.upi,
        card: !!m.card,
        credit_card: !!m.credit_card,
        debit_card: !!m.debit_card,
        netbanking,
        wallet,
        emi: !!m.emi,
        paylater: m.paylater && typeof m.paylater === 'object'
          ? Object.entries(m.paylater).filter(([, on]) => !!on).map(([code]) => code)
          : [],
      }
    }), {
      headers: {
        'Content-Type': 'application/json',
        // Methods rarely change — let the browser/CDN cache briefly.
        'Cache-Control': 'public, max-age=300'
      }
    }));
  } catch (error) {
    console.error('Get payment methods error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error: ' + error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
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

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Missing payment verification data'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Verify the Razorpay signature — this is the authoritative check and does
    // NOT depend on a local DB row (in the pay-then-book flow the booking and
    // payment_orders row are created AFTER payment).
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

    // If a payment_orders row exists (only created when a booking already
    // existed), mark it completed and update the linked booking. A missing row
    // is NOT an error — the signature is verified above.
    const paymentOrder = paymentOrderId
      ? await env.KUDDL_DB.prepare('SELECT * FROM payment_orders WHERE id = ?').bind(paymentOrderId).first()
      : null;

    if (paymentOrder) {
      await env.KUDDL_DB.prepare(`
        UPDATE payment_orders
        SET status = 'completed', razorpay_payment_id = ?, updated_at = ?
        WHERE id = ?
      `).bind(razorpay_payment_id, new Date().toISOString(), paymentOrderId).run();

      if (paymentOrder.booking_id) {
        await env.KUDDL_DB.prepare(`
          UPDATE bookings
          SET payment_status = 'paid', payment_id = ?, updated_at = ?
          WHERE id = ?
        `).bind(razorpay_payment_id, new Date().toISOString(), paymentOrder.booking_id).run();
      }
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
        id, amount, currency, status, razorpay_payment_id, created_at, updated_at
      ) VALUES (?, ?, 'INR', 'completed', ?, ?, ?)
    `).bind(
      paymentOrderId,
      amount,
      paymentId,
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
