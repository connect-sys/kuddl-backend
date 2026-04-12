/**
 * Users Table Complete Schema Fix
 * Adds all missing columns to users table
 */

import { addCorsHeaders } from '../utils/cors.js';

export async function fixUsersTableSchema(request, env) {
  try {
    console.log('🔧 Running migration: Fix users table schema - add all missing columns');
    
    // Check current table structure
    const columnCheck = await env.KUDDL_DB.prepare(`
      PRAGMA table_info(users)
    `).all();
    
    console.log('Current users table columns:', columnCheck.results?.map(col => col.name));
    
    // Define all required columns with their SQL
    const requiredColumns = [
      { name: 'email', sql: 'ALTER TABLE users ADD COLUMN email TEXT UNIQUE' },
      { name: 'phone', sql: 'ALTER TABLE users ADD COLUMN phone TEXT UNIQUE' },
      { name: 'password_hash', sql: 'ALTER TABLE users ADD COLUMN password_hash TEXT' },
      { name: 'first_name', sql: 'ALTER TABLE users ADD COLUMN first_name TEXT' },
      { name: 'last_name', sql: 'ALTER TABLE users ADD COLUMN last_name TEXT' },
      { name: 'role', sql: 'ALTER TABLE users ADD COLUMN role TEXT CHECK (role IN (\'customer\', \'admin\')) DEFAULT \'customer\'' },
      { name: 'status', sql: 'ALTER TABLE users ADD COLUMN status TEXT CHECK (status IN (\'active\', \'inactive\', \'suspended\')) DEFAULT \'active\'' },
      { name: 'email_verified', sql: 'ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0' },
      { name: 'phone_verified', sql: 'ALTER TABLE users ADD COLUMN phone_verified INTEGER DEFAULT 0' },
      { name: 'profile_image_url', sql: 'ALTER TABLE users ADD COLUMN profile_image_url TEXT' },
      { name: 'date_of_birth', sql: 'ALTER TABLE users ADD COLUMN date_of_birth TEXT' },
      { name: 'gender', sql: 'ALTER TABLE users ADD COLUMN gender TEXT' },
      { name: 'address', sql: 'ALTER TABLE users ADD COLUMN address TEXT' },
      { name: 'city', sql: 'ALTER TABLE users ADD COLUMN city TEXT' },
      { name: 'state', sql: 'ALTER TABLE users ADD COLUMN state TEXT' },
      { name: 'pincode', sql: 'ALTER TABLE users ADD COLUMN pincode TEXT' },
      { name: 'is_active', sql: 'ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1' },
      { name: 'last_login_at', sql: 'ALTER TABLE users ADD COLUMN last_login_at TEXT' },
      { name: 'created_at', sql: 'ALTER TABLE users ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP' },
      { name: 'updated_at', sql: 'ALTER TABLE users ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP' }
    ];
    
    const existingColumns = columnCheck.results?.map(col => col.name) || [];
    const results = [];
    
    // Add missing columns
    for (const column of requiredColumns) {
      if (!existingColumns.includes(column.name)) {
        try {
          await env.KUDDL_DB.prepare(column.sql).run();
          console.log(`✅ Added column: ${column.name}`);
          results.push({ column: column.name, status: 'added' });
        } catch (error) {
          console.error(`❌ Failed to add column ${column.name}:`, error.message);
          results.push({ column: column.name, status: 'failed', error: error.message });
        }
      } else {
        console.log(`⚠️ Column already exists: ${column.name}`);
        results.push({ column: column.name, status: 'exists' });
      }
    }
    
    // Verify final table structure
    const finalCheck = await env.KUDDL_DB.prepare(`
      PRAGMA table_info(users)
    `).all();
    
    console.log('Final users table columns:', finalCheck.results?.map(col => col.name));
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Successfully fixed users table schema',
      results: results,
      finalColumns: finalCheck.results?.map(col => col.name)
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
