import { addCorsHeaders } from '../utils/cors.js';

export async function findProviderWithBookings(request, env) {
  try {
    console.log('🔍 Finding providers with bookings...');

    // Get all providers
    const providersQuery = await env.KUDDL_DB.prepare(`
      SELECT id, first_name, last_name, business_name, phone 
      FROM providers 
      ORDER BY created_at DESC
    `).all();

    // Get all bookings with provider info
    const bookingsQuery = await env.KUDDL_DB.prepare(`
      SELECT 
        b.provider_id,
        COUNT(*) as booking_count,
        SUM(b.total_amount) as total_revenue,
        p.first_name,
        p.last_name,
        p.business_name,
        p.phone
      FROM bookings b
      LEFT JOIN providers p ON b.provider_id = p.id
      GROUP BY b.provider_id
      ORDER BY booking_count DESC
    `).all();

    // Get sample bookings to see the data structure
    const sampleBookings = await env.KUDDL_DB.prepare(`
      SELECT * FROM bookings LIMIT 5
    `).all();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: {
        providers: providersQuery.results || [],
        providersWithBookings: bookingsQuery.results || [],
        sampleBookings: sampleBookings.results || [],
        totalProviders: providersQuery.results?.length || 0,
        providersWithBookingsCount: bookingsQuery.results?.length || 0
      }
    }), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    }));

  } catch (error) {
    console.error('❌ Find provider error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Error finding providers: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}
