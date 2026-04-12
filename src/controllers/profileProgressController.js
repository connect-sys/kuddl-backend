/**
 * Profile Progress Controller
 * Handles saving and retrieving partial profile completion progress
 */

import { addCorsHeaders } from '../utils/cors.js';

/**
 * Save profile progress
 * POST /api/partner/save-profile-progress
 */
export async function saveProfileProgress(request, env) {
  try {
    const { phone, lastCompletedStep, formData, timestamp } = await request.json();

    if (!phone) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Phone number is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Check if progress record exists
    const existingProgress = await env.KUDDL_DB.prepare(
      'SELECT id FROM profile_progress WHERE phone = ?'
    ).bind(phone).first();

    const progressData = JSON.stringify({
      lastCompletedStep,
      formData,
      timestamp
    });

    if (existingProgress) {
      // Update existing progress
      await env.KUDDL_DB.prepare(
        `UPDATE profile_progress 
         SET progress_data = ?, 
             last_completed_step = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE phone = ?`
      ).bind(progressData, lastCompletedStep, phone).run();
    } else {
      // Insert new progress record
      await env.KUDDL_DB.prepare(
        `INSERT INTO profile_progress (phone, progress_data, last_completed_step, created_at, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      ).bind(phone, progressData, lastCompletedStep).run();
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Progress saved successfully',
      data: {
        phone,
        lastCompletedStep
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Save profile progress error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to save progress',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

/**
 * Get profile progress
 * GET /api/partner/get-profile-progress?phone={phone}
 */
export async function getProfileProgress(request, env) {
  try {
    const url = new URL(request.url);
    const phone = url.searchParams.get('phone');

    if (!phone) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Phone number is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const progress = await env.KUDDL_DB.prepare(
      'SELECT progress_data, last_completed_step, updated_at FROM profile_progress WHERE phone = ?'
    ).bind(phone).first();

    if (!progress) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: true,
        message: 'No saved progress found',
        data: null
      }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Parse the stored JSON data
    const progressData = JSON.parse(progress.progress_data);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Progress retrieved successfully',
      data: {
        lastCompletedStep: progress.last_completed_step,
        formData: progressData.formData,
        timestamp: progressData.timestamp,
        updatedAt: progress.updated_at
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Get profile progress error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to retrieve progress',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

/**
 * Clear profile progress (after successful completion)
 * DELETE /api/partner/clear-profile-progress
 */
export async function clearProfileProgress(request, env) {
  try {
    const { phone } = await request.json();

    if (!phone) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Phone number is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    await env.KUDDL_DB.prepare(
      'DELETE FROM profile_progress WHERE phone = ?'
    ).bind(phone).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Progress cleared successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Clear profile progress error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to clear progress',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}
