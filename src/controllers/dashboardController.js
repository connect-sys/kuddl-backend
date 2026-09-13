/**
 * Dashboard Controller
 * Handles dashboard statistics and analytics
 */

import { addCorsHeaders } from '../utils/cors.js';
import { verifyToken } from './authController.js';

// Small helpers to read a batched D1 result set uniformly.
const firstOf = (res) => (res && res.results && res.results[0]) || {};
const rowsOf = (res) => (res && res.results) || [];

// Get partner reviews
export async function getPartnerReviews(request, env) {
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

    // For now, return mock reviews since we don't have a reviews table
    // In a real implementation, you would fetch from a reviews table
    const mockReviews = [
      {
        id: '1',
        customer_name: 'Sarah Johnson',
        service_name: 'Babysitting',
        rating: 5,
        comment: 'Excellent service! Very professional and caring with my children.',
        booking_date: '2024-11-01',
        created_at: '2024-11-02T10:30:00Z',
        response: null
      },
      {
        id: '2',
        customer_name: 'Mike Chen',
        service_name: 'Pet Care',
        rating: 4,
        comment: 'Good service, my dog was well taken care of. Would book again.',
        booking_date: '2024-10-28',
        created_at: '2024-10-29T15:45:00Z',
        response: 'Thank you for the feedback! We love taking care of pets.'
      },
      {
        id: '3',
        customer_name: 'Emily Davis',
        service_name: 'House Cleaning',
        rating: 5,
        comment: 'Amazing work! House was spotless. Highly recommend.',
        booking_date: '2024-10-25',
        created_at: '2024-10-26T09:15:00Z',
        response: null
      }
    ];

    const averageRating = mockReviews.reduce((sum, review) => sum + review.rating, 0) / mockReviews.length;

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: {
        reviews: mockReviews,
        averageRating: Math.round(averageRating * 10) / 10,
        totalReviews: mockReviews.length
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Get partner reviews error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get partner dashboard statistics
export async function getPartnerDashboardStats(request, env) {
  try {
    const url = new URL(request.url);
    let providerId = url.searchParams.get('providerId');

    // Auth + IDOR fix: a partner may only read their OWN stats. Non-admins are
    // forced to the id in their token regardless of ?providerId= (which used to
    // be trusted verbatim, so anyone could read any provider's numbers). Admins
    // may look up any provider.
    const authUser = await verifyToken(request, env);
    if (!authUser) {
      return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'Authorization required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }
    if (authUser.role !== 'admin') {
      providerId = authUser.id;
    }
    if (!providerId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Provider ID is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Current and previous month keys (YYYY-MM) for the month-over-month deltas.
    const currentDate = new Date();
    const currentMonth = currentDate.toISOString().slice(0, 7);
    const previousDate = new Date(currentDate);
    previousDate.setMonth(previousDate.getMonth() - 1);
    const previousMonth = previousDate.toISOString().slice(0, 7);

    // Every standard-column read in ONE round-trip (was ~9 sequential calls).
    const b = await env.KUDDL_DB.batch([
      env.KUDDL_DB.prepare(`SELECT COUNT(*) as total FROM bookings WHERE provider_id = ?`).bind(providerId),
      env.KUDDL_DB.prepare(`SELECT COUNT(*) as total FROM bookings WHERE provider_id = ? AND status = 'completed'`).bind(providerId),
      env.KUDDL_DB.prepare(`SELECT COUNT(*) as total FROM bookings WHERE provider_id = ? AND status = 'pending'`).bind(providerId),
      env.KUDDL_DB.prepare(`SELECT COUNT(*) as total FROM bookings WHERE provider_id = ? AND booking_date LIKE ?`).bind(providerId, `${currentMonth}%`),
      env.KUDDL_DB.prepare(`SELECT COUNT(*) as total FROM bookings WHERE provider_id = ? AND booking_date LIKE ?`).bind(providerId, `${previousMonth}%`),
      env.KUDDL_DB.prepare(`SELECT COALESCE(SUM(total_amount), 0) as total FROM bookings WHERE provider_id = ? AND payment_status = 'paid' AND booking_date LIKE ?`).bind(providerId, `${currentMonth}%`),
      env.KUDDL_DB.prepare(`SELECT COALESCE(SUM(total_amount), 0) as total FROM bookings WHERE provider_id = ? AND payment_status = 'paid' AND booking_date LIKE ?`).bind(providerId, `${previousMonth}%`),
      env.KUDDL_DB.prepare(`SELECT COUNT(*) as total FROM bookings WHERE provider_id = ? AND status = 'completed' AND booking_date LIKE ?`).bind(providerId, `${currentMonth}%`),
      env.KUDDL_DB.prepare(`SELECT COUNT(*) as total FROM bookings WHERE provider_id = ? AND status = 'completed' AND booking_date LIKE ?`).bind(providerId, `${previousMonth}%`),
    ]);
    const totalBookingsResult = firstOf(b[0]);
    const completedBookingsResult = firstOf(b[1]);
    const pendingBookingsResult = firstOf(b[2]);
    const currentMonthBookingsResult = firstOf(b[3]);
    const previousMonthBookingsResult = firstOf(b[4]);
    const currentMonthRevenueResult = firstOf(b[5]);
    const previousMonthRevenueResult = firstOf(b[6]);
    const currentMonthCompletedResult = firstOf(b[7]);
    const previousMonthCompletedResult = firstOf(b[8]);

    // Total revenue: prefer provider_amount, fall back if that column is absent.
    let revenueResult;
    try {
      revenueResult = await env.KUDDL_DB.prepare(`
        SELECT COALESCE(SUM(provider_amount), 0) as total FROM bookings
        WHERE provider_id = ? AND payment_status = 'paid'
      `).bind(providerId).first();
    } catch (error) {
      if (String(error.message).includes('no such column: provider_amount')) {
        revenueResult = await env.KUDDL_DB.prepare(`
          SELECT COALESCE(SUM(total_amount * 0.95), 0) as total FROM bookings
          WHERE provider_id = ? AND payment_status = 'paid'
        `).bind(providerId).first();
      } else {
        throw error;
      }
    }

    // Get average rating from completed bookings with parent ratings (with fallback for missing column)
    let averageRating = 0;
    let totalRatings = 0;
    let currentMonthRating = 0;
    let previousMonthRating = 0;

    try {
      // Overall average rating
      const ratingsResult = await env.KUDDL_DB.prepare(`
        SELECT AVG(parent_rating) as avg_rating, COUNT(*) as rating_count
        FROM bookings 
        WHERE provider_id = ? AND status = 'completed' AND parent_rating IS NOT NULL
      `).bind(providerId).first();

      averageRating = ratingsResult?.avg_rating ?
        Math.round(ratingsResult.avg_rating * 10) / 10 : 0;
      totalRatings = ratingsResult?.rating_count || 0;

      // Current month rating
      const currentMonthRatingResult = await env.KUDDL_DB.prepare(`
        SELECT AVG(parent_rating) as avg_rating
        FROM bookings 
        WHERE provider_id = ? AND status = 'completed' AND parent_rating IS NOT NULL 
        AND booking_date LIKE ?
      `).bind(providerId, `${currentMonth}%`).first();

      currentMonthRating = currentMonthRatingResult?.avg_rating ?
        Math.round(currentMonthRatingResult.avg_rating * 10) / 10 : 0;

      // Previous month rating
      const previousMonthRatingResult = await env.KUDDL_DB.prepare(`
        SELECT AVG(parent_rating) as avg_rating
        FROM bookings 
        WHERE provider_id = ? AND status = 'completed' AND parent_rating IS NOT NULL 
        AND booking_date LIKE ?
      `).bind(providerId, `${previousMonth}%`).first();

      previousMonthRating = previousMonthRatingResult?.avg_rating ?
        Math.round(previousMonthRatingResult.avg_rating * 10) / 10 : 0;

    } catch (ratingError) {
      console.log('⚠️ parent_rating column not found, using fallback rating calculation');
      // Fallback: return 0 rating if parent_rating column doesn't exist
      averageRating = 0;
      totalRatings = 0;
      currentMonthRating = 0;
      previousMonthRating = 0;
    }

    // Get recent bookings
    const recentBookings = await env.KUDDL_DB.prepare(`
      SELECT 
        b.*,
        s.name as service_name
      FROM bookings b
      LEFT JOIN services s ON b.service_id = s.id
      WHERE b.provider_id = ?
      ORDER BY b.created_at DESC
      LIMIT 5
    `).bind(providerId).all();

    // Process recent bookings to extract customer details
    const processedRecentBookings = (recentBookings.results || []).map(booking => {
      let customerDetails = {};
      try {
        customerDetails = JSON.parse(booking.special_requests || '{}');
      } catch (e) {
        customerDetails = { name: 'Unknown', phone: 'N/A' };
      }

      return {
        id: booking.id,
        service_name: booking.service_name,
        customer_name: customerDetails.name || 'Unknown',
        booking_date: booking.booking_date,
        start_time: booking.start_time,
        status: booking.status,
        total_amount: booking.total_amount,
        created_at: booking.created_at
      };
    });

    // Helper function to calculate percentage change
    const calculatePercentageChange = (current, previous) => {
      if (previous === 0) {
        return current > 0 ? 100 : 0; // 100% increase if previous was 0 and current > 0
      }
      return Math.round(((current - previous) / previous) * 100);
    };

    // Calculate current and previous month values
    const currentMonthBookings = currentMonthBookingsResult?.total || 0;
    const previousMonthBookings = previousMonthBookingsResult?.total || 0;
    const currentMonthRevenue = currentMonthRevenueResult?.total || 0;
    const previousMonthRevenue = previousMonthRevenueResult?.total || 0;
    const currentMonthCompleted = currentMonthCompletedResult?.total || 0;
    const previousMonthCompleted = previousMonthCompletedResult?.total || 0;

    // Calculate completion rates
    const currentCompletionRate = currentMonthBookings > 0
      ? Math.round((currentMonthCompleted / currentMonthBookings) * 100)
      : 0;
    const previousCompletionRate = previousMonthBookings > 0
      ? Math.round((previousMonthCompleted / previousMonthBookings) * 100)
      : 0;

    // Calculate percentage changes
    const bookingsChange = calculatePercentageChange(currentMonthBookings, previousMonthBookings);
    const revenueChange = calculatePercentageChange(currentMonthRevenue, previousMonthRevenue);
    const ratingChange = calculatePercentageChange(currentMonthRating, previousMonthRating);
    const completionRateChange = calculatePercentageChange(currentCompletionRate, previousCompletionRate);

    const stats = {
      totalBookings: totalBookingsResult?.total || 0,
      completedBookings: completedBookingsResult?.total || 0,
      pendingBookings: pendingBookingsResult?.total || 0,
      totalRevenue: revenueResult?.total || 0,
      monthlyBookings: currentMonthBookings,
      averageRating: averageRating,
      completionRate: currentCompletionRate,
      recentBookings: processedRecentBookings,
      // Dynamic percentage changes
      monthOverMonth: {
        bookingsChange: bookingsChange,
        revenueChange: revenueChange,
        ratingChange: ratingChange,
        completionRateChange: completionRateChange,
        bookingsDirection: bookingsChange >= 0 ? 'up' : 'down',
        revenueDirection: revenueChange >= 0 ? 'up' : 'down',
        ratingDirection: ratingChange >= 0 ? 'up' : 'down',
        completionRateDirection: completionRateChange >= 0 ? 'up' : 'down'
      }
    };

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: stats
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Get partner dashboard stats error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get admin dashboard statistics
export async function getAdminDashboardStats(request, env) {
  try {
    // Admin-only. (This endpoint exposes platform-wide totals; it previously ran
    // without any auth check.)
    const user = await verifyToken(request, env);
    if (!user) {
      return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'Authorization required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }
    if (user.role !== 'admin') {
      return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'Admin access required' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }));
    }

    // All independent reads in a SINGLE round-trip to D1 instead of 9 sequential
    // ones — this is what took the dashboard from ~1.2s to a few hundred ms.
    const [
      totalPartnersResult, totalCustomersResult, totalBookingsResult,
      completedBookingsResult, pendingBookingsResult, revenueResult,
      pendingVerificationsResult, rejectedDocumentsResult, recentActivitiesRes,
    ] = await env.KUDDL_DB.batch([
      env.KUDDL_DB.prepare(`SELECT COUNT(*) as total FROM providers WHERE is_active = 1`),
      env.KUDDL_DB.prepare(`SELECT COUNT(*) as total FROM parents`),
      env.KUDDL_DB.prepare(`SELECT COUNT(*) as total FROM bookings`),
      env.KUDDL_DB.prepare(`SELECT COUNT(*) as total FROM bookings WHERE status = 'completed'`),
      env.KUDDL_DB.prepare(`SELECT COUNT(*) as total FROM bookings WHERE status = 'pending'`),
      env.KUDDL_DB.prepare(`SELECT COALESCE(SUM(total_amount), 0) as total FROM bookings WHERE payment_status = 'paid'`),
      env.KUDDL_DB.prepare(`SELECT COUNT(*) as total FROM providers WHERE kyc_status = 'pending'`),
      env.KUDDL_DB.prepare(`SELECT COUNT(*) as total FROM document_verifications WHERE verification_status = 'rejected'`),
      env.KUDDL_DB.prepare(`
        SELECT b.*, s.name as service_name, p.business_name as provider_name
        FROM bookings b
        LEFT JOIN services s ON b.service_id = s.id
        LEFT JOIN providers p ON b.provider_id = p.id
        ORDER BY b.created_at DESC
        LIMIT 10
      `),
    ]);
    const recentActivities = { results: rowsOf(recentActivitiesRes) };

    // Process recent activities
    const processedActivities = (recentActivities.results || []).map(booking => {
      let customerDetails = {};
      try {
        customerDetails = JSON.parse(booking.special_requests || '{}');
      } catch (e) {
        customerDetails = { name: 'Unknown' };
      }

      return {
        description: `New booking for ${booking.service_name} by ${customerDetails.name || 'Unknown'}`,
        timestamp: booking.created_at,
        type: 'booking',
        status: booking.status
      };
    });

    const totalPartners = firstOf(totalPartnersResult).total || 0;
    const totalCustomers = firstOf(totalCustomersResult).total || 0;
    const stats = {
      totalUsers: totalPartners + totalCustomers,
      totalPartners,
      totalCustomers,
      activeUsers: totalPartners, // Assuming active partners as active users
      totalBookings: firstOf(totalBookingsResult).total || 0,
      completedBookings: firstOf(completedBookingsResult).total || 0,
      pendingBookings: firstOf(pendingBookingsResult).total || 0,
      totalRevenue: firstOf(revenueResult).total || 0,
      pendingVerifications: firstOf(pendingVerificationsResult).total || 0,
      rejectedDocuments: firstOf(rejectedDocumentsResult).total || 0,
      recentActivities: processedActivities
    };

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: stats
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Get admin dashboard stats error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get partner calendar bookings
export async function getPartnerCalendarBookings(request, env) {
  try {
    const url = new URL(request.url);
    let providerId = url.searchParams.get('providerId');

    if (!providerId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Provider ID is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Get all bookings for this provider (not just recent ones)
    const bookings = await env.KUDDL_DB.prepare(`
      SELECT 
        b.*,
        s.name as service_name,
        COALESCE(p.full_name, p.name, '') as parent_name,
        p.phone as parent_phone
      FROM bookings b
      LEFT JOIN services s ON b.service_id = s.id
      LEFT JOIN parents p ON b.parent_id = p.id
      WHERE b.provider_id = ?
      AND b.status IN ('confirmed', 'pending', 'in_progress', 'completed')
      ORDER BY b.booking_date ASC, b.start_time ASC
    `).bind(providerId).all();

    // Process bookings for calendar display
    const calendarBookings = (bookings.results || []).map(booking => {
      // Extract customer details from special_requests if parent data is not available
      let customerDetails = {};
      try {
        customerDetails = JSON.parse(booking.special_requests || '{}');
      } catch (e) {
        customerDetails = {};
      }

      return {
        id: booking.id,
        service_name: booking.service_name || 'Service',
        customer_name: booking.parent_name || customerDetails.name || 'Unknown Customer',
        customer_phone: booking.parent_phone || customerDetails.phone || 'N/A',
        booking_date: booking.booking_date,
        start_time: booking.start_time || '09:00',
        end_time: booking.end_time || '11:00',
        status: booking.status,
        total_amount: booking.total_amount,
        payment_status: booking.payment_status,
        special_requests: booking.special_requests,
        created_at: booking.created_at,
        updated_at: booking.updated_at
      };
    });

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: {
        bookings: calendarBookings,
        total: calendarBookings.length
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Get partner calendar bookings error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}
