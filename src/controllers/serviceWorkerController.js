import { addCorsHeaders } from '../utils/cors.js';
import bcrypt from 'bcryptjs';
import jwt from '@tsndr/cloudflare-worker-jwt';
import { checkWorkerLimit } from './subscriptionController.js';

// Create a new service worker
export async function createServiceWorker(request, env) {
  try {
    const { username, password, full_name, email, phone, permissions } = await request.json();
    
    // Get provider_id from JWT token
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authorization required'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Verify token
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (!isValid) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid token'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    const decoded = jwt.decode(token);
    const providerId = decoded.payload.partnerId || decoded.payload.id;

    // Check worker limit based on subscription
    const limitCheck = await checkWorkerLimit(providerId, env);
    if (!limitCheck.canAdd) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: `Worker limit reached. You have ${limitCheck.current}/${limitCheck.max} workers. Please upgrade your subscription to add more workers.`,
        limit_reached: true,
        current_workers: limitCheck.current,
        max_workers: limitCheck.max
      }), { status: 403, headers: { 'Content-Type': 'application/json' } }));
    }

    if (!username || !password || !full_name) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Username, password, and full name are required'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    // Check if username already exists
    const existingWorker = await env.KUDDL_DB.prepare(
      'SELECT id FROM service_workers WHERE username = ?'
    ).bind(username).first();

    if (existingWorker) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Username already exists'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    const workerId = `worker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create service worker
    await env.KUDDL_DB.prepare(`
      INSERT INTO service_workers (
        id, provider_id, username, password_hash, full_name, email, phone, 
        is_active, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))
    `).bind(
      workerId, providerId, username, passwordHash, full_name, 
      email || '', phone || '', providerId
    ).run();

    // Create permissions
    if (permissions && Array.isArray(permissions)) {
      for (const perm of permissions) {
        const permId = `perm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await env.KUDDL_DB.prepare(`
          INSERT INTO service_worker_permissions (
            id, worker_id, permission_type, resource_id, can_view, can_edit, can_delete, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).bind(
          permId, workerId, perm.permission_type, perm.resource_id || null,
          perm.can_view ? 1 : 0, perm.can_edit ? 1 : 0, perm.can_delete ? 1 : 0
        ).run();
      }
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Service worker created successfully',
      worker_id: workerId
    }), { status: 201, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('Create service worker error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to create service worker',
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// Get all service workers for a provider
export async function getServiceWorkers(request, env) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authorization required'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    const token = authHeader.replace('Bearer ', '');
    
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (!isValid) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid token'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    const decoded = jwt.decode(token);
    const providerId = decoded.payload.partnerId || decoded.payload.id;

    const workers = await env.KUDDL_DB.prepare(`
      SELECT id, username, full_name, email, phone, is_active, created_at, updated_at
      FROM service_workers
      WHERE provider_id = ?
      ORDER BY created_at DESC
    `).bind(providerId).all();

    // Get permissions for each worker
    const workersWithPermissions = await Promise.all(
      (workers.results || []).map(async (worker) => {
        const permissions = await env.KUDDL_DB.prepare(`
          SELECT permission_type, resource_id, can_view, can_edit, can_delete
          FROM service_worker_permissions
          WHERE worker_id = ?
        `).bind(worker.id).all();

        return {
          ...worker,
          permissions: permissions.results || []
        };
      })
    );

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      workers: workersWithPermissions
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('Get service workers error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch service workers',
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// Update service worker
export async function updateServiceWorker(request, env) {
  try {
    const { worker_id, full_name, email, phone, is_active, permissions, password } = await request.json();

    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authorization required'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    const token = authHeader.replace('Bearer ', '');
    
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (!isValid) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid token'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    const decoded = jwt.decode(token);
    const providerId = decoded.payload.partnerId || decoded.payload.id;

    // Verify worker belongs to this provider
    const worker = await env.KUDDL_DB.prepare(
      'SELECT id FROM service_workers WHERE id = ? AND provider_id = ?'
    ).bind(worker_id, providerId).first();

    if (!worker) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Service worker not found'
      }), { status: 404, headers: { 'Content-Type': 'application/json' } }));
    }

    // Update worker details
    const updates = [];
    const values = [];

    if (full_name !== undefined) {
      updates.push('full_name = ?');
      values.push(full_name);
    }
    if (email !== undefined) {
      updates.push('email = ?');
      values.push(email);
    }
    if (phone !== undefined) {
      updates.push('phone = ?');
      values.push(phone);
    }
    if (is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(is_active ? 1 : 0);
    }
    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      updates.push('password_hash = ?');
      values.push(passwordHash);
    }

    updates.push('updated_at = datetime(\'now\')');
    values.push(worker_id);

    await env.KUDDL_DB.prepare(
      `UPDATE service_workers SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run();

    // Update permissions if provided
    if (permissions && Array.isArray(permissions)) {
      // Delete existing permissions
      await env.KUDDL_DB.prepare(
        'DELETE FROM service_worker_permissions WHERE worker_id = ?'
      ).bind(worker_id).run();

      // Create new permissions
      for (const perm of permissions) {
        const permId = `perm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await env.KUDDL_DB.prepare(`
          INSERT INTO service_worker_permissions (
            id, worker_id, permission_type, resource_id, can_view, can_edit, can_delete, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).bind(
          permId, worker_id, perm.permission_type, perm.resource_id || null,
          perm.can_view ? 1 : 0, perm.can_edit ? 1 : 0, perm.can_delete ? 1 : 0
        ).run();
      }
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Service worker updated successfully'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('Update service worker error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to update service worker',
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// Delete service worker
export async function deleteServiceWorker(request, env) {
  try {
    const url = new URL(request.url);
    const workerId = url.searchParams.get('worker_id');

    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authorization required'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    const token = authHeader.replace('Bearer ', '');
    
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (!isValid) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid token'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    const decoded = jwt.decode(token);
    const providerId = decoded.payload.partnerId || decoded.payload.id;

    // Verify worker belongs to this provider
    const worker = await env.KUDDL_DB.prepare(
      'SELECT id FROM service_workers WHERE id = ? AND provider_id = ?'
    ).bind(workerId, providerId).first();

    if (!worker) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Service worker not found'
      }), { status: 404, headers: { 'Content-Type': 'application/json' } }));
    }

    // Delete permissions first (CASCADE should handle this, but being explicit)
    await env.KUDDL_DB.prepare(
      'DELETE FROM service_worker_permissions WHERE worker_id = ?'
    ).bind(workerId).run();

    // Delete worker
    await env.KUDDL_DB.prepare(
      'DELETE FROM service_workers WHERE id = ?'
    ).bind(workerId).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Service worker deleted successfully'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('Delete service worker error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to delete service worker',
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// Service worker login
export async function serviceWorkerLogin(request, env) {
  try {
    const { username, password, phone, email } = await request.json();

    const identifier = username || phone || email;
    if (!identifier || !password) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Username/phone/email and password are required'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    // Get worker by username OR phone OR email
    const worker = await env.KUDDL_DB.prepare(`
      SELECT sw.*, p.business_name, p.name as provider_name
      FROM service_workers sw
      JOIN providers p ON sw.provider_id = p.id
      WHERE (sw.username = ? OR sw.phone = ? OR sw.email = ?) AND sw.is_active = 1
    `).bind(identifier, identifier, identifier).first();

    if (!worker) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid credentials'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, worker.password_hash);
    if (!passwordMatch) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid credentials'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    // Get permissions
    const permissions = await env.KUDDL_DB.prepare(`
      SELECT permission_type, resource_id, can_view, can_edit, can_delete
      FROM service_worker_permissions
      WHERE worker_id = ?
    `).bind(worker.id).all();

    // Generate JWT token
    const token = await jwt.sign(
      {
        workerId: worker.id,
        providerId: worker.provider_id,
        username: worker.username,
        role: 'service_worker',
        exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60)
      },
      env.JWT_SECRET
    );

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      token,
      user: {
        id: worker.id,
        username: worker.username,
        full_name: worker.full_name,
        email: worker.email,
        phone: worker.phone,
        role: 'service_worker',
        provider_id: worker.provider_id,
        provider_name: worker.business_name || worker.provider_name,
        permissions: permissions.results || []
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('Service worker login error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Login failed',
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// Check if a phone/email/username belongs to a service worker (public, no auth)
export async function checkIsServiceWorker(request, env) {
  try {
    const url = new URL(request.url);
    const identifier = url.searchParams.get('phone') || url.searchParams.get('email') || url.searchParams.get('username');

    if (!identifier) {
      return addCorsHeaders(new Response(JSON.stringify({ is_service_worker: false }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      }));
    }

    const worker = await env.KUDDL_DB.prepare(`
      SELECT id FROM service_workers
      WHERE (phone = ? OR email = ? OR username = ?) AND is_active = 1
      LIMIT 1
    `).bind(identifier, identifier, identifier).first();

    return addCorsHeaders(new Response(JSON.stringify({
      is_service_worker: !!worker
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    return addCorsHeaders(new Response(JSON.stringify({ is_service_worker: false }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get worker permissions
export async function getWorkerPermissions(request, env) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authorization required'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    const token = authHeader.replace('Bearer ', '');
    
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (!isValid) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid token'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    const decoded = jwt.decode(token);
    
    if (decoded.payload.role !== 'service_worker') {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Not a service worker'
      }), { status: 403, headers: { 'Content-Type': 'application/json' } }));
    }

    const permissions = await env.KUDDL_DB.prepare(`
      SELECT permission_type, resource_id, can_view, can_edit, can_delete
      FROM service_worker_permissions
      WHERE worker_id = ?
    `).bind(decoded.payload.workerId).all();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      permissions: permissions.results || []
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('Get worker permissions error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch permissions',
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}
