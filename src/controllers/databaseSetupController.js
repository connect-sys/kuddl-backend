/**
 * Database Setup Controller
 * Direct database table creation and testing
 */

import { addCorsHeaders } from '../utils/cors.js';
import { generateId } from '../utils/helpers.js';

// Create parents and children tables directly
export async function setupParentsTables(request, env) {
  try {
    console.log('🔄 Setting up parents and children tables...');

    // Create parents table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS parents (
        id TEXT PRIMARY KEY,
        phone TEXT UNIQUE NOT NULL,
        email TEXT,
        full_name TEXT NOT NULL,
        address TEXT,
        city TEXT,
        state TEXT,
        pincode TEXT,
        alternate_contact_name TEXT,
        alternate_contact_phone TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    console.log('✅ Created parents table');

    // Create children table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS children (
        id TEXT PRIMARY KEY,
        parent_id TEXT NOT NULL,
        name TEXT NOT NULL,
        date_of_birth TEXT,
        age INTEGER,
        gender TEXT,
        medical_conditions TEXT,
        bedtime TEXT,
        special_needs TEXT,
        allergies TEXT,
        dietary_restrictions TEXT,
        preferences TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    console.log('✅ Created children table');

    // Check if bookings table has parent_id column, if not add it
    try {
      const tableInfo = await env.KUDDL_DB.prepare(`
        PRAGMA table_info(bookings)
      `).all();
      
      const hasParentId = tableInfo.results?.some(col => col.name === 'parent_id');
      
      if (!hasParentId) {
        await env.KUDDL_DB.prepare(`
          ALTER TABLE bookings ADD COLUMN parent_id TEXT
        `).run();
        console.log('✅ Added parent_id column to bookings table');
      } else {
        console.log('ℹ️ parent_id column already exists in bookings table');
      }
    } catch (alterError) {
      console.log('⚠️ Could not modify bookings table:', alterError.message);
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Successfully created parents and children tables'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Database setup error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to setup database tables',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Add dummy parent record
export async function addDummyParent(request, env) {
  try {
    console.log('🔄 Adding dummy parent record...');

    const parentId = generateId();
    const dummyPhone = '+919876543210';
    
    // Check if dummy parent already exists
    const existingParent = await env.KUDDL_DB.prepare(
      'SELECT id FROM parents WHERE phone = ?'
    ).bind(dummyPhone).first();

    if (existingParent) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: true,
        message: 'Dummy parent already exists',
        parentId: existingParent.id,
        phone: dummyPhone
      }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Insert dummy parent
    await env.KUDDL_DB.prepare(`
      INSERT INTO parents (
        id, phone, email, full_name, address, city, state, pincode,
        alternate_contact_name, alternate_contact_phone, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      parentId,
      dummyPhone,
      'dummy.parent@example.com',
      'Dummy Parent User',
      '123 Test Street, Test Area',
      'Test City',
      'Test State',
      '123456',
      'Emergency Contact',
      '+919876543211',
      new Date().toISOString(),
      new Date().toISOString()
    ).run();

    console.log('✅ Created dummy parent:', parentId);

    // Add a dummy child for this parent
    const childId = generateId();
    await env.KUDDL_DB.prepare(`
      INSERT INTO children (
        id, parent_id, name, age, gender, medical_conditions,
        bedtime, special_needs, allergies, dietary_restrictions,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      childId,
      parentId,
      'Test Child',
      5,
      'other',
      'None',
      '8:00 PM',
      'None',
      'None',
      'Vegetarian',
      new Date().toISOString(),
      new Date().toISOString()
    ).run();

    console.log('✅ Created dummy child:', childId);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Successfully created dummy parent and child',
      data: {
        parentId,
        childId,
        phone: dummyPhone,
        parentName: 'Dummy Parent User',
        childName: 'Test Child'
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Add dummy parent error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to add dummy parent',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// List all parents (for testing)
export async function listParents(request, env) {
  try {
    const parents = await env.KUDDL_DB.prepare(`
      SELECT p.*, 
             COUNT(c.id) as children_count
      FROM parents p
      LEFT JOIN children c ON p.id = c.parent_id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `).all();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: parents.results || []
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ List parents error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to list parents',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}
