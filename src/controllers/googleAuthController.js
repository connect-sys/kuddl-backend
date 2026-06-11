/**
 * Google OAuth Controller for Kuddl Backend
 * Uses the `parents` table (same as OTP auth) for consistency.
 */

import jwt from '@tsndr/cloudflare-worker-jwt';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });

export class GoogleAuthController {
  constructor(env) {
    this.env = env;
    this.db = env.KUDDL_DB;
  }

  /**
   * Handle Google OAuth login/signup
   * POST /api/auth/google
   * Body: { googleId, email, name, firstName, lastName, profilePicture }
   */
  async handleGoogleAuth(request) {
    try {
      const body = await request.json();
      const { googleId, email, name, firstName, lastName, profilePicture } = body;

      if (!email) {
        return json({ success: false, message: 'email is required' }, 400);
      }

      const fullName = name || `${firstName || ''} ${lastName || ''}`.trim() || 'User';
      const nameParts = fullName.trim().split(' ');
      const fName = firstName || nameParts[0] || '';
      const lName = lastName || nameParts.slice(1).join(' ') || '';

      // Find parent by email (most reliable — email always exists in parents table)
      let existingParent = null;
      let isNewUser = false;
      let parentId;

      try {
        existingParent = await this.db.prepare(
          `SELECT id, fullname, email FROM parents WHERE email = ? LIMIT 1`
        ).bind(email).first();
      } catch (e) {
        console.error('Google auth — lookup error:', e.message);
      }

      if (existingParent) {
        parentId = existingParent.id;
        // Update name and profile_picture (from Google) if available
        try {
          const updates = ['fullname = ?', 'updated_at = ?'];
          const vals = [fullName, new Date().toISOString()];
          if (profilePicture) { updates.push('profile_picture = ?'); vals.push(profilePicture); }
          vals.push(parentId);
          await this.db.prepare(
            `UPDATE parents SET ${updates.join(', ')} WHERE id = ?`
          ).bind(...vals).run();
        } catch (_) { /* non-critical */ }
      } else {
        // Create new parent using only core columns
        // (id, phone, fullname, email, created_at, updated_at).
        // parents.phone has a UNIQUE constraint and the column is NOT NULL.
        // If another row already holds phone='' (a stale legacy account),
        // use a per-Google-account placeholder so we don't 500 the signup.
        // The user can set their real phone from the profile later.
        isNewUser = true;
        parentId = crypto.randomUUID();
        const now = new Date().toISOString();

        let phoneToInsert = '';
        try {
          const collision = await this.db.prepare(
            `SELECT id FROM parents WHERE phone = ? LIMIT 1`
          ).bind('').first();
          if (collision) {
            phoneToInsert = `g:${googleId || parentId}`;
          }
        } catch (_) { /* ignore — fall through with '' */ }

        await this.db.prepare(
          `INSERT INTO parents (id, phone, fullname, email, profile_picture, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(parentId, phoneToInsert, fullName, email, profilePicture || '', now, now).run();
      }

      // Best-effort: store google_id for future lookups (column added via migration)
      if (googleId) {
        try {
          await this.db.prepare(
            `UPDATE parents SET google_id = ? WHERE id = ?`
          ).bind(googleId, parentId).run();
        } catch (_) { /* google_id column may not exist yet — safe to ignore */ }
      }

      // Generate JWT (same structure as OTP auth)
      const jwtSecret = this.env.JWT_SECRET || '';
      if (!jwtSecret) throw new Error('JWT_SECRET not configured');

      const token = await jwt.sign({
        id: parentId,
        email,
        role: 'customer',
        exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60),
      }, jwtSecret);

      return json({
        success: true,
        message: isNewUser ? 'Account created successfully' : 'Login successful',
        token,
        user: {
          id: parentId,
          email,
          first_name: fName,
          last_name: lName,
          full_name: fullName,
          profile_picture: profilePicture || '',
          role: 'customer',
          isNewUser,
        },
      });

    } catch (error) {
      console.error('Google auth error:', error.message, error.stack);
      return json({ success: false, message: 'Authentication failed', error: error.message }, 500);
    }
  }

  /**
   * Get user profile  — GET /api/auth/profile
   */
  async getUserProfile(request, userId) {
    try {
      const parent = await this.db.prepare(
        `SELECT id, email, fullname, google_id, created_at FROM parents WHERE id = ? LIMIT 1`
      ).bind(userId).first();

      if (!parent) return json({ success: false, message: 'User not found' }, 404);

      const nameParts = (parent.fullname || '').trim().split(' ');
      return json({
        success: true,
        user: {
          id: parent.id,
          email: parent.email,
          firstName: nameParts[0] || '',
          lastName: nameParts.slice(1).join(' ') || '',
          fullName: parent.fullname || '',
          memberSince: parent.created_at,
        },
      });
    } catch (error) {
      console.error('Get profile error:', error);
      return json({ success: false, message: 'Failed to get user profile' }, 500);
    }
  }
}
