import { addCorsHeaders } from '../utils/cors.js';

// Get reviews for a specific partner/provider
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

    console.log('🔍 Fetching reviews for provider:', providerId);

    // First check if rating columns exist
    let reviewsQuery;
    try {
      // Try to get reviews with rating columns
      reviewsQuery = await env.KUDDL_DB.prepare(`
        SELECT 
          b.id,
          b.parent_rating as rating,
          b.parent_feedback as comment,
          b.provider_response as response,
          b.booking_date,
          b.created_at,
          b.updated_at,
          s.name as service_name,
          b.special_requests
        FROM bookings b
        LEFT JOIN services s ON b.service_id = s.id
        WHERE b.provider_id = ? 
          AND b.parent_rating IS NOT NULL
          AND b.parent_rating > 0
        ORDER BY b.updated_at DESC
      `).bind(providerId).all();
    } catch (error) {
      console.log('Rating columns may not exist yet, returning empty reviews');
      reviewsQuery = { results: [] };
    }

    console.log('📊 Raw reviews query result:', reviewsQuery);

    const reviews = (reviewsQuery.results || []).map(booking => {
      // Parse customer details from special_requests
      let customerDetails = {};
      try {
        customerDetails = JSON.parse(booking.special_requests || '{}');
      } catch (e) {
        customerDetails = { name: 'Unknown Customer' };
      }

      // Handle both nested and flat customer data structures
      const parentInfo = customerDetails.parentDetails || customerDetails;
      const customerName = parentInfo.fullName || parentInfo.name || 'Unknown Customer';

      return {
        id: booking.id,
        customer_name: customerName,
        service_name: booking.service_name || 'Service',
        rating: booking.rating || 0,
        comment: booking.comment || '',
        booking_date: booking.booking_date,
        created_at: booking.updated_at || booking.created_at,
        response: booking.response
      };
    });

    // Calculate statistics
    const totalReviews = reviews.length;
    const averageRating = totalReviews > 0 
      ? Math.round((reviews.reduce((sum, review) => sum + review.rating, 0) / totalReviews) * 10) / 10
      : 0;

    console.log('✅ Processed reviews:', {
      totalReviews,
      averageRating,
      reviewsCount: reviews.length
    });

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: {
        reviews,
        totalReviews,
        averageRating
      }
    }), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    }));

  } catch (error) {
    console.error('❌ Get partner reviews error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Error fetching reviews: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Add or update a reply to a review
export async function replyToReview(request, env) {
  try {
    const { reviewId, response } = await request.json();

    if (!reviewId || !response) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Review ID and response are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    console.log('💬 Adding reply to review:', reviewId);

    // Update the booking with provider response
    const updateResult = await env.KUDDL_DB.prepare(`
      UPDATE bookings 
      SET provider_response = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(response, reviewId).run();

    if (updateResult.changes === 0) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Review not found or unable to update'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    console.log('✅ Reply added successfully');

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Reply added successfully'
    }), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    }));

  } catch (error) {
    console.error('❌ Reply to review error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Error adding reply: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get review statistics for dashboard
export async function getReviewStats(request, env) {
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

    // Get rating distribution
    const distributionQuery = await env.KUDDL_DB.prepare(`
      SELECT 
        parent_rating as rating,
        COUNT(*) as count
      FROM bookings 
      WHERE provider_id = ? 
        AND status = 'completed' 
        AND parent_rating IS NOT NULL
        AND parent_rating > 0
      GROUP BY parent_rating
      ORDER BY parent_rating DESC
    `).bind(providerId).all();

    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    (distributionQuery.results || []).forEach(row => {
      distribution[row.rating] = row.count;
    });

    // Get response rate
    const responseRateQuery = await env.KUDDL_DB.prepare(`
      SELECT 
        COUNT(*) as total_reviews,
        SUM(CASE WHEN provider_response IS NOT NULL AND provider_response != '' THEN 1 ELSE 0 END) as responded_reviews
      FROM bookings 
      WHERE provider_id = ? 
        AND status = 'completed' 
        AND parent_rating IS NOT NULL
        AND parent_rating > 0
    `).bind(providerId).first();

    const totalReviews = responseRateQuery?.total_reviews || 0;
    const respondedReviews = responseRateQuery?.responded_reviews || 0;
    const responseRate = totalReviews > 0 ? Math.round((respondedReviews / totalReviews) * 100) : 0;

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: {
        distribution,
        responseRate,
        totalReviews,
        respondedReviews
      }
    }), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    }));

  } catch (error) {
    console.error('❌ Get review stats error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Error fetching review stats: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}
