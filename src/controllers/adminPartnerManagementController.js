import { addCorsHeaders } from '../utils/cors.js';
import jwt from '@tsndr/cloudflare-worker-jwt';

// Get partner info
export async function getPartnerInfo(request, env) {
  try {
    const url = new URL(request.url);
    const partnerId = url.pathname.split('/').pop();

    const partner = await env.KUDDL_DB.prepare(`
      SELECT * FROM providers WHERE id = ?
    `).bind(partnerId).first();

    if (!partner) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Partner not found'
      }), { status: 404, headers: { 'Content-Type': 'application/json' } }));
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      partner
    }), { headers: { 'Content-Type': 'application/json' } }));
  } catch (error) {
    console.error('Error fetching partner info:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch partner info'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// Get partner services
export async function getPartnerServices(request, env) {
  try {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const partnerId = pathParts[pathParts.indexOf('partners') + 1];

    const services = await env.KUDDL_DB.prepare(`
      SELECT s.*, c.name as category_name
      FROM services s
      LEFT JOIN categories c ON s.category_id = c.id
      WHERE s.provider_id = ?
      ORDER BY s.created_at DESC
    `).bind(partnerId).all();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      services: services.results || []
    }), { headers: { 'Content-Type': 'application/json' } }));
  } catch (error) {
    console.error('Error fetching partner services:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch services'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// Delete partner service
export async function deletePartnerService(request, env) {
  try {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const serviceId = pathParts[pathParts.length - 1];
    const partnerId = pathParts[pathParts.indexOf('partners') + 1];

    // Verify service belongs to partner
    const service = await env.KUDDL_DB.prepare(`
      SELECT id FROM services WHERE id = ? AND provider_id = ?
    `).bind(serviceId, partnerId).first();

    if (!service) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Service not found'
      }), { status: 404, headers: { 'Content-Type': 'application/json' } }));
    }

    await env.KUDDL_DB.prepare(`
      DELETE FROM services WHERE id = ?
    `).bind(serviceId).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Service deleted successfully'
    }), { headers: { 'Content-Type': 'application/json' } }));
  } catch (error) {
    console.error('Error deleting service:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to delete service'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// Get partner camps
export async function getPartnerCamps(request, env) {
  try {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const partnerId = pathParts[pathParts.indexOf('partners') + 1];

    const camps = await env.KUDDL_DB.prepare(`
      SELECT * FROM camps
      WHERE provider_id = ?
      ORDER BY created_at DESC
    `).bind(partnerId).all();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      camps: camps.results || []
    }), { headers: { 'Content-Type': 'application/json' } }));
  } catch (error) {
    console.error('Error fetching partner camps:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch camps'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// Delete partner camp
export async function deletePartnerCamp(request, env) {
  try {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const campId = pathParts[pathParts.length - 1];
    const partnerId = pathParts[pathParts.indexOf('partners') + 1];

    // Verify camp belongs to partner
    const camp = await env.KUDDL_DB.prepare(`
      SELECT id FROM camps WHERE id = ? AND provider_id = ?
    `).bind(campId, partnerId).first();

    if (!camp) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Camp not found'
      }), { status: 404, headers: { 'Content-Type': 'application/json' } }));
    }

    await env.KUDDL_DB.prepare(`
      DELETE FROM camps WHERE id = ?
    `).bind(campId).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Camp deleted successfully'
    }), { headers: { 'Content-Type': 'application/json' } }));
  } catch (error) {
    console.error('Error deleting camp:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to delete camp'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}
