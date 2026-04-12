/**
 * Customer Profile Controller
 * Handles all customer profile-related API endpoints
 */

import { addCorsHeaders } from '../utils/cors.js';
import { generateId } from '../utils/helpers.js';
import jwt from '@tsndr/cloudflare-worker-jwt';

// Helper function to get customer ID from token
async function getCustomerIdFromToken(request, env) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    
    const token = authHeader.substring(7);
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    
    if (!isValid) {
      return null;
    }
    
    const decoded = jwt.decode(token);
    return decoded?.payload?.id || null;
  } catch (error) {
    console.error('Error extracting customer ID from token:', error);
    return null;
  }
}

// ==================== DASHBOARD ====================

export async function getCustomerDashboard(request, env) {
  try {
    const customerId = await getCustomerIdFromToken(request, env);
    if (!customerId) {
      return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
        status: 401,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' })
      });
    }

    // Get dashboard stats
    const bookingsResult = await env.KUDDL_DB.prepare(
      'SELECT COUNT(*) as total, SUM(CASE WHEN status = "completed" THEN 1 ELSE 0 END) as completed FROM bookings WHERE parent_id = ?'
    ).bind(customerId).first();

    const reviewsResult = await env.KUDDL_DB.prepare(
      'SELECT COUNT(*) as total FROM customer_reviews WHERE customer_id = ?'
    ).bind(customerId).first();

    const favoritesResult = await env.KUDDL_DB.prepare(
      'SELECT COUNT(*) as total FROM customer_favorites WHERE customer_id = ?'
    ).bind(customerId).first();

    const transactionsResult = await env.KUDDL_DB.prepare(
      'SELECT SUM(amount) as total_spent FROM customer_transactions WHERE customer_id = ? AND transaction_type = "payment" AND payment_status = "completed"'
    ).bind(customerId).first();

    // Get recent bookings
    const recentBookings = await env.KUDDL_DB.prepare(
      `SELECT b.*, s.name as service_name, p.business_name as provider_name 
       FROM bookings b 
       LEFT JOIN services s ON b.service_id = s.id 
       LEFT JOIN providers p ON b.provider_id = p.id 
       WHERE b.parent_id = ? 
       ORDER BY b.created_at DESC 
       LIMIT 5`
    ).bind(customerId).all();

    // Get upcoming events
    const upcomingEvents = await env.KUDDL_DB.prepare(
      `SELECT e.*, er.is_bookmarked 
       FROM customer_events e 
       INNER JOIN customer_event_registrations er ON e.id = er.event_id 
       WHERE er.customer_id = ? AND e.event_date >= DATE('now') 
       ORDER BY e.event_date ASC 
       LIMIT 5`
    ).bind(customerId).all();

    return new Response(JSON.stringify({
      success: true,
      data: {
        stats: {
          totalBookings: bookingsResult?.total || 0,
          completedBookings: bookingsResult?.completed || 0,
          totalReviews: reviewsResult?.total || 0,
          totalFavorites: favoritesResult?.total || 0,
          totalSpent: transactionsResult?.total_spent || 0
        },
        recentBookings: recentBookings.results || [],
        upcomingEvents: upcomingEvents.results || []
      }
    }), {
      status: 200,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
  } catch (error) {
    console.error('Error fetching customer dashboard:', error);
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
  }
}

// ==================== BOOKINGS ====================

export async function getCustomerBookings(request, env) {
  try {
    const customerId = await getCustomerIdFromToken(request, env);
    if (!customerId) {
      return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
        status: 401,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' })
      });
    }

    const url = new URL(request.url);
    const status = url.searchParams.get('status') || 'all';
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const offset = (page - 1) * limit;

    let query = `
      SELECT b.*, 
             s.name as service_name, 
             s.price as service_price,
             p.business_name as provider_name,
             p.first_name as provider_first_name,
             p.last_name as provider_last_name,
             p.phone as provider_phone,
             p.city as provider_city
      FROM bookings b
      LEFT JOIN services s ON b.service_id = s.id
      LEFT JOIN providers p ON b.provider_id = p.id
      WHERE b.parent_id = ?
    `;

    const params = [customerId];

    if (status !== 'all') {
      query += ' AND b.status = ?';
      params.push(status);
    }

    query += ' ORDER BY b.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const bookings = await env.KUDDL_DB.prepare(query).bind(...params).all();

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM bookings WHERE parent_id = ?';
    const countParams = [customerId];
    if (status !== 'all') {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }
    const countResult = await env.KUDDL_DB.prepare(countQuery).bind(...countParams).first();

    return new Response(JSON.stringify({
      success: true,
      data: {
        bookings: bookings.results || [],
        pagination: {
          page,
          limit,
          total: countResult?.total || 0,
          totalPages: Math.ceil((countResult?.total || 0) / limit)
        }
      }
    }), {
      status: 200,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
  } catch (error) {
    console.error('Error fetching customer bookings:', error);
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
  }
}

// ==================== FAVORITES ====================

export async function getCustomerFavorites(request, env) {
  try {
    const customerId = await getCustomerIdFromToken(request, env);
    if (!customerId) {
      return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
        status: 401,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' })
      });
    }

    const favorites = await env.KUDDL_DB.prepare(`
      SELECT f.*, 
             s.name as service_name,
             s.description as service_description,
             s.price as service_price,
             s.primary_image_url,
             p.business_name as provider_name,
             p.city as provider_city,
             p.average_rating as provider_rating
      FROM customer_favorites f
      LEFT JOIN services s ON f.service_id = s.id
      LEFT JOIN providers p ON f.provider_id = p.id
      WHERE f.customer_id = ?
      ORDER BY f.created_at DESC
    `).bind(customerId).all();

    return new Response(JSON.stringify({
      success: true,
      data: favorites.results || []
    }), {
      status: 200,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
  } catch (error) {
    console.error('Error fetching favorites:', error);
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
  }
}

export async function addToFavorites(request, env) {
  try {
    const customerId = await getCustomerIdFromToken(request, env);
    if (!customerId) {
      return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
        status: 401,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' })
      });
    }

    const { serviceId, providerId } = await request.json();

    const favoriteId = generateId();
    await env.KUDDL_DB.prepare(
      'INSERT INTO customer_favorites (id, customer_id, service_id, provider_id) VALUES (?, ?, ?, ?)'
    ).bind(favoriteId, customerId, serviceId, providerId).run();

    return new Response(JSON.stringify({
      success: true,
      message: 'Added to favorites',
      data: { id: favoriteId }
    }), {
      status: 201,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
  } catch (error) {
    console.error('Error adding to favorites:', error);
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
  }
}

export async function removeFromFavorites(request, env, favoriteId) {
  try {
    const customerId = await getCustomerIdFromToken(request, env);
    if (!customerId) {
      return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
        status: 401,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' })
      });
    }

    await env.KUDDL_DB.prepare(
      'DELETE FROM customer_favorites WHERE id = ? AND customer_id = ?'
    ).bind(favoriteId, customerId).run();

    return new Response(JSON.stringify({
      success: true,
      message: 'Removed from favorites'
    }), {
      status: 200,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
  } catch (error) {
    console.error('Error removing from favorites:', error);
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
  }
}

// ==================== REVIEWS ====================

export async function getCustomerReviews(request, env) {
  try {
    const customerId = await getCustomerIdFromToken(request, env);
    if (!customerId) {
      return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
        status: 401,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' })
      });
    }

    const reviews = await env.KUDDL_DB.prepare(`
      SELECT r.*, 
             p.business_name as provider_name,
             p.first_name as provider_first_name,
             p.city as provider_city,
             b.service_name
      FROM customer_reviews r
      LEFT JOIN providers p ON r.provider_id = p.id
      LEFT JOIN bookings b ON r.booking_id = b.id
      WHERE r.customer_id = ?
      ORDER BY r.created_at DESC
    `).bind(customerId).all();

    return new Response(JSON.stringify({
      success: true,
      data: reviews.results || []
    }), {
      status: 200,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
  } catch (error) {
    console.error('Error fetching reviews:', error);
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
  }
}

export async function createReview(request, env) {
  try {
    const customerId = await getCustomerIdFromToken(request, env);
    if (!customerId) {
      return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
        status: 401,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' })
      });
    }

    const { providerId, bookingId, rating, reviewText } = await request.json();

    const reviewId = generateId();
    await env.KUDDL_DB.prepare(
      'INSERT INTO customer_reviews (id, customer_id, provider_id, booking_id, rating, review_text) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(reviewId, customerId, providerId, bookingId, rating, reviewText).run();

    // Update provider average rating
    const avgResult = await env.KUDDL_DB.prepare(
      'SELECT AVG(rating) as avg_rating FROM customer_reviews WHERE provider_id = ?'
    ).bind(providerId).first();

    if (avgResult) {
      await env.KUDDL_DB.prepare(
        'UPDATE providers SET average_rating = ? WHERE id = ?'
      ).bind(avgResult.avg_rating, providerId).run();
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Review submitted successfully',
      data: { id: reviewId }
    }), {
      status: 201,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
  } catch (error) {
    console.error('Error creating review:', error);
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
  }
}

// ==================== TRANSACTIONS/WALLET ====================

export async function getCustomerTransactions(request, env) {
  try {
    const customerId = await getCustomerIdFromToken(request, env);
    if (!customerId) {
      return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
        status: 401,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' })
      });
    }

    const url = new URL(request.url);
    const type = url.searchParams.get('type') || 'all';
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const offset = (page - 1) * limit;

    let query = `
      SELECT t.*, b.service_name
      FROM customer_transactions t
      LEFT JOIN bookings b ON t.booking_id = b.id
      WHERE t.customer_id = ?
    `;

    const params = [customerId];

    if (type !== 'all') {
      query += ' AND t.transaction_type = ?';
      params.push(type);
    }

    query += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const transactions = await env.KUDDL_DB.prepare(query).bind(...params).all();

    // Get wallet balance
    const balanceResult = await env.KUDDL_DB.prepare(`
      SELECT 
        SUM(CASE WHEN transaction_type IN ('credit', 'refund') THEN amount ELSE 0 END) -
        SUM(CASE WHEN transaction_type IN ('debit', 'payment') THEN amount ELSE 0 END) as balance
      FROM customer_transactions
      WHERE customer_id = ? AND payment_status = 'completed'
    `).bind(customerId).first();

    // Get stats
    const statsResult = await env.KUDDL_DB.prepare(`
      SELECT 
        SUM(CASE WHEN transaction_type = 'payment' AND payment_status = 'completed' THEN amount ELSE 0 END) as total_spent,
        COUNT(CASE WHEN transaction_type = 'payment' THEN 1 END) as total_payments
      FROM customer_transactions
      WHERE customer_id = ?
    `).bind(customerId).first();

    return new Response(JSON.stringify({
      success: true,
      data: {
        transactions: transactions.results || [],
        wallet: {
          balance: balanceResult?.balance || 0,
          totalSpent: statsResult?.total_spent || 0,
          totalPayments: statsResult?.total_payments || 0
        }
      }
    }), {
      status: 200,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
  }
}

// ==================== EVENTS ====================

export async function getCustomerEvents(request, env) {
  try {
    const customerId = await getCustomerIdFromToken(request, env);
    if (!customerId) {
      return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
        status: 401,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' })
      });
    }

    const url = new URL(request.url);
    const filter = url.searchParams.get('filter') || 'upcoming';

    let query = `
      SELECT e.*, er.is_bookmarked, er.registration_status
      FROM customer_events e
      LEFT JOIN customer_event_registrations er ON e.id = er.event_id AND er.customer_id = ?
    `;

    const params = [customerId];

    if (filter === 'upcoming') {
      query += ' WHERE e.event_date >= DATE("now")';
    } else if (filter === 'my_events') {
      query += ' WHERE er.customer_id = ?';
      params.push(customerId);
    }

    query += ' ORDER BY e.event_date ASC';

    const events = await env.KUDDL_DB.prepare(query).bind(...params).all();

    return new Response(JSON.stringify({
      success: true,
      data: events.results || []
    }), {
      status: 200,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
  }
}

export async function joinEvent(request, env, eventId) {
  try {
    const customerId = await getCustomerIdFromToken(request, env);
    if (!customerId) {
      return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
        status: 401,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' })
      });
    }

    const registrationId = generateId();
    await env.KUDDL_DB.prepare(
      'INSERT INTO customer_event_registrations (id, customer_id, event_id, registration_status) VALUES (?, ?, ?, ?)'
    ).bind(registrationId, customerId, eventId, 'registered').run();

    // Update attendees count
    await env.KUDDL_DB.prepare(
      'UPDATE customer_events SET attendees_count = attendees_count + 1 WHERE id = ?'
    ).bind(eventId).run();

    return new Response(JSON.stringify({
      success: true,
      message: 'Successfully joined event'
    }), {
      status: 200,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
  } catch (error) {
    console.error('Error joining event:', error);
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
  }
}

export async function toggleEventBookmark(request, env, eventId) {
  try {
    const customerId = await getCustomerIdFromToken(request, env);
    if (!customerId) {
      return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
        status: 401,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' })
      });
    }

    const existing = await env.KUDDL_DB.prepare(
      'SELECT is_bookmarked FROM customer_event_registrations WHERE customer_id = ? AND event_id = ?'
    ).bind(customerId, eventId).first();

    if (existing) {
      await env.KUDDL_DB.prepare(
        'UPDATE customer_event_registrations SET is_bookmarked = ? WHERE customer_id = ? AND event_id = ?'
      ).bind(!existing.is_bookmarked, customerId, eventId).run();
    } else {
      const registrationId = generateId();
      await env.KUDDL_DB.prepare(
        'INSERT INTO customer_event_registrations (id, customer_id, event_id, is_bookmarked) VALUES (?, ?, ?, ?)'
      ).bind(registrationId, customerId, eventId, true).run();
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Bookmark toggled'
    }), {
      status: 200,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
  } catch (error) {
    console.error('Error toggling bookmark:', error);
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
  }
}

// ==================== CONTACTS & MESSAGES ====================

export async function getCustomerContacts(request, env) {
  try {
    const customerId = await getCustomerIdFromToken(request, env);
    if (!customerId) {
      return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
        status: 401,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' })
      });
    }

    const contacts = await env.KUDDL_DB.prepare(`
      SELECT * FROM customer_contacts
      WHERE customer_id = ?
      ORDER BY last_message_time DESC
    `).bind(customerId).all();

    return new Response(JSON.stringify({
      success: true,
      data: contacts.results || []
    }), {
      status: 200,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
  }
}

export async function getContactMessages(request, env, contactId) {
  try {
    const customerId = await getCustomerIdFromToken(request, env);
    if (!customerId) {
      return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
        status: 401,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' })
      });
    }

    const messages = await env.KUDDL_DB.prepare(`
      SELECT * FROM customer_messages
      WHERE contact_id = ?
      ORDER BY created_at ASC
    `).bind(contactId).all();

    // Mark messages as read
    await env.KUDDL_DB.prepare(
      'UPDATE customer_messages SET is_read = 1 WHERE contact_id = ? AND receiver_id = ?'
    ).bind(contactId, customerId).run();

    await env.KUDDL_DB.prepare(
      'UPDATE customer_contacts SET unread_count = 0 WHERE id = ? AND customer_id = ?'
    ).bind(contactId, customerId).run();

    return new Response(JSON.stringify({
      success: true,
      data: messages.results || []
    }), {
      status: 200,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
  }
}

export async function sendMessage(request, env) {
  try {
    const customerId = await getCustomerIdFromToken(request, env);
    if (!customerId) {
      return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
        status: 401,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' })
      });
    }

    const { contactId, receiverId, messageText } = await request.json();

    const messageId = generateId();
    await env.KUDDL_DB.prepare(
      'INSERT INTO customer_messages (id, contact_id, sender_id, receiver_id, message_text) VALUES (?, ?, ?, ?, ?)'
    ).bind(messageId, contactId, customerId, receiverId, messageText).run();

    // Update contact last message
    await env.KUDDL_DB.prepare(
      'UPDATE customer_contacts SET last_message = ?, last_message_time = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(messageText, contactId).run();

    return new Response(JSON.stringify({
      success: true,
      message: 'Message sent',
      data: { id: messageId }
    }), {
      status: 201,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
  } catch (error) {
    console.error('Error sending message:', error);
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
  }
}

// ==================== CHILDREN/BABY PROFILES ====================

export async function getCustomerChildren(request, env) {
  try {
    const customerId = await getCustomerIdFromToken(request, env);
    if (!customerId) {
      return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
        status: 401,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' })
      });
    }

    const children = await env.KUDDL_DB.prepare(`
      SELECT * FROM customer_children
      WHERE customer_id = ?
      ORDER BY created_at DESC
    `).bind(customerId).all();

    return new Response(JSON.stringify({
      success: true,
      data: children.results || []
    }), {
      status: 200,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
  } catch (error) {
    console.error('Error fetching children:', error);
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
  }
}

export async function addChild(request, env) {
  try {
    const customerId = await getCustomerIdFromToken(request, env);
    if (!customerId) {
      return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
        status: 401,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' })
      });
    }

    const childData = await request.json();
    const childId = generateId();

    await env.KUDDL_DB.prepare(`
      INSERT INTO customer_children (
        id, customer_id, name, nickname, gender, date_of_birth, 
        profile_picture, present_address, permanent_address, 
        city, postal_code, country
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      childId, customerId, childData.name, childData.nickname, childData.gender,
      childData.dateOfBirth, childData.profilePicture, childData.presentAddress,
      childData.permanentAddress, childData.city, childData.postalCode, childData.country || 'INDIA'
    ).run();

    return new Response(JSON.stringify({
      success: true,
      message: 'Child profile added',
      data: { id: childId }
    }), {
      status: 201,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
  } catch (error) {
    console.error('Error adding child:', error);
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
  }
}

export async function updateChild(request, env, childId) {
  try {
    const customerId = await getCustomerIdFromToken(request, env);
    if (!customerId) {
      return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
        status: 401,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' })
      });
    }

    const childData = await request.json();

    await env.KUDDL_DB.prepare(`
      UPDATE customer_children SET
        name = ?, nickname = ?, gender = ?, date_of_birth = ?,
        profile_picture = ?, present_address = ?, permanent_address = ?,
        city = ?, postal_code = ?, country = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND customer_id = ?
    `).bind(
      childData.name, childData.nickname, childData.gender, childData.dateOfBirth,
      childData.profilePicture, childData.presentAddress, childData.permanentAddress,
      childData.city, childData.postalCode, childData.country || 'INDIA',
      childId, customerId
    ).run();

    return new Response(JSON.stringify({
      success: true,
      message: 'Child profile updated'
    }), {
      status: 200,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
  } catch (error) {
    console.error('Error updating child:', error);
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
  }
}
