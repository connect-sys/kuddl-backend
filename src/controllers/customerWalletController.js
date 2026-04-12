/**
 * Customer Wallet Controller
 * Handles wallet balance, add money, and transactions for customers
 */

import { addCorsHeaders } from '../utils/cors.js';
import { generateId } from '../utils/helpers.js';
import jwt from '@tsndr/cloudflare-worker-jwt';

// Get wallet balance and transactions
export async function getWallet(request, env) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authorization required'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    const token = authHeader.substring(7);
    const decoded = jwt.decode(token);
    const parentId = decoded.payload.id;

    // Get or create wallet
    let wallet = await env.KUDDL_DB.prepare(`
      SELECT * FROM customer_wallets WHERE parent_id = ?
    `).bind(parentId).first();

    if (!wallet) {
      const walletId = generateId();
      await env.KUDDL_DB.prepare(`
        INSERT INTO customer_wallets (id, parent_id, balance, created_at, updated_at)
        VALUES (?, ?, 0, ?, ?)
      `).bind(walletId, parentId, new Date().toISOString(), new Date().toISOString()).run();

      wallet = { id: walletId, parent_id: parentId, balance: 0 };
    }

    // Get transactions
    const transactions = await env.KUDDL_DB.prepare(`
      SELECT * FROM wallet_transactions 
      WHERE parent_id = ? 
      ORDER BY created_at DESC 
      LIMIT 50
    `).bind(parentId).all();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      wallet: {
        balance: wallet.balance || 0,
        transactions: transactions.results || []
      }
    }), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    }));

  } catch (error) {
    console.error('Get wallet error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch wallet'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// Create Razorpay order for adding money
export async function createAddMoneyOrder(request, env) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authorization required'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    const token = authHeader.substring(7);
    const decoded = jwt.decode(token);
    const parentId = decoded.payload.id;

    const { amount } = await request.json();

    if (!amount || amount < 1) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Valid amount is required (minimum ₹1)'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    // Create Razorpay order
    const orderId = generateId();
    const amountInPaise = Math.round(amount * 100);

    // Create order in Razorpay
    const razorpayAuth = btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
    const razorpayResponse = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${razorpayAuth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency: 'INR',
        receipt: orderId,
        notes: {
          parent_id: parentId,
          purpose: 'wallet_topup'
        }
      })
    });

    if (!razorpayResponse.ok) {
      throw new Error('Failed to create Razorpay order');
    }

    const razorpayOrder = await razorpayResponse.json();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      order_id: orderId,
      razorpay_order_id: razorpayOrder.id,
      amount: amount,
      currency: 'INR'
    }), { headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('Create add money order error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to create order'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// Verify payment and credit wallet
export async function verifyPaymentAndCredit(request, env) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authorization required'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    const token = authHeader.substring(7);
    const decoded = jwt.decode(token);
    const parentId = decoded.payload.id;

    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, amount } = await request.json();

    // Verify signature using Web Crypto API
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(env.RAZORPAY_KEY_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(`${razorpay_order_id}|${razorpay_payment_id}`)
    );
    
    const expectedSignature = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    if (expectedSignature !== razorpay_signature) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Payment verification failed'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    // Get or create wallet
    let wallet = await env.KUDDL_DB.prepare(`
      SELECT * FROM customer_wallets WHERE parent_id = ?
    `).bind(parentId).first();

    if (!wallet) {
      const walletId = generateId();
      await env.KUDDL_DB.prepare(`
        INSERT INTO customer_wallets (id, parent_id, balance, created_at, updated_at)
        VALUES (?, ?, 0, ?, ?)
      `).bind(walletId, parentId, new Date().toISOString(), new Date().toISOString()).run();
      wallet = { id: walletId, balance: 0 };
    }

    // Credit wallet
    const newBalance = (wallet.balance || 0) + amount;
    await env.KUDDL_DB.prepare(`
      UPDATE customer_wallets SET balance = ?, updated_at = ? WHERE id = ?
    `).bind(newBalance, new Date().toISOString(), wallet.id).run();

    // Record transaction
    const transactionId = generateId();
    await env.KUDDL_DB.prepare(`
      INSERT INTO wallet_transactions 
      (id, wallet_id, parent_id, type, amount, description, payment_id, order_id, status, created_at)
      VALUES (?, ?, ?, 'credit', ?, 'Wallet top-up', ?, ?, 'completed', ?)
    `).bind(
      transactionId,
      wallet.id,
      parentId,
      amount,
      razorpay_payment_id,
      razorpay_order_id,
      new Date().toISOString()
    ).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Payment verified and wallet credited',
      new_balance: newBalance,
      transaction_id: transactionId
    }), { headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('Verify payment error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to verify payment'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}
