/**
 * Services Controller
 * Handles service-related API endpoints
 */

import jwt from '@tsndr/cloudflare-worker-jwt';
import bcrypt from 'bcryptjs';
import { addCorsHeaders } from '../utils/cors.js';
import { getPublicR2Url } from '../utils/r2Utils.js';

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
    const decoded = await jwt.verify(token, env.JWT_SECRET);
    
    if (!decoded) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: true,
        data: [] // Return empty array instead of error
      }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    }

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
      let providerId = decoded.id || decoded.user_id || decoded.userId || decoded.sub;
      
      // If still no ID, check if it's nested in user object
      if (!providerId && decoded.user) {
        providerId = decoded.user.id || decoded.user.user_id || decoded.user.userId;
      }
      
      // If still no provider ID, try to find it using email from JWT
      if (!providerId && decoded.email) {
        console.log('🔍 No ID in JWT for services, trying to find provider by email:', decoded.email);
        try {
          const providerByEmail = await env.KUDDL_DB.prepare(`
            SELECT id FROM providers WHERE email = ?
          `).bind(decoded.email).first();
          
          if (providerByEmail) {
            providerId = providerByEmail.id;
            console.log('✅ Found provider ID by email for services:', providerId);
          }
        } catch (error) {
          console.error('❌ Error finding provider by email for services:', error);
        }
      }
      
      // Final fallback: get any active partner from database
      if (!providerId) {
        try {
          const activePartner = await env.KUDDL_DB.prepare(`
            SELECT id FROM providers WHERE is_active = 1 AND kyc_status = 'verified' LIMIT 1
          `).first();
          
          if (activePartner) {
            providerId = activePartner.id;
            console.log('✅ Using active partner ID as fallback for services:', providerId);
          }
        } catch (error) {
          console.error('❌ Error getting active partner for services:', error);
        }
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
    
    if (!providerId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid token: Provider ID not found. Please login again.',
        data: [],
        debug: { payload }
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    
    // Final fallback: get any active partner from database
    if (!providerId) {
      try {
        const activePartner = await env.KUDDL_DB.prepare(`
          SELECT id FROM providers WHERE is_active = 1 AND kyc_status = 'verified' LIMIT 1
        `).first();
        if (activePartner) {
          providerId = activePartner.id;
        }
      } catch (error) {
        // error getting active partner
      }
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
    
    const serviceData = await request.json();
    console.log('📦 Received service data:', JSON.stringify(serviceData, null, 2));
    console.log('🖼️ Image URLs received:', serviceData.image_urls);
    console.log('🖼️ Primary image URL received:', serviceData.primary_image_url);
    
    const {
      name, description, category_id, subcategory_id, price_type, price,
      duration_minutes, features, special_requirements, cancellation_policy,
      available_pincodes, age_group_min, age_group_max, max_children,
      provider_id // Extract provider_id from request body (from localStorage)
    } = serviceData;
    
    console.log('🔍 DEBUGGING - Extracted category_id:', category_id);
    console.log('🔍 DEBUGGING - Raw serviceData.category_id:', serviceData.category_id);
    console.log('🔍 DEBUGGING - All serviceData keys:', Object.keys(serviceData));
    
    console.log('📋 Provider ID from request body:', provider_id);
  
    if (!name || !category_id || !price_type || !price) {

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

    if (!price || price <= 0) {
      console.log('❌ Valid price is required');
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Valid price is required'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    console.log('✅ All required fields validated successfully');
    
    // Use provider_id from request body (sent from frontend localStorage)
    const providerId = provider_id;
    

    if (!providerId) {
      console.error('❌ No provider ID provided in request');
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Provider ID is required. Please logout and login again.'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }
    

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
    
    // Verify category exists
    console.log('🔍 Verifying category:', category_id);
    const categoryStmt = env.KUDDL_DB.prepare('SELECT id FROM categories WHERE id = ?');
    let category = await categoryStmt.bind(category_id).first();
    
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
    
    console.log('✅ Category verified:', category.id);
    
    const serviceId = `service_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Extract additional fields from service data
    const {
      image_urls, primary_image_url
    } = serviceData;
    
    
    // INSERT with available columns (match actual database schema)
    const insertStmt = env.KUDDL_DB.prepare(`
      INSERT INTO services (
        id, provider_id, category_id, subcategory_id, name, description,
        price_type, price, duration_minutes, special_requirements, cancellation_policy,
        features, available_pincodes, images,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Prepare image URLs for database
    const imageUrlsJson = JSON.stringify(Array.isArray(image_urls) ? image_urls : []);
    const primaryImageUrl = primary_image_url || null;
    

    // Ensure all values are properly defined with strict validation
    const bindValues = [
      serviceId || `service_${Date.now()}`,
      providerId, // Use the provider ID from JWT token (providers.id)
      category_id,
      subcategory_id || null,
      name || 'Untitled Service',
      description || 'No description provided',
      price_type || 'hourly',
      parseFloat(price) || 0,
      parseInt(duration_minutes) || 60,
      special_requirements || '',
      cancellation_policy || '',
      JSON.stringify(features || {}),
      JSON.stringify(Array.isArray(available_pincodes) ? available_pincodes : []),
      imageUrlsJson, // Store in 'images' column
      'active',
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

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Service created successfully',
      serviceId
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
    const decoded = await jwt.verify(token, env.JWT_SECRET);
    
    // Check if user is admin
    if (!decoded || decoded.email !== 'admin@kuddl.co') {
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

      // Query for all services (lenient filtering for now)
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
          p.id as provider_db_id,
          p.business_name,
          p.first_name,
          p.last_name,
          p.profile_image_url,
          p.city,
          p.state,
          p.experience_years,
          p.is_active,
          p.serviceable_pincodes
        FROM services s
        LEFT JOIN providers p ON s.provider_id = p.id
        LEFT JOIN categories c ON s.category_id = c.id
        WHERE 1=1
      `;
      
      const params = [];

      if (pincode) {
        // Only return services that are actually available in the requested pincode
        // Check service-level available_pincodes first, then provider serviceable_pincodes as fallback
        query += ` AND (
          (s.available_pincodes IS NOT NULL AND s.available_pincodes LIKE ?) OR
          (s.available_pincodes IS NULL AND p.serviceable_pincodes IS NOT NULL AND p.serviceable_pincodes LIKE ?)
        )`;
        params.push(`%${pincode}%`, `%${pincode}%`);
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

      const servicesStmt = env.KUDDL_DB.prepare(query);
      const services = await servicesStmt.bind(...params).all();

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
          availablePincodes: service.available_pincodes ? (typeof service.available_pincodes === 'string' ? JSON.parse(service.available_pincodes) : service.available_pincodes) : [],
          available_pincodes: service.available_pincodes ? (typeof service.available_pincodes === 'string' ? JSON.parse(service.available_pincodes) : service.available_pincodes) : [],
          // Image fields - provide both formats for compatibility
          images: parsedImageUrls,
          image_urls: parsedImageUrls,
          primaryImage: service.primary_image_url || null,
          primary_image_url: service.primary_image_url || null,
          // Provider info
          business_name: service.business_name || 'Service Provider',
          first_name: service.first_name || 'Service',
          last_name: service.last_name || 'Provider',
          average_rating: 4.5, // Default rating since column doesn't exist
          profile_image_url: service.profile_image_url,
          provider: {
            id: service.provider_id,
            businessName: service.business_name || 'Service Provider',
            name: service.first_name && service.last_name ? `${service.first_name} ${service.last_name}` : 'Service Provider',
            first_name: service.first_name || 'Service',
            last_name: service.last_name || 'Provider',
            profileImage: service.profile_image_url,
            profile_image_url: service.profile_image_url,
            location: service.city && service.state ? `${service.city}, ${service.state}` : 'Available Nationwide',
            city: service.city || 'Available',
            state: service.state || 'Nationwide',
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
    const decoded = await jwt.verify(token, env.JWT_SECRET);
    
    if (!decoded) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid or expired token'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    // Get provider ID with same fallback logic
    let providerId = decoded.id || decoded.user_id || decoded.userId || decoded.sub;
    
    if (!providerId && decoded.user) {
      providerId = decoded.user.id || decoded.user.user_id || decoded.user.userId;
    }
    
    if (!providerId && decoded.email) {
      try {
        const providerByEmail = await env.KUDDL_DB.prepare(`
          SELECT id FROM providers WHERE email = ?
        `).bind(decoded.email).first();
        
        if (providerByEmail) {
          providerId = providerByEmail.id;
        }
      } catch (error) {
        console.error('❌ Error finding provider by email for delete:', error);
      }
    }
    
    if (!providerId) {
      try {
        const activePartner = await env.KUDDL_DB.prepare(`
          SELECT id FROM providers WHERE is_active = 1 AND kyc_status = 'verified' LIMIT 1
        `).first();
        
        if (activePartner) {
          providerId = activePartner.id;
        }
      } catch (error) {
        console.error('❌ Error getting active partner for delete:', error);
      }
    }

    if (!providerId) {
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

    if (service.provider_id !== providerId) {
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
        s.features,
        s.available_pincodes,
        s.created_at,
        s.provider_id,
        p.id as provider_db_id,
        p.business_name,
        p.first_name,
        p.last_name,
        p.profile_image_url,
        p.city,
        p.state,
        p.average_rating,
        p.experience_years
      FROM services s
      JOIN providers p ON s.provider_id = p.id
      LEFT JOIN categories c ON s.category_id = c.id
      WHERE s.id = ? AND s.status = 'active' AND p.is_active = 1 AND p.kyc_status = 'verified'
    `).bind(serviceId).first();

    if (!service) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Service not found or provider inactive'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }));
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
      features: service.features ? JSON.parse(service.features) : {},
      availablePincodes: service.available_pincodes ? JSON.parse(service.available_pincodes) : [],
      provider: {
        id: service.provider_id,
        businessName: service.business_name,
        name: `${service.first_name} ${service.last_name}`,
        first_name: service.first_name,
        last_name: service.last_name,
        profileImage: service.profile_image_url,
        profile_image_url: service.profile_image_url,
        location: `${service.city}, ${service.state}`,
        city: service.city,
        state: service.state,
        average_rating: service.average_rating || 4.5,
        experience_years: service.experience_years || 3,
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
