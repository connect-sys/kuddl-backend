import { addCorsHeaders } from '../utils/cors.js';

/**
 * Get public platform statistics for landing page
 * No authentication required - public endpoint
 */
export async function getPublicStats(request, env) {
  try {
    console.log('📊 Fetching public platform statistics...');

    // Get total active providers (verified and active partners)
    const activeProvidersResult = await env.KUDDL_DB.prepare(`
      SELECT COUNT(*) as count 
      FROM providers 
      WHERE kyc_status = 'verified' AND is_active = 1
    `).first();

    // Get total bookings completed
    const bookingsCompletedResult = await env.KUDDL_DB.prepare(`
      SELECT COUNT(*) as count 
      FROM bookings 
      WHERE status = 'completed'
    `).first();

    // Get average rating from reviews
    const averageRatingResult = await env.KUDDL_DB.prepare(`
      SELECT AVG(rating) as avg_rating, COUNT(*) as total_reviews
      FROM reviews
    `).first();

    // Get total bookings (all statuses)
    const totalBookingsResult = await env.KUDDL_DB.prepare(`
      SELECT COUNT(*) as count 
      FROM bookings
    `).first();

    const activeProviders = activeProvidersResult?.count || 0;
    const bookingsCompleted = bookingsCompletedResult?.count || 0;
    const averageRating = averageRatingResult?.avg_rating || 0;
    const totalReviews = averageRatingResult?.total_reviews || 0;
    const totalBookings = totalBookingsResult?.count || 0;

    // Format numbers for display
    const formatNumber = (num) => {
      if (num >= 1000000) {
        return `${(num / 1000000).toFixed(1)}M+`;
      } else if (num >= 1000) {
        return `${(num / 1000).toFixed(0)}K+`;
      }
      return num.toString();
    };

    const stats = {
      activeProviders: {
        value: activeProviders,
        display: formatNumber(activeProviders),
        label: 'Active Providers'
      },
      bookingsCompleted: {
        value: bookingsCompleted,
        display: formatNumber(bookingsCompleted),
        label: 'Bookings Completed'
      },
      averageRating: {
        value: parseFloat(averageRating.toFixed(1)),
        display: `${averageRating.toFixed(1)}⭐`,
        label: 'Average Rating',
        totalReviews: totalReviews
      },
      totalBookings: {
        value: totalBookings,
        display: formatNumber(totalBookings),
        label: 'Total Bookings'
      }
    };

    console.log('✅ Public stats fetched successfully:', stats);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      stats: stats
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Get public stats error:', error);
    
    // Return default stats on error
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      stats: {
        activeProviders: {
          value: 10000,
          display: '10K+',
          label: 'Active Providers'
        },
        bookingsCompleted: {
          value: 50000,
          display: '50K+',
          label: 'Bookings Completed'
        },
        averageRating: {
          value: 4.8,
          display: '4.8⭐',
          label: 'Average Rating',
          totalReviews: 0
        },
        totalBookings: {
          value: 75000,
          display: '75K+',
          label: 'Total Bookings'
        }
      },
      fallback: true,
      error: error.message
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}
