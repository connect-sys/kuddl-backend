/**
 * Users Table Migration
 * Fixes the missing role column in users table
 */

import { addCorsHeaders } from '../utils/cors.js';

export async function addUsersRoleColumn(request, env) {
  try {
    console.log('🔧 Running migration: Add role column to users table');
    
    // Check if users table exists
    const tableCheck = await env.KUDDL_DB.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='users'
    `).first();
    
    if (!tableCheck) {
      console.log('❌ Users table does not exist, creating it...');
      
      // Create users table with all required columns
      await env.KUDDL_DB.prepare(`
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE,
          phone TEXT UNIQUE,
          password_hash TEXT,
          first_name TEXT,
          last_name TEXT,
          role TEXT CHECK (role IN ('customer', 'admin')) DEFAULT 'customer',
          status TEXT CHECK (status IN ('active', 'inactive', 'suspended')) DEFAULT 'active',
          email_verified INTEGER DEFAULT 0,
          phone_verified INTEGER DEFAULT 0,
          profile_image_url TEXT,
          date_of_birth TEXT,
          gender TEXT,
          address TEXT,
          city TEXT,
          state TEXT,
          pincode TEXT,
          is_active INTEGER DEFAULT 1,
          last_login_at TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      
      console.log('✅ Created users table with role column');
      
      return addCorsHeaders(new Response(JSON.stringify({
        success: true,
        message: 'Successfully created users table with role column'
      }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    
    // Check if role column already exists
    const columnCheck = await env.KUDDL_DB.prepare(`
      PRAGMA table_info(users)
    `).all();
    
    const hasRole = columnCheck.results?.some(col => col.name === 'role');
    
    if (hasRole) {
      console.log('✅ role column already exists in users table');
      return addCorsHeaders(new Response(JSON.stringify({
        success: true,
        message: 'role column already exists in users table'
      }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    
    // Add the role column
    await env.KUDDL_DB.prepare(`
      ALTER TABLE users ADD COLUMN role TEXT CHECK (role IN ('customer', 'admin')) DEFAULT 'customer'
    `).run();
    
    // Add is_active column if it doesn't exist
    const hasIsActive = columnCheck.results?.some(col => col.name === 'is_active');
    if (!hasIsActive) {
      await env.KUDDL_DB.prepare(`
        ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1
      `).run();
      console.log('✅ Added is_active column to users table');
    }
    
    console.log('✅ Added role column to users table');
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Successfully added role column to users table'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Migration failed',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}
