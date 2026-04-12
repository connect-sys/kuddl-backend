import { addCorsHeaders } from '../utils/cors.js';

// Get partner bookings for calendar display
export async function getPartnerBookings(request, env) {
  try {
    const url = new URL(request.url);
    const providerId = url.searchParams.get('providerId');

    if (!providerId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Provider ID is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Fetch bookings for the partner with service and parent details
    const bookingsResult = await env.KUDDL_DB.prepare(`
      SELECT 
        b.id,
        b.booking_date,
        b.start_time,
        b.end_time,
        b.duration_minutes,
        b.status,
        b.total_amount,
        b.special_requests,
        s.service_name,
        s.category,
        p.first_name as parent_first_name,
        p.last_name as parent_last_name,
        p.phone as parent_phone,
        b.created_at,
        b.updated_at
      FROM bookings b
      LEFT JOIN services s ON b.service_id = s.id
      LEFT JOIN parents p ON b.parent_id = p.id
      WHERE b.provider_id = ?
      ORDER BY b.booking_date DESC, b.start_time DESC
    `).bind(providerId).all();

    const bookings = bookingsResult.results || [];

    // Transform bookings for calendar format
    const calendarEvents = bookings.map(booking => {
      // Combine date and time for start/end datetime
      const startDateTime = new Date(`${booking.booking_date}T${booking.start_time || '09:00'}:00`);
      const endDateTime = booking.end_time 
        ? new Date(`${booking.booking_date}T${booking.end_time}:00`)
        : new Date(startDateTime.getTime() + (booking.duration_minutes || 60) * 60000);

      // Determine occupancy (for now, assume 1 person per booking, max capacity based on service type)
      const maxCapacity = getServiceCapacity(booking.category);
      const occupancy = 1; // Current booking occupancy

      return {
        id: booking.id,
        title: `${booking.service_name || 'Service'} (${occupancy}/${maxCapacity})`,
        start: startDateTime.toISOString(),
        end: endDateTime.toISOString(),
        backgroundColor: getEventColor(booking.status, occupancy, maxCapacity),
        borderColor: getEventColor(booking.status, occupancy, maxCapacity),
        extendedProps: {
          status: booking.status,
          customerId: booking.parent_id,
          customerName: `${booking.parent_first_name || ''} ${booking.parent_last_name || ''}`.trim(),
          customerPhone: booking.parent_phone,
          serviceType: booking.service_name,
          category: booking.category,
          occupancy: occupancy,
          maxCapacity: maxCapacity,
          totalAmount: booking.total_amount,
          specialRequests: booking.special_requests,
          createdAt: booking.created_at
        }
      };
    });

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      events: calendarEvents,
      totalBookings: bookings.length
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Error fetching partner bookings:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch bookings',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get service capacity based on category
function getServiceCapacity(category) {
  const capacityMap = {
    'party': 15,
    'bloom': 8,
    'care': 3,
    'discover': 10,
    'magic': 20,
    'art': 12,
    'dance': 15,
    'music': 8
  };

  if (!category) return 10; // Default capacity

  const categoryLower = category.toLowerCase();
  for (const [key, capacity] of Object.entries(capacityMap)) {
    if (categoryLower.includes(key)) {
      return capacity;
    }
  }

  return 10; // Default capacity
}

// Get event color based on status and occupancy
function getEventColor(status, occupancy, maxCapacity) {
  if (status === 'cancelled') return '#ef4444'; // Red
  if (status === 'pending') return '#f59e0b'; // Yellow
  
  // Color based on occupancy for confirmed bookings
  const occupancyRate = occupancy / maxCapacity;
  if (occupancyRate >= 1) return '#dc2626'; // Full - Red
  if (occupancyRate >= 0.8) return '#ea580c'; // Almost full - Orange
  if (occupancyRate >= 0.5) return '#578f82'; // Half full - Primary green
  return '#10b981'; // Low occupancy - Green
}

// Get booking statistics for partner
export async function getPartnerBookingStats(request, env) {
  try {
    const url = new URL(request.url);
    const providerId = url.searchParams.get('providerId');

    if (!providerId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Provider ID is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Get booking statistics
    const statsResult = await env.KUDDL_DB.prepare(`
      SELECT 
        COUNT(*) as total_bookings,
        COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_bookings,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_bookings,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_bookings,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_bookings,
        SUM(CASE WHEN status IN ('confirmed', 'completed') THEN total_amount ELSE 0 END) as total_revenue,
        AVG(CASE WHEN status IN ('confirmed', 'completed') THEN total_amount ELSE NULL END) as avg_booking_value
      FROM bookings 
      WHERE provider_id = ?
    `).bind(providerId).first();

    // Get recent bookings
    const recentBookingsResult = await env.KUDDL_DB.prepare(`
      SELECT 
        b.id,
        b.booking_date,
        b.start_time,
        b.status,
        b.total_amount,
        s.service_name,
        p.first_name as parent_first_name,
        p.last_name as parent_last_name
      FROM bookings b
      LEFT JOIN services s ON b.service_id = s.id
      LEFT JOIN parents p ON b.parent_id = p.id
      WHERE b.provider_id = ?
      ORDER BY b.created_at DESC
      LIMIT 5
    `).bind(providerId).all();

    const stats = {
      totalBookings: statsResult?.total_bookings || 0,
      confirmedBookings: statsResult?.confirmed_bookings || 0,
      pendingBookings: statsResult?.pending_bookings || 0,
      cancelledBookings: statsResult?.cancelled_bookings || 0,
      completedBookings: statsResult?.completed_bookings || 0,
      totalRevenue: statsResult?.total_revenue || 0,
      avgBookingValue: statsResult?.avg_booking_value || 0,
      recentBookings: recentBookingsResult.results || []
    };

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      stats
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Error fetching booking stats:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch booking statistics',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}
