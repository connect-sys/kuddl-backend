/**
 * User Controller
 * Handles user management API endpoints
 */

import bcrypt from 'bcryptjs';
import jwt from '@tsndr/cloudflare-worker-jwt';
import { addCorsHeaders } from '../utils/cors.js';
import { generateId } from '../utils/helpers.js';

// Register user
export async function register(request, env) {
  try {
    const { email, phone, password, firstName, lastName, role = 'customer', selectedCategories } = await request.json();
    
    if (!email || !phone || !password || !firstName || !lastName) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'All fields are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Check if user already exists
    let existingUser = null;
    
    if (role === 'provider') {
      existingUser = await env.KUDDL_DB.prepare(
        'SELECT id FROM providers WHERE email = ? OR phone = ?'
      ).bind(email, phone).first();
    } else {
      existingUser = await env.KUDDL_DB.prepare(
        'SELECT id FROM users WHERE email = ? OR phone = ?'
      ).bind(email, phone).first();
    }

    if (existingUser) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'User with this email or phone already exists'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);
    let userId = '';

    if (role === 'provider') {
      userId = `provider_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Create provider
      await env.KUDDL_DB.prepare(`
        INSERT INTO providers (
          id, email, phone, password_hash, first_name, last_name, 
          kyc_status, is_active, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, 'pending', 1, ?, ?)
      `).bind(
        userId, email, phone, hashedPassword, firstName, lastName,
        new Date().toISOString(), new Date().toISOString()
      ).run();

      // Save selected categories if provided
      if (selectedCategories && selectedCategories.subcategories && selectedCategories.subcategories.length > 0) {
        console.log('🏷️ Saving selected categories for provider:', userId, selectedCategories);
        
        // Convert subcategories array to comma-separated string for service_categories field
        const serviceCategories = selectedCategories.subcategories.join(',');
        
        // Update provider with selected service categories
        await env.KUDDL_DB.prepare(`
          UPDATE providers 
          SET service_categories = ?, main_category = ?
          WHERE id = ?
        `).bind(
          serviceCategories, 
          selectedCategories.mainCategory?.module || selectedCategories.mainCategory?.title || 'General',
          userId
        ).run();
        
        console.log('✅ Categories saved successfully for provider:', userId);
      }
      
    } else {
      userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Create user (customer)
      await env.KUDDL_DB.prepare(`
        INSERT INTO users (id, email, phone, password_hash, first_name, last_name, role, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
      `).bind(
        userId, email, phone, hashedPassword, firstName, lastName, role,
        new Date().toISOString(), new Date().toISOString()
      ).run();

      // Create customer profile
      const customerProfileId = `cp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await env.KUDDL_DB.prepare(`
        INSERT INTO customer_profiles (id, user_id, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `).bind(customerProfileId, userId, new Date().toISOString(), new Date().toISOString()).run();
    }

    // Generate JWT token
    const token = await jwt.sign({
      id: userId,
      email: email,
      role: role === 'provider' ? 'partner' : role, // Map provider to partner role for consistency
      name: `${firstName} ${lastName}`,
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
    }, env.JWT_SECRET);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'User registered successfully',
      user: {
        id: userId,
        email,
        phone,
        firstName,
        lastName,
        role: role === 'provider' ? 'partner' : role,
        status: 'active'
      },
      token
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Registration error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Login user
export async function login(request, env) {
  try {
    const { email, password } = await request.json();
    
    if (!email || !password) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Email and password are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Get user from providers table (since no users table)
    console.log('🔍 Login attempt for email:', email);
    const user = await env.KUDDL_DB.prepare(
      'SELECT * FROM providers WHERE email = ? AND is_active = 1'
    ).bind(email).first();

    console.log('👤 User found:', user ? {
      id: user.id,
      email: user.email,
      name: `${user.first_name} ${user.last_name}`,
      is_active: user.is_active,
      kyc_status: user.kyc_status
    } : 'No user found');

    if (!user) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid email or password'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!isValidPassword) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid email or password'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Update last login
    await env.KUDDL_DB.prepare(
      'UPDATE providers SET last_login_at = ? WHERE id = ?'
    ).bind(new Date().toISOString(), user.id).run();

    // Generate JWT token - treat all providers as admin for now
    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: user.id === 'admin001' ? 'admin' : 'provider',
      name: `${user.first_name} ${user.last_name}`,
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
    };
    
    console.log('🔐 Creating JWT token with payload:', tokenPayload);
    const token = await jwt.sign(tokenPayload, env.JWT_SECRET);
    console.log('✅ JWT token created successfully');

    // Remove password from response
    const { password_hash, ...userWithoutPassword } = user;

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Login successful',
      user: {
        ...userWithoutPassword,
        role: user.id === 'admin001' ? 'admin' : 'provider',
        name: `${user.first_name} ${user.last_name}`
      },
      token
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Login error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get user profile
export async function getProfile(request, env) {
  try {
    const user = request.user; // From auth middleware
    let userDetails = null;
    let profileData = {};

    // Check role to determine which table to query
    if (user.role === 'provider' || user.role === 'partner') {
      // Get provider details directly from providers table
      userDetails = await env.KUDDL_DB.prepare(
        'SELECT * FROM providers WHERE id = ?'
      ).bind(user.id).first();
      
      if (userDetails) {
        // Add specific provider fields to profileData if needed, 
        // though we are returning the whole object merged below.
        profileData.provider = userDetails;
      }
    } else {
      // Default to users table (customers, admins)
      userDetails = await env.KUDDL_DB.prepare(
        'SELECT * FROM users WHERE id = ?'
      ).bind(user.id).first();
      
      if (userDetails && userDetails.role === 'customer') {
        const customer = await env.KUDDL_DB.prepare(
          'SELECT * FROM customer_profiles WHERE user_id = ?'
        ).bind(user.id).first();
        
        const children = await env.KUDDL_DB.prepare(
          'SELECT * FROM children WHERE customer_id = ?'
        ).bind(user.id).all();
        
        profileData.customer = customer;
        profileData.children = children.results || [];
      }
    }

    if (!userDetails) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'User not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Remove password from response
    const { password_hash, ...userWithoutPassword } = userDetails;

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      user: {
        ...userWithoutPassword,
        name: `${userDetails.first_name} ${userDetails.last_name}`,
        ...profileData
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Get profile error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Update user profile
export async function updateProfile(request, env) {
  try {
    const user = request.user; // From auth middleware
    const updateData = await request.json();
    
    const allowedFields = [
      'first_name', 'last_name', 'phone', 'profile_image_url', 
      'date_of_birth', 'gender', 'address', 'city', 'state', 'pincode',
      'business_name', 'description' // Added provider fields
    ];
    
    const updates = {};
    Object.keys(updateData).forEach(key => {
      if (allowedFields.includes(key)) {
        updates[key] = updateData[key];
      }
    });

    if (Object.keys(updates).length === 0) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'No valid fields to update'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Build update query
    const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(new Date().toISOString(), user.id);

    // Determine table based on role
    const tableName = (user.role === 'provider' || user.role === 'partner') ? 'providers' : 'users';

    await env.KUDDL_DB.prepare(`
      UPDATE ${tableName} SET ${setClause}, updated_at = ? WHERE id = ?
    `).bind(...values).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Profile updated successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Update profile error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Change password
export async function changePassword(request, env) {
  try {
    const user = request.user; // From auth middleware
    const { currentPassword, newPassword } = await request.json();
    
    if (!currentPassword || !newPassword) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Current password and new password are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Determine table based on role
    const tableName = (user.role === 'provider' || user.role === 'partner') ? 'providers' : 'users';

    // Get current user
    const userRecord = await env.KUDDL_DB.prepare(
      `SELECT password_hash FROM ${tableName} WHERE id = ?`
    ).bind(user.id).first();

    if (!userRecord) {
       return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'User not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, userRecord.password_hash);
    if (!isValidPassword) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Current password is incorrect'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await env.KUDDL_DB.prepare(
      `UPDATE ${tableName} SET password_hash = ?, updated_at = ? WHERE id = ?`
    ).bind(hashedNewPassword, new Date().toISOString(), user.id).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Password updated successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Change password error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}
