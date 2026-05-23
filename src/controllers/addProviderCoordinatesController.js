/**
 * Add latitude and longitude columns to providers table
 */

import { addCorsHeaders } from '../utils/cors.js';

export async function addProviderCoordinates(request, env) {
  try {
    console.log('🔧 Adding latitude and longitude columns to providers table...');

    // Add latitude column
    try {
      await env.KUDDL_DB.prepare(`
        ALTER TABLE providers ADD COLUMN latitude REAL
      `).run();
      console.log('✅ Added latitude column');
    } catch (error) {
      if (error.message && error.message.includes('duplicate column name')) {
        console.log('⚠️  latitude column already exists');
      } else {
        throw error;
      }
    }

    // Add longitude column
    try {
      await env.KUDDL_DB.prepare(`
        ALTER TABLE providers ADD COLUMN longitude REAL
      `).run();
      console.log('✅ Added longitude column');
    } catch (error) {
      if (error.message && error.message.includes('duplicate column name')) {
        console.log('⚠️  longitude column already exists');
      } else {
        throw error;
      }
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Provider coordinates columns added successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Error adding provider coordinates:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to add provider coordinates columns',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}
