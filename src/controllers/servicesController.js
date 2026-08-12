/**
 * Services Controller
 * Handles service-related API endpoints
 */

import jwt from '@tsndr/cloudflare-worker-jwt';
import bcrypt from 'bcryptjs';
import { addCorsHeaders } from '../utils/cors.js';
import { getPublicR2Url } from '../utils/r2Utils.js';
import { insertBatch } from './batchesController.js';
import { extractServiceExtras } from '../utils/helpers.js';
import { validateServiceName, findBannedWords } from '../utils/serviceValidation.js';

// Parse a JSON column safely — returns the fallback on null/invalid instead of throwing.
function safeJson(v, fallback) {
  if (v == null) return fallback;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

// Get service categories endpoint
export async function getServiceCategories(request, env) {
  try {
    // Get all active categories from DB
    const categories = await env.KUDDL_DB.prepare(`
      SELECT * FROM categories 
      WHERE status = 'active' 
      ORDER BY display_order ASC, name ASC
    `).all();

    const dbCategories = categories.results || [];

    const url = new URL(request.url);
    const module = url.searchParams.get('module');

    let filteredCategories = dbCategories;
    if (module) {
      filteredCategories = dbCategories.filter(cat => cat.module === module.toUpperCase());
    }

    // Group by module
    const groupedCategories = {};
    filteredCategories.forEach(category => {
      if (!groupedCategories[category.module]) {
        groupedCategories[category.module] = [];
      }
      groupedCategories[category.module].push(category);
    });

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: {
        categories: filteredCategories,
        grouped: groupedCategories
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
  } catch (error) {
    console.error('Service categories fetch error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: {
        categories: [],
        grouped: {}
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get services endpoint
export async function getServices(request, env) {
  try {
    // Get user from token for partner-specific services
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: true,
        data: [] // Return empty array instead of error for missing auth
      }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const token = authHeader.substring(7);
    // `verify()` resolves to a boolean — the claims come from `decode()`.
    const isValid = await jwt.verify(token, env.JWT_SECRET);

    if (!isValid) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: true,
        data: [] // Return empty array instead of error
      }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const payload = jwt.decode(token)?.payload || {};

    // Check if services table exists, if not return empty array
    try {
      const checkTableQuery = `SELECT name FROM sqlite_master WHERE type='table' AND name='services'`;
      const tableExists = await env.KUDDL_DB.prepare(checkTableQuery).first();
      
      if (!tableExists) {
        console.log('Services table does not exist, returning empty array');
        return addCorsHeaders(new Response(JSON.stringify({
          success: true,
          data: []
        }), {
          headers: { 'Content-Type': 'application/json' }
        }));
      }

      // Get provider ID with same fallback logic as service creation
      let providerId = payload.id || payload.user_id || payload.userId || payload.sub;

      // If still no ID, check if it's nested in user object
      if (!providerId && payload.user) {
        providerId = payload.user.id || payload.user.user_id || payload.user.userId;
      }

      // If still no provider ID, try to find it using email from JWT
      if (!providerId && payload.email) {
        console.log('🔍 No ID in JWT for services, trying to find provider by email:', payload.email);
        try {
          const providerByEmail = await env.KUDDL_DB.prepare(`
            SELECT id FROM providers WHERE email = ?
          `).bind(payload.email).first();

          if (providerByEmail) {
            providerId = providerByEmail.id;
            console.log('✅ Found provider ID by email for services:', providerId);
          }
        } catch (error) {
          console.error('❌ Error finding provider by email for services:', error);
        }
      }

      // NOTE: there used to be a "final fallback" here that grabbed an arbitrary
      // active partner (`WHERE is_active = 1 ... LIMIT 1`) when the token yielded no
      // id — which served ANOTHER partner's services to the caller. Fail closed instead.
      if (!providerId) {
        return addCorsHeaders(new Response(JSON.stringify({
          success: false,
          message: 'Unable to identify provider from token. Please login again.',
          data: []
        }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
      }

      // Query for partner's services with category details
      const query = `
        SELECT 
          s.*,
          c.name as category_name
        FROM services s
        LEFT JOIN categories c ON s.category_id = c.id
        WHERE s.provider_id = ? AND s.status = 'active'
        ORDER BY s.created_at DESC
      `;

      const servicesStmt = env.KUDDL_DB.prepare(query);
      const services = await servicesStmt.bind(providerId).all();

      return addCorsHeaders(new Response(JSON.stringify({
        success: true,
        data: services.results || []
      }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    } catch (dbError) {
      console.log('Database error, returning empty services:', dbError);
      return addCorsHeaders(new Response(JSON.stringify({
        success: true,
        data: []
      }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    }
  } catch (error) {
    console.error('Services fetch error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: [] // Return empty array instead of error
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get my services endpoint (for providers - only their own services)
export async function getMyServices(request, env) {
  try {
    console.log('=== GET MY SERVICES REQUEST ===');
    
    // Get user from token
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ No authorization header found');
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authorization token required'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const token = authHeader.substring(7);
    console.log('🔑 Verifying JWT token...');
    
    // Verify token is valid
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (!isValid) {
      console.log('❌ JWT verification failed');
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid or expired token. Please login again.',
        data: []
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    
    // Decode token to get payload
    const decoded = jwt.decode(token);
    console.log('✅ JWT decoded successfully. Full payload:', JSON.stringify(decoded.payload));
    
    // Extract provider ID from decoded token payload
    const payload = decoded.payload || decoded;
    let providerId = payload.id || payload.sub || payload.userId || payload.provider_id;
    
    // Fail closed. (There used to be an unreachable "grab any active partner"
    // fallback below this — a landmine that would have served another partner's
    // services if this guard were ever reordered. Removed.)
    if (!providerId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid token: Provider ID not found. Please login again.',
        data: []
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Verify provider exists
    const providerStmt = env.KUDDL_DB.prepare('SELECT id FROM providers WHERE id = ?');
    const provider = await providerStmt.bind(providerId).first();
    
    if (!provider) {
      console.log('❌ Provider not found:', providerId);
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Provider profile not found',
        data: []
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    
    console.log('✅ Provider verified:', providerId);
    console.log('🔍 Fetching services for provider:', providerId);
    
    // Fetch only services for this provider
    const query = `
      SELECT 
        s.*,
        c.name as category_name
      FROM services s
      LEFT JOIN categories c ON s.category_id = c.id
      WHERE s.provider_id = ?
      ORDER BY s.created_at DESC
    `;
    
    console.log('📋 Executing query with provider_id:', providerId);
    const servicesStmt = env.KUDDL_DB.prepare(query);
    const services = await servicesStmt.bind(providerId).all();
    
    console.log(`✅ Found ${services.results?.length || 0} services for provider ${providerId}`);
    
    // Convert R2 URLs to public URLs for each service
    const servicesWithPublicUrls = (services.results || []).map(service => {
      const convertedService = { ...service };
      
      // Convert primary image URL
      if (service.primary_image_url) {
        convertedService.primary_image_url = getPublicR2Url(service.primary_image_url, env);
      }
      
      // Convert image URLs array
      if (service.image_urls) {
        try {
          const imageUrls = typeof service.image_urls === 'string' 
            ? JSON.parse(service.image_urls) 
            : service.image_urls;
          
          if (Array.isArray(imageUrls)) {
            convertedService.image_urls = imageUrls.map(url => 
              url ? getPublicR2Url(url, env) : url
            );
          }
        } catch (error) {
          console.warn('Error parsing image_urls for service:', service.id, error);
          convertedService.image_urls = [];
        }
      }
      
      return convertedService;
    });
    
    if (servicesWithPublicUrls.length > 0) {
      console.log('📋 First service with converted URLs:', JSON.stringify(servicesWithPublicUrls[0]));
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: servicesWithPublicUrls
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
  } catch (error) {
    console.error('❌ My services fetch error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch your services',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Create service endpoint
export async function createService(request, env) {
  try {
    // Enable foreign key constraints
    await env.KUDDL_DB.prepare('PRAGMA foreign_keys = ON').run();
    
    console.log('=== CREATE SERVICE REQUEST STARTED ===');
    console.log('Request method:', request.method);
    console.log('Request headers:', Object.fromEntries(request.headers.entries()));
    
    // Get user from token
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ No authorization header found');
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authorization token required'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const token = authHeader.substring(7);
    console.log('🔑 Verifying JWT token for service creation...');
    
    // Verify token is valid
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (!isValid) {
      console.log('❌ JWT verification failed');
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid or expired token. Please login again.'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    
    // Decode token to get provider ID
    const decoded = jwt.decode(token);
    const jwtRole = decoded?.payload?.role;
    const jwtProviderId = decoded?.payload?.id || decoded?.payload?.userId;
    
    const serviceData = await request.json();

    // Admin can create a service on behalf of any partner by supplying provider_id in body
    const providerId = (jwtRole === 'admin' && serviceData.provider_id) ? serviceData.provider_id : jwtProviderId;
    
    if (!providerId) {
      console.error('❌ No provider ID found in JWT token');
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid token. Please logout and login again.'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }
    
    console.log('✅ Provider ID resolved:', providerId, jwtRole === 'admin' ? '(admin override)' : '(from JWT)');
    console.log('📦 Received service data:', JSON.stringify(serviceData, null, 2));
    console.log('🖼️ Image URLs received:', serviceData.image_urls);
    console.log('🖼️ Primary image URL received:', serviceData.primary_image_url);
    
    const {
      name, description, category_id, subcategory_id, subcategory_label, price_type, price,
      duration_minutes, features, special_requirements, cancellation_policy,
      available_pincodes, age_group_min, age_group_max, max_children,
      status: requestStatus // Extract status from request (draft, submitted, active)
    } = serviceData;
    
    console.log('🔍 DEBUGGING - Extracted category_id:', category_id);
    console.log('🔍 DEBUGGING - Raw serviceData.category_id:', serviceData.category_id);
    console.log('🔍 DEBUGGING - All serviceData keys:', Object.keys(serviceData));
  
    if (!name || !category_id || !price_type) {

      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Service name is required'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    if (!category_id.trim()) {
      console.log('❌ Category ID is required');
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Category ID is required'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    if (!price_type.trim()) {
      console.log('❌ Price type is required');
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Price type is required'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    // Allow free services (price 0). Only reject missing/negative/non-numeric prices.
    if (price === undefined || price === null || price === '' || isNaN(Number(price)) || Number(price) < 0) {
      console.log('❌ Valid price is required');
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Valid price is required (0 or greater)'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    // ── PRD content rules (Partner Mockups §B/G): service name ≤ 60 chars and
    // no banned words in the name or description. Rejected on save so a bad
    // listing can never render on the customer site.
    const nameCheck = validateServiceName(name);
    if (!nameCheck.valid) {
      console.log('❌ Service name rejected:', nameCheck.error);
      return addCorsHeaders(new Response(JSON.stringify({
        success: false, message: nameCheck.error,
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }
    const bannedInDescription = findBannedWords(description || '');
    if (bannedInDescription.length) {
      console.log('❌ Description contains banned words:', bannedInDescription);
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: `Description contains not-allowed words/claims: ${bannedInDescription.join(', ')}. Remove them and try again.`,
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    console.log('✅ All required fields validated successfully');


    // Verify provider exists and is active
    console.log('🔍 Verifying provider record:', providerId);
    const providerStmt = env.KUDDL_DB.prepare('SELECT id, is_active FROM providers WHERE id = ?');
    const provider = await providerStmt.bind(providerId).first();
    
    if (!provider) {
      console.log('❌ Provider not found:', providerId);
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Provider profile not found. Please login again.'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    
    if (!provider.is_active) {
      console.log('❌ Provider is not active:', providerId);
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Your provider account is not active. Please contact support.'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    
    console.log('✅ Provider verified:', provider.id);
    
    // Verify category exists — accept id, slug, or name (clients may send any of these)
    console.log('🔍 Verifying category:', category_id);
    const categoryStmt = env.KUDDL_DB.prepare(
      'SELECT id FROM categories WHERE id = ? OR slug = ? OR LOWER(name) = LOWER(?)'
    );
    let category = await categoryStmt.bind(category_id, category_id, category_id).first();

    if (!category) {
      console.log('❌ Category not found:', category_id);
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: `Category '${category_id}' not found. Please select a valid category.`
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Use the canonical category id for the insert (e.g. "cat_adventure")
    const resolvedCategoryId = category.id;
    console.log('✅ Category verified:', resolvedCategoryId);

    // Resolve subcategory against the subcategories table — match by id, slug, or
    // name. The wizard may send a synthetic id, so also try the human-readable
    // subcategory_label as a name match.
    let resolvedSubcategoryId = null;
    const subLookup = env.KUDDL_DB.prepare(
      'SELECT id FROM subcategories WHERE id = ? OR slug = ? OR LOWER(name) = LOWER(?)'
    );
    if (subcategory_id) {
      const sub = await subLookup.bind(subcategory_id, subcategory_id, subcategory_id).first();
      if (sub) resolvedSubcategoryId = sub.id;
    }
    if (!resolvedSubcategoryId && subcategory_label) {
      const sub = await subLookup.bind(subcategory_label, subcategory_label, subcategory_label).first();
      if (sub) resolvedSubcategoryId = sub.id;
    }
    if (!resolvedSubcategoryId) {
      console.log('⚠️ Subcategory not resolved, storing null:', subcategory_id, subcategory_label);
    }
    
    const serviceId = `service_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Extract additional fields from service data
    const {
      image_urls, primary_image_url
    } = serviceData;
    
    
    // Generate slug from service name
    const serviceName = name || 'Untitled Service';
    const slug = serviceName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      + '-' + Date.now();
    
    // INSERT with available columns (match actual database schema)
    const insertStmt = env.KUDDL_DB.prepare(`
      INSERT INTO services (
        id, provider_id, category_id, subcategory_id, name, slug, description,
        price_type, price, duration_minutes, special_requirements, cancellation_policy,
        features, available_pincodes, image_urls, primary_image_url,
        partner_approved, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Prepare image URLs for database
    const imageUrlsJson = JSON.stringify(Array.isArray(image_urls) ? image_urls : []);
    const primaryImageUrl = primary_image_url || null;


    // Ensure all values are properly defined with strict validation
    const bindValues = [
      serviceId || `service_${Date.now()}`,
      providerId, // Use the provider ID from JWT token (providers.id)
      resolvedCategoryId,
      resolvedSubcategoryId,
      serviceName,
      slug,
      description || 'No description provided',
      price_type || 'hourly',
      parseFloat(price) || 0,
      parseInt(duration_minutes) || 60,
      special_requirements || '',
      cancellation_policy || '',
      JSON.stringify(features || {}),
      JSON.stringify(Array.isArray(available_pincodes) ? available_pincodes : []),
      imageUrlsJson,
      primaryImageUrl,
      0, // partner_approved: new services start unapproved — partner must approve before customers see them
      requestStatus || 'active', // Use status from request or default to 'active'
      new Date().toISOString(),
      new Date().toISOString()
    ];
    try {
      console.log('⚡ Executing INSERT with provider_id:', bindValues[1]);
      await insertStmt.bind(...bindValues).run();
      console.log('✅ Service inserted successfully with provider_id:', bindValues[1]);
    } catch (insertError) {
      console.error('❌ Insert error:', insertError);
      console.error('❌ Insert error details:', JSON.stringify(insertError));
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Failed to insert service into database',
        error: insertError.message,
        details: insertError.toString()
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Structured Bloom pricing (Screen C) — additive: only when the partner
    // sends it, and guarded so a missing column can never fail a create.
    // The read path parses this + reuses batches to assemble the Bloom shape;
    // an incomplete listing is flagged (assembleBloom), never rendered blank.
    if (serviceData.bloom_pricing) {
      try {
        const bp = typeof serviceData.bloom_pricing === 'string'
          ? JSON.parse(serviceData.bloom_pricing) : serviceData.bloom_pricing;
        await env.KUDDL_DB.prepare('UPDATE services SET bloom_pricing = ? WHERE id = ?')
          .bind(JSON.stringify(bp), serviceId).run();
        console.log('✅ Bloom pricing saved for', serviceId);
      } catch (e) {
        console.warn('bloom_pricing not saved (column missing or bad JSON):', e.message);
      }
    }

    // Adventure (parties) — one JSON blob holding variants + add-ons +
    // setup questions + ages/capacity/space. Parties have NO batches; the read
    // path parses this and assembleAdventure flags an incomplete listing rather
    // than rendering blanks. Additive UPDATE, guarded like bloom_pricing.
    if (serviceData.adventure_pricing) {
      try {
        const ap = typeof serviceData.adventure_pricing === 'string'
          ? JSON.parse(serviceData.adventure_pricing) : serviceData.adventure_pricing;
        await env.KUDDL_DB.prepare('UPDATE services SET adventure_pricing = ? WHERE id = ?')
          .bind(JSON.stringify(ap), serviceId).run();
        console.log('✅ Adventure pricing saved for', serviceId);
      } catch (e) {
        console.warn('adventure_pricing not saved (column missing or bad JSON):', e.message);
      }
    }

    // Care (specialists) — one JSON blob holding session price + packages +
    // claimed title + registration number + ages. The protected-title gate is
    // applied on READ from the provider's verified state, never from this JSON.
    if (serviceData.care_pricing) {
      try {
        const cp = typeof serviceData.care_pricing === 'string'
          ? JSON.parse(serviceData.care_pricing) : serviceData.care_pricing;
        await env.KUDDL_DB.prepare('UPDATE services SET care_pricing = ? WHERE id = ?')
          .bind(JSON.stringify(cp), serviceId).run();
        console.log('✅ Care pricing saved for', serviceId);
      } catch (e) {
        console.warn('care_pricing not saved (column missing or bad JSON):', e.message);
      }
    }

    // Camp Architecture v2.0 — create ONE batch row per wizard schedule.
    // Bloom sends multiple batches (features.schedules); each is a separately
    // bookable batch with its OWN age band / time / days / seats / mode, so the
    // customer detail (which reads the batches table) shows every one of them.
    // Other flows send a single schedule (or none) and still get one batch.
    let batchId = null;
    const batchIds = [];
    try {
      const f = (typeof features === 'object' && features) || {};
      const scheds = Array.isArray(f.schedules) && f.schedules.length
        ? f.schedules
        : [f.schedule || {}];
      for (const sched of scheds) {
        // Bloom writes mode(s) per-batch as `modes` (['offline'] / ['offline','online']);
        // older/other flows send a service-wide `mode`.
        const modes = Array.isArray(sched.modes) ? sched.modes : null;
        const mode = modes
          ? (modes.length >= 2 ? 'hybrid' : (modes[0] || 'offline'))
          : (sched.mode || f.mode || 'offline');
        const bId = await insertBatch(env, {
          parent_type: 'service',
          parent_id: serviceId,
          provider_id: providerId,
          batch_name: sched.name || f.variant_name || f.batch_name || serviceName,
          mode,
          // Per-batch age band (Bloom "banded"); fall back to the service age.
          age_min: sched.age_min ?? f.age_min ?? age_group_min ?? null,
          age_max: sched.age_max ?? f.age_max ?? age_group_max ?? null,
          pincodes: Array.isArray(available_pincodes) ? available_pincodes : [],
          total_seats: sched.capacity_override ?? f.cohort_capacity ?? f.per_session_capacity ?? null,
          per_session_override: null,
          cancellation_policy: cancellation_policy || 'flexible',
          booking_cutoff_hours: f.booking_cutoff_hours ?? 24,
          instructor: sched.instructor || f.instructor || null,
          what_to_bring: f.what_to_bring || null,
          price: parseFloat(price) || 0,
          price_type: price_type || null,
          schedule: sched || {},
          features: f,
          status: 'live',
        });
        batchIds.push(bId);
      }
      batchId = batchIds[0] || null;
    } catch (batchError) {
      console.error('⚠️ Service created but batch insert failed:', batchError);
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Service created successfully',
      serviceId,
      batchId
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
  } catch (error) {
    console.error('❌ Service creation error:', error);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Error message:', error.message);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to create service',
      error: error.message,
      details: error.stack
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Add provider endpoint
export async function addProvider(request, env) {
  try {
    console.log('=== ADD PROVIDER REQUEST STARTED ===');

    // Get user from token
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
    // `verify()` resolves to a boolean — the claims come from `decode()`, so the
    // old `decoded.email` check compared `undefined` and always rejected.
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    const payload = isValid ? (jwt.decode(token)?.payload || {}) : {};

    // Check if user is admin (accept either convention used in this codebase)
    if (!isValid || (payload.role !== 'admin' && payload.email !== 'admin@kuddl.co')) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Admin access required'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const providerData = await request.json();
    console.log('Received provider data:', providerData);
    
    const {
      email, first_name, last_name, business_name, phone, password, document_url
    } = providerData;

    // Validate required fields
    if (!email || !first_name || !last_name || !password) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Email, first name, last name, and password are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Check if provider already exists
    const existingProvider = await env.KUDDL_DB.prepare(
      'SELECT id FROM providers WHERE email = ?'
    ).bind(email).first();

    if (existingProvider) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Provider with this email already exists'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);
    
    const providerId = `provider_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Insert provider
    await env.KUDDL_DB.prepare(`
      INSERT INTO providers (
        id, email, phone, password_hash, first_name, last_name, business_name, 
        description, kyc_status, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 1, ?, ?)
    `).bind(
      providerId,
      email,
      phone || '',
      passwordHash,
      first_name,
      last_name,
      business_name || '',
      `Provider: ${first_name} ${last_name}`,
      new Date().toISOString(),
      new Date().toISOString()
    ).run();

    console.log('✅ Provider created successfully');

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Provider added successfully',
      providerId,
      document_url: document_url || null
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Provider creation error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to add provider',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get providers endpoint
export async function getProviders(request, env) {
  try {
    // Get user from token
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

    const providers = await env.KUDDL_DB.prepare(
      'SELECT * FROM providers ORDER BY created_at DESC'
    ).all();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      providers: providers.results || []
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Get providers error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch providers',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

export async function getEarnings(request, env) {
  try {
    // Get user from token
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

    // Mock earnings data for now
    const earningsData = {
      totalEarnings: 25000,
      thisMonth: 8500,
      lastMonth: 7200,
      pendingPayments: 2300,
      completedBookings: 45,
      averageRating: 4.8,
      monthlyData: [
        { month: 'Jan', earnings: 5200 },
        { month: 'Feb', earnings: 6800 },
        { month: 'Mar', earnings: 7200 },
        { month: 'Apr', earnings: 8500 }
      ],
      recentTransactions: [
        { id: 1, date: '2024-04-15', amount: 1200, service: 'Childcare Service', status: 'completed' },
        { id: 2, date: '2024-04-14', amount: 800, service: 'Tutoring', status: 'completed' },
        { id: 3, date: '2024-04-13', amount: 1500, service: 'Home Cleaning', status: 'pending' }
      ]
    };

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: earningsData
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
  } catch (error) {
    console.error('Earnings fetch error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch earnings data'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get pincode information
export async function getPincodeInfo(request, env) {
  try {
    const url = new URL(request.url);
    const pincode = url.pathname.split('/').pop();

    if (!pincode) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Pincode is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Get pincode information from database
    const pincodeInfo = await env.KUDDL_DB.prepare(
      'SELECT * FROM pincodes WHERE pincode = ? AND is_active = 1'
    ).bind(pincode).first();

    if (!pincodeInfo) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Pincode not found or not serviceable'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: {
        pincode: pincodeInfo.pincode,
        area: pincodeInfo.area,
        city: pincodeInfo.city,
        state: pincodeInfo.state,
        isServiceable: true
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Error getting pincode info:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to get pincode information',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get public services for customers (no authentication required)
export async function getPublicServices(request, env) {
  try {
    const url = new URL(request.url);
    const pincode = url.searchParams.get('pincode');
    const category = url.searchParams.get('category');
    const provider = url.searchParams.get('provider');
    const limit = parseInt(url.searchParams.get('limit')) || 50;

    // Check if services table exists
    try {
      const checkTableQuery = `SELECT name FROM sqlite_master WHERE type='table' AND name='services'`;
      const tableExists = await env.KUDDL_DB.prepare(checkTableQuery).first();
      
      if (!tableExists) {
        console.log('Services table does not exist, returning empty array');
        return addCorsHeaders(new Response(JSON.stringify({
          success: true,
          data: []
        }), {
          headers: { 'Content-Type': 'application/json' }
        }));
      }

      // Query for all services. Only admin-verified services are exposed publicly.
      let query = `
        SELECT
          s.id,
          s.name,
          s.description,
          s.category_id,
          c.name as category_name,
          c.module as category_module,
          s.subcategory_id,
          s.price_type,
          s.price,
          s.duration_minutes,
          s.features,
          s.available_pincodes,
          s.image_urls,
          s.primary_image_url,
          s.created_at,
          s.status,
          s.provider_id,
          p.name as provider_name,
          p.business_name,
          p.profile_picture as profile_image_url,
          p.city,
          p.state,
          p.address,
          p.pincode,
          p.experience_years
        FROM services s
        LEFT JOIN categories c ON s.category_id = c.id
        LEFT JOIN providers p ON s.provider_id = p.id
        WHERE s.status = 'active'
          AND COALESCE(s.partner_approved, 1) = 1
      `;

      const params = [];

      if (pincode) {
        // Include services available in the pincode OR services with no pincode restriction (available everywhere)
        query += ` AND (s.available_pincodes IS NULL OR s.available_pincodes = '[]' OR s.available_pincodes LIKE ?)`;
        params.push(`%${pincode}%`);
      }

      if (category) {
        query += ` AND (s.category_id = ? OR s.subcategory_id = ? OR s.category_id IN (SELECT category_id FROM subcategories WHERE id = ?))`;
        params.push(category, category, category);
      }

      if (provider) {
        query += ` AND s.provider_id = ?`;
        params.push(provider);
      }

      query += ` ORDER BY s.created_at DESC LIMIT ?`;
      params.push(limit);

      console.log('🔍 Final Query:', query);
      console.log('📋 Params:', params);

      let services;
      try {
        const servicesStmt = env.KUDDL_DB.prepare(query);
        services = await servicesStmt.bind(...params).all();
        console.log('📦 Services found:', services.results?.length || 0);
      } catch (queryError) {
        console.error('❌ SQL Query Error:', queryError);
        console.error('Query was:', query);
        console.error('Params were:', params);
        throw queryError;
      }

      // If no services found with pincode filter, return specific response
      if (pincode && (!services.results || services.results.length === 0)) {
        return addCorsHeaders(new Response(JSON.stringify({
          success: true,
          data: [],
          total: 0,
          message: `No services available in pincode ${pincode}`,
          no_services_available: true
        }), {
          headers: { 'Content-Type': 'application/json' }
        }));
      }

      // Transform services data
      const imageUrlsArray = service => {
        if (!service.image_urls) return [];
        return typeof service.image_urls === 'string' ? JSON.parse(service.image_urls) : service.image_urls;
      };
      
      const transformedServices = (services.results || []).map(service => {
        const parsedImageUrls = imageUrlsArray(service);
        
        // Debug provider data
        console.log(`🔍 Service: ${service.name}, Provider ID: ${service.provider_id}`);
        console.log(`   Provider Data: provider_name=${service.provider_name}, business_name=${service.business_name}`);
        
        return {
          id: service.id,
          provider_id: service.provider_id, // Add top-level provider_id for compatibility
          name: service.name,
          description: service.description,
          category: service.category_id,
          category_id: service.category_id,
          category_name: service.category_name || service.category_id,
          subcategory: service.subcategory_id,
          subcategory_id: service.subcategory_id,
          priceType: service.price_type,
          price_type: service.price_type,
          price: service.price,
          duration: service.duration_minutes,
          duration_minutes: service.duration_minutes,
          features: service.features ? (typeof service.features === 'string' ? JSON.parse(service.features) : service.features) : {},
          // Customer-facing extras extracted from features (display-only).
          ...extractServiceExtras(service.features),
          availablePincodes: service.available_pincodes ? (typeof service.available_pincodes === 'string' ? JSON.parse(service.available_pincodes) : service.available_pincodes) : [],
          available_pincodes: service.available_pincodes ? (typeof service.available_pincodes === 'string' ? JSON.parse(service.available_pincodes) : service.available_pincodes) : [],
          // Image fields - provide both formats for compatibility
          images: parsedImageUrls,
          image_urls: parsedImageUrls,
          primaryImage: service.primary_image_url || null,
          primary_image_url: service.primary_image_url || null,
          // Provider info
          provider_name: service.provider_name,
          business_name: service.business_name,
          average_rating: 4.5, // Default rating since column doesn't exist
          profile_image_url: service.profile_image_url,
          city: service.city,
          state: service.state,
          experience_years: service.experience_years,
          provider: {
            id: service.provider_id,
            name: service.provider_name,
            businessName: service.business_name,
            profileImage: service.profile_image_url,
            profile_image_url: service.profile_image_url,
            location: service.city && service.state ? `${service.city}, ${service.state}` : 'Available Nationwide',
            city: service.city || 'Available',
            state: service.state || 'Nationwide',
            address: service.address,
            pincode: service.pincode,
            average_rating: 4.5, // Default rating since column doesn't exist
            experience_years: service.experience_years || 0,
            business_name: service.business_name || 'Service Provider',
            serviceable_pincodes: service.serviceable_pincodes || ''
          },
          createdAt: service.created_at,
          created_at: service.created_at
        };
      });

      return addCorsHeaders(new Response(JSON.stringify({
        success: true,
        data: transformedServices,
        total: transformedServices.length
      }), {
        headers: { 'Content-Type': 'application/json' }
      }));

    } catch (dbError) {
      console.log('Database error in public services:', dbError);
      return addCorsHeaders(new Response(JSON.stringify({
        success: true,
        data: []
      }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    }
  } catch (error) {
    console.error('Public services fetch error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: []
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get top subcategories by booking count (public)
export async function getTopSubcategories(request, env) {
  try {
    const url = new URL(request.url);
    const pincode = url.searchParams.get('pincode');
    const rawLimit = parseInt(url.searchParams.get('limit') || '8', 10);
    const limit = Number.isNaN(rawLimit) ? 8 : Math.min(Math.max(rawLimit, 1), 20);

    // Query subcategories with their booking counts
    // Order by booking count (most popular first), then by sort_order
    // Join bookings through services table since bookings have service_id
    let query = `
      SELECT
        sc.id AS subcategory_id,
        sc.category_id,
        sc.name AS subcategory_name,
        sc.description,
        sc.icon,
        sc.image_url,
        COUNT(DISTINCT s.id) AS service_count,
        COUNT(DISTINCT b.id) AS booking_count
      FROM subcategories sc
      LEFT JOIN services s ON s.subcategory_id = sc.id AND COALESCE(s.is_active, 1) = 1
      LEFT JOIN bookings b ON b.service_id = s.id
      WHERE COALESCE(sc.is_active, 1) = 1
      GROUP BY sc.id, sc.category_id, sc.name, sc.description, sc.icon, sc.image_url
      ORDER BY booking_count DESC, service_count DESC, sc.sort_order ASC, sc.name ASC
      LIMIT ?
    `;
    const params = [limit];

    const result = await env.KUDDL_DB.prepare(query).bind(...params).all();
    const rows = result.results || [];

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: rows.map(row => ({
        subcategory_id: row.subcategory_id,
        category_id: row.category_id,
        subcategory_name: row.subcategory_name,
        description: row.description,
        icon: row.icon,
        image_url: row.image_url,
        service_count: row.service_count,
        booking_count: row.booking_count
      })),
      total: rows.length
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
  } catch (error) {
    console.error('Get top subcategories error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch top subcategories',
      error: error.message,
      data: []
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Delete service endpoint
export async function deleteService(request, env) {
  try {
    // Get service ID from URL
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const serviceId = pathParts[pathParts.length - 1];

    if (!serviceId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Service ID is required'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    // Verify JWT token
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authorization token required'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    const token = authHeader.substring(7);

    // NOTE: @tsndr/cloudflare-worker-jwt `verify()` resolves to a BOOLEAN, not the
    // payload — reading `.id` off it always gave undefined, which made every delete
    // fall through to an arbitrary "first active partner" and 403 the real owner.
    // Verify for authenticity, then `decode()` for the actual claims.
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (!isValid) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid or expired token'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    const payload = jwt.decode(token)?.payload || {};
    const isAdmin = payload.role === 'admin';
    let providerId = payload.id || payload.user_id || payload.userId || payload.sub;

    if (!providerId && payload.user) {
      providerId = payload.user.id || payload.user.user_id || payload.user.userId;
    }

    if (!providerId && payload.email) {
      try {
        const providerByEmail = await env.KUDDL_DB.prepare(`
          SELECT id FROM providers WHERE email = ?
        `).bind(payload.email).first();

        if (providerByEmail) {
          providerId = providerByEmail.id;
        }
      } catch (error) {
        console.error('❌ Error finding provider by email for delete:', error);
      }
    }

    // Admins act without a provider identity; partners must resolve to one.
    // (Never fall back to "some active partner" — that impersonates a real account.)
    if (!providerId && !isAdmin) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Unable to identify provider'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    // Check if service exists and belongs to this provider
    const service = await env.KUDDL_DB.prepare(`
      SELECT id, provider_id FROM services WHERE id = ?
    `).bind(serviceId).first();

    if (!service) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Service not found'
      }), { status: 404, headers: { 'Content-Type': 'application/json' } }));
    }

    // Admins can delete any service; partners only their own.
    if (!isAdmin && service.provider_id !== providerId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'You can only delete your own services'
      }), { status: 403, headers: { 'Content-Type': 'application/json' } }));
    }

    // Delete the service
    await env.KUDDL_DB.prepare(`
      DELETE FROM services WHERE id = ?
    `).bind(serviceId).run();

    console.log('✅ Service deleted successfully:', serviceId);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Service deleted successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Get public service by ID error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get actual service categories from database
export async function getDatabaseCategories(request, env) {
  try {
    // Check if services table exists first
    try {
      const checkTableQuery = `SELECT name FROM sqlite_master WHERE type='table' AND name='services'`;
      const tableExists = await env.KUDDL_DB.prepare(checkTableQuery).first();
      
      if (!tableExists) {
        console.log('Services table does not exist, returning empty array');
        return addCorsHeaders(new Response(JSON.stringify({
          success: true,
          categories: []
        }), {
          headers: { 'Content-Type': 'application/json' }
        }));
      }
    } catch (error) {
      console.error('Error checking services table:', error);
    }

    // Get unique categories from services table with counts
    const categoriesQuery = `
      SELECT 
        s.category_id,
        c.name as category_name,
        c.description as category_description,
        COUNT(*) as service_count
      FROM services s
      LEFT JOIN categories c ON s.category_id = c.id
      WHERE s.status = 'active' 
      GROUP BY s.category_id
      ORDER BY s.category_id
    `;

    const categoriesResult = await env.KUDDL_DB.prepare(categoriesQuery).all();
    
    const categories = [];
    
    if (categoriesResult.results && categoriesResult.results.length > 0) {
      categoriesResult.results.forEach(row => {
        const categoryId = row.category_id;
        const serviceCount = row.service_count;
        
        // Use name from DB if available, otherwise fallback to ID formatting (backward compatibility)
        let categoryName = row.category_name;
        if (!categoryName) {
           categoryName = categoryId
            .split(categoryId.includes('_') ? '_' : '-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
        }
        
        const categoryDescription = row.category_description || `${categoryName} services`;

        categories.push({
          id: categoryId,
          name: categoryName,
          description: categoryDescription,
          service_count: serviceCount
        });
      });
    }

    // If no categories found in database, return empty array
    if (categories.length === 0) {
      console.log('⚠️ No categories found in database');
      return addCorsHeaders(new Response(JSON.stringify({
        success: true,
        categories: []
      }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    console.log('✅ Found categories from database:', categories.length);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      categories
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Database categories fetch error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get single public service by ID (for booking page)
export async function getPublicServiceById(request, env) {
  try {
    const url = new URL(request.url);
    const serviceId = url.pathname.split('/').pop();

    if (!serviceId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Service ID is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Query for specific service with provider details
    // NB: providers table does NOT have `average_rating` — use COALESCE(rating, 0) instead.
    const service = await env.KUDDL_DB.prepare(`
      SELECT
        s.id,
        s.name,
        s.description,
        s.category_id,
        c.name as category_name,
        c.module as category_module,
        s.subcategory_id,
        s.price_type,
        s.price,
        s.duration_minutes,
        s.short_description,
        s.age_group,
        s.special_requirements,
        s.cancellation_policy,
        s.features,
        s.available_pincodes,
        s.image_urls,
        s.primary_image_url,
        s.bloom_pricing,
        s.adventure_pricing,
        s.care_pricing,
        s.created_at,
        s.provider_id,
        p.id as provider_db_id,
        p.name as provider_name,
        p.business_name,
        p.profile_picture as profile_image_url,
        p.city,
        p.state,
        COALESCE(p.rating, 0) as average_rating,
        p.experience_years
      FROM services s
      JOIN providers p ON s.provider_id = p.id
      LEFT JOIN categories c ON s.category_id = c.id
      WHERE s.id = ? AND s.status = 'active' AND p.is_active = 1 AND p.kyc_status = 'verified'
        AND COALESCE(s.partner_approved, 1) = 1
    `).bind(serviceId).first();

    if (!service) {
      // Fall back to the camps table — same route is used by the customer portal
      // for both service and camp detail pages.
      const camp = await env.KUDDL_DB.prepare(`
        SELECT
          k.*,
          c.name AS category_name,
          c.module AS category_module,
          p.id AS provider_db_id,
          p.name AS provider_name,
          p.business_name,
          p.profile_picture AS profile_image_url,
          p.city AS provider_city,
          p.state AS provider_state,
          p.average_rating,
          p.experience_years
        FROM camps k
        JOIN providers p ON k.provider_id = p.id
        LEFT JOIN categories c ON k.category_id = c.id
        WHERE k.id = ? AND k.status IN ('active','live')
          AND p.is_active = 1 AND p.kyc_status = 'verified'
      `).bind(serviceId).first();

      if (!camp) {
        return addCorsHeaders(new Response(JSON.stringify({
          success: false,
          message: 'Service not found or provider inactive'
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }));
      }

      const parse = (v, fb) => {
        if (v == null) return fb;
        if (typeof v !== 'string') return v;
        try { return JSON.parse(v); } catch { return fb; }
      };
      const imageUrls = parse(camp.image_urls, []);
      const features = parse(camp.features, []);
      const startDate = camp.start_date;
      const endDate = camp.end_date;
      let durationDays = camp.duration_days;
      if (!durationDays && startDate && endDate) {
        const s = new Date(startDate), e = new Date(endDate);
        if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
          durationDays = Math.max(1, Math.ceil((e - s) / 86400000) + 1);
        }
      }

      const campResponse = {
        id: camp.id,
        name: camp.title,
        description: camp.description,
        category: camp.category_id,
        categoryName: camp.category_name,
        categoryModule: camp.category_module,
        subcategory: camp.subcategory_id,
        priceType: camp.price_type,
        price: camp.price,
        duration: null,
        duration_days: durationDays,
        start_date: startDate,
        end_date: endDate,
        schedule_time: camp.schedule_start_time || camp.schedule_time || null,
        features: Array.isArray(features) ? features : [],
        availablePincodes: camp.pincode ? [String(camp.pincode)] : [],
        image_urls: Array.isArray(imageUrls) ? imageUrls : [],
        images: Array.isArray(imageUrls) ? imageUrls : [],
        primary_image_url: camp.primary_image_url || null,
        primaryImage: camp.primary_image_url || null,
        item_type: 'camp',
        provider: {
          id: camp.provider_id,
          businessName: camp.business_name,
          name: camp.provider_name || camp.business_name,
          profileImage: camp.profile_image_url,
          profile_image_url: camp.profile_image_url,
          location: `${camp.provider_city || ''}${camp.provider_state ? ', ' + camp.provider_state : ''}`,
          city: camp.provider_city,
          state: camp.provider_state,
          average_rating: camp.average_rating || 4.5,
          experience_years: camp.experience_years || 3,
          business_name: camp.business_name,
        },
        createdAt: camp.created_at,
      };

      return addCorsHeaders(new Response(JSON.stringify({
        success: true,
        data: campResponse,
      }), { headers: { 'Content-Type': 'application/json' } }));
    }

    // Verify category exists
    console.log('🔍 Verifying category:', service.category_id);
    const categoryStmt = env.KUDDL_DB.prepare('SELECT id FROM categories WHERE id = ?');
    let category = await categoryStmt.bind(service.category_id).first();
    
    if (!category) {
      console.log('❌ Category not found:', service.category_id);
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: `Category '${service.category_id}' not found. Please select a valid category.`
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    
    console.log('✅ Category verified:', category.id);

    // Transform service data
    const transformedService = {
      id: service.id,
      name: service.name,
      description: service.description,
      category: service.category_id,
      categoryName: service.category_name,
      categoryModule: service.category_module,
      subcategory: service.subcategory_id,
      priceType: service.price_type,
      price: service.price,
      duration: service.duration_minutes,
      shortDescription: service.short_description || null,
      ageGroup: service.age_group || null,
      specialRequirements: service.special_requirements || null,
      cancellationPolicy: service.cancellation_policy || null,
      features: service.features ? safeJson(service.features, {}) : {},
      // Customer-facing extras (trial offer, one-time registration fee, daycare) — display-only.
      ...extractServiceExtras(service.features),
      availablePincodes: service.available_pincodes ? safeJson(service.available_pincodes, []) : [],
      images: service.image_urls ? safeJson(service.image_urls, []) : [],
      primaryImage: service.primary_image_url || null,
      // Structured pricing blobs (parsed) so the detail page can render the full
      // Bloom/Adventure/Care shape when present.
      bloomPricing: service.bloom_pricing ? safeJson(service.bloom_pricing, null) : null,
      adventurePricing: service.adventure_pricing ? safeJson(service.adventure_pricing, null) : null,
      carePricing: service.care_pricing ? safeJson(service.care_pricing, null) : null,
      provider: {
        id: service.provider_id,
        businessName: service.business_name,
        name: service.provider_name || service.business_name,
        profileImage: service.profile_image_url,
        profile_image_url: service.profile_image_url,
        location: [service.city, service.state].filter(Boolean).join(', '),
        city: service.city,
        state: service.state,
        // Real values ONLY — no fake 4.5 rating / 3 years (§01 r4). Null when
        // there is nothing real to show; the UI hides these entirely.
        average_rating: Number(service.average_rating) > 0 ? Number(service.average_rating) : null,
        experience_years: Number(service.experience_years) > 0 ? Number(service.experience_years) : null,
        business_name: service.business_name
      },
      createdAt: service.created_at
    };

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: transformedService
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Get public service by ID error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get all services for admin (with provider info)
export async function getAllServicesForAdmin(request, env) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authorization required'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    const token = authHeader.substring(7);
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (!isValid) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid token'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    const decoded = jwt.decode(token);
    const userRole = decoded?.payload?.role;

    if (userRole !== 'admin') {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Admin access required'
      }), { status: 403, headers: { 'Content-Type': 'application/json' } }));
    }

    const services = await env.KUDDL_DB.prepare(`
      SELECT 
        s.*,
        p.name as provider_name,
        p.email as provider_email,
        p.phone as provider_phone
      FROM services s
      LEFT JOIN providers p ON s.provider_id = p.id
      ORDER BY s.created_at DESC
    `).all();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: services.results || []
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('Get all services error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch services',
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// Approve service (admin only)
export async function approveService(request, env) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authorization required'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    const token = authHeader.substring(7);
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (!isValid) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid token'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    const decoded = jwt.decode(token);
    const userRole = decoded?.payload?.role;

    if (userRole !== 'admin') {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Admin access required'
      }), { status: 403, headers: { 'Content-Type': 'application/json' } }));
    }

    const url = new URL(request.url);
    const serviceId = url.pathname.split('/').slice(-2)[0];
    const adminId = decoded?.payload?.id || decoded?.payload?.partnerId || null;

    await env.KUDDL_DB.prepare(
      `UPDATE services
         SET status = ?,
             is_verified = 1,
             verified_by = COALESCE(?, verified_by),
             verified_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
    ).bind('active', adminId, serviceId).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Service approved and made visible on the customer portal'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('Approve service error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to approve service',
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// Reject service (admin only)
export async function rejectService(request, env) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authorization required'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    const token = authHeader.substring(7);
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (!isValid) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid token'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    const decoded = jwt.decode(token);
    const userRole = decoded?.payload?.role;

    if (userRole !== 'admin') {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Admin access required'
      }), { status: 403, headers: { 'Content-Type': 'application/json' } }));
    }

    const url = new URL(request.url);
    const serviceId = url.pathname.split('/').slice(-2)[0];

    await env.KUDDL_DB.prepare(
      `UPDATE services
         SET status = ?,
             is_verified = 0,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
    ).bind('rejected', serviceId).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Service rejected and hidden from the customer portal'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('Reject service error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to reject service',
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// Update service endpoint (for status changes and edits)
export async function updateService(request, env) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authorization token required'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    const token = authHeader.substring(7);
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (!isValid) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid or expired token'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    const decoded = jwt.decode(token);
    const providerId = decoded?.payload?.id || decoded?.payload?.userId;
    const isAdmin = decoded?.payload?.role === 'admin';

    const url = new URL(request.url);
    const serviceId = url.pathname.split('/').pop();
    const updateData = await request.json();

    const service = await env.KUDDL_DB.prepare(
      'SELECT id, provider_id FROM services WHERE id = ?'
    ).bind(serviceId).first();

    if (!service) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Service not found'
      }), { status: 404, headers: { 'Content-Type': 'application/json' } }));
    }

    // Admins can edit any service; partners can edit only their own.
    if (!isAdmin && service.provider_id !== providerId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Unauthorized'
      }), { status: 403, headers: { 'Content-Type': 'application/json' } }));
    }

    // Whitelisted editable columns. Previously this endpoint only set `status`,
    // which silently dropped every other field the form sent — that's why edits
    // appeared to "do nothing" in the admin portal.
    // NOTE: age_group_min / age_group_max / max_children are NOT columns on
    // `services` — the wizard persists them inside `features` (age_min/age_max)
    // and reads fall back to that. Listing them here built an UPDATE referencing
    // non-existent columns, so every edit with an age range failed with
    // "Failed to update service". Keep this list to real columns only.
    const editableFields = [
      'name', 'description', 'category_id', 'subcategory_id',
      'price', 'price_type', 'duration_minutes',
      'features', 'available_pincodes',
      'image_urls', 'primary_image_url',
      'cancellation_policy', 'service_type_id',
      'special_requirements', 'status',
      'partner_approved',
      // Category money-shape blobs — without these, editing the trial / monthly
      // plan / makeup / party variants / care fields silently saved nothing.
      'bloom_pricing', 'adventure_pricing', 'care_pricing',
    ];
    // Resolve subcategory by id / slug / name (or the human-readable label)
    // so a synthetic id from the wizard still maps to a real subcategory row.
    if (updateData.subcategory_id !== undefined || updateData.subcategory_label) {
      const subLookup = env.KUDDL_DB.prepare(
        'SELECT id FROM subcategories WHERE id = ? OR slug = ? OR LOWER(name) = LOWER(?)'
      );
      let resolved = null;
      if (updateData.subcategory_id) {
        const s = await subLookup
          .bind(updateData.subcategory_id, updateData.subcategory_id, updateData.subcategory_id)
          .first();
        if (s) resolved = s.id;
      }
      if (!resolved && updateData.subcategory_label) {
        const s = await subLookup
          .bind(updateData.subcategory_label, updateData.subcategory_label, updateData.subcategory_label)
          .first();
        if (s) resolved = s.id;
      }
      updateData.subcategory_id = resolved;
    }

    const updates = [];
    const values = [];
    for (const field of editableFields) {
      if (updateData[field] === undefined) continue;
      let value = updateData[field];
      const jsonFields = ['features', 'image_urls', 'available_pincodes', 'bloom_pricing', 'adventure_pricing', 'care_pricing'];
      if (jsonFields.includes(field)) {
        value = typeof value === 'string' ? value : JSON.stringify(value ?? (Array.isArray(updateData[field]) ? [] : {}));
      } else if (
        (field === 'bloom_pricing' || field === 'adventure_pricing' || field === 'care_pricing')
        && value != null && typeof value === 'object'
      ) {
        // These are TEXT/JSON columns; a raw object can't be bound to D1.
        value = JSON.stringify(value);
      }
      updates.push(`${field} = ?`);
      values.push(value);
    }

    if (updates.length === 0) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'No editable fields provided',
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(serviceId);

    await env.KUDDL_DB.prepare(
      `UPDATE services SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run();

    // Re-sync batches from the wizard's features.schedules so edits to batches
    // (add / change / remove) actually reach the customer read path (which reads
    // the batches table). Archive the current live batches — existing bookings
    // keep their (now archived) batch row — then recreate one per schedule.
    try {
      const feats = updateData.features && typeof updateData.features === 'object'
        ? updateData.features
        : (typeof updateData.features === 'string' ? JSON.parse(updateData.features) : null);
      if (feats && Array.isArray(feats.schedules) && feats.schedules.length) {
        await env.KUDDL_DB.prepare(
          "UPDATE batches SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE parent_type = 'service' AND parent_id = ? AND status != 'archived'"
        ).bind(serviceId).run();
        const pincodes = Array.isArray(updateData.available_pincodes) ? updateData.available_pincodes : [];
        const priceNum = parseFloat(updateData.price) || 0;
        for (const sched of feats.schedules) {
          const modes = Array.isArray(sched.modes) ? sched.modes : null;
          const mode = modes ? (modes.length >= 2 ? 'hybrid' : (modes[0] || 'offline')) : (sched.mode || feats.mode || 'offline');
          await insertBatch(env, {
            parent_type: 'service',
            parent_id: serviceId,
            provider_id: service.provider_id,
            batch_name: sched.name || feats.variant_name || updateData.name || 'Batch',
            mode,
            age_min: sched.age_min ?? feats.age_min ?? null,
            age_max: sched.age_max ?? feats.age_max ?? null,
            pincodes,
            total_seats: sched.capacity_override ?? null,
            per_session_override: null,
            cancellation_policy: updateData.cancellation_policy || 'flexible',
            booking_cutoff_hours: feats.booking_cutoff_hours ?? 24,
            instructor: sched.instructor || feats.instructor || null,
            what_to_bring: feats.what_to_bring || null,
            price: priceNum,
            price_type: updateData.price_type || null,
            schedule: sched || {},
            features: feats,
            status: 'live',
          });
        }
      }
    } catch (batchSyncErr) {
      console.error('⚠️ Batch re-sync on update failed:', batchSyncErr?.message);
    }

    const updatedService = await env.KUDDL_DB.prepare(
      'SELECT * FROM services WHERE id = ?'
    ).bind(serviceId).first();

    // Camp Architecture v2.0 — re-sync the batches table on edit. The wizard
    // owns batches inside features.schedules, but the customer detail reads the
    // separate batches table, so an edit that changes schedules must rewrite
    // those rows or the customer keeps seeing the stale (or collapsed) batch
    // set. Only runs when the edit actually carries schedules, so status-only
    // edits never touch batches. booked_seats is preserved by position.
    try {
      const f = (updateData.features && typeof updateData.features === 'object')
        ? updateData.features : null;
      const scheds = f && Array.isArray(f.schedules) && f.schedules.length
        ? f.schedules : null;
      if (scheds) {
        const existing = await env.KUDDL_DB.prepare(
          'SELECT booked_seats FROM batches WHERE parent_type = ? AND parent_id = ? ORDER BY created_at ASC'
        ).bind('service', serviceId).all();
        const prevBooked = (existing?.results || []).map(r => r.booked_seats ?? 0);

        await env.KUDDL_DB.prepare(
          'DELETE FROM batches WHERE parent_type = ? AND parent_id = ?'
        ).bind('service', serviceId).run();

        let pincodes = [];
        if (Array.isArray(updateData.available_pincodes)) {
          pincodes = updateData.available_pincodes;
        } else if (updatedService.available_pincodes) {
          try { pincodes = JSON.parse(updatedService.available_pincodes) || []; } catch { pincodes = []; }
        }
        const svcPrice = updateData.price ?? updatedService.price;
        const svcPriceType = updateData.price_type ?? updatedService.price_type;
        const svcCancel = updateData.cancellation_policy || updatedService.cancellation_policy || 'flexible';

        let idx = 0;
        for (const sched of scheds) {
          const modes = Array.isArray(sched.modes) ? sched.modes : null;
          const mode = modes
            ? (modes.length >= 2 ? 'hybrid' : (modes[0] || 'offline'))
            : (sched.mode || f.mode || 'offline');
          await insertBatch(env, {
            parent_type: 'service',
            parent_id: serviceId,
            provider_id: service.provider_id || providerId,
            batch_name: sched.name || f.variant_name || f.batch_name || updatedService.name || '',
            mode,
            age_min: sched.age_min ?? f.age_min ?? null,
            age_max: sched.age_max ?? f.age_max ?? null,
            pincodes,
            total_seats: sched.capacity_override ?? f.cohort_capacity ?? f.per_session_capacity ?? null,
            per_session_override: null,
            cancellation_policy: svcCancel,
            booking_cutoff_hours: f.booking_cutoff_hours ?? 24,
            instructor: sched.instructor || f.instructor || null,
            what_to_bring: f.what_to_bring || null,
            price: parseFloat(svcPrice) || 0,
            price_type: svcPriceType || null,
            schedule: sched || {},
            features: f,
            status: 'live',
            booked_seats: prevBooked[idx] ?? 0,
          });
          idx++;
        }
      }
    } catch (batchError) {
      console.error('⚠️ Service updated but batch re-sync failed:', batchError);
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Service updated successfully',
      data: updatedService
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('Update service error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to update service',
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}
