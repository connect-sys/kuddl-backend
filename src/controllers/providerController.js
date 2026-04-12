/**
 * Provider Controller
 * Handles provider-specific API endpoints
 */

import { addCorsHeaders } from '../utils/cors.js';
import { generateId } from '../utils/helpers.js';

// Get all providers with filters
export async function getProviders(request, env) {
  try {
    const url = new URL(request.url);
    const category = url.searchParams.get('category');
    const location = url.searchParams.get('location');
    const rating = url.searchParams.get('rating');
    const priceMin = url.searchParams.get('priceMin');
    const priceMax = url.searchParams.get('priceMax');
    const availability = url.searchParams.get('availability');
    const page = parseInt(url.searchParams.get('page')) || 1;
    const limit = parseInt(url.searchParams.get('limit')) || 20;
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        p.id, p.business_name, p.description, p.experience_years,
        p.languages, p.average_rating, p.total_bookings,
        p.total_reviews, p.is_featured, p.response_time_minutes,
        p.first_name, p.last_name, p.profile_image_url, p.city, p.state,
        GROUP_CONCAT(s.name) as services,
        MIN(s.price) as min_price,
        MAX(s.price) as max_price
      FROM providers p
      LEFT JOIN services s ON p.id = s.provider_id AND s.status = 'active'
      WHERE p.is_active = 1 AND p.kyc_status = 'verified'
    `;

    const params = [];

    if (category) {
      query += ` AND s.category_id = ?`;
      params.push(category);
    }

    if (location) {
      query += ` AND (p.city LIKE ? OR p.state LIKE ?)`;
      params.push(`%${location}%`, `%${location}%`);
    }

    if (rating) {
      query += ` AND p.average_rating >= ?`;
      params.push(parseFloat(rating));
    }

    query += ` GROUP BY p.id`;

    if (priceMin || priceMax) {
      query += ` HAVING 1=1`;
      if (priceMin) {
        query += ` AND min_price >= ?`;
        params.push(parseFloat(priceMin));
      }
      if (priceMax) {
        query += ` AND max_price <= ?`;
        params.push(parseFloat(priceMax));
      }
    }

    query += ` ORDER BY p.is_featured DESC, p.average_rating DESC, p.total_bookings DESC`;
    query += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const providers = await env.KUDDL_DB.prepare(query).bind(...params).all();

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(DISTINCT p.id) as total
      FROM providers p
      LEFT JOIN services s ON p.id = s.provider_id AND s.status = 'active'
      WHERE p.is_active = 1 AND p.kyc_status = 'verified'
    `;

    const countParams = [];
    if (category) {
      countQuery += ` AND s.category_id = ?`;
      countParams.push(category);
    }
    if (location) {
      countQuery += ` AND (p.city LIKE ? OR p.state LIKE ?)`;
      countParams.push(`%${location}%`, `%${location}%`);
    }
    if (rating) {
      countQuery += ` AND p.average_rating >= ?`;
      countParams.push(parseFloat(rating));
    }

    const totalResult = await env.KUDDL_DB.prepare(countQuery).bind(...countParams).first();
    const total = totalResult?.total || 0;

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: {
        providers: providers.results || [],
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
    console.error('Get providers error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get provider by ID
export async function getProviderById(request, env) {
  try {
    const url = new URL(request.url);
    const providerId = url.pathname.split('/').pop();

    const provider = await env.KUDDL_DB.prepare(`
      SELECT 
        p.*, 
        p.first_name, p.last_name, p.email, p.phone, p.profile_image_url,
        p.city, p.state, p.created_at as user_created_at
      FROM providers p
      WHERE p.id = ? AND p.is_active = 1
    `).bind(providerId).first();

    if (!provider) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Provider not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Get provider services
    const services = await env.KUDDL_DB.prepare(`
      SELECT s.*, c.name as category_name
      FROM services s
      LEFT JOIN categories c ON s.category_id = c.id
      WHERE s.provider_id = ? AND s.status = 'active'
      ORDER BY s.created_at DESC
    `).bind(providerId).all();

    // Get provider availability
    const availability = await env.KUDDL_DB.prepare(`
      SELECT * FROM provider_availability
      WHERE provider_id = ? AND is_available = 1
      ORDER BY day_of_week, start_time
    `).bind(providerId).all();

    // Get recent reviews
    const reviews = await env.KUDDL_DB.prepare(`
      SELECT 
        r.*, 
        u.first_name, u.last_name, u.profile_image_url,
        s.name as service_name
      FROM reviews r
      JOIN users u ON r.customer_id = u.id
      LEFT JOIN services s ON r.service_id = s.id
      WHERE r.provider_id = ?
      ORDER BY r.created_at DESC
      LIMIT 10
    `).bind(providerId).all();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: {
        provider: {
          ...provider,
          name: `${provider.first_name} ${provider.last_name}`,
          languages: provider.languages ? JSON.parse(provider.languages) : [],
          service_area: provider.service_area ? JSON.parse(provider.service_area) : [],
          verification_documents: provider.verification_documents ? JSON.parse(provider.verification_documents) : []
        },
        services: services.results || [],
        availability: availability.results || [],
        reviews: reviews.results || []
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Get provider error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Update provider profile
export async function updateProvider(request, env) {
  try {
    const user = request.user; // From auth middleware
    
    if (user.role !== 'provider') {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Access denied. Provider role required.'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const updateData = await request.json();
    
    const allowedFields = [
      'business_name', 'description', 'experience_years', 'languages',
      'service_area', 'response_time_minutes', 'instant_booking_enabled'
    ];
    
    const updates = {};
    Object.keys(updateData).forEach(key => {
      if (allowedFields.includes(key)) {
        if (key === 'languages' || key === 'service_area') {
          updates[key] = JSON.stringify(updateData[key]);
        } else {
          updates[key] = updateData[key];
        }
      }
    });

    if (Object.keys(updates).length === 0) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'No valid fields to update'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Build update query
    const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(new Date().toISOString(), user.id);

    await env.KUDDL_DB.prepare(`
      UPDATE providers SET ${setClause}, updated_at = ? WHERE id = ?
    `).bind(...values).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Provider profile updated successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Update provider error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Set provider availability
export async function setAvailability(request, env) {
  try {
    const user = request.user; // From auth middleware
    
    if (user.role !== 'provider') {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Access denied. Provider role required.'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const { availability } = await request.json();

    if (!Array.isArray(availability)) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Availability must be an array'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Get provider ID
    const provider = await env.KUDDL_DB.prepare(
      'SELECT id FROM providers WHERE id = ?'
    ).bind(user.id).first();

    if (!provider) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Provider profile not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Delete existing availability
    await env.KUDDL_DB.prepare(
      'DELETE FROM provider_availability WHERE provider_id = ?'
    ).bind(provider.id).run();

    // Insert new availability
    for (const slot of availability) {
      if (slot.isAvailable) {
        const availabilityId = generateId();
        await env.KUDDL_DB.prepare(`
          INSERT INTO provider_availability (id, provider_id, day_of_week, start_time, end_time, is_available, created_at)
          VALUES (?, ?, ?, ?, ?, 1, ?)
        `).bind(
          availabilityId, provider.id, slot.dayOfWeek, 
          slot.startTime, slot.endTime, new Date().toISOString()
        ).run();
      }
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Availability updated successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Set availability error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get provider dashboard stats
export async function getDashboardStats(request, env) {
  try {
    const user = request.user; // From auth middleware
    
    if (user.role !== 'provider') {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Access denied. Provider role required.'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Get provider ID
    const provider = await env.KUDDL_DB.prepare(
      'SELECT id FROM providers WHERE id = ?'
    ).bind(user.id).first();

    if (!provider) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Provider profile not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Get booking stats
    const bookingStats = await env.KUDDL_DB.prepare(`
      SELECT 
        COUNT(*) as total_bookings,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_bookings,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_bookings,
        COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_bookings,
        SUM(CASE WHEN status = 'completed' THEN provider_amount ELSE 0 END) as total_earnings
      FROM bookings 
      WHERE provider_id = ?
    `).bind(provider.id).first();

    // Get monthly earnings
    const monthlyEarnings = await env.KUDDL_DB.prepare(`
      SELECT 
        strftime('%Y-%m', booking_date) as month,
        SUM(provider_amount) as earnings,
        COUNT(*) as bookings
      FROM bookings 
      WHERE provider_id = ? AND status = 'completed'
      GROUP BY strftime('%Y-%m', booking_date)
      ORDER BY month DESC
      LIMIT 12
    `).bind(provider.id).all();

    // Get recent bookings
    const recentBookings = await env.KUDDL_DB.prepare(`
      SELECT 
        b.*,
        u.first_name, u.last_name, u.profile_image_url,
        s.name as service_name
      FROM bookings b
      JOIN users u ON b.customer_id = u.id
      LEFT JOIN services s ON b.service_id = s.id
      WHERE b.provider_id = ?
      ORDER BY b.created_at DESC
      LIMIT 10
    `).bind(provider.id).all();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: {
        stats: bookingStats || {
          total_bookings: 0,
          completed_bookings: 0,
          pending_bookings: 0,
          confirmed_bookings: 0,
          total_earnings: 0
        },
        monthlyEarnings: monthlyEarnings.results || [],
        recentBookings: recentBookings.results || []
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Get dashboard stats error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}
