/**
 * Customer Wishlist Controller
 * Handles wishlist/favorites functionality for customers
 */

import { addCorsHeaders } from '../utils/cors.js';
import { generateId } from '../utils/helpers.js';
import jwt from '@tsndr/cloudflare-worker-jwt';

// Get customer wishlist
export async function getWishlist(request, env) {
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

    // Get wishlist with service details
    const wishlist = await env.KUDDL_DB.prepare(`
      SELECT 
        w.id as wishlist_id,
        w.created_at as added_at,
        s.*,
        p.full_name as provider_name,
        p.email as provider_email
      FROM customer_wishlist w
      JOIN services s ON w.service_id = s.id
      LEFT JOIN providers p ON s.provider_id = p.id
      WHERE w.parent_id = ?
      ORDER BY w.created_at DESC
    `).bind(parentId).all();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      wishlist: wishlist.results || []
    }), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    }));

  } catch (error) {
    console.error('Get wishlist error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch wishlist'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// Add to wishlist
export async function addToWishlist(request, env) {
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

    const { service_id } = await request.json();

    if (!service_id) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Service ID is required'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    // Check if already in wishlist
    const existing = await env.KUDDL_DB.prepare(`
      SELECT id FROM customer_wishlist WHERE parent_id = ? AND service_id = ?
    `).bind(parentId, service_id).first();

    if (existing) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Service already in wishlist'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    const wishlistId = generateId();
    await env.KUDDL_DB.prepare(`
      INSERT INTO customer_wishlist (id, parent_id, service_id, created_at)
      VALUES (?, ?, ?, ?)
    `).bind(wishlistId, parentId, service_id, new Date().toISOString()).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Added to wishlist',
      wishlist_id: wishlistId
    }), { headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('Add to wishlist error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to add to wishlist'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// Remove from wishlist
export async function removeFromWishlist(request, env) {
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

    const url = new URL(request.url);
    const serviceId = url.pathname.split('/').pop();

    await env.KUDDL_DB.prepare(`
      DELETE FROM customer_wishlist WHERE parent_id = ? AND service_id = ?
    `).bind(parentId, serviceId).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Removed from wishlist'
    }), { headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('Remove from wishlist error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to remove from wishlist'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}
