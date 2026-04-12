/**
 * Authentication Middleware
 * Handles JWT token verification and role-based access control
 */

import jwt from '@tsndr/cloudflare-worker-jwt';
import { corsHeaders } from '../utils/cors.js';

/**
 * Verify JWT token and get user info
 */
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

/**
 * Authenticate JWT token middleware
 */
export async function authenticateToken(request, env, ctx) {
  try {
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Missing or invalid authorization header'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const token = authHeader.substring(7);
    
    // Verify JWT token
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (!isValid) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Invalid token'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const payload = jwt.decode(token);
    const decoded = payload.payload || payload;
    
    // Handle different token structures - try id, userId, or phone
    const userId = decoded.id || decoded.userId;
    const userPhone = decoded.phone;
    
    console.log('🔍 Auth Debug - Token payload:', JSON.stringify(decoded, null, 2));
    console.log('🔍 Auth Debug - Extracted userId:', userId, 'phone:', userPhone);
    
    let user = null;
    
    // Try to find user by ID first
    if (userId) {
      user = await env.KUDDL_DB.prepare(
        'SELECT * FROM providers WHERE id = ? AND is_active = 1'
      ).bind(userId).first();
    }
    
    // If not found by ID and we have phone, try to find by phone
    if (!user && userPhone) {
      user = await env.KUDDL_DB.prepare(
        'SELECT * FROM providers WHERE phone = ? AND is_active = 1'
      ).bind(userPhone).first();
    }
    
    if (!user) {
      return new Response(JSON.stringify({
        success: false,
        message: 'User not found or inactive'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Add user info to request context
    request.user = {
      id: user.id,
      email: user.email,
      role: user.id === 'admin001' ? 'admin' : 'provider',
      name: `${user.first_name} ${user.last_name}`
    };

    // Continue to next middleware/handler
    return null;
  } catch (error) {
    console.error('Authentication error:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Authentication failed'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

/**
 * Require specific roles
 */
export function requireRole(allowedRoles) {
  return async function(request, env, ctx) {
    if (!request.user) {
      return new Response(JSON.stringify({
        error: 'Unauthorized',
        message: 'Authentication required'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    if (!allowedRoles.includes(request.user.role)) {
      return new Response(JSON.stringify({
        error: 'Forbidden',
        message: 'Insufficient permissions'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // User has required role, continue
    return null;
  };
}

/**
 * Optional authentication (doesn't fail if no token)
 */
export async function optionalAuth(request, env, ctx) {
  try {
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null; // No token, but that's okay
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, env.JWT_SECRET);
    const user = await d1Service.getUserById(decoded.userId);
    
    if (user && user.status === 'active') {
      request.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name
      };
    }

    return null;
  } catch (error) {
    // Ignore auth errors for optional auth
    return null;
  }
}

/**
 * Generate JWT token
 */
export function generateToken(user, env, expiresIn = '30d') {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role
    },
    env.JWT_SECRET,
    { expiresIn }
  );
}

/**
 * Generate refresh token
 */
export function generateRefreshToken(user, env) {
  return jwt.sign(
    {
      userId: user.id,
      type: 'refresh'
    },
    env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

/**
 * Verify refresh token
 */
export function verifyRefreshToken(token, env) {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }
    
    return decoded;
  } catch (error) {
    throw new Error('Invalid refresh token');
  }
}
