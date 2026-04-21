import { addCorsHeaders } from '../utils/cors.js';

/**
 * Submit contact form
 * Public endpoint - no authentication required
 */
export const submitContactForm = async (request, env) => {
  try {
    console.log('📬 Submitting contact form...');
    
    const body = await request.json();
    const { name, email, phone, subject, message, category } = body;

    // Validate required fields
    if (!name || !email || !subject || !message || !category) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Missing required fields'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Insert contact submission into database
    const result = await env.KUDDL_DB.prepare(`
      INSERT INTO contact_submissions (
        name, email, phone, subject, message, category, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'new', datetime('now'))
    `).bind(
      name,
      email,
      phone || null,
      subject,
      message,
      category
    ).run();

    console.log('✅ Contact form submitted successfully:', result);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Contact form submitted successfully',
      data: {
        id: result.meta.last_row_id
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Submit contact form error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to submit contact form',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
};

/**
 * Get all contact submissions (Admin only)
 */
export const getContactSubmissions = async (request, env, authedUser) => {
  try {
    console.log('📋 Getting contact submissions...');

    // Check if user is admin
    if (!authedUser || authedUser.role !== 'admin') {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Unauthorized - Admin access required'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Get query parameters for filtering
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // Build query
    let query = 'SELECT * FROM contact_submissions';
    const params = [];

    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const submissions = await env.KUDDL_DB.prepare(query).bind(...params).all();

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM contact_submissions';
    if (status) {
      countQuery += ' WHERE status = ?';
    }
    const countResult = await env.KUDDL_DB.prepare(countQuery).bind(...(status ? [status] : [])).first();

    console.log(`✅ Retrieved ${submissions.results?.length || 0} contact submissions`);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: submissions.results || submissions,
      total: countResult?.total || 0,
      limit,
      offset
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Get contact submissions error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to get contact submissions',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
};

/**
 * Update contact submission status (Admin only)
 */
export const updateContactSubmissionStatus = async (request, env, authedUser) => {
  try {
    console.log('🔄 Updating contact submission status...');

    // Check if user is admin
    if (!authedUser || authedUser.role !== 'admin') {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Unauthorized - Admin access required'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const body = await request.json();
    const { id, status } = body;

    if (!id || !status) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Missing required fields: id and status'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Valid statuses
    const validStatuses = ['new', 'in_progress', 'resolved', 'closed'];
    if (!validStatuses.includes(status)) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Update status
    await env.KUDDL_DB.prepare(`
      UPDATE contact_submissions 
      SET status = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(status, id).run();

    console.log(`✅ Updated contact submission ${id} status to ${status}`);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Contact submission status updated successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Update contact submission status error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to update contact submission status',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
};
