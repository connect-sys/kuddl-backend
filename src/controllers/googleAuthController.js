/**
 * Google OAuth Controller for Kuddl Backend
 * Handles Google Sign-In authentication and user data storage in Cloudflare D1
 */

// import { generateToken } from '../utils/jwt.js'; // TODO: Fix JWT utility import

export class GoogleAuthController {
  constructor(env) {
    this.env = env;
    this.db = env.DB; // Cloudflare D1 database binding
  }

  /**
   * Handle Google OAuth login/signup
   * POST /api/auth/google
   */
  async handleGoogleAuth(request) {
    try {
      const body = await request.json();
      const { googleId, email, name, firstName, lastName, profilePicture } = body;

      // Validate required fields
      if (!googleId || !email || !name) {
        return new Response(JSON.stringify({
          success: false,
          message: 'Missing required fields: googleId, email, name'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Check if user already exists
      const existingUser = await this.db.prepare(
        'SELECT * FROM customers WHERE google_id = ? OR email = ?'
      ).bind(googleId, email).first();

      let user;
      let isNewUser = false;

      if (existingUser) {
        // Update existing user's Google info if needed
        user = await this.db.prepare(`
          UPDATE customers 
          SET 
            google_id = ?,
            name = ?,
            first_name = ?,
            last_name = ?,
            profile_picture = ?,
            updated_at = datetime('now')
          WHERE id = ?
          RETURNING *
        `).bind(
          googleId,
          name,
          firstName || existingUser.first_name,
          lastName || existingUser.last_name,
          profilePicture || existingUser.profile_picture,
          existingUser.id
        ).first();
      } else {
        // Create new user
        isNewUser = true;
        const userId = crypto.randomUUID();
        
        user = await this.db.prepare(`
          INSERT INTO customers (
            id, google_id, email, name, first_name, last_name, 
            profile_picture, auth_provider, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'google', datetime('now'), datetime('now'))
          RETURNING *
        `).bind(
          userId,
          googleId,
          email,
          name,
          firstName,
          lastName,
          profilePicture
        ).first();
      }

      if (!user) {
        throw new Error('Failed to create or update user');
      }

      // Generate JWT token
      const token = generateToken({
        id: user.id,
        email: user.email,
        name: user.name,
        type: 'customer'
      });

      // Log the authentication event
      await this.logAuthEvent(user.id, 'google_login', request);

      return new Response(JSON.stringify({
        success: true,
        message: isNewUser ? 'Account created successfully' : 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          firstName: user.first_name,
          lastName: user.last_name,
          profilePicture: user.profile_picture,
          isNewUser
        },
        token
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('Google auth error:', error);
      return new Response(JSON.stringify({
        success: false,
        message: 'Authentication failed',
        error: error.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  /**
   * Log authentication events for security and analytics
   */
  async logAuthEvent(userId, eventType, request) {
    try {
      const userAgent = request.headers.get('User-Agent') || '';
      const ip = request.headers.get('CF-Connecting-IP') || 
                 request.headers.get('X-Forwarded-For') || 
                 'unknown';

      await this.db.prepare(`
        INSERT INTO auth_logs (
          id, user_id, event_type, ip_address, user_agent, created_at
        ) VALUES (?, ?, ?, ?, ?, datetime('now'))
      `).bind(
        crypto.randomUUID(),
        userId,
        eventType,
        ip,
        userAgent
      ).run();
    } catch (error) {
      console.error('Failed to log auth event:', error);
      // Don't throw error as this is not critical
    }
  }

  /**
   * Get user profile by token
   * GET /api/auth/profile
   */
  async getUserProfile(request, userId) {
    try {
      const user = await this.db.prepare(
        'SELECT id, email, name, first_name, last_name, profile_picture, created_at FROM customers WHERE id = ?'
      ).bind(userId).first();

      if (!user) {
        return new Response(JSON.stringify({
          success: false,
          message: 'User not found'
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          firstName: user.first_name,
          lastName: user.last_name,
          profilePicture: user.profile_picture,
          memberSince: user.created_at
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('Get profile error:', error);
      return new Response(JSON.stringify({
        success: false,
        message: 'Failed to get user profile'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
}
