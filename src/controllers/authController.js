/**
 * Authentication Controller
 * Handles authentication-related API endpoints
 */

import bcrypt from 'bcryptjs';
import jwt from '@tsndr/cloudflare-worker-jwt';
import { addCorsHeaders } from '../utils/cors.js';

// Middleware to verify JWT token
export async function verifyToken(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  try {
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (!isValid) return null;

    const payload = jwt.decode(token);
    return payload.payload;
  } catch (error) {
    console.error('Token verification error:', error);
    return null;
  }
}

// Middleware to require admin role
export async function requireAdmin(request, env) {
  const user = await verifyToken(request, env);
  if (!user || (user.role !== 'admin' && user.user_type !== 'admin' && !user.isAdmin)) {
    return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'Admin access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
  return user;
}

// Login endpoint
export async function login(request, env) {
  try {
    const { email, password } = await request.json();
    console.log('Login attempt for email:', email);

    if (!email || !password) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Email and password are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Check admins table for admin login
    let user = null;

    // First try admin login
    console.log('Checking admin login for:', email);
    let adminUser = null;

    // Try with status column first, then fallback without it
    try {
      adminUser = await env.KUDDL_DB.prepare(
        'SELECT * FROM admins WHERE email = ? AND status = ?'
      ).bind(email, 'active').first();
      console.log('Admin user found (with status):', !!adminUser);
    } catch (error) {
      if (error.message.includes('no such column: status')) {
        console.log('Status column not found, trying without it...');
        adminUser = await env.KUDDL_DB.prepare(
          'SELECT * FROM admins WHERE email = ?'
        ).bind(email).first();
        console.log('Admin user found (without status):', !!adminUser);
      } else {
        throw error;
      }
    }

    if (adminUser) {
      // Verify admin password
      const isValidPassword = await bcrypt.compare(password, adminUser.password_hash);
      if (!isValidPassword) {
        return addCorsHeaders(new Response(JSON.stringify({
          success: false,
          message: 'Invalid email or password'
        }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }));
      }

      // Generate JWT tokens for admin
      const accessToken = await jwt.sign({
        id: adminUser.id,
        email: adminUser.email,
        role: 'admin',
        type: 'access',
        exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days
      }, env.JWT_SECRET);

      const refreshToken = await jwt.sign({
        id: adminUser.id,
        type: 'refresh',
        exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days
      }, env.JWT_SECRET);

      // Use first_name and last_name from database
      const firstName = adminUser.first_name || 'Admin';
      const lastName = adminUser.last_name || 'User';
      const fullName = `${firstName} ${lastName}`;

      // Return admin data with tokens
      return addCorsHeaders(new Response(JSON.stringify({
        success: true,
        message: 'Admin login successful',
        user: {
          id: adminUser.id,
          email: adminUser.email,
          first_name: firstName,
          last_name: lastName,
          role: 'admin',
          name: fullName
        },
        token: accessToken,
        refreshToken,
        isFirstLogin: false
      }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // If not admin, check for provider login directly in providers table
    console.log('Checking provider login for:', email);

    // Try with is_active column first, then fallback without it
    try {
      user = await env.KUDDL_DB.prepare(
        'SELECT * FROM providers WHERE email = ? AND is_active = ?'
      ).bind(email, 1).first();
    } catch (error) {
      if (error.message.includes('no such column: is_active')) {
        console.log('is_active column not found, trying without it...');
        user = await env.KUDDL_DB.prepare(
          'SELECT * FROM providers WHERE email = ?'
        ).bind(email).first();
      } else {
        throw error;
      }
    }
    console.log('Provider user found:', !!user);
    if (user) {
      console.log('User details:', {
        id: user.id,
        email: user.email,
        hasPasswordHash: !!user.password_hash,
        passwordHashLength: user.password_hash?.length || 0
      });
    }

    if (!user) {
      console.log('❌ No user found with email:', email);
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid email or password'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Check if password hash exists
    if (!user.password_hash) {
      console.log('❌ User found but no password hash set');
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid email or password'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Verify user password
    console.log('🔐 Comparing password with hash...');
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    console.log('Password validation result:', isValidPassword);

    if (!isValidPassword) {
      console.log('❌ Password validation failed');
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid email or password'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Generate JWT tokens for provider
    const accessToken = await jwt.sign({
      id: user.id,
      email: user.email,
      role: 'partner',
      type: 'access',
      exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days
    }, env.JWT_SECRET);

    const refreshToken = await jwt.sign({
      id: user.id,
      type: 'refresh',
      exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days
    }, env.JWT_SECRET);

    // Return provider data with tokens
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
        business_name: user.business_name,
        kyc_status: user.kyc_status,
        role: 'partner',
        name: `${user.first_name} ${user.last_name}`
      },
      token: accessToken,
      refreshToken,
      isFirstLogin: false
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Login error:', error);
    console.error('Error stack:', error.stack);
    console.error('Error message:', error.message);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error',
      error: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Signup disabled - Admin only system
export async function signup(request, env) {
  return addCorsHeaders(new Response(JSON.stringify({
    success: false,
    message: 'Registration is disabled. Only admin access is allowed.'
  }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' }
  }));
}


// Logout endpoint
export async function logout(request, env) {
  try {
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Logged out successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
  } catch (error) {
    console.error('Logout error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Logout failed'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Token verification endpoint
export async function verify(request, env) {
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

    // Verify JWT token
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (!isValid) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid or expired token'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const payload = jwt.decode(token);
    const decoded = payload.payload;

    console.log('🔍 JWT Payload Debug:', {
      payload: payload,
      decoded: decoded,
      decodedId: decoded?.id,
      decodedRole: decoded?.role
    });

    // Validate decoded payload
    if (!decoded || !decoded.id) {
      console.error('❌ Invalid JWT payload - missing id');
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid token payload'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    let user = null;
    let userRole = null;
    let userName = null;

    // Check if it's an admin token
    if (decoded.role === 'admin') {
      user = await env.KUDDL_DB.prepare(
        'SELECT * FROM admins WHERE id = ? AND is_active = ?'
      ).bind(decoded.id, 1).first();

      if (user) {
        userRole = 'admin';
        userName = `${user.first_name} ${user.last_name}`;
      }
    } else if (decoded.role === 'partner') {
      // Check providers table for partner tokens
      user = await env.KUDDL_DB.prepare(
        'SELECT * FROM providers WHERE id = ?'
      ).bind(decoded.id).first();
      
      // If not found by ID, try phone lookup for tokens that only have phone
      if (!user && decoded.phone) {
        console.log('🔍 Provider not found by ID, trying phone lookup:', decoded.phone);
        user = await env.KUDDL_DB.prepare(
          'SELECT * FROM providers WHERE phone = ?'
        ).bind(decoded.phone).first();
      }

      if (user) {
        userRole = 'partner';
        userName = `${user.first_name} ${user.last_name}`;

        // Calculate profile completion for partners based on essential fields
        const hasEssentialFields = user.first_name && 
                                  user.email && 
                                  user.service_categories && 
                                  user.account_holder_name && 
                                  user.account_number;
        
        user.profileComplete = hasEssentialFields;
        user.profileCompletionPercentage = hasEssentialFields ? 100 : 50;
        user.missingFields = hasEssentialFields ? [] : ['Some essential fields missing'];
      }
    }

    if (!user) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'User not found or inactive'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Remove password from response
    const { password_hash, ...userWithoutPassword } = user;

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Token verified successfully',
      user: {
        ...userWithoutPassword,
        role: userRole,
          name: userName,
          profile_picture_url: userWithoutPassword.profile_image_url || null
        }
      }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Token verification error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Token verification failed'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Token refresh endpoint
export async function refresh(request, env) {
  try {
    const { refreshToken } = await request.json();

    if (!refreshToken) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Refresh token required'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Verify refresh token
    const isValid = await jwt.verify(refreshToken, env.JWT_SECRET);
    if (!isValid) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid or expired refresh token'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const payload = jwt.decode(refreshToken);
    const decoded = payload.payload;

    if (decoded.type !== 'refresh') {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid token type'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Determine which table to query based on the original token
    let user = null;
    let userRole = null;
    let userName = null;

    // Try to find the user in admins table first
    user = await env.KUDDL_DB.prepare(
      'SELECT * FROM admins WHERE id = ? AND is_active = ?'
    ).bind(decoded.id, 1).first();

    if (user) {
      userRole = 'admin';
      userName = user.full_name;
    } else {
      // Try providers table
      user = await env.KUDDL_DB.prepare(
        'SELECT * FROM providers WHERE id = ? AND is_active = ?'
      ).bind(decoded.id, 1).first();

      if (user) {
        userRole = 'partner';
        userName = `${user.first_name} ${user.last_name}`;
      }
    }

    if (!user) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'User not found or inactive'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Generate new tokens
    const newToken = await jwt.sign({
      id: user.id,
      email: user.email,
      role: userRole,
      type: 'access',
      exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days
    }, env.JWT_SECRET);

    const newRefreshToken = await jwt.sign({
      id: user.id,
      type: 'refresh',
      exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days
    }, env.JWT_SECRET);

    // Remove password from response
    const { password_hash, ...userWithoutPassword } = user;

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Token refreshed successfully',
      user: {
        ...userWithoutPassword,
        role: userRole,
        name: userName
      },
      token: newToken,
      refreshToken: newRefreshToken
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Token refresh error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Token refresh failed'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Password reset endpoint
export async function resetPassword(request, env) {
  try {
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

    // Get admin from token
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

    // Get user from database
    const userStmt = env.KUDDL_DB.prepare('SELECT * FROM admins WHERE id = ?');
    const user = await userStmt.bind(decoded.id).first();

    if (!user) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Admin not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
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
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Update password in database
    const updateStmt = env.KUDDL_DB.prepare('UPDATE admins SET password_hash = ? WHERE id = ?');
    await updateStmt.bind(newPasswordHash, decoded.id).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Password updated successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
  } catch (error) {
    console.error('Password reset error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Password reset failed'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}
