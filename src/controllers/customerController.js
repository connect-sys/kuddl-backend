/**
 * Customer Controller
 * Handles customer-related API endpoints
 */

import bcrypt from 'bcryptjs';
import jwt from '@tsndr/cloudflare-worker-jwt';
import { addCorsHeaders, createApiResponse } from '../utils/cors.js';
import { generateId } from '../utils/helpers.js';

// Customer registration
export async function registerCustomer(request, env) {
  try {
    const { email, phone, password, firstName, lastName, pincode, children } = await request.json();

    if (!email || !phone || !password || !firstName || !lastName) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'All fields are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Check if customer already exists
    const existingCustomer = await env.KUDDL_DB.prepare(
      'SELECT id FROM users WHERE email = ? OR phone = ?'
    ).bind(email, phone).first();

    if (existingCustomer) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Customer already exists with this email or phone'
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);
    const customerId = `customer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create customer
    await env.KUDDL_DB.prepare(`
      INSERT INTO users (
        id, email, phone, password_hash, first_name, last_name, 
        role, pincode, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'customer', ?, ?, ?)
    `).bind(
      customerId,
      email,
      phone,
      hashedPassword,
      firstName,
      lastName,
      pincode || null,
      new Date().toISOString(),
      new Date().toISOString()
    ).run();

    // Create customer profile entry
    const profileId = `cp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    try {
      await env.KUDDL_DB.prepare(`
        INSERT INTO customer_profiles (id, user_id, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `).bind(
        profileId,
        customerId,
        new Date().toISOString(),
        new Date().toISOString()
      ).run();
      console.log('✅ Created customer profile for:', customerId);
    } catch (profileError) {
      console.error('⚠️ Failed to create customer profile:', profileError);
      // Continue since user is created
    }

    // Handle children data if provided
    if (Array.isArray(children) && children.length > 0) {
      console.log(`👨‍👩‍👧‍👦 Adding ${children.length} children for customer ${customerId}`);
      
      const childInsertStmt = env.KUDDL_DB.prepare(`
        INSERT INTO children (
          id, customer_id, name, age, gender, 
          medical_conditions, bedtime, dietary_restrictions,
          special_needs, allergies, preferences,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const childrenResults = [];
      
      for (const child of children) {
        if (!child.name || !child.age) {
          console.warn('⚠️ Skipping child without name or age:', child);
          continue;
        }
        
        const childId = `child_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        try {
          await childInsertStmt.bind(
            childId,
            customerId,
            child.name,
            child.age,
            child.gender || 'unknown',
            child.medicalConditions || null,
            child.bedtime || null,
            child.dietaryRestrictions || null,
            child.specialNeeds || null,
            child.allergies || null,
            child.preferences || null,
            new Date().toISOString(),
            new Date().toISOString()
          ).run();
          childrenResults.push({ ...child, id: childId });
        } catch (childError) {
          console.error('❌ Failed to add child:', child.name, childError);
        }
      }
      console.log(`✅ Successfully added ${childrenResults.length} children`);
    }

    // Generate JWT token
    const token = await jwt.sign({
      id: customerId,
      email,
      role: 'customer',
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
    }, env.JWT_SECRET);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Customer registered successfully',
      token,
      customer: {
        id: customerId,
        email,
        firstName,
        lastName,
        role: 'customer'
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Customer registration error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Registration failed'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Customer login
export async function loginCustomer(request, env) {
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

    // Find customer
    const customer = await env.KUDDL_DB.prepare(
      'SELECT * FROM users WHERE email = ? AND role = "customer"'
    ).bind(email).first();

    if (!customer) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid credentials'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, customer.password_hash);
    if (!isValidPassword) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid credentials'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Ensure customer profile exists
    try {
      const existingProfile = await env.KUDDL_DB.prepare(
        'SELECT id FROM customer_profiles WHERE user_id = ?'
      ).bind(customer.id).first();

      if (!existingProfile) {
        console.log('👤 Customer profile missing on login, creating one for:', customer.id);
        const profileId = `cp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await env.KUDDL_DB.prepare(`
          INSERT INTO customer_profiles (id, user_id, created_at, updated_at)
          VALUES (?, ?, ?, ?)
        `).bind(
          profileId,
          customer.id,
          new Date().toISOString(),
          new Date().toISOString()
        ).run();
        console.log('✅ Created missing customer profile');
      }
    } catch (profileError) {
      console.error('⚠️ Failed to check/create customer profile on login:', profileError);
      // Continue login process, don't block user
    }

    // Update last login
    await env.KUDDL_DB.prepare(
      'UPDATE users SET last_login_at = ? WHERE id = ?'
    ).bind(new Date().toISOString(), customer.id).run();

    // Generate JWT token
    const token = await jwt.sign({
      id: customer.id,
      email: customer.email,
      role: 'customer',
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
    }, env.JWT_SECRET);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Login successful',
      token,
      customer: {
        id: customer.id,
        email: customer.email,
        firstName: customer.first_name,
        lastName: customer.last_name,
        role: 'customer',
        pincode: customer.pincode
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Customer login error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Login failed'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Helper for authentication
async function verifyAuth(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  try {
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (!isValid) return null;
    
    // @tsndr/cloudflare-worker-jwt decode returns { header, payload, signature }
    const { payload } = jwt.decode(token);
    return payload;
  } catch (error) {
    console.error('Auth verification error:', error);
    return null;
  }
}

// Get customer profile
export async function getCustomerProfile(request, env) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authorization token required'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const token = authHeader.substring(7);
    const decoded = await jwt.verify(token, env.JWT_SECRET);

    const customer = await env.KUDDL_DB.prepare(
      'SELECT * FROM users WHERE id = ? AND role = "customer"'
    ).bind(decoded.id).first();

    if (!customer) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Customer not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      customer: {
        id: customer.id,
        email: customer.email,
        phone: customer.phone,
        firstName: customer.first_name,
        lastName: customer.last_name,
        address: customer.address,
        city: customer.city,
        state: customer.state,
        pincode: customer.pincode,
        profileImageUrl: customer.profile_image_url
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Get customer profile error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch profile'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get available pincodes
export async function getPincodes(request, env) {
  try {
    const pincodes = await env.KUDDL_DB.prepare(`
      SELECT DISTINCT pincode, area, city 
      FROM pincodes 
      WHERE is_active = 1 
      ORDER BY pincode, area
    `).all();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      pincodes: pincodes.results || []
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Get pincodes error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch pincodes'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Check service availability by pincode
export async function checkServiceAvailability(request, env) {
  try {
    const url = new URL(request.url);
    const pincode = url.searchParams.get('pincode');

    if (!pincode) {
      return createApiResponse({
        success: false,
        message: 'Pincode is required'
      }, 400);
    }

    // Check if pincode exists
    const pincodeExists = await env.KUDDL_DB.prepare(
      'SELECT id FROM pincodes WHERE pincode = ? AND is_active = 1'
    ).bind(pincode).first();

    if (!pincodeExists) {
      return createApiResponse({
        success: false,
        available: false,
        message: 'Service not available in your location. Stay in touch with us!'
      });
    }

    // Count available services in this pincode
    const serviceCount = await env.KUDDL_DB.prepare(`
      SELECT COUNT(*) as count 
      FROM services s
      JOIN providers p ON s.provider_id = p.id
      WHERE s.status = 'active' 
      AND p.is_active = 1
      AND s.available_pincodes IS NOT NULL AND s.available_pincodes LIKE '%' || ? || '%'
    `).bind(pincode).first();

    return createApiResponse({
      success: true,
      available: true,
      serviceCount: serviceCount?.count || 0,
      message: `${serviceCount?.count || 0} services available in your area`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Check service availability error:', error);
    return createApiResponse({
      success: false,
      message: 'Failed to check availability'
    }, 500);
  }
}

// Get customer children
export async function getChildren(request, env) {
  try {
    const user = await verifyAuth(request, env);
    
    if (!user) {
      return createApiResponse({
        success: false,
        message: 'Unauthorized'
      }, 401);
    }

    const children = await env.KUDDL_DB.prepare(`
      SELECT * FROM children WHERE customer_id = ? ORDER BY created_at DESC
    `).bind(user.id).all();

    return createApiResponse({
      success: true,
      children: children.results || []
    });

  } catch (error) {
    console.error('Get children error:', error);
    return createApiResponse({
      success: false,
      message: 'Failed to fetch children'
    }, 500);
  }
}

// Add child
export async function addChild(request, env) {
  try {
    const user = await verifyAuth(request, env);
    if (!user) {
      return createApiResponse({
        success: false,
        message: 'Unauthorized'
      }, 401);
    }

    const { name, age, gender, medicalConditions, bedtime, dietaryRestrictions, specialNeeds, allergies, preferences } = await request.json();

    if (!name || !age) {
      return createApiResponse({
        success: false,
        message: 'Name and age are required'
      }, 400);
    }

    const childId = generateId();
    await env.KUDDL_DB.prepare(`
      INSERT INTO children (
        id, customer_id, name, age, gender, 
        medical_conditions, bedtime, dietary_restrictions,
        special_needs, allergies, preferences,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      childId,
      user.id,
      name,
      age,
      gender || 'unknown',
      medicalConditions || null,
      bedtime || null,
      dietaryRestrictions || null,
      specialNeeds || null,
      allergies || null,
      preferences || null,
      new Date().toISOString(),
      new Date().toISOString()
    ).run();

    return createApiResponse({
      success: true,
      message: 'Child added successfully',
      child: {
        id: childId,
        name,
        age,
        gender,
        medicalConditions,
        bedtime,
        dietaryRestrictions,
        specialNeeds,
        allergies,
        preferences
      }
    });

  } catch (error) {
    console.error('Add child error:', error);
    return createApiResponse({
      success: false,
      message: 'Failed to add child'
    }, 500);
  }
}

// Update child
export async function updateChild(request, env) {
  try {
    const user = await verifyAuth(request, env);
    if (!user) {
      return createApiResponse({
        success: false,
        message: 'Unauthorized'
      }, 401);
    }

    const url = new URL(request.url);
    const childId = url.pathname.split('/').pop();
    const updates = await request.json();

    // Check if child belongs to user
    const child = await env.KUDDL_DB.prepare(
      'SELECT id FROM children WHERE id = ? AND customer_id = ?'
    ).bind(childId, user.id).first();

    if (!child) {
      return createApiResponse({
        success: false,
        message: 'Child not found'
      }, 404);
    }

    const allowedFields = [
      'name', 'age', 'gender', 'medical_conditions', 'bedtime', 
      'dietary_restrictions', 'special_needs', 'allergies', 'preferences'
    ];

    const updateFields = [];
    const updateValues = [];

    // Map camelCase to snake_case for DB
    const fieldMapping = {
      medicalConditions: 'medical_conditions',
      dietaryRestrictions: 'dietary_restrictions',
      specialNeeds: 'special_needs'
    };

    for (const [key, value] of Object.entries(updates)) {
      const dbField = fieldMapping[key] || key;
      if (allowedFields.includes(dbField)) {
        updateFields.push(`${dbField} = ?`);
        updateValues.push(value);
      }
    }

    if (updateFields.length === 0) {
      return createApiResponse({
        success: false,
        message: 'No valid fields to update'
      }, 400);
    }

    updateValues.push(new Date().toISOString());
    updateValues.push(childId);

    await env.KUDDL_DB.prepare(`
      UPDATE children 
      SET ${updateFields.join(', ')}, updated_at = ?
      WHERE id = ?
    `).bind(...updateValues).run();

    return createApiResponse({
      success: true,
      message: 'Child updated successfully'
    });

  } catch (error) {
    console.error('Update child error:', error);
    return createApiResponse({
      success: false,
      message: 'Failed to update child'
    }, 500);
  }
}

// Delete child
export async function deleteChild(request, env) {
  try {
    const user = await verifyAuth(request, env);
    if (!user) {
      return createApiResponse({
        success: false,
        message: 'Unauthorized'
      }, 401);
    }

    const url = new URL(request.url);
    const childId = url.pathname.split('/').pop();

    const result = await env.KUDDL_DB.prepare(
      'DELETE FROM children WHERE id = ? AND customer_id = ?'
    ).bind(childId, user.id).run();

    if (result.meta.changes === 0) {
      return createApiResponse({
        success: false,
        message: 'Child not found or not authorized'
      }, 404);
    }

    return createApiResponse({
      success: true,
      message: 'Child deleted successfully'
    });

  } catch (error) {
    console.error('Delete child error:', error);
    return createApiResponse({
      success: false,
      message: 'Failed to delete child'
    }, 500);
  }
}
