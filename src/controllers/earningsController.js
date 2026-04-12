import { addCorsHeaders } from '../utils/cors.js';

// Get earnings data for a specific partner/provider
export async function getPartnerEarnings(request, env) {
  try {
    const url = new URL(request.url);
    const providerId = url.searchParams.get('providerId');
    const status = url.searchParams.get('status') || 'completed';
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    if (!providerId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Provider ID is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    console.log('💰 Fetching earnings for provider:', providerId, { status, startDate, endDate });

    // Build the WHERE clause
    let whereClause = 'WHERE b.provider_id = ? AND b.status = ?';
    let params = [providerId, status];

    // Add date filtering if provided
    if (startDate && endDate) {
      whereClause += ' AND b.booking_date BETWEEN ? AND ?';
      params.push(startDate, endDate);
    }

    // Get earnings from completed bookings (remove status filter for now to see all bookings)
    let actualWhereClause = 'WHERE b.provider_id = ?';
    let actualParams = [providerId];

    // Add date filtering if provided
    if (startDate && endDate) {
      actualWhereClause += ' AND b.booking_date BETWEEN ? AND ?';
      actualParams.push(startDate, endDate);
    }

    const earningsQuery = await env.KUDDL_DB.prepare(`
      SELECT 
        b.id,
        b.booking_date,
        b.start_time,
        b.end_time,
        b.total_amount,
        b.payment_status,
        b.status,
        b.created_at,
        b.updated_at,
        b.special_requests,
        s.name as service_name,
        s.price,
        s.price_type
      FROM bookings b
      LEFT JOIN services s ON b.service_id = s.id
      ${actualWhereClause}
      ORDER BY b.booking_date DESC, b.created_at DESC
    `).bind(...actualParams).all();

    console.log('📊 Raw earnings query result:', earningsQuery);

    // Process earnings data
    const earnings = (earningsQuery.results || []).map(booking => {
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

      // Calculate platform fee and provider amount
      const totalAmount = booking.total_amount || 0;
      const platformFeeRate = 0.10; // 10% platform fee
      const platformFee = Math.round(totalAmount * platformFeeRate);
      const providerAmount = totalAmount - platformFee;

      return {
        id: booking.id,
        customer_name: customerName,
        booking_id: booking.id,
        service_name: booking.service_name || 'Service',
        booking_date: booking.booking_date,
        completed_at: booking.updated_at || booking.created_at,
        total_amount: totalAmount,
        provider_amount: providerAmount,
        platform_fee: platformFee,
        payment_status: booking.status === 'confirmed' ? 'paid' : (booking.payment_status || 'pending'),
        payment_method: 'Online',
        booking_status: booking.status
      };
    });

    // Calculate totals and statistics
    const calculateTotals = (earningsData, statusFilter = null) => {
      const filtered = statusFilter 
        ? earningsData.filter(e => e.payment_status === statusFilter)
        : earningsData;
      
      return {
        count: filtered.length,
        grossAmount: filtered.reduce((sum, e) => sum + e.total_amount, 0),
        netAmount: filtered.reduce((sum, e) => sum + e.provider_amount, 0),
        platformFees: filtered.reduce((sum, e) => sum + e.platform_fee, 0)
      };
    };

    const totals = {
      all: calculateTotals(earnings),
      paid: calculateTotals(earnings, 'paid'),
      pending: calculateTotals(earnings, 'pending'),
      failed: calculateTotals(earnings, 'failed')
    };

    console.log('✅ Processed earnings:', {
      totalEarnings: earnings.length,
      totals
    });

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: {
        earnings,
        totals
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
    console.error('❌ Get partner earnings error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Error fetching earnings: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get earnings summary/dashboard stats
export async function getEarningsSummary(request, env) {
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

    console.log('📈 Fetching earnings summary for provider:', providerId);

    // Get current month and previous month for comparison
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1);
    const previousMonth = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;

    // Get monthly earnings comparison
    const monthlyEarningsQuery = await env.KUDDL_DB.prepare(`
      SELECT 
        strftime('%Y-%m', booking_date) as month,
        COUNT(*) as booking_count,
        SUM(total_amount) as gross_amount,
        SUM(total_amount * 0.9) as net_amount,
        AVG(total_amount) as avg_booking_value
      FROM bookings 
      WHERE provider_id = ? 
        AND status = 'completed' 
        AND payment_status = 'paid'
        AND (strftime('%Y-%m', booking_date) = ? OR strftime('%Y-%m', booking_date) = ?)
      GROUP BY strftime('%Y-%m', booking_date)
      ORDER BY month DESC
    `).bind(providerId, currentMonth, previousMonth).all();

    // Get top services by earnings
    const topServicesQuery = await env.KUDDL_DB.prepare(`
      SELECT 
        s.name as service_name,
        COUNT(*) as booking_count,
        SUM(b.total_amount) as total_earnings,
        AVG(b.total_amount) as avg_price
      FROM bookings b
      LEFT JOIN services s ON b.service_id = s.id
      WHERE b.provider_id = ? 
        AND b.status = 'completed' 
        AND b.payment_status = 'paid'
      GROUP BY b.service_id, s.name
      ORDER BY total_earnings DESC
      LIMIT 5
    `).bind(providerId).all();

    // Get recent high-value bookings
    const recentHighValueQuery = await env.KUDDL_DB.prepare(`
      SELECT 
        b.id,
        b.total_amount,
        b.booking_date,
        b.special_requests,
        s.name as service_name
      FROM bookings b
      LEFT JOIN services s ON b.service_id = s.id
      WHERE b.provider_id = ? 
        AND b.status = 'completed' 
        AND b.payment_status = 'paid'
        AND b.total_amount > 500
      ORDER BY b.total_amount DESC, b.booking_date DESC
      LIMIT 10
    `).bind(providerId).all();

    // Process the results
    const monthlyData = (monthlyEarningsQuery.results || []).reduce((acc, row) => {
      acc[row.month] = {
        bookingCount: row.booking_count,
        grossAmount: row.gross_amount,
        netAmount: row.net_amount,
        avgBookingValue: row.avg_booking_value
      };
      return acc;
    }, {});

    const currentMonthData = monthlyData[currentMonth] || { bookingCount: 0, grossAmount: 0, netAmount: 0, avgBookingValue: 0 };
    const previousMonthData = monthlyData[previousMonth] || { bookingCount: 0, grossAmount: 0, netAmount: 0, avgBookingValue: 0 };

    // Calculate growth percentages
    const calculateGrowth = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    const topServices = (topServicesQuery.results || []).map(service => ({
      serviceName: service.service_name,
      bookingCount: service.booking_count,
      totalEarnings: service.total_earnings,
      avgPrice: service.avg_price
    }));

    const recentHighValue = (recentHighValueQuery.results || []).map(booking => {
      let customerDetails = {};
      try {
        customerDetails = JSON.parse(booking.special_requests || '{}');
      } catch (e) {
        customerDetails = { name: 'Unknown Customer' };
      }
      const parentInfo = customerDetails.parentDetails || customerDetails;
      
      return {
        id: booking.id,
        customerName: parentInfo.fullName || parentInfo.name || 'Unknown Customer',
        serviceName: booking.service_name,
        amount: booking.total_amount,
        date: booking.booking_date
      };
    });

    const summary = {
      currentMonth: currentMonthData,
      previousMonth: previousMonthData,
      growth: {
        bookings: calculateGrowth(currentMonthData.bookingCount, previousMonthData.bookingCount),
        earnings: calculateGrowth(currentMonthData.netAmount, previousMonthData.netAmount),
        avgValue: calculateGrowth(currentMonthData.avgBookingValue, previousMonthData.avgBookingValue)
      },
      topServices,
      recentHighValue
    };

    console.log('✅ Earnings summary processed:', summary);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: summary
    }), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    }));

  } catch (error) {
    console.error('❌ Get earnings summary error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Error fetching earnings summary: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}
