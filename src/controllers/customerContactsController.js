/**
 * Customer Contacts Controller
 * Handles customer contacts based on bookings and interactions
 */

import { addCorsHeaders } from '../utils/cors.js';
import jwt from '@tsndr/cloudflare-worker-jwt';

// Get customer contacts (providers they've interacted with)
export async function getContacts(request, env) {
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

    // Get unique providers from bookings
    const contacts = await env.KUDDL_DB.prepare(`
      SELECT DISTINCT
        p.id,
        p.name as full_name,
        p.email,
        p.phone,
        p.profile_image_url,
        MAX(b.created_at) as last_interaction,
        COUNT(b.id) as booking_count
      FROM bookings b
      JOIN providers p ON b.provider_id = p.id
      WHERE b.parent_id = ?
      GROUP BY p.id, p.name, p.email, p.phone, p.profile_image_url
      ORDER BY last_interaction DESC
      LIMIT 50
    `).bind(parentId).all();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      contacts: contacts.results || []
    }), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    }));

  } catch (error) {
    console.error('Get contacts error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch contacts'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}
