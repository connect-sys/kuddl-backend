import { addCorsHeaders } from '../utils/cors.js';

export async function addFirebaseUidColumn(request, env) {
  try {
    console.log('🔧 Adding firebase_uid column to providers table...');

    // Add firebase_uid column to providers table
    const alterResult = await env.KUDDL_DB.prepare(`
      ALTER TABLE providers ADD COLUMN firebase_uid TEXT
    `).run();

    if (!alterResult.success) {
      console.error('❌ Failed to add firebase_uid column:', alterResult.error);
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Failed to add firebase_uid column',
        error: alterResult.error
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    console.log('✅ Successfully added firebase_uid column to providers table');

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'firebase_uid column added successfully to providers table'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Error adding firebase_uid column:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: error.message || 'Error adding firebase_uid column'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

export async function checkProvidersSchema(request, env) {
  try {
    console.log('🔍 Checking providers table schema...');

    // Get table schema
    const schemaResult = await env.KUDDL_DB.prepare(`
      PRAGMA table_info(providers)
    `).all();

    console.log('📋 Providers table schema:', schemaResult.results);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      schema: schemaResult.results,
      hasFirebaseUid: schemaResult.results?.some(col => col.name === 'firebase_uid') || false
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Error checking providers schema:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: error.message || 'Error checking providers schema'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}
