/**
 * Cloudflare Worker for Kuddl Platform
 * Restructured with proper folder organization
 */

import { Router } from 'itty-router';
import jwt from '@tsndr/cloudflare-worker-jwt';
import { addCorsHeaders, handleCorsOptions, createApiResponse } from './utils/cors.js';
import * as authController from './controllers/authController.js';
import * as adminController from './controllers/adminController.js';
import * as otpController from './controllers/otpController.js';
import * as otpServiceController from './controllers/otpServiceController.js';
import * as otpDatabaseController from './controllers/otpDatabaseController.js';
import * as providerTableMigrationController from './controllers/providerTableMigrationController.js';
import * as tableInfoController from './controllers/tableInfoController.js';
import * as documentsController from './controllers/documentsController.js';
import servicesRoutes from './routes/servicesRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import kycRoutes from './routes/kycRoutes.js';
import * as servicesController from './controllers/servicesController.js';
import { convertProfileUrlsToPublic } from './utils/r2Utils.js';
import * as bookingController from './controllers/bookingController.js';
import * as simpleBookingController from './controllers/simpleBookingController.js';
import * as tableSetupController from './controllers/tableSetupController.js';
import * as isolatedTestController from './controllers/isolatedTestController.js';
import * as paymentController from './controllers/paymentController.js';
import * as verificationController from './controllers/verificationController.js';
import * as databaseController from './controllers/databaseController.js';
import * as subcategoryMigration from "./controllers/subcategoryMigration.js";
import * as customerController from './controllers/customerController.js';
import * as dashboardController from './controllers/dashboardController.js';
import * as migrationController from './controllers/migrationController.js';
import * as parentController from './controllers/parentController.js';
import * as databaseSetupController from './controllers/databaseSetupController.js';
import { GoogleAuthController } from './controllers/googleAuthController.js';
import * as categoriesController from './controllers/categoriesController.js';
import * as availabilityController from './controllers/availabilityController.js';
import * as fixedAvailabilityController from "./controllers/fixedAvailabilityController.js";
import * as partnerAvailabilityController from './controllers/partnerAvailabilityController.js';
import * as calendarSyncController from './controllers/calendarSyncController.js';
import * as databaseCleanupController from './controllers/databaseCleanupController.js';
import * as bookingLifecycleController from './controllers/bookingLifecycleController.js';
import * as whatsappNotificationController from './controllers/whatsappNotificationController.js';
import * as partnerBookingController from './controllers/partnerBookingController.js';
import * as notificationController from './controllers/notificationController.js';
import { sendAadhaarOtp, verifyAadhaarOtp, verifyGst, verifyBankAccount, verifyPan, lookupIfsc } from './controllers/sandboxController.js';
import { authenticateToken } from './middleware/auth.js';
import * as customerProfileController from './controllers/customerProfileController.js';
import * as customerWishlistController from './controllers/customerWishlistController.js';
import * as customerWalletController from './controllers/customerWalletController.js';
import * as customerContactsController from './controllers/customerContactsController.js';
import * as createBookingOtpsTableController from './controllers/createBookingOtpsTableController.js';
import * as fixParentsTableController from './controllers/fixParentsTableController.js';
import * as profileProgressController from './controllers/profileProgressController.js';
import * as profileProgressDatabaseController from './controllers/profileProgressDatabaseController.js';
import * as publicStatsController from './controllers/publicStatsController.js';
import * as contentManagementController from './controllers/contentManagementController.js';
import bcrypt from 'bcryptjs';

// Initialize router
const router = Router();

// Utility function to get partner folder path from partner ID
function getPartnerFolderPath(partnerId) {
  if (!partnerId) return null;
  // Use partner ID directly for folder structure (already clean)
  return partnerId.toString();
}

// Handle CORS preflight requests - must be first
router.options('*', (request) => {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, Pragma, Expires, Access-Control-Allow-Headers, X-API-Key, X-Client-Version',
      'Access-Control-Max-Age': '86400',
      'Access-Control-Allow-Credentials': 'false',
    }
  });
});

// Mount sub-routers
router.all('/api/customers/*', customerRoutes.handle);
router.all('/api/kyc/*', kycRoutes.handle);

// Category routes
router.get('/api/categories', (request, env) => categoriesController.getCategories(request, env));
router.get('/api/categories/module', (request, env) => categoriesController.getCategoriesByModule(request, env));
router.get('/api/subcategories', (request, env) => categoriesController.getSubcategories(request, env));
router.get('/api/child-subcategories', (request, env) => categoriesController.getChildSubcategories(request, env));

// Public stats route (no authentication required)
router.get('/api/public/stats', (request, env) => publicStatsController.getPublicStats(request, env));

// Content Management System routes
router.post('/api/cms/setup-tables', (request, env) => contentManagementController.createContentTables(request, env));

// Blog routes (public)
router.get('/api/blogs', (request, env) => contentManagementController.getBlogPosts(request, env));
router.get('/api/blog', (request, env) => contentManagementController.getBlogPost(request, env));

// Blog routes (admin only)
router.post('/api/admin/blog', (request, env) => contentManagementController.createBlogPost(request, env));
router.put('/api/admin/blog', (request, env) => contentManagementController.updateBlogPost(request, env));
router.delete('/api/admin/blog', (request, env) => contentManagementController.deleteBlogPost(request, env));

// Job posting routes (public)
router.get('/api/jobs', (request, env) => contentManagementController.getJobPostings(request, env));

// Job posting routes (admin only)
router.post('/api/admin/job', (request, env) => contentManagementController.createJobPosting(request, env));
router.put('/api/admin/job', (request, env) => contentManagementController.updateJobPosting(request, env));
router.delete('/api/admin/job', (request, env) => contentManagementController.deleteJobPosting(request, env));

// Press release routes (public)
router.get('/api/press', (request, env) => contentManagementController.getPressReleases(request, env));

// Press release routes (admin only)
router.post('/api/admin/press', (request, env) => contentManagementController.createPressRelease(request, env));
router.put('/api/admin/press', (request, env) => contentManagementController.updatePressRelease(request, env));
router.delete('/api/admin/press', (request, env) => contentManagementController.deletePressRelease(request, env));

// Partner Availability routes
router.post('/api/availability/create-tables', (request, env) => availabilityController.createAvailabilityTables(request, env));
router.post('/api/availability/partner-type', (request, env) => availabilityController.setPartnerType(request, env));
router.post('/api/availability/working-hours', (request, env) => availabilityController.setWorkingHours(request, env));
router.post('/api/availability/batch-timings', (request, env) => availabilityController.setBatchTimings(request, env));
router.get('/api/availability/partner', (request, env) => availabilityController.getPartnerAvailability(request, env));
router.get("/api/availability/provider", (request, env) => fixedAvailabilityController.getProviderAvailability(request, env));

// Enhanced Partner Availability Routes
router.post('/api/partner/setup-tables', (request, env) => partnerAvailabilityController.createPartnerAvailabilityTables(request, env));
router.post('/api/partner/setup-profile', (request, env) => partnerAvailabilityController.setupPartnerProfile(request, env));
router.post('/api/partner/working-hours', (request, env) => partnerAvailabilityController.setWorkingHours(request, env));
router.post('/api/partner/batch-timings', (request, env) => partnerAvailabilityController.setBatchTimings(request, env));
router.get('/api/partner/enhanced-availability', async (request, env) => {
  return partnerAvailabilityController.getEnhancedProviderAvailability(request, env);
});
// Note: /api/partner/profile is handled by the main profile endpoint below (line ~553)
// partnerAvailabilityController.getPartnerProfile requires ?providerId= query param
// and is available at /api/partner/operational-profile instead
router.get('/api/partner/operational-profile', (request, env) => partnerAvailabilityController.getPartnerProfile(request, env));
router.post('/api/partner/availability', async (request, env) => {
  return partnerAvailabilityController.savePartnerAvailability(request, env);
});

// Calendar Sync Routes
router.post('/api/partner/calendar/sync', async (request, env) => {
  return calendarSyncController.syncProviderCalendar(request, env);
});

router.get('/api/partner/calendar/status', async (request, env) => {
  return calendarSyncController.getCalendarSyncStatus(request, env);
});

// Database Cleanup Routes
router.post('/api/database/cleanup-and-create-essential', (request, env) => databaseCleanupController.cleanupAndCreateEssentialTables(request, env));
router.post('/api/database/fix-bookings-table', (request, env) => databaseCleanupController.fixBookingsTable(request, env));
router.get('/api/database/schema', (request, env) => databaseCleanupController.getDatabaseSchema(request, env));
router.get('/api/database/debug-bookings', (request, env) => databaseCleanupController.debugBookingsData(request, env));
router.post('/api/database/fix-orphaned-bookings', (request, env) => databaseCleanupController.fixOrphanedBookings(request, env));
router.post('/api/database/add-service-columns', (request, env) => databaseCleanupController.addServiceTrackingColumns(request, env));
router.post('/api/database/create-booking-otps-table', (request, env) => createBookingOtpsTableController.createBookingOtpsTable(request, env));
router.post('/api/database/fix-parents-table', (request, env) => fixParentsTableController.fixParentsTable(request, env));

// Removed duplicate route - main partner profile route is handled below

// Booking Lifecycle Routes
router.post('/api/booking/initialize-lifecycle', (request, env) => bookingLifecycleController.initializeBookingLifecycle(request, env));
router.post('/api/booking/respond', (request, env) => bookingLifecycleController.respondToBooking(request, env));
router.post('/api/booking/checkin', (request, env) => bookingLifecycleController.partnerCheckIn(request, env));
router.post('/api/booking/complete', (request, env) => bookingLifecycleController.markBookingCompleted(request, env));
router.get('/api/booking/lifecycle', (request, env) => bookingLifecycleController.getBookingLifecycle(request, env));

// WhatsApp & Multi-Channel Notification Routes
router.post('/api/notifications/whatsapp', (request, env) => whatsappNotificationController.sendWhatsAppNotification(request, env));
router.post('/api/notifications/multi-channel', (request, env) => whatsappNotificationController.sendMultiChannelNotification(request, env));
router.post('/api/availability/block-slot', (request, env) => availabilityController.blockTimeSlot(request, env));
router.post('/api/availability/special-availability', (request, env) => availabilityController.setSpecialAvailability(request, env));

// Partner Booking routes
router.get('/api/partner/bookings', (request, env) => partnerBookingController.getPartnerBookings(request, env));
router.get('/api/partner/booking-stats', (request, env) => partnerBookingController.getPartnerBookingStats(request, env));

// Notification routes
router.post('/api/notifications/create-tables', (request, env) => notificationController.createNotificationTables(request, env));
router.post('/api/notifications', (request, env) => notificationController.createNotification(request, env, env.io));
router.get('/api/notifications', (request, env) => notificationController.getNotifications(request, env));
router.put('/api/notifications/:id/read', (request, env) => notificationController.markNotificationRead(request, env, env.io));
router.put('/api/notifications/read-all', (request, env) => notificationController.markAllNotificationsRead(request, env, env.io));

// Customer Profile Routes
router.get('/api/customer/dashboard', (request, env) => customerProfileController.getCustomerDashboard(request, env));
router.get('/api/customer/bookings', (request, env) => customerProfileController.getCustomerBookings(request, env));
router.get('/api/customer/favorites', (request, env) => customerProfileController.getCustomerFavorites(request, env));
router.post('/api/customer/favorites', (request, env) => customerProfileController.addToFavorites(request, env));
router.delete('/api/customer/favorites/:id', (request, env, ctx) => customerProfileController.removeFromFavorites(request, env, ctx.params.id));
router.get('/api/customer/reviews', (request, env) => customerProfileController.getCustomerReviews(request, env));
router.post('/api/customer/reviews', (request, env) => customerProfileController.createReview(request, env));
router.get('/api/customer/transactions', (request, env) => customerProfileController.getCustomerTransactions(request, env));
router.get('/api/customer/events', (request, env) => customerProfileController.getCustomerEvents(request, env));
router.post('/api/customer/events/:id/join', (request, env, ctx) => customerProfileController.joinEvent(request, env, ctx.params.id));
router.post('/api/customer/events/:id/bookmark', (request, env, ctx) => customerProfileController.toggleEventBookmark(request, env, ctx.params.id));
router.get('/api/customer/contacts', (request, env) => customerProfileController.getCustomerContacts(request, env));
router.get('/api/customer/contacts/:id/messages', (request, env, ctx) => customerProfileController.getContactMessages(request, env, ctx.params.id));
router.post('/api/customer/messages', (request, env) => customerProfileController.sendMessage(request, env));
router.get('/api/customer/children', (request, env) => customerProfileController.getCustomerChildren(request, env));
router.post('/api/customer/children', (request, env) => customerProfileController.addChild(request, env));
router.put('/api/customer/children/:id', (request, env, ctx) => customerProfileController.updateChild(request, env, ctx.params.id));

// Bank verification routes
router.get('/api/bank/ifsc/:ifsc', async (request, env, ctx) => {
  try {
    console.log('🔐 [IFSC Auth] Starting authentication for IFSC lookup');
    
    // Check authentication first
    const authHeader = request.headers.get('Authorization');
    console.log('🔐 [IFSC Auth] Auth header present:', !!authHeader);
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ [IFSC Auth] Missing or invalid authorization header');
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Missing or invalid authorization header'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const token = authHeader.substring(7);
    console.log('🔐 [IFSC Auth] Token extracted, length:', token.length);
    
    // First verify the token is valid
    console.log('🔐 [IFSC Auth] Verifying token...');
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    console.log('🔐 [IFSC Auth] Token valid:', isValid);
    
    if (!isValid) {
      console.log('❌ [IFSC Auth] Token verification failed');
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid token'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    
    // Then decode the payload
    console.log('🔐 [IFSC Auth] Decoding token...');
    const decoded = jwt.decode(token);
    console.log('🔐 [IFSC Auth] Decoded payload:', JSON.stringify(decoded));
    
    // Check if we have a user ID
    const userId = decoded.payload?.id || decoded.payload?.userId || decoded.payload?.phone || decoded.id || decoded.userId || decoded.phone;
    console.log('🔐 [IFSC Auth] Extracted user ID:', userId);
    
    if (!userId) {
      console.log('❌ [IFSC Auth] No user ID found in token');
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid token: no user ID found'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    
    // Extract IFSC from URL path
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const ifsc = pathParts[pathParts.length - 1];
    console.log('🔐 [IFSC Auth] IFSC code:', ifsc);
    
    // Create a request with user and params
    const authenticatedRequest = {
      ...request,
      user: { id: userId },
      params: { ifsc }
    };
    
    console.log('✅ [IFSC Auth] Authentication successful, calling lookupIfsc');
    return await lookupIfsc(authenticatedRequest, env);
  } catch (error) {
    console.error('❌ [IFSC Auth] Authentication error:', error);
    console.error('❌ [IFSC Auth] Error stack:', error.stack);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Authentication failed',
      error: error.message
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});


// Health check endpoint
router.get('/health', () => {
  return addCorsHeaders(new Response(JSON.stringify({
    status: 'healthy',
    timestamp: new Date().toISOString()
  }), {
    headers: { 'Content-Type': 'application/json' }
  }));
});

// Migration endpoint to add missing columns
router.post('/api/migrate/add-missing-columns', async (request, env) => {
  try {
    // Check existing columns
    const tableInfo = await env.KUDDL_DB.prepare(`PRAGMA table_info(providers)`).all();
    const existingCols = new Set((tableInfo.results || []).map((r) => r.name));

    const requiredColumns = [
      'qualifications',
      'area',
      'account_holder_name',
      'service_categories',
      'specific_services',
      'age_groups'
    ];

    const addedColumns = [];
    const existingColumns = [];

    for (const column of requiredColumns) {
      if (existingCols.has(column)) {
        existingColumns.push(column);
      } else {
        try {
          await env.KUDDL_DB.prepare(`ALTER TABLE providers ADD COLUMN ${column} TEXT`).run();
          addedColumns.push(column);
          console.log(`✅ Added ${column} column to providers table`);
        } catch (alterError) {
          console.log(`⚠️ Failed to add ${column} column:`, alterError.message);
        }
      }
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Migration completed',
      addedColumns,
      existingColumns,
      totalColumns: existingCols.size
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Migration error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false, 
      message: 'Migration failed: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Migration endpoint to add service_addresses column
router.post('/api/migrate/add-service-addresses', async (request, env) => {
  try {
    // Check if service_addresses column already exists
    const tableInfo = await env.KUDDL_DB.prepare(`PRAGMA table_info(providers)`).all();
    const existingCols = new Set((tableInfo.results || []).map((r) => r.name));

    if (existingCols.has('service_addresses')) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: true,
        message: 'Service_addresses column already exists'
      }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Add service_addresses column
    await env.KUDDL_DB.prepare(`
      ALTER TABLE providers ADD COLUMN service_addresses TEXT
    `).run();

    console.log('✅ Added service_addresses column to providers table');

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Successfully added service_addresses column to providers table'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Migration error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Migration failed: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Migration endpoint to move files from temp email folders to actual email folders
router.post('/api/migrate/move-temp-folders', async (request, env) => {
  try {
    console.log('🔄 Starting temp folder migration...');

    // Get all providers with actual emails (not temp emails)
    const providers = await env.KUDDL_DB.prepare(`
      SELECT id, email, profile_image_url 
      FROM providers 
      WHERE email NOT LIKE '%@temp.kuddl.com' AND email IS NOT NULL
    `).all();

    let movedCount = 0;

    for (const provider of providers.results || []) {
      const actualEmail = provider.email;
      const providerId = provider.id;
      const tempEmail = `${providerId}@temp.kuddl.com`; // Reconstruct temp email

      const actualFolder = actualEmail.replace(/[^a-zA-Z0-9@.-]/g, '_');
      const tempFolder = tempEmail.replace(/[^a-zA-Z0-9@.-]/g, '_');

      console.log(`📁 Checking migration for ${actualEmail} (ID: ${providerId})`);

      // List files in temp folder
      const tempFiles = await env.KUDDL_STORAGE.list({
        prefix: `partners/${tempFolder}/`
      });

      if (tempFiles.objects && tempFiles.objects.length > 0) {
        console.log(`📦 Found ${tempFiles.objects.length} files to move for ${actualEmail}`);

        for (const file of tempFiles.objects) {
          // Create new path with actual email
          const newPath = file.key.replace(`partners/${tempFolder}/`, `partners/${actualFolder}/`);

          // Copy file to new location
          const fileData = await env.KUDDL_STORAGE.get(file.key);
          if (fileData) {
            await env.KUDDL_STORAGE.put(newPath, fileData.body, {
              httpMetadata: fileData.httpMetadata
            });

            // Delete old file
            await env.KUDDL_STORAGE.delete(file.key);

            console.log(`✅ Moved: ${file.key} → ${newPath}`);

            // Update profile_image_url if this was a profile picture
            if (file.key.includes('/profilepic/') && provider.profile_image_url && provider.profile_image_url.includes(file.key)) {
              const newUrl = provider.profile_image_url.replace(file.key, newPath);
              await env.KUDDL_DB.prepare(`
                UPDATE providers SET profile_image_url = ? WHERE id = ?
              `).bind(newUrl, providerId).run();
              console.log(`✅ Updated profile_image_url for ${actualEmail}`);
            }
          }
        }
        movedCount++;
      }
    }

    console.log(`✅ Migration completed. Moved files for ${movedCount} providers.`);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: `Successfully moved files for ${movedCount} providers from temp folders to actual email folders`,
      details: {
        providersProcessed: providers.results?.length || 0,
        providersMoved: movedCount
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Temp folder migration error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Migration failed: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Migration endpoint to consolidate document URLs and cleanup table
router.post('/api/migrate/consolidate-documents', async (request, env) => {
  try {
    console.log('🔄 Starting document consolidation migration...');

    // Step 1: Get all providers with individual document URLs
    const providers = await env.KUDDL_DB.prepare(`
      SELECT id, pan_card_url, aadhaar_card_url, cancelled_cheque_url, document_urls
      FROM providers 
      WHERE pan_card_url IS NOT NULL OR aadhaar_card_url IS NOT NULL OR cancelled_cheque_url IS NOT NULL
    `).all();

    let consolidatedCount = 0;

    // Step 2: Consolidate individual document URLs into document_urls JSON field
    for (const provider of providers.results || []) {
      const existingDocs = provider.document_urls ? JSON.parse(provider.document_urls) : {};

      // Add individual URLs to consolidated object
      if (provider.pan_card_url) existingDocs.pan_card_url = provider.pan_card_url;
      if (provider.aadhaar_card_url) existingDocs.aadhaar_card_url = provider.aadhaar_card_url;
      if (provider.cancelled_cheque_url) existingDocs.cancelled_cheque_url = provider.cancelled_cheque_url;

      // Update document_urls field with consolidated data
      await env.KUDDL_DB.prepare(`
        UPDATE providers 
        SET document_urls = ?, last_login_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(JSON.stringify(existingDocs), provider.id).run();

      consolidatedCount++;
      console.log(`✅ Consolidated documents for provider ${provider.id}`);
    }

    // Step 3: Create new table without deprecated columns
    await env.KUDDL_DB.prepare(`
      CREATE TABLE providers_new (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        phone TEXT,
        password_hash TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        business_name TEXT,
        description TEXT,
        experience_years INTEGER DEFAULT 0,
        languages TEXT,
        address TEXT,
        city TEXT,
        state TEXT,
        pincode TEXT,
        kyc_status TEXT CHECK (kyc_status IN ('pending', 'verified', 'rejected')) DEFAULT 'pending',
        verification_level INTEGER DEFAULT 1,
        verification_documents TEXT,
        profile_image_url TEXT,
        document_urls TEXT,
        average_rating REAL DEFAULT 0,
        total_bookings INTEGER DEFAULT 0,
        total_reviews INTEGER DEFAULT 0,
        commission_rate REAL DEFAULT 15.0,
        is_featured INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        response_time_minutes INTEGER DEFAULT 60,
        instant_booking_enabled INTEGER DEFAULT 0,
        theme_color TEXT DEFAULT '#cf956d',
        last_login_at TEXT DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        service_categories TEXT,
        specific_services TEXT,
        age_groups TEXT,
        account_holder_name TEXT,
        bank_name TEXT,
        account_number TEXT,
        ifsc_code TEXT,
        account_type TEXT,
        upi_id TEXT,
        area TEXT,
        qualifications TEXT,
        service_addresses TEXT,
        serviceable_pincodes TEXT
      )
    `).run();

    // Step 4: Copy data to new table (excluding deprecated columns)
    await env.KUDDL_DB.prepare(`
      INSERT INTO providers_new 
      SELECT 
        id, email, phone, password_hash, first_name, last_name, business_name, description,
        experience_years, languages, address, city, state, pincode, kyc_status,
        verification_level, verification_documents, profile_image_url, document_urls,
        average_rating, total_bookings, total_reviews, commission_rate, is_featured,
        is_active, response_time_minutes, instant_booking_enabled, theme_color,
        CURRENT_TIMESTAMP as last_login_at, created_at, updated_at,
        service_categories, specific_services, age_groups, account_holder_name,
        bank_name, account_number, ifsc_code, account_type, upi_id, area,
        qualifications, service_addresses, serviceable_pincodes
      FROM providers
    `).run();

    // Step 5: Replace old table with new table
    await env.KUDDL_DB.prepare(`DROP TABLE providers`).run();
    await env.KUDDL_DB.prepare(`ALTER TABLE providers_new RENAME TO providers`).run();

    console.log(`✅ Migration completed. Consolidated ${consolidatedCount} provider documents.`);
    console.log('✅ Removed deprecated columns: service_pincodes, service_area, pan_card_url, cancelled_cheque_url, aadhaar_card_url');
    console.log('✅ Updated last_login_at timestamps');

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: `Successfully consolidated ${consolidatedCount} provider documents and cleaned up table structure`,
      details: {
        consolidatedProviders: consolidatedCount,
        removedColumns: ['service_pincodes', 'service_area', 'pan_card_url', 'cancelled_cheque_url', 'aadhaar_card_url'],
        updatedTimestamps: true
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Document consolidation migration error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Migration failed: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});


// Partner profile endpoint (used by partner portal)
router.get('/api/partner/profile', async (request, env) => {
  try {
    console.log('🔍 Profile endpoint called');

    // Check if required environment variables exist
    if (!env.KUDDL_DB) {
      console.error('❌ KUDDL_DB not found in environment');
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Database not available'
      }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
    }

    if (!env.JWT_SECRET) {
      console.error('❌ JWT_SECRET not found in environment');
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authentication service not available'
      }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
    }

    const authedUser = await authController.verifyToken(request, env);
    console.log('🔑 Auth result:', authedUser ? 'Valid user' : 'No user');

    if (!authedUser) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authorization token required'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    console.log('👤 User role:', authedUser.role, 'ID:', authedUser.id);
    console.log('🔍 Full authedUser object:', JSON.stringify(authedUser, null, 2));

    // For admin tokens, return minimal admin profile to keep portal functional
    if (authedUser.role === 'admin') {
      try {
        const admin = await env.KUDDL_DB.prepare(`
          SELECT id, email, full_name, profile_image_url
          FROM admins WHERE id = ?
        `).bind(authedUser.id).first();

        if (!admin) {
          console.error('❌ Admin not found in database:', authedUser.id);
          return addCorsHeaders(new Response(JSON.stringify({
            success: false,
            message: 'Admin not found'
          }), { status: 404, headers: { 'Content-Type': 'application/json' } }));
        }

        console.log('✅ Admin profile found');
        // Split full_name into first_name and last_name for compatibility
        const nameParts = (admin.full_name || 'Admin User').split(' ');
        const firstName = nameParts[0] || 'Admin';
        const lastName = nameParts.slice(1).join(' ') || 'User';

        // Convert admin profile URLs to public R2 URLs
        const adminProfile = {
          id: admin.id,
          email: admin.email,
          first_name: firstName,
          last_name: lastName,
          business_name: 'Kuddl Admin',
          service_category: 'Administration',
          kyc_status: 'verified',
          profile_image_url: admin.profile_image_url || null
        };

        const adminWithPublicUrls = convertProfileUrlsToPublic(adminProfile, env);

        return addCorsHeaders(new Response(JSON.stringify({
          success: true,
          data: adminWithPublicUrls
        }), { 
          headers: { 
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Last-Modified': new Date().toUTCString()
          } 
        }));
      } catch (adminError) {
        console.error('❌ Admin query error:', adminError);
        return addCorsHeaders(new Response(JSON.stringify({
          success: false,
          message: 'Database error while fetching admin profile'
        }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
      }
    }

    // Default: partner/provider profile
    try {
      let provider = await env.KUDDL_DB.prepare(`
        SELECT * FROM providers WHERE id = ?
      `).bind(authedUser.id).first();

      // If provider not found by ID, try to find by phone (for tokens that only have phone)
      if (!provider && authedUser.phone) {
        console.log('🔍 Provider not found by ID, trying phone lookup:', authedUser.phone);
        provider = await env.KUDDL_DB.prepare(`
          SELECT * FROM providers WHERE phone = ?
        `).bind(authedUser.phone).first();
        
        if (provider) {
          console.log('✅ Provider found by phone lookup:', provider.id);
        }
      }

      if (!provider) {
        console.error('❌ Provider not found in database by ID or phone:', { id: authedUser.id, phone: authedUser.phone });
        return addCorsHeaders(new Response(JSON.stringify({
          success: false,
          message: 'Partner not found'
        }), { status: 404, headers: { 'Content-Type': 'application/json' } }));
      }

      console.log('✅ Provider profile found');

      // Calculate profile completion percentage with error handling
      let profileCompletion;
      try {
        profileCompletion = await calculateProfileCompletion(provider, env);
      } catch (completionError) {
        console.error('❌ Profile completion calculation error:', completionError);
        // Fallback completion data
        profileCompletion = {
          percentage: 50,
          missingFields: ['Some fields may be incomplete'],
          completedFields: 10,
          totalFields: 20
        };
      }

      // Convert URLs to public R2 URLs and respond with provider data
      const profileWithPublicUrls = convertProfileUrlsToPublic(provider, env);

      // Profile completion is based on essential fields, not verification status
      const hasEssentialFields = provider.first_name && 
                                provider.email && 
                                provider.service_categories && 
                                provider.account_holder_name && 
                                provider.account_number;
      const isProfileComplete = hasEssentialFields;

      return addCorsHeaders(new Response(JSON.stringify({
        success: true,
        data: {
          ...profileWithPublicUrls,
          profileComplete: isProfileComplete,
          profileCompletionPercentage: isProfileComplete ? 100 : profileCompletion.percentage,
          missingFields: isProfileComplete ? [] : profileCompletion.missingFields,
          _debug: {
            endpoint: 'main_partner_profile',
            timestamp: new Date().toISOString(),
            userRole: authedUser.role,
            kycStatus: provider.kyc_status,
            isProfileComplete: isProfileComplete,
            calculatedCompletion: profileCompletion
          }
        },
        user: {
          ...profileWithPublicUrls,
          profileComplete: isProfileComplete
        }
      }), { 
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'Last-Modified': new Date().toUTCString()
        } 
      }));

    } catch (providerError) {
      console.error('❌ Provider query error:', providerError);
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Database error while fetching provider profile'
      }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
    }

  } catch (error) {
    console.error('❌ Partner profile error:', error);
    console.error('❌ Error stack:', error.stack);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error: ' + error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
});

// Update partner profile fields
router.put('/api/partner/profile', async (request, env) => {
  try {
    const authedUser = await authController.verifyToken(request, env);
    if (!authedUser) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authorization token required'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    let payload = {};
    try {
      payload = await request.json();
    } catch (e) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid JSON body'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    const updates = {};

    // Basic info fields
    if (typeof payload.fullName === 'string') {
      const parts = payload.fullName.trim().split(' ');
      updates.first_name = parts[0] || '';
      updates.last_name = parts.slice(1).join(' ') || '';
    }
    if (typeof payload.first_name === 'string') updates.first_name = payload.first_name;
    if (typeof payload.last_name === 'string') updates.last_name = payload.last_name;
    if (typeof payload.email === 'string') updates.email = payload.email;
    if (typeof payload.phone === 'string') updates.phone = payload.phone;
    if (typeof payload.address === 'string') updates.address = payload.address;
    if (typeof payload.city === 'string') updates.city = payload.city;
    if (typeof payload.state === 'string') updates.state = payload.state;
    if (typeof payload.pincode === 'string') updates.pincode = payload.pincode;
    if (typeof payload.gender === 'string') updates.gender = payload.gender;
    if (typeof payload.date_of_birth === 'string') updates.date_of_birth = payload.date_of_birth;

    // Services fields
    if (typeof payload.service_categories === 'string') updates.service_categories = payload.service_categories;
    if (typeof payload.specific_services === 'string') updates.specific_services = payload.specific_services;
    if (typeof payload.age_groups === 'string') updates.age_groups = payload.age_groups;
    if (typeof payload.qualifications === 'string') updates.qualifications = payload.qualifications;
    if (typeof payload.description === 'string') updates.description = payload.description;
    if (typeof payload.languages === 'string') updates.languages = payload.languages;
    if (typeof payload.experience_years !== 'undefined') {
      const exp = parseInt(payload.experience_years, 10);
      updates.experience_years = Number.isFinite(exp) ? exp : 0;
    }

    // Verification fields
    if (typeof payload.aadhaarNumber === 'string') updates.aadhaar_number = payload.aadhaarNumber;
    if (typeof payload.panNumber === 'string') updates.pan_number = payload.panNumber;
    if (typeof payload.gstNumber === 'string') updates.gst_number = payload.gstNumber;
    if (typeof payload.isAadhaarVerified === 'boolean') updates.is_aadhaar_verified = payload.isAadhaarVerified ? 1 : 0;
    if (typeof payload.isPanVerified === 'boolean') updates.is_pan_verified = payload.isPanVerified ? 1 : 0;
    if (typeof payload.isGstVerified === 'boolean') updates.is_gst_verified = payload.isGstVerified ? 1 : 0;

    // Banking fields - handle all variations
    if (typeof payload.account_holder === 'string') updates.account_holder = payload.account_holder;
    if (typeof payload.accountHolder === 'string') updates.accountHolder = payload.accountHolder;
    if (typeof payload.account_holder_name === 'string') updates.account_holder_name = payload.account_holder_name;
    if (typeof payload.bank_name === 'string') updates.bank_name = payload.bank_name;
    if (typeof payload.account_number === 'string') updates.account_number = payload.account_number;
    if (typeof payload.ifsc_code === 'string') updates.ifsc_code = payload.ifsc_code;
    if (typeof payload.account_type === 'string') updates.account_type = payload.account_type;
    if (typeof payload.upi_id === 'string') updates.upi_id = payload.upi_id;

    // Document URLs
    if (typeof payload.document_urls === 'string') updates.document_urls = payload.document_urls;

    // Profile completion tracking
    if (typeof payload.last_completed_step !== 'undefined') {
      const step = parseInt(payload.last_completed_step, 10);
      updates.last_completed_step = Number.isFinite(step) ? step : 0;
    }

    // Availability fields
    if (typeof payload.partner_type === 'string') updates.partner_type = payload.partner_type;
    if (typeof payload.buffer_time_minutes !== 'undefined') {
      const buffer = parseInt(payload.buffer_time_minutes, 10);
      updates.buffer_time_minutes = Number.isFinite(buffer) ? buffer : 30;
    }
    if (typeof payload.working_hours === 'string') updates.working_hours = payload.working_hours;
    if (typeof payload.batch_timings === 'string') updates.batch_timings = payload.batch_timings;

    // Accept either CSV string or array for serviceable_pincodes
    if (Array.isArray(payload.serviceable_pincodes)) {
      updates.serviceable_pincodes = payload.serviceable_pincodes.filter(Boolean).join(',');
    } else if (typeof payload.serviceable_pincodes === 'string') {
      updates.serviceable_pincodes = payload.serviceable_pincodes;
    }

    // Handle service_addresses field
    if (Array.isArray(payload.service_addresses)) {
      updates.service_addresses = payload.service_addresses.filter(Boolean).join(',');
    } else if (typeof payload.service_addresses === 'string') {
      updates.service_addresses = payload.service_addresses;
    }

    // Debug logging for service addresses
    if (payload.service_addresses !== undefined) {
      console.log('🔧 Backend received service_addresses:', payload.service_addresses);
      console.log('🔧 Backend will update service_addresses to:', updates.service_addresses);
    }

    // Note: providers table may not have 'area'; skip to avoid SQL errors unless column exists

    // Validate pincode against pincodes table when provided
    if (typeof payload.pincode === 'string' && payload.pincode.trim()) {
      const pc = await env.KUDDL_DB.prepare(`SELECT 1 AS ok FROM pincodes WHERE pincode = ?`)
        .bind(payload.pincode.trim())
        .first();
      if (!pc) {
        return addCorsHeaders(new Response(JSON.stringify({
          success: false,
          message: 'Invalid pincode. Not serviceable.'
        }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
      }
      updates.pincode = payload.pincode.trim();
    }


    console.log('🔧 Profile update - Raw payload keys:', Object.keys(payload));
    console.log('🔧 Profile update - Updates object:', updates);
    console.log('🔧 Profile update - Updates count:', Object.keys(updates).length);

    if (Object.keys(updates).length === 0) {
      console.log('❌ No valid fields to update - payload was:', payload);
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'No valid fields to update'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    // Introspect existing columns to avoid SQL errors when schemas differ
    const tableInfo = await env.KUDDL_DB.prepare(`PRAGMA table_info(providers)`).all();
    const existingCols = new Set((tableInfo.results || []).map((r) => r.name));

    console.log('🔧 Database columns available:', Array.from(existingCols));

    // Map updates to existing columns only; handle known aliases
    const mappedUpdates = {};
    for (const [key, value] of Object.entries(updates)) {
      if (existingCols.has(key)) {
        mappedUpdates[key] = value;
        console.log(`✅ Direct mapping: ${key} = ${value}`);
      } else if (key === 'account_holder' && existingCols.has('account_holder_name')) {
        mappedUpdates['account_holder_name'] = value;
        console.log(`✅ Alias mapping: ${key} → account_holder_name = ${value}`);
      } else if (key === 'accountHolder' && existingCols.has('account_holder_name')) {
        mappedUpdates['account_holder_name'] = value;
        console.log(`✅ Alias mapping: ${key} → account_holder_name = ${value}`);
      } else if (key === 'accountHolderName' && existingCols.has('account_holder_name')) {
        mappedUpdates['account_holder_name'] = value;
        console.log(`✅ Alias mapping: ${key} → account_holder_name = ${value}`);
      } else {
        console.log(`❌ Skipping unknown field: ${key} = ${value}`);
      }
    }

    console.log('🔧 Final mapped updates:', mappedUpdates);
    console.log('🔧 Mapped updates count:', Object.keys(mappedUpdates).length);

    if (Object.keys(mappedUpdates).length === 0) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'No updatable fields match the current database schema'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    const setClause = Object.keys(mappedUpdates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(mappedUpdates), new Date().toISOString(), authedUser.id];

    await env.KUDDL_DB.prepare(`
      UPDATE providers SET ${setClause}, updated_at = ? WHERE id = ?
    `).bind(...values).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Profile updated successfully'
    }), { headers: { 'Content-Type': 'application/json' } }));

    // Update categories with new data
    // (Dead code removed)

  } catch (error) {
    console.error('Migration error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Migration failed',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

router.post('/api/migrate/recreate-notifications-table', async (request, env) => {
  try {
    console.log('🔄 Recreating notifications table...');

    // Drop existing notifications table
    await env.KUDDL_DB.prepare('DROP TABLE IF EXISTS notifications').run();

    // Create new notifications table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS notifications (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          data TEXT,
          is_read INTEGER DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Notifications table recreated successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Migration error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Migration failed',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});


// Debug endpoint to check database tables
router.get('/debug/tables', async (request, env) => {
  try {
    const tables = await env.KUDDL_DB.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' ORDER BY name
    `).all();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      tables: tables.results || []
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
  } catch (error) {
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Debug endpoint to check providers
router.get('/debug/providers', async (request, env) => {
  try {
    const providers = await env.KUDDL_DB.prepare(`
      SELECT id, email, first_name, last_name, business_name, kyc_status, is_active, created_at
      FROM providers 
      ORDER BY created_at DESC
    `).all();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      providers: providers.results || []
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
  } catch (error) {
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Debug endpoint to create test partner
router.post('/debug/create-test-partner', async (request, env) => {
  try {
    const testEmail = 'partner@kuddl.com';
    const testPassword = 'Partner@123';

    // Check if partner already exists
    const existing = await env.KUDDL_DB.prepare(
      'SELECT id FROM providers WHERE email = ?'
    ).bind(testEmail).first();

    if (existing) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Test partner already exists',
        credentials: {
          email: testEmail,
          password: testPassword
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(testPassword, 12);
    const providerId = `test_partner_${Date.now()}`;

    // Create test partner
    await env.KUDDL_DB.prepare(`
      INSERT INTO providers (
        id, email, password_hash, first_name, last_name, 
        business_name, kyc_status, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      providerId,
      testEmail,
      hashedPassword,
      'Test',
      'Partner',
      'Test Business',
      'verified',
      1,
      new Date().toISOString(),
      new Date().toISOString()
    ).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Test partner created successfully',
      credentials: {
        email: testEmail,
        password: testPassword
      },
      partner: {
        id: providerId,
        email: testEmail,
        name: 'Test Partner'
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Create test partner error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Debug blink capture endpoint
router.post('/api/debug/blink-capture', async (request, env) => {
  try {
    console.log('🔍 Debug blink capture called');
    const body = await request.json();
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Debug endpoint working',
      receivedData: {
        hasFirstImage: !!body.firstImage,
        hasSecondImage: !!body.secondImage,
        userId: body.userId,
        hasFaceMeta: !!body.faceMeta,
        firstImageLength: body.firstImage?.length || 0,
        secondImageLength: body.secondImage?.length || 0
      }
    }), { headers: { 'Content-Type': 'application/json' } }));
  } catch (error) {
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Debug failed',
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
});

// ===== Blink Capture Route (moved here to prevent routing conflicts) =====
router.post('/api/verify/blink-capture', async (request, env) => {
  try {
    console.log('🎯 Blink capture endpoint called');
    console.log('🔍 Available env bindings:', Object.keys(env));
    console.log('📦 KUDDL_STORAGE available:', !!env.KUDDL_STORAGE);
    
    // Log the authorization header for debugging
    const authHeader = request.headers.get('Authorization');
    console.log('🔐 Authorization header present:', !!authHeader);
    if (authHeader) {
      console.log('🔐 Authorization header preview:', authHeader.substring(0, 20) + '...');
    }

    // Parse JSON with timeout protection
    let requestData;
    try {
      requestData = await request.json();
    } catch (parseError) {
      console.error('❌ JSON parsing failed:', parseError);
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid JSON in request body',
        error: parseError.message
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    const { firstImage, secondImage, userId, faceMeta } = requestData;
    console.log('📝 Request data:', {
      hasFirstImage: !!firstImage,
      hasSecondImage: !!secondImage,
      userId: userId || 'anonymous',
      firstImageSize: firstImage?.length || 0,
      secondImageSize: secondImage?.length || 0
    });

    // Check image size limits (prevent memory issues)
    const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB limit
    if (firstImage && firstImage.length > MAX_IMAGE_SIZE) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'First image too large. Maximum size is 5MB.',
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }
    if (secondImage && secondImage.length > MAX_IMAGE_SIZE) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Second image too large. Maximum size is 5MB.',
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    // Try to get user info from JWT token if userId is not provided
    let actualUserId = userId;
    let userPhone = null;
    
    try {
      const authHeader = request.headers.get('Authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const jwt = await import('@tsndr/cloudflare-worker-jwt');
        
        // First verify the token is valid
        const isValid = await jwt.verify(token, env.JWT_SECRET);
        if (!isValid) {
          console.warn('⚠️ Invalid JWT token provided');
        } else {
          const payload = jwt.decode(token);
          const decoded = payload?.payload;
          
          console.log('🔍 JWT Token Debug:', {
            hasToken: !!token,
            decoded: decoded
          });
          
          if (decoded) {
            // If token has id, use it
            if (decoded.id) {
              actualUserId = decoded.id;
              console.log('✅ Using user ID from JWT:', actualUserId);
            }
            // If token has phone but no id (OTP verification case), use phone
            else if (decoded.phone) {
              userPhone = decoded.phone;
              console.log('✅ Using phone from JWT:', userPhone);
              
              // Try to find existing provider by phone
              try {
                const existingProvider = await env.KUDDL_DB.prepare(
                  'SELECT id FROM providers WHERE phone = ?'
                ).bind(userPhone).first();
                
                if (existingProvider) {
                  actualUserId = existingProvider.id;
                  console.log('✅ Found existing provider by phone:', actualUserId);
                }
              } catch (dbError) {
                console.warn('⚠️ Could not find provider by phone:', dbError.message);
              }
            }
          }
        }
      }
    } catch (tokenError) {
      console.warn('⚠️ Could not decode JWT token:', tokenError.message);
    }

    if (!firstImage || !secondImage) {
      return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'firstImage and secondImage are required' }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    // Check R2 storage availability
    if (!env.KUDDL_STORAGE) {
      console.error('❌ KUDDL_STORAGE binding not found! Check wrangler.toml configuration');
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Storage service not available',
        error: 'KUDDL_STORAGE binding not found'
      }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' } 
      }));
    }

    console.log('✅ KUDDL_STORAGE binding found');
    console.log('🔧 R2_PUBLIC_URL:', env.R2_PUBLIC_URL);

    const stripPrefix = (b64) => b64.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
    const base64ToArrayBuffer = (b64) => {
      const binary = atob(b64);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    };

    // Get partner phone for proper folder structure (consistent with document uploads)
    let partner = null;
    
    // If actualUserId is still not found, try to get the first active provider as fallback
    if (!actualUserId || actualUserId === 'anonymous') {
      console.warn('⚠️ No valid userId provided, attempting to find active provider');
      try {
        const activeProvider = await env.KUDDL_DB.prepare(
          'SELECT id, phone FROM providers WHERE is_active = 1 LIMIT 1'
        ).first();
        if (activeProvider) {
          actualUserId = activeProvider.id;
          partner = activeProvider;
          console.log('✅ Found active provider:', actualUserId);
        }
      } catch (dbError) {
        console.warn('⚠️ Could not find active provider:', dbError.message);
      }
    } else {
      try {
        partner = await env.KUDDL_DB.prepare(
          'SELECT phone FROM providers WHERE id = ?'
        ).bind(actualUserId).first();
      } catch (dbError) {
        console.warn('⚠️ Database query failed:', dbError.message);
      }
    }

    // Use partner ID directly for folder structure
    const folderIdentifier = actualUserId || 'anonymous';
    console.log('✅ Using partner ID for folder:', folderIdentifier);

    const sanitizedIdentifier = folderIdentifier.replace(/[^a-zA-Z0-9@.-]/g, '_');

    const ts = Date.now();
    // Store only final profile picture in proper structure - EXACT structure as requested
    const profileKey = `partners/${sanitizedIdentifier}/profile/profile_${ts}.jpg`;

    // Use the first image as the final profile picture
    console.log('🔍 Processing first image...');
    console.log('📏 First image length (raw):', firstImage?.length || 0);
    
    const strippedImage = stripPrefix(firstImage);
    console.log('📏 First image length (after strip):', strippedImage?.length || 0);
    console.log('🔍 First 50 chars of stripped image:', strippedImage?.substring(0, 50) || 'EMPTY');
    
    const profileBytes = base64ToArrayBuffer(strippedImage);
    console.log('📊 Profile image size (bytes):', profileBytes.length, 'bytes');
    
    if (profileBytes.length === 0) {
      console.error('❌ Profile image is empty after processing!');
      return addCorsHeaders(new Response(JSON.stringify({ 
        success: false, 
        message: 'Profile image data is empty' 
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    console.log('📤 Uploading profile picture to R2:', profileKey);

    let publicProfileUrl;
    let uploadSuccess = false;

    // Always try R2 upload first, fallback to base64 only if R2 fails
    try {
      console.log('🚀 Attempting R2 upload...');
      console.log('🔧 R2 binding available:', !!env.KUDDL_STORAGE);
      console.log('🔧 Profile key:', profileKey);
      console.log('🔧 Profile bytes type:', typeof profileBytes);
      console.log('🔧 Profile bytes constructor:', profileBytes.constructor.name);
      
      // Store only the final profile picture
      const uploadResult = await env.KUDDL_STORAGE.put(profileKey, profileBytes, {
        httpMetadata: { contentType: 'image/jpeg' }
      });

      console.log('✅ Successfully uploaded profile picture to R2');
      console.log('📋 Upload result:', uploadResult);
      
      // Generate the correct public URL using R2Utils
      const { getPublicR2Url } = await import('./utils/r2Utils.js');
      const r2PublicUrl = getPublicR2Url(profileKey, env);
      
      // Test if R2 URL is accessible by making a HEAD request
      try {
        const testResponse = await fetch(r2PublicUrl, { method: 'HEAD' });
        if (testResponse.ok) {
          console.log('✅ R2 URL is publicly accessible:', r2PublicUrl);
          publicProfileUrl = r2PublicUrl;
          uploadSuccess = true;
        } else {
          console.warn('⚠️ R2 URL not publicly accessible (status:', testResponse.status, '), using base64 fallback');
          publicProfileUrl = firstImage; // Use base64 fallback
          uploadSuccess = true;
        }
      } catch (testError) {
        console.warn('⚠️ Could not test R2 URL accessibility, using base64 fallback:', testError.message);
        publicProfileUrl = firstImage; // Use base64 fallback
        uploadSuccess = true;
      }
      
    } catch (uploadError) {
      console.error('❌ R2 upload failed:', uploadError);
      console.error('❌ Upload error details:', {
        message: uploadError.message,
        stack: uploadError.stack,
        name: uploadError.name
      });
      
      // Fallback to base64 data URL if R2 upload fails
      console.log('🔄 Falling back to base64 data URL');
      publicProfileUrl = firstImage; // Use the original base64 data URL
      uploadSuccess = true;
    }
    
    console.log('🔗 Generated public profile URL:', publicProfileUrl);
    console.log('🔧 Profile key used:', profileKey);
    console.log('🔧 R2_PUBLIC_URL from env:', env.R2_PUBLIC_URL);

    // Update profile_image_url in database with the correct public URL
    if (actualUserId && actualUserId !== 'anonymous') {
      try {
        console.log('🔄 Updating database with profile URL:', publicProfileUrl);
        console.log('👤 Actual User ID:', actualUserId);
        
        const result = await env.KUDDL_DB.prepare(`
          UPDATE providers SET profile_image_url = ?, updated_at = ? WHERE id = ?
        `).bind(publicProfileUrl, new Date().toISOString(), actualUserId).run();
        
        console.log('✅ Database update result:', result);
        console.log('✅ Updated profile_image_url in database:', publicProfileUrl);
        
        // Verify the update by querying the database
        const verification = await env.KUDDL_DB.prepare(`
          SELECT profile_image_url FROM providers WHERE id = ?
        `).bind(actualUserId).first();
        
        console.log('🔍 Verification query result:', verification);
      } catch (dbError) {
        console.error('❌ Database update error:', dbError);
        console.warn('⚠️ Could not update profile_image_url:', dbError.message);
      }
    } else {
      console.warn('⚠️ No valid userId provided for database update');
    }

    // Lightweight server-side checks
    let verified = true;
    let similarityScore = 0.9;
    const reasons = [];

    // Basic validation - check if images are provided
    const firstImageSize = stripPrefix(firstImage).length;
    const secondImageSize = stripPrefix(secondImage).length;

    // 1) Reject identical byte-lengths as a weak indicator of copy (not definitive)
    if (firstImageSize === secondImageSize) {
      similarityScore = 0.6;
      reasons.push('Images appear identical in size');
    }

    // 2) Use client-provided EAR meta if present
    if (faceMeta && typeof faceMeta === 'object') {
      if (!faceMeta.blinkDetected) {
        verified = false;
        reasons.push('Blink not detected');
      }
      const firstEAR = faceMeta.firstEAR;
      const secondEAR = faceMeta.secondEAR;
      const avg = (v) => typeof v === 'number' ? v : 0;
      if (firstEAR && secondEAR) {
        const firstAvg = (avg(firstEAR.L) + avg(firstEAR.R)) / 2;
        const secondAvg = (avg(secondEAR.L) + avg(secondEAR.R)) / 2;
        if (firstAvg < 0.22) { verified = false; reasons.push('First photo eyes not open'); }
        if (secondAvg < 0.22) { verified = false; reasons.push('Second photo eyes not open'); }
      }
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      verified,
      similarityScore,
      reasons,
      profilePictureKey: profileKey,
      profilePictureUrl: publicProfileUrl,
      firstUrl: publicProfileUrl,
      secondUrl: publicProfileUrl // Same image for both
    }), { headers: { 'Content-Type': 'application/json' } }));
  } catch (error) {
    console.error('❌ blink-capture error:', error);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Error name:', error.name);
    console.error('❌ Error message:', error.message);
    
    return addCorsHeaders(new Response(JSON.stringify({ 
      success: false, 
      message: 'Blink capture failed', 
      error: error.message,
      errorType: error.name,
      details: 'Check server logs for more information'
    }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    }));
  }
});

// Migration endpoint to update children table schema
router.post('/api/migrate/update-children-schema', async (request, env) => {
  try {
    console.log('🔄 Running children table schema update...');

    const alterStatements = [
      'ALTER TABLE children ADD COLUMN medical_conditions TEXT',
      'ALTER TABLE children ADD COLUMN bedtime TEXT',
      'ALTER TABLE children ADD COLUMN dietary_restrictions TEXT'
    ];

    const results = [];

    for (const statement of alterStatements) {
      try {
        await env.KUDDL_DB.prepare(statement).run();
        console.log('✅ Executed:', statement);
        results.push({ statement, status: 'success' });
      } catch (error) {
        if (error.message.includes('duplicate column name')) {
          console.log('⚠️ Column already exists:', statement);
          results.push({ statement, status: 'already_exists' });
        } else {
          console.error('❌ Failed:', statement, error.message);
          results.push({ statement, status: 'failed', error: error.message });
        }
      }
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Children schema update completed',
      results
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Migration error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Migration failed',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Migration endpoint to ensure customer_profiles table exists
router.post('/api/migrate/ensure-customer-profiles', async (request, env) => {
  try {
    console.log('🔄 Ensuring customer_profiles table exists...');
    
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS customer_profiles (
          id TEXT PRIMARY KEY,
          user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
          family_size INTEGER,
          children_count INTEGER DEFAULT 0,
          preferred_languages TEXT,
          emergency_contact_name TEXT,
          emergency_contact_phone TEXT,
          special_instructions TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'customer_profiles table check/creation completed'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
  } catch (error) {
    console.error('Migration error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to ensure customer_profiles table',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Auth Routes
router.post('/api/auth/login', async (request, env) => {
  return authController.login(request, env);
});

router.post('/api/auth/verify', async (request, env) => {
  return authController.verify(request, env);
});

router.post('/api/auth/refresh', async (request, env) => {
  return authController.refresh(request, env);
});

router.post('/api/auth/logout', async (request, env) => {
  return authController.logout(request, env);
});

// KYC routes are now handled by kycRoutes.js

// Validation Routes
router.post('/api/validate/email', async (request, env) => {
  return adminController.checkEmailAvailability(request, env);
});

router.post('/api/validate/phone', async (request, env) => {
  return adminController.checkPhoneAvailability(request, env);
});

// Partner/Admin change password
router.post('/api/partner/change-password', async (request, env) => {
  try {
    const user = await authController.verifyToken(request, env);
    if (!user) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authorization token required'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'Invalid JSON body' }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    const { currentPassword, newPassword } = body || {};
    if (!currentPassword || !newPassword) {
      return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'Current password and new password are required' }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    // Basic new password policy
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'New password must be at least 8 characters' }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    if (user.role === 'admin') {
      const admin = await env.KUDDL_DB.prepare('SELECT id, password_hash FROM admins WHERE id = ?').bind(user.id).first();
      if (!admin) {
        return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'Admin not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } }));
      }
      const ok = await bcrypt.compare(currentPassword, admin.password_hash || '');
      if (!ok) {
        return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'Current password is incorrect' }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
      }
      const newHash = await bcrypt.hash(newPassword, 12);
      await env.KUDDL_DB.prepare('UPDATE admins SET password_hash = ?, last_password_change = ?, updated_at = ? WHERE id = ?')
        .bind(newHash, new Date().toISOString(), new Date().toISOString(), user.id).run();
      return addCorsHeaders(new Response(JSON.stringify({ success: true, message: 'Password updated successfully' }), { headers: { 'Content-Type': 'application/json' } }));
    }

    // Default: partner/provider
    const provider = await env.KUDDL_DB.prepare('SELECT id, password_hash FROM providers WHERE id = ?')
      .bind(user.id).first();
    if (!provider) {
      return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'Partner not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } }));
    }
    const isMatch = await bcrypt.compare(currentPassword, provider.password_hash || '');
    if (!isMatch) {
      return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'Current password is incorrect' }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }
    const hashed = await bcrypt.hash(newPassword, 12);
    await env.KUDDL_DB.prepare('UPDATE providers SET password_hash = ?, updated_at = ? WHERE id = ?')
      .bind(hashed, new Date().toISOString(), user.id).run();
    return addCorsHeaders(new Response(JSON.stringify({ success: true, message: 'Password updated successfully' }), { headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('Change password error:', error);
    return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
});

// Production OTP Routes (D1 + Twilio SMS)
router.post('/api/auth/send-otp', async (request, env) => {
  const { sendProductionOTP } = await import('./controllers/productionOtpController.js');
  return sendProductionOTP(request, env);
});

router.post('/api/auth/verify-otp', async (request, env) => {
  const { verifyProductionOTP } = await import('./controllers/productionOtpController.js');
  return verifyProductionOTP(request, env);
});

// Partner Production OTP Routes
router.post('/api/auth/send-partner-otp', async (request, env) => {
  const { sendPartnerProductionOTP } = await import('./controllers/productionOtpController.js');
  return sendPartnerProductionOTP(request, env);
});

router.post('/api/auth/verify-partner-otp', async (request, env) => {
  const { verifyPartnerProductionOTP } = await import('./controllers/productionOtpController.js');
  return verifyPartnerProductionOTP(request, env);
});

// Legacy OTP Routes (keep for backward compatibility)
router.post('/api/otp/send', async (request, env) => {
  const { sendProductionOTP } = await import('./controllers/productionOtpController.js');
  return sendProductionOTP(request, env);
});

router.post('/api/otp/verify', async (request, env) => {
  const { verifyProductionOTP } = await import('./controllers/productionOtpController.js');
  return verifyProductionOTP(request, env);
});

router.post('/api/otp/send-partner', async (request, env) => {
  const { sendPartnerProductionOTP } = await import('./controllers/productionOtpController.js');
  return sendPartnerProductionOTP(request, env);
});

router.post('/api/otp/verify-partner', async (request, env) => {
  const { verifyPartnerProductionOTP } = await import('./controllers/productionOtpController.js');
  return verifyPartnerProductionOTP(request, env);
});

// OTP Service Routes (Urban Clap style booking flow)
router.post('/api/otp/booking/generate', async (request, env) => {
  return otpServiceController.generateBookingOTP(request, env);
});

router.post('/api/otp/booking/verify-start', async (request, env) => {
  return otpServiceController.verifyOTPAndStartService(request, env);
});

router.post('/api/otp/booking/complete', async (request, env) => {
  return otpServiceController.markServiceCompleted(request, env);
});

router.get('/api/otp/booking/status', async (request, env) => {
  return otpServiceController.getOTPStatus(request, env);
});

router.post('/api/otp/booking/generate-missing', async (request, env) => {
  return otpServiceController.generateMissingOTPs(request, env);
});

// Database Migration Routes
router.post('/api/database/create-otp-tables', async (request, env) => {
  return otpDatabaseController.createOTPTables(request, env);
});

router.post('/api/database/update-bookings-for-otp', async (request, env) => {
  return otpDatabaseController.updateBookingsTableForOTP(request, env);
});

// Create OTP verifications table for production OTP flow
router.post('/api/database/create-otp-verifications', async (request, env) => {
  const { createOtpVerificationsTable } = await import('./controllers/productionOtpController.js');
  return createOtpVerificationsTable(request, env);
});

// Twilio testing routes
router.post('/api/test/twilio-credentials', async (request, env) => {
  const { testTwilioCredentials } = await import('./controllers/twilioTestController.js');
  return testTwilioCredentials(request, env);
});

router.post('/api/test/send-sms', async (request, env) => {
  const { sendTestSMS } = await import('./controllers/twilioTestController.js');
  return sendTestSMS(request, env);
});

// Debug routes
router.get('/api/debug/otp-table', async (request, env) => {
  const { debugOtpTable } = await import('./controllers/debugController.js');
  return debugOtpTable(request, env);
});

router.post('/api/debug/recreate-otp-table', async (request, env) => {
  const { recreateOtpTable } = await import('./controllers/debugController.js');
  return recreateOtpTable(request, env);
});

router.post('/api/test/twilio-without-service', async (request, env) => {
  const { testTwilioWithoutService } = await import('./controllers/twilioDebugController.js');
  return testTwilioWithoutService(request, env);
});

// Test OTP Route for debugging
router.post('/api/test/create-booking-with-otp', async (request, env) => {
  return testOtpController.createTestBookingWithOTP(request, env);
});

// Test Data Route for creating sample bookings with ratings
router.post('/api/test/create-booking-data', async (request, env) => {
  return testDataController.createTestBookingData(request, env);
});

// Quick Test Route for direct database insert
router.post('/api/test/quick-data', async (request, env) => {
  return quickTestController.createQuickTestData(request, env);
});

// Direct Test Route for raw SQL insertion
router.post('/api/test/direct-data', async (request, env) => {
  return directTestController.createDirectTestData(request, env);
});

// Provider Table Migration Route
router.post('/api/migrate/restructure-provider-table', async (request, env) => {
  return providerTableMigrationController.restructureProviderTable(request, env);
});

// Force Column Removal Route
router.post('/api/migrate/force-remove-columns', async (request, env) => {
  return forceColumnRemovalController.forceRemoveColumns(request, env);
});

// Direct Column Removal Route
router.post('/api/migrate/direct-remove-columns', async (request, env) => {
  return directColumnRemovalController.removeColumnsDirectly(request, env);
});

// Database Inspection Routes
router.get('/api/debug/inspect-database', async (request, env) => {
  return databaseInspectionController.inspectDatabase(request, env);
});

router.post('/api/migrate/force-recreate-providers', async (request, env) => {
  return databaseInspectionController.forceRecreateProvidersTable(request, env);
});

// Debug Bookings Routes
router.get('/api/debug/bookings-ratings', async (request, env) => {
  return debugBookingsController.debugBookingsAndRatings(request, env);
});

router.post('/api/debug/clear-test-bookings', async (request, env) => {
  return debugBookingsController.clearTestBookings(request, env);
});

// Table Info Route
router.get('/api/debug/table-info', async (request, env) => {
  return tableInfoController.getTableInfo(request, env);
});

// Google OAuth Routes
router.post('/api/auth/google', async (request, env) => {
  const googleAuthController = new GoogleAuthController(env);
  return googleAuthController.handleGoogleAuth(request);
});

router.get('/api/auth/profile', async (request, env) => {
  try {
    const user = await authController.verifyToken(request, env);
    if (!user) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Unauthorized'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    
    const googleAuthController = new GoogleAuthController(env);
    return googleAuthController.getUserProfile(request, user.id);
  } catch (error) {
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Authentication failed'
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Verification Routes
router.post('/api/verification/complete', async (request, env) => {
  return verificationController.completeVerification(request, env);
});

router.get('/api/verification/status/:providerId', async (request, env) => {
  return verificationController.getVerificationStatus(request, env);
});

router.post('/api/verification/document', async (request, env) => {
  return verificationController.updateDocumentVerification(request, env);
});

// Admin Routes
router.post('/api/admin/init-database', async (request, env) => {
  return adminController.initDatabase(request, env);
});

// Fix categories table schema
router.post('/api/admin/fix-categories-schema', async (request, env) => {
  try {
    console.log('🔧 Fixing categories and subcategories table schema...');
    
    // Fix categories table
    const categoriesTableInfo = await env.KUDDL_DB.prepare('PRAGMA table_info(categories)').all();
    const categoriesColumnNames = categoriesTableInfo.results.map(col => col.name);
    
    const categoriesColumnsToAdd = [
      { name: 'color', type: 'TEXT' },
      { name: 'is_active', type: 'INTEGER DEFAULT 1' },
      { name: 'icon', type: 'TEXT' }
    ];
    
    for (const column of categoriesColumnsToAdd) {
      if (!categoriesColumnNames.includes(column.name)) {
        console.log(`Adding ${column.name} column to categories table...`);
        await env.KUDDL_DB.prepare(`ALTER TABLE categories ADD COLUMN ${column.name} ${column.type}`).run();
        console.log(`✅ ${column.name} column added`);
      }
    }
    
    // Fix subcategories table
    const subcategoriesTableInfo = await env.KUDDL_DB.prepare('PRAGMA table_info(subcategories)').all();
    const subcategoriesColumnNames = subcategoriesTableInfo.results.map(col => col.name);
    
    const subcategoriesColumnsToAdd = [
      { name: 'sort_order', type: 'INTEGER DEFAULT 0' },
      { name: 'is_parent', type: 'INTEGER DEFAULT 0' },
      { name: 'parent_name', type: 'TEXT' },
      { name: 'is_active', type: 'INTEGER DEFAULT 1' }
    ];
    
    for (const column of subcategoriesColumnsToAdd) {
      if (!subcategoriesColumnNames.includes(column.name)) {
        console.log(`Adding ${column.name} column to subcategories table...`);
        await env.KUDDL_DB.prepare(`ALTER TABLE subcategories ADD COLUMN ${column.name} ${column.type}`).run();
        console.log(`✅ ${column.name} column added`);
      }
    }
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Categories and subcategories schema fixed successfully',
      categoriesColumnsAdded: categoriesColumnsToAdd.filter(col => !categoriesColumnNames.includes(col.name)).map(col => col.name),
      subcategoriesColumnsAdded: subcategoriesColumnsToAdd.filter(col => !subcategoriesColumnNames.includes(col.name)).map(col => col.name)
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    
  } catch (error) {
    console.error('❌ Error fixing categories schema:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Update categories endpoint
router.post('/api/admin/update-categories', async (request, env) => {
  try {
    console.log('🚀 Starting category database update...\n');
    
    const categories = [
      {
        id: 'adventure',
        name: 'ADVENTURE',
        module: 'EVENTS',
        description: 'Kids parties, events and celebration experiences',
        icon: 'PartyPopper',
        color: '#FF6B6B',
        is_active: true,
        subcategories: [
          { name: 'Kids Parties', description: 'Birthday parties and celebration events for children', sort_order: 1 },
          { name: 'Events and Celebrations', description: 'Special events and celebration experiences', sort_order: 2 },
          { name: 'Party Decor & Setups', description: 'Professional party decoration and setup services', sort_order: 3 },
          { name: 'Entertainment & Live Performers', description: 'Live entertainment and performers for events', sort_order: 4 },
          { name: 'Active Play & Bouncies', description: 'Bouncy castles and active play equipment', sort_order: 5 },
          { name: 'Creative & DIY Activities', description: 'Creative and do-it-yourself activity stations', sort_order: 6 },
          { name: 'Games & Interaction Zones', description: 'Interactive games and activity zones', sort_order: 7 },
          { name: 'Cakes & Return Gifts', description: 'Custom cakes and return gift services', sort_order: 8 },
          { name: 'Photographers', description: 'Professional photography services for events', sort_order: 9 },
          { name: 'Videographers', description: 'Professional videography services for events', sort_order: 10 },
          { name: 'Premium Experience Add-ons', description: 'Premium add-on experiences for special events', sort_order: 11 },
          { name: 'Other', description: 'Other party and event services', sort_order: 12 }
        ]
      },
      {
        id: 'bloom',
        name: 'BLOOM',
        module: 'BLOOM',
        description: 'Kids learning, sports and developmental classes',
        icon: 'Sparkles',
        color: '#4ECDC4',
        is_active: true,
        subcategories: [
          { name: 'Kids Classes for Brain Development', description: 'Classes focused on cognitive and brain development', sort_order: 1 },
          { name: 'Kids Learning Programmes', description: 'Educational learning programmes for children', sort_order: 2 },
          { name: 'Sports Coaching', description: 'Sports training and coaching programmes', sort_order: 3 },
          { name: 'Developmental Classes', description: 'Classes for overall child development', sort_order: 4 },
          { name: 'Sensory Integration Therapy', description: 'Therapy for sensory processing development', sort_order: 5 },
          { name: 'Early Childhood Education', description: 'Foundational education for young children', sort_order: 6 },
          { name: 'Phonics & Literacy Classes', description: 'Reading and literacy skill development', sort_order: 7 },
          { name: 'Music Classes', description: 'Musical education and instrument training', sort_order: 8 },
          { name: 'Child Yoga & Mindfulness Classes', description: 'Yoga and mindfulness practices for children', sort_order: 9 },
          { name: 'Visual Arts & Creative Classes', description: 'Art and creative expression classes', sort_order: 10 },
          { name: 'Dance & Movement Classes', description: 'Dance and movement education', sort_order: 11 },
          { name: 'Montessori Education Programmes', description: 'Montessori-based educational programmes', sort_order: 12 },
          { name: 'Other', description: 'Other learning and developmental programmes', sort_order: 13 }
        ]
      },
      {
        id: 'care',
        name: 'CARE',
        module: 'CARE',
        description: 'Health, therapy & child wellbeing support',
        icon: 'Heart',
        color: '#95E1D3',
        is_active: true,
        subcategories: [
          { name: 'Infant & Postnatal Care', description: 'Comprehensive infant and postnatal care services', sort_order: 1, is_parent: true },
          { name: 'Infant Massage Therapy', description: 'Therapeutic massage for infants', sort_order: 2, parent_name: 'Infant & Postnatal Care' },
          { name: 'Postnatal Caregiver (Japa Services)', description: 'Traditional postnatal care and support', sort_order: 3, parent_name: 'Infant & Postnatal Care' },
          { name: 'Pediatric Home Nursing Care', description: 'Professional nursing care at home', sort_order: 4, parent_name: 'Infant & Postnatal Care' },
          { name: 'Lactation Consultation', description: 'Expert lactation support and consultation', sort_order: 5, parent_name: 'Infant & Postnatal Care' },
          { name: 'Infant Grooming & Hygiene Care', description: 'Professional infant grooming and hygiene services', sort_order: 6, parent_name: 'Infant & Postnatal Care' },
          { name: 'Infant Ear Piercing Services', description: 'Safe and hygienic ear piercing for infants', sort_order: 7, parent_name: 'Infant & Postnatal Care' },
          { name: 'Therapy & Clinical Support', description: 'Professional therapy and clinical services', sort_order: 8, is_parent: true },
          { name: 'Speech Therapy', description: 'Speech and language development therapy', sort_order: 9, parent_name: 'Therapy & Clinical Support' },
          { name: 'Physiotherapy', description: 'Pediatric physiotherapy services', sort_order: 10, parent_name: 'Therapy & Clinical Support' },
          { name: 'Pediatric Occupational Therapy (OT)', description: 'Occupational therapy for children', sort_order: 11, parent_name: 'Therapy & Clinical Support' },
          { name: 'Child Psychology & Counselling', description: 'Psychological support and counseling for children', sort_order: 12, parent_name: 'Therapy & Clinical Support' },
          { name: 'Special Education & Early Intervention', description: 'Special education and early intervention programs', sort_order: 13, parent_name: 'Therapy & Clinical Support' },
          { name: 'Wellness & Nutrition', description: 'Health, wellness and nutrition services', sort_order: 14, is_parent: true },
          { name: 'Pediatric Nutrition & Diet Planning', description: 'Professional nutrition and diet planning for children', sort_order: 15, parent_name: 'Wellness & Nutrition' },
          { name: 'Pediatric Sleep Consulting', description: 'Expert sleep consultation and support', sort_order: 16, parent_name: 'Wellness & Nutrition' },
          { name: 'Other', description: 'Other care and therapy services', sort_order: 17 }
        ]
      },
      {
        id: 'discover',
        name: 'DISCOVER',
        module: 'DISCOVER',
        description: 'Exposure, experiences & enrichment',
        icon: 'GraduationCap',
        color: '#F38181',
        is_active: true,
        subcategories: [
          { name: 'Workshops & Events', description: 'Educational workshops and skill-building events', sort_order: 1 },
          { name: 'Camps & Holiday Programs', description: 'Seasonal camps and holiday programs', sort_order: 2 },
          { name: 'Community & Social Activities', description: 'Community engagement and social activities', sort_order: 3 },
          { name: 'Other', description: 'Other discovery and enrichment activities', sort_order: 4 }
        ]
      }
    ];
    
    // Clear existing data
    console.log('📝 Clearing existing categories and subcategories...');
    await env.KUDDL_DB.prepare('DELETE FROM subcategories').run();
    await env.KUDDL_DB.prepare('DELETE FROM categories').run();
    console.log('✅ Existing data cleared\n');
    
    // Insert new categories
    console.log('📝 Inserting new categories...');
    for (const category of categories) {
      await env.KUDDL_DB.prepare(`
        INSERT INTO categories (id, name, module, description, icon, color, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).bind(
        category.id,
        category.name,
        category.module,
        category.description,
        category.icon,
        category.color,
        category.is_active ? 1 : 0
      ).run();
      
      console.log(`  ✓ Inserted category: ${category.name}`);
    }
    console.log('✅ All categories inserted\n');
    
    // Insert subcategories
    console.log('📝 Inserting subcategories...');
    let totalSubcategories = 0;
    
    for (const category of categories) {
      for (const subcategory of category.subcategories) {
        const subcategoryId = `${category.id}_${subcategory.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
        
        await env.KUDDL_DB.prepare(`
          INSERT INTO subcategories (
            id, category_id, name, description, sort_order, 
            is_parent, parent_name, is_active, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).bind(
          subcategoryId,
          category.id,
          subcategory.name,
          subcategory.description,
          subcategory.sort_order,
          subcategory.is_parent ? 1 : 0,
          subcategory.parent_name || null,
          1
        ).run();
        
        totalSubcategories++;
      }
    }
    console.log(`✅ Total ${totalSubcategories} subcategories inserted\n`);
    
    // Verify
    const categoryCount = await env.KUDDL_DB.prepare('SELECT COUNT(*) as count FROM categories').first();
    const subcategoryCount = await env.KUDDL_DB.prepare('SELECT COUNT(*) as count FROM subcategories').first();
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Categories updated successfully',
      categoriesInserted: categoryCount.count,
      subcategoriesInserted: subcategoryCount.count
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    
  } catch (error) {
    console.error('❌ Error updating categories:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Test and fix database schema
router.post('/api/admin/test-database', async (request, env) => {
  try {
    // Import the test functions
    const { testAndFixDatabase, testProfileCompletion } = await import('../test-database.js');

    console.log('🧪 Running database schema test and fix...');

    // Test and fix the database schema
    const schemaResult = await testAndFixDatabase(env);
    console.log('Schema test result:', schemaResult);

    // Test profile completion
    const profileResult = await testProfileCompletion(env);
    console.log('Profile test result:', profileResult);

    return new Response(JSON.stringify({
      success: true,
      message: 'Database test and fix completed',
      schemaResult,
      profileResult
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Database test failed:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Database test failed',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});


router.get('/api/debug/partners', async (request, env) => {
  return adminController.debugPartners(request, env);
});

// Admin: delete a provider by id
router.delete('/api/admin/partners/:id', async (request, env) => {
  try {
    const authed = await authController.verifyToken(request, env);
    if (!authed || authed.role !== 'admin') {
      return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'Admin authorization required' }), { status: 403, headers: { 'Content-Type': 'application/json' } }));
    }

    const providerId = request.params?.id;
    if (!providerId) {
      return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'Provider id is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    // Ensure provider exists
    const existing = await env.KUDDL_DB.prepare('SELECT id FROM providers WHERE id = ?').bind(providerId).first();
    if (!existing) {
      return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'Provider not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } }));
    }

    // Delete provider (foreign keys may cascade if defined)
    await env.KUDDL_DB.prepare('DELETE FROM providers WHERE id = ?').bind(providerId).run();

    return addCorsHeaders(new Response(JSON.stringify({ success: true, message: 'Provider deleted' }), { headers: { 'Content-Type': 'application/json' } }));
  } catch (error) {
    console.error('Delete provider error:', error);
    return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
});

// Quick admin setup (no auth required) - creates admin if doesn't exist
router.post('/api/admin/quick-setup', async (request, env) => {
  try {
    console.log('🔧 Quick admin setup...');

    // Drop existing admin table to fix schema issues
    try {
      await env.KUDDL_DB.prepare(`DROP TABLE IF EXISTS admins`).run();
      console.log('✅ Dropped existing admins table');
    } catch (dropError) {
      console.log('⚠️ Could not drop admins table:', dropError.message);
    }

    // Create admin table with correct schema
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS admins (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    console.log('✅ Admin table created with correct schema');

    // Create admin user
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash('Admin@123', 12);

    await env.KUDDL_DB.prepare(`
      INSERT INTO admins (id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      'admin001',
      'admin@kuddl.co',
      passwordHash,
      'Kuddl',
      'Admin',
      1,
      new Date().toISOString(),
      new Date().toISOString()
    ).run();

    console.log('✅ Admin created successfully');

    // Verify admin exists
    const finalAdmin = await env.KUDDL_DB.prepare(`
      SELECT id, email, first_name, last_name, is_active, created_at FROM admins WHERE email = ?
    `).bind('admin@kuddl.co').first();

    return new Response(JSON.stringify({
      success: true,
      message: 'Admin setup completed successfully',
      admin: finalAdmin,
      credentials: {
        email: 'admin@kuddl.co',
        password: 'Admin@123'
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Quick setup error:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Quick setup failed',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// Simple admin check (no auth required)
router.get('/api/admin/exists', async (request, env) => {
  try {
    console.log('🔍 Checking if admin exists...');

    const admins = await env.KUDDL_DB.prepare(`
      SELECT id, email, full_name, status, created_at
      FROM admins 
      ORDER BY created_at DESC
    `).all();

    return new Response(JSON.stringify({
      success: true,
      message: `Found ${admins.results.length} admin(s)`,
      admins: admins.results
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Error checking admins:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Failed to check admins',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// Check admin credentials (for debugging)
router.post('/api/admin/check-credentials', async (request, env) => {
  try {
    const { email, password } = await request.json();
    console.log('🔍 Checking admin credentials for:', email);

    // Check if admin exists
    const admin = await env.KUDDL_DB.prepare(`
      SELECT id, email, full_name, status, password_hash, created_at
      FROM admins 
      WHERE email = ?
    `).bind(email).first();

    if (!admin) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Admin not found',
        email: email
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check password
    const bcrypt = await import('bcryptjs');
    const isValidPassword = await bcrypt.compare(password, admin.password_hash);

    return new Response(JSON.stringify({
      success: true,
      message: 'Admin credentials check completed',
      admin: {
        id: admin.id,
        email: admin.email,
        full_name: admin.full_name,
        status: admin.status,
        created_at: admin.created_at,
        password_valid: isValidPassword
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Error checking admin credentials:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Failed to check admin credentials',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// Get all partners with credentials (for debugging)
router.get('/api/admin/partners-list', async (request, env) => {
  try {
    console.log('🔍 Fetching all partners...');

    const partners = await env.KUDDL_DB.prepare(`
      SELECT 
        id, 
        email, 
        phone, 
        first_name, 
        last_name, 
        business_name,
        is_active,
        created_at,
        CASE 
          WHEN password_hash IS NOT NULL THEN 'Has Password' 
          ELSE 'No Password Set' 
        END as password_status
      FROM providers 
      ORDER BY created_at DESC
    `).all();

    return new Response(JSON.stringify({
      success: true,
      message: `Found ${partners.results.length} partners`,
      partners: partners.results
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Error fetching partners:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch partners',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

router.post('/api/debug/test-login', async (request, env) => {
  return adminController.testLogin(request, env);
});

router.get('/api/admin/partners', async (request, env) => {
  return adminController.getPartners(request, env);
});

router.get('/api/admin/partners/:id/documents', async (request, env) => {
  return adminController.getPartnerDocuments(request, env);
});

router.put('/api/admin/partners/:id/verify', async (request, env) => {
  return adminController.updatePartnerVerification(request, env);
});

router.get('/api/admin/dashboard-stats', async (request, env) => {
  return adminController.getDashboardStats(request, env);
});

router.get('/api/admin/bookings', async (request, env) => {
  return adminController.getAdminBookings(request, env);
});

router.get('/api/admin/revenue', async (request, env) => {
  return adminController.getAdminRevenue(request, env);
});

// Combined parent dashboard - single call for profile + bookings + children
router.get('/api/parent/dashboard', async (request, env) => {
  return parentController.getParentDashboard(request, env);
});

// Parent/Customer routes
router.get('/api/parent/profile', async (request, env) => {
  return parentController.getParentProfile(request, env);
});

router.post('/api/parent/profile', async (request, env) => {
  return parentController.getParentProfile(request, env);
});

router.put('/api/parent/profile', async (request, env) => {
  return parentController.updateParentProfile(request, env);
});

router.get('/api/parent/children', async (request, env) => {
  return parentController.getParentChildren(request, env);
});

router.post('/api/parent/children', async (request, env) => {
  return parentController.addChild(request, env);
});

router.get('/api/parent/bookings', async (request, env) => {
  return parentController.getParentBookings(request, env);
});

// Customer Wishlist routes
router.get('/api/customer/wishlist', async (request, env) => {
  return customerWishlistController.getWishlist(request, env);
});

router.post('/api/customer/wishlist', async (request, env) => {
  return customerWishlistController.addToWishlist(request, env);
});

router.delete('/api/customer/wishlist/:service_id', async (request, env) => {
  return customerWishlistController.removeFromWishlist(request, env);
});

// Customer Wallet routes
router.get('/api/customer/wallet', async (request, env) => {
  return customerWalletController.getWallet(request, env);
});

router.post('/api/customer/wallet/add-money', async (request, env) => {
  return customerWalletController.createAddMoneyOrder(request, env);
});

router.post('/api/customer/wallet/verify-payment', async (request, env) => {
  return customerWalletController.verifyPaymentAndCredit(request, env);
});

// Customer Contacts routes
router.get('/api/customer/contacts', async (request, env) => {
  return customerContactsController.getContacts(request, env);
});

// Temporary test endpoint to check bookings directly
router.post('/api/test-bookings-direct', async (request, env) => {
  try {
    const { parentId } = await request.json();
    console.log('🔍 Direct test - Checking bookings for parent ID:', parentId);
    
    // Query bookings directly
    const bookings = await env.KUDDL_DB.prepare(`
      SELECT 
        b.*,
        s.name as service_name,
        pr.business_name,
        pr.first_name as provider_first_name,
        pr.last_name as provider_last_name
      FROM bookings b
      LEFT JOIN services s ON b.service_id = s.id
      LEFT JOIN providers pr ON b.provider_id = pr.id
      WHERE b.parent_id = ?
      ORDER BY b.created_at DESC
    `).bind(parentId).all();
    
    console.log('🔍 Direct test - Query result:', bookings);
    console.log('🔍 Direct test - Number of bookings found:', bookings.results?.length || 0);
    
    return new Response(JSON.stringify({
      success: true,
      parentId,
      bookingsFound: bookings.results?.length || 0,
      bookings: bookings.results || []
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('❌ Direct test error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// Location-based product filtering - returns real services from database
router.get('/api/products', async (request, env) => {
  try {
    const url = new URL(request.url);
    const pincode = url.searchParams.get('pincode');
    
    console.log('🔍 Products API called with pincode:', pincode);
    
    if (!pincode) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Pincode is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Check if services table exists
    try {
      const checkTableQuery = `SELECT name FROM sqlite_master WHERE type='table' AND name='services'`;
      const tableExists = await env.KUDDL_DB.prepare(checkTableQuery).first();
      
      if (!tableExists) {
        console.log('Services table does not exist, returning empty array');
        return addCorsHeaders(new Response(JSON.stringify({
          success: true,
          products: [],
          pincode: pincode,
          count: 0
        }), {
          headers: { 'Content-Type': 'application/json' }
        }));
      }

      // Query services that are available in the requested pincode
      const servicesQuery = `
        SELECT 
          s.id,
          s.name,
          s.category_id as category,
          c.name as category_name,
          s.price,
          s.price_type,
          s.duration_minutes,
          s.available_pincodes,
          s.primary_image_url,
          p.business_name,
          p.first_name,
          p.last_name,
          p.average_rating
        FROM services s
        LEFT JOIN providers p ON s.provider_id = p.id
        LEFT JOIN categories c ON s.category_id = c.id
        WHERE s.status = 'active' 
        AND p.is_active = 1 
        AND (
          (s.available_pincodes IS NOT NULL AND s.available_pincodes LIKE ?) OR
          (s.available_pincodes IS NULL AND p.serviceable_pincodes IS NOT NULL AND p.serviceable_pincodes LIKE ?)
        )
        ORDER BY s.created_at DESC
        LIMIT 20
      `;

      const services = await env.KUDDL_DB.prepare(servicesQuery).bind(`%${pincode}%`, `%${pincode}%`).all();

      // Transform services to products format for compatibility
      const products = (services.results || []).map(service => ({
        id: service.id,
        name: service.name,
        category: service.category_name || service.category,
        price: service.price,
        duration: service.duration_minutes ? `${service.duration_minutes} minutes` : '1 hour',
        rating: service.average_rating || 4.5,
        available: true,
        pincode: pincode,
        price_type: service.price_type,
        provider_name: service.business_name || `${service.first_name || ''} ${service.last_name || ''}`.trim() || 'Service Provider',
        image_url: service.primary_image_url
      }));

      console.log('✅ Found', products.length, 'real services for pincode:', pincode);

      return addCorsHeaders(new Response(JSON.stringify({
        success: true,
        products: products,
        pincode: pincode,
        count: products.length
      }), {
        headers: { 'Content-Type': 'application/json' }
      }));

    } catch (dbError) {
      console.log('Database error in products API:', dbError);
      return addCorsHeaders(new Response(JSON.stringify({
        success: true,
        products: [],
        pincode: pincode,
        count: 0
      }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    }

  } catch (error) {
    console.error('❌ Products API error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch products',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Search pincodes API - only for service available states
router.get('/api/search/pincodes', async (request, env) => {
  try {
    const url = new URL(request.url);
    let query = url.searchParams.get('q');
    
    console.log('🔍 Pincodes search API called with query:', query);
    
    if (!query || query.length < 2) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: true,
        results: []
      }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Handle city name aliases
    const cityAliases = {
      'gurgaon': 'gurugram',
      'gurgoan': 'gurugram',
      'noida': 'noida',
      'greater noida': 'noida',
      'faridabad': 'faridabad',
      'ghaziabad': 'ghaziabad',
      'lucknow': 'lucknow',
      'agra': 'agra'
    };

    // Check if query matches any alias
    const lowerQuery = query.toLowerCase();
    const actualCityName = cityAliases[lowerQuery] || query;

    // Only search in states where services are available
    const serviceStates = ['Delhi', 'Uttar Pradesh', 'Haryana'];
    const stateConditions = serviceStates.map(() => 'state = ?').join(' OR ');

    // Search in pincodes table - only in service available states
    // Use both original query and alias for comprehensive search
    const searchResults = await env.KUDDL_DB.prepare(`
      SELECT DISTINCT pincode, area, city, state 
      FROM pincodes 
      WHERE 
        (${stateConditions}) AND
        (pincode LIKE ? OR 
         area LIKE ? OR 
         city LIKE ? OR 
         city LIKE ? OR 
         state LIKE ?)
      ORDER BY 
        CASE 
          WHEN pincode LIKE ? THEN 1
          WHEN city LIKE ? THEN 2
          WHEN city LIKE ? THEN 3
          WHEN area LIKE ? THEN 4
          ELSE 5
        END,
        city, area
      LIMIT 10
    `).bind(
      ...serviceStates,
      `%${query}%`, `%${query}%`, `%${query}%`, `%${actualCityName}%`, `%${query}%`,
      `${query}%`, `${query}%`, `${actualCityName}%`, `${query}%`
    ).all();

    console.log('✅ Found', searchResults.results?.length || 0, 'pincode results in service states');

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      results: searchResults.results || [],
      query: query,
      searchedFor: actualCityName !== query ? [query, actualCityName] : [query],
      serviceStates: serviceStates
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Pincodes search API error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to search pincodes',
      error: error.message,
      results: []
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Validate pincode availability API
router.get('/api/validate/pincode/:pincode', async (request, env) => {
  try {
    const { pincode } = request.params;
    
    console.log('🔍 Validating pincode:', pincode);
    
    if (!pincode) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Pincode is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Check if pincode exists in service available states
    const serviceStates = ['Delhi', 'Uttar Pradesh', 'Haryana'];
    const stateConditions = serviceStates.map(() => 'state = ?').join(' OR ');

    const pincodeData = await env.KUDDL_DB.prepare(`
      SELECT pincode, area, city, state 
      FROM pincodes 
      WHERE pincode = ? AND (${stateConditions})
      LIMIT 1
    `).bind(pincode, ...serviceStates).first();

    const isAvailable = !!pincodeData;

    console.log('✅ Pincode validation result:', { pincode, isAvailable, data: pincodeData });

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      available: isAvailable,
      pincode: pincode,
      data: pincodeData || null,
      serviceStates: serviceStates
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Pincode validation API error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to validate pincode',
      error: error.message,
      available: false
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Public partner endpoints
router.post('/api/partners/signup', async (request, env) => {
  return adminController.partnerSignup(request, env);
});

// Debug endpoints
router.get('/debug/admins', async (request, env) => {
  return adminController.debugAdmins(request, env);
});

// Admin dashboard stats
router.get('/api/admin/dashboard/stats', async (request, env) => {
  return adminController.getDashboardStats(request, env);
});

// Admin partner documents
router.get('/api/admin/partners/:id/documents', async (request, env) => {
  return adminController.getPartnerDocuments(request, env);
});

// Delete partner
router.delete('/api/admin/partners/:id', async (request, env) => {
  return adminController.deletePartner(request, env);
});

// Get partner documents from providers table (direct URLs)
router.get('/api/admin/partners/:id/document-urls', async (request, env) => {
  return adminController.getPartnerDocumentUrls(request, env);
});

// Duplicate route removed - already defined above

// Document Routes
router.post('/api/documents/upload', async (request, env) => {
  return documentsController.uploadProfileDocument(request, env);
});

router.get('/api/documents/provider/:providerId', async (request, env) => {
  return documentsController.getProviderDocuments(request, env);
});

router.post('/api/documents/update-verification', async (request, env) => {
  return documentsController.updateDocumentVerification(request, env);
});

router.get('/api/documents/view/:key', async (request, env) => {
  return documentsController.viewDocument(request, env);
});

// Debug JWT token endpoint
router.get('/debug/jwt', async (request, env) => {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authorization header required'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const token = authHeader.substring(7);
    const jwt = await import('@tsndr/cloudflare-worker-jwt');

    const isValid = await jwt.verify(token, env.JWT_SECRET);
    const decoded = jwt.decode(token);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      isValid,
      decoded,
      secret: env.JWT_SECRET ? 'Present' : 'Missing'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
  } catch (error) {
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Provider verification routes
router.post('/api/providers/complete-verification', async (request, env) => {
  return adminController.completeProviderVerification(request, env);
});

// Notification routes
router.post('/api/notifications/send-pending-items', async (request, env) => {
  return adminController.sendPendingItemsNotification(request, env);
});

router.post('/api/notifications/send-credentials', async (request, env) => {
  return adminController.sendCredentialsEmail(request, env);
});

// Migration Routes
router.post('/api/migrate/add-ocr-column', async (request, env) => {
  return migrationController.addOcrDataColumn(request, env);
});

router.post('/api/migrate/bookings-to-parent-id', async (request, env) => {
  return migrationController.migrateBookingsToParentId(request, env);
});

router.post('/api/migrate/create-availability-tables', async (request, env) => {
  return migrationController.createAvailabilityTables(request, env);
});

router.post('/api/migrate/add-payment-column', async (request, env) => {
  return migrationController.addRazorpayOrderIdColumn(request, env);
});

router.post('/api/migrate/add-total-bookings-column', async (request, env) => {
  return migrationController.addTotalBookingsColumn(request, env);
});

router.post('/api/migrate/add-selected-date-column', async (request, env) => {
  return migrationController.addSelectedDateColumn(request, env);
});

router.post('/api/migrate/create-parents-tables', async (request, env) => {
  return migrationController.createParentsTables(request, env);
});

// Database setup routes
router.post('/api/setup/parents-tables', async (request, env) => {
  return databaseSetupController.setupParentsTables(request, env);
});

router.post('/api/setup/add-dummy-parent', async (request, env) => {
  return databaseSetupController.addDummyParent(request, env);
});

router.get('/api/setup/list-parents', async (request, env) => {
  return databaseSetupController.listParents(request, env);
});

router.post('/api/migrate/add-users-role-column', async (request, env) => {
  const { addUsersRoleColumn } = await import('./controllers/usersMigration.js');
  return addUsersRoleColumn(request, env);
});

router.post('/api/migrate/fix-users-table-schema', async (request, env) => {
  const { fixUsersTableSchema } = await import('./controllers/usersTableFix.js');
  return fixUsersTableSchema(request, env);
});

router.post('/api/migrate/drop-provider-columns', async (request, env) => {
  return migrationController.dropProviderColumns(request, env);
});

router.post('/api/migrate/add-provider-user-columns', async (request, env) => {
  return migrationController.addProviderUserColumns(request, env);
});

router.post('/api/migrate/create-kyc-table', async (request, env) => {
  return migrationController.createKycTable(request, env);
});

router.post('/api/migrate/fix-admins-schema', async (request, env) => {
  return migrationController.fixAdminsSchema(request, env);
});

router.post('/api/migrate/add-gst-columns', async (request, env) => {
  return migrationController.addGstColumnsToKyc(request, env);
});

router.get('/api/migrate/check-schema', async (request, env) => {
  return migrationController.checkTableSchema(request, env);
});

// Migration endpoint to create document_verifications table
router.post('/api/migrate/create-document-verifications', async (request, env) => {
  try {
    console.log('🔄 Creating document_verifications table if not exists...');
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS document_verifications (
        id TEXT PRIMARY KEY,
        partner_id TEXT NOT NULL,
        document_type TEXT NOT NULL,
        document_url TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_size INTEGER,
        mime_type TEXT,
        verification_status TEXT CHECK (verification_status IN ('pending', 'verified', 'rejected', 'needs_review', 'failed')) DEFAULT 'pending',
        ocr_data TEXT,
        rejection_reason TEXT,
        admin_notes TEXT,
        verified_by TEXT,
        verified_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    console.log('✅ document_verifications table ready');
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'document_verifications table created successfully'
    }), { headers: { 'Content-Type': 'application/json' } }));
  } catch (error) {
    console.error('❌ Migration error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
});

// Migration endpoint to apply hierarchical category structure
// (Removed hierarchical-categories migration endpoint)

// Public upload route for profile selfies (no auth)
router.post('/api/public/upload-profile', async (request, env) => {
  return documentsController.uploadProfilePublic(request, env);
});


// R2 image view endpoint
router.get('/api/r2/view/*', async (request, env) => {
  try {
    const url = new URL(request.url);
    const path = url.pathname.replace('/api/r2/view/', '');

    console.log('📷 Fetching image from R2:', path);

    const object = await env.KUDDL_STORAGE.get(path);

    if (!object) {
      return addCorsHeaders(new Response('Image not found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain' }
      }));
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Cache-Control', 'public, max-age=31536000');

    return addCorsHeaders(new Response(object.body, { headers }));
  } catch (error) {
    console.error('R2 view error:', error);
    return addCorsHeaders(new Response('Error fetching image', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' }
    }));
  }
});

// Pincodes endpoint
router.get('/api/pincodes', async (request, env) => {
  try {
    // Fetch all active pincodes from database
    const pincodes = await env.KUDDL_DB.prepare(`
      SELECT pincode, city, area, state 
      FROM pincodes 
      WHERE is_active = 1
      ORDER BY state, city, pincode
    `).all();

    console.log(`🌍 Returning ${pincodes.results?.length || 0} pincodes from database`);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      pincodes: pincodes.results || []
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
  } catch (error) {
    console.error('Pincodes fetch error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch pincodes',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Pincode serviceability check endpoint
router.get('/api/pincodes/check', async (request, env) => {
  try {
    const url = new URL(request.url);
    const pincode = url.searchParams.get('pincode');
    if (!pincode) {
      return createApiResponse({
        success: false,
        serviceable: false,
        message: 'pincode is required'
      }, 400);
    }

    // Normalize: keep only digits and 6 length
    const normalized = pincode.replace(/\D/g, '').slice(0, 6);
    if (!/^\d{6}$/.test(normalized)) {
      return createApiResponse({
        success: true,
        serviceable: false,
        data: null
      });
    }

    console.log('[PincodeCheck] normalized input:', normalized);
    // Try exact text match first
    let result = await env.KUDDL_DB.prepare(`
      SELECT pincode, city, state, area 
      FROM pincodes 
      WHERE TRIM(CAST(pincode AS TEXT)) = ? AND is_active = 1
      LIMIT 1
    `).bind(normalized).first();

    // If not found, try numeric match (handles integer-stored pincodes)
    if (!result) {
      const normalizedInt = Number(normalized);
      result = await env.KUDDL_DB.prepare(`
        SELECT pincode, city, state, area 
        FROM pincodes 
        WHERE CAST(pincode AS INTEGER) = ? AND is_active = 1
        LIMIT 1
      `).bind(normalizedInt).first();
    }
    console.log('[PincodeCheck] query result:', !!result, result);

    return createApiResponse({
      success: true,
      serviceable: !!result,
      data: result || null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Pincode check error:', error);
    return createApiResponse({
      success: false,
      serviceable: false,
      message: 'Failed to check pincode',
      error: error.message
    }, 500);
  }
});

// Enhanced location search endpoint
router.get('/api/pincodes/search', async (request, env) => {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get('q');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    
    if (!query || query.trim().length < 2) {
      return createApiResponse({
        success: false,
        message: 'Search query must be at least 2 characters'
      }, 400);
    }

    const searchTerm = query.trim().toLowerCase();
    
    // Search in pincode, area, city, and state
    const results = await env.KUDDL_DB.prepare(`
      SELECT pincode, area, city, state 
      FROM pincodes 
      WHERE is_active = 1 
        AND (
          LOWER(pincode) LIKE ? 
          OR LOWER(area) LIKE ? 
          OR LOWER(city) LIKE ? 
          OR LOWER(state) LIKE ?
        )
      ORDER BY 
        CASE 
          WHEN LOWER(pincode) = ? THEN 1
          WHEN LOWER(area) = ? THEN 2
          WHEN LOWER(city) = ? THEN 3
          WHEN LOWER(pincode) LIKE ? THEN 4
          WHEN LOWER(area) LIKE ? THEN 5
          WHEN LOWER(city) LIKE ? THEN 6
          ELSE 7
        END,
        city, area, pincode
      LIMIT ?
    `).bind(
      `%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`,
      searchTerm, searchTerm, searchTerm,
      `${searchTerm}%`, `${searchTerm}%`, `${searchTerm}%`,
      limit
    ).all();

    return createApiResponse({
      success: true,
      results: results.results || [],
      count: results.results?.length || 0
    });
  } catch (error) {
    console.error('Location search error:', error);
    return createApiResponse({
      success: false,
      message: 'Failed to search locations',
      error: error.message
    }, 500);
  }
});

// Pincodes endpoint
router.get('/api/pincodes/:pincode', async (request, env) => {
  return servicesController.getPincodeInfo(request, env);
});

// Service availability check endpoint
router.get('/api/services/availability', async (request, env) => {
  return customerController.checkServiceAvailability(request, env);
});

// Debug endpoint to generate test JWT token
router.get('/api/debug/generate-token/:userId', async (request, env) => {
  try {
    const userId = request.params.userId;
    const jwt = await import('@tsndr/cloudflare-worker-jwt');
    
    const token = await jwt.sign({
      id: userId,
      role: 'partner',
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
    }, env.JWT_SECRET);
    
    return createApiResponse({
      success: true,
      token: token,
      userId: userId
    });
  } catch (error) {
    return createApiResponse({
      success: false,
      message: 'Failed to generate token',
      error: error.message
    }, 500);
  }
});

// Debug endpoint to create test provider
router.post('/api/debug/create-test-provider', async (request, env) => {
  try {
    const providerId = 'test_provider_001';
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash('Test@123', 12);
    
    await env.KUDDL_DB.prepare(`
      INSERT OR REPLACE INTO providers (
        id, email, phone, password_hash, first_name, last_name, 
        business_name, is_active, kyc_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      providerId,
      'test@kuddl.co',
      '9876543210',
      passwordHash,
      'Test',
      'Provider',
      'Test Business',
      1,
      'verified',
      new Date().toISOString(),
      new Date().toISOString()
    ).run();
    
    return createApiResponse({
      success: true,
      message: 'Test provider created',
      providerId: providerId
    });
  } catch (error) {
    return createApiResponse({
      success: false,
      message: 'Failed to create test provider',
      error: error.message
    }, 500);
  }
});

// Fallback services endpoint with lenient filtering
router.get('/api/public/services-all', async (request, env) => {
  try {
    const url = new URL(request.url);
    const pincode = url.searchParams.get('pincode');
    const category = url.searchParams.get('category');
    const limit = parseInt(url.searchParams.get('limit')) || 50;

    console.log('🔍 [Services-All] Fetching services with lenient filtering');
    console.log('🔍 [Services-All] Pincode:', pincode);
    console.log('🔍 [Services-All] Category:', category);

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

      // More lenient query - show services from nearby areas if exact pincode not available
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
          p.serviceable_pincodes,
          p.pincode as provider_pincode,
          CASE 
            WHEN ? != '' AND (s.available_pincodes LIKE '%' || ? || '%' OR p.serviceable_pincode = ? OR p.serviceable_pincodes LIKE '%' || ? || '%' OR p.pincode = ?) THEN 1
            WHEN ? != '' AND p.city IN (SELECT city FROM pincodes WHERE pincode = ?) THEN 2
            ELSE 3
          END as location_priority
        FROM services s
        LEFT JOIN providers p ON s.provider_id = p.id
        LEFT JOIN categories c ON s.category_id = c.id
        WHERE s.status = 'active' AND p.is_active = 1
      `;
      
      const params = [];
      
      // Add pincode parameters for priority calculation
      const pincodeParam = pincode || '';
      params.push(pincodeParam, pincodeParam, pincodeParam, pincodeParam, pincodeParam, pincodeParam, pincodeParam);

      if (category) {
        query += ` AND s.category_id = ?`;
        params.push(category);
      }

      query += ` ORDER BY location_priority ASC, s.created_at DESC LIMIT ?`;
      params.push(limit);

      console.log('🔍 [Services-All] QUERY:', query);
      console.log('🔍 [Services-All] PARAMS:', params);
      
      const servicesStmt = env.KUDDL_DB.prepare(query);
      const services = await servicesStmt.bind(...params).all();

      console.log('✅ [Services-All] Services found:', services.results?.length || 0);

      // Transform services data (same as main endpoint)
      const imageUrlsArray = service => {
        if (!service.image_urls) return [];
        return typeof service.image_urls === 'string' ? JSON.parse(service.image_urls) : service.image_urls;
      };
      
      const transformedServices = (services.results || []).map(service => {
        const parsedImageUrls = imageUrlsArray(service);
        
        return {
          id: service.id,
          name: service.name,
          description: service.description,
          category_id: service.category_id,
          category_name: service.category_name,
          category_module: service.category_module,
          subcategory_id: service.subcategory_id,
          price_type: service.price_type,
          price: service.price,
          duration_minutes: service.duration_minutes,
          features: service.features ? (typeof service.features === 'string' ? JSON.parse(service.features) : service.features) : [],
          available_pincodes: service.available_pincodes,
          image_urls: parsedImageUrls,
          images: parsedImageUrls,
          primary_image_url: service.primary_image_url,
          primaryImage: service.primary_image_url,
          average_rating: 4.5,
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
            average_rating: 4.5,
            experience_years: service.experience_years || 0,
            business_name: service.business_name || 'Service Provider'
          },
          createdAt: service.created_at,
          created_at: service.created_at,
          location_priority: service.location_priority
        };
      });

      return addCorsHeaders(new Response(JSON.stringify({
        success: true,
        data: transformedServices,
        total: transformedServices.length,
        message: pincode ? `Services for ${pincode} and nearby areas` : 'All available services'
      }), {
        headers: { 'Content-Type': 'application/json' }
      }));

    } catch (dbError) {
      console.log('Database error in services-all:', dbError);
      return addCorsHeaders(new Response(JSON.stringify({
        success: true,
        data: []
      }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    }
  } catch (error) {
    console.error('Services-all fetch error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: []
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Debug endpoint to check services and pincode data
router.get('/api/debug/services-pincodes', async (request, env) => {
  try {
    // Check total services
    const totalServices = await env.KUDDL_DB.prepare(`SELECT COUNT(*) as count FROM services`).first();
    
    // Check services with pincode data
    const servicesWithPincodes = await env.KUDDL_DB.prepare(`
      SELECT 
        s.id, 
        s.name, 
        s.available_pincodes,
        p.serviceable_pincodes,
        p.pincode as provider_pincode,
        p.city,
        p.state
      FROM services s 
      LEFT JOIN providers p ON s.provider_id = p.id 
      LIMIT 10
    `).all();
    
    // Check providers with pincode data
    const providersWithPincodes = await env.KUDDL_DB.prepare(`
      SELECT id, business_name, serviceable_pincode, serviceable_pincodes, pincode, city, state 
      FROM providers 
      WHERE serviceable_pincode IS NOT NULL OR serviceable_pincodes IS NOT NULL OR pincode IS NOT NULL
      LIMIT 10
    `).all();
    
    // Check available pincodes in database
    const availablePincodes = await env.KUDDL_DB.prepare(`
      SELECT pincode, area, city, state 
      FROM pincodes 
      WHERE is_active = 1 
      LIMIT 10
    `).all();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: {
        totalServices: totalServices.count,
        servicesWithPincodes: servicesWithPincodes.results || [],
        providersWithPincodes: providersWithPincodes.results || [],
        availablePincodes: availablePincodes.results || []
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
  } catch (error) {
    console.error('Debug services-pincodes error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Debug endpoint to check user in database
router.get('/api/debug/user/:userId', async (request, env) => {
  try {
    const userId = request.params.userId;
    
    const user = await env.KUDDL_DB.prepare(`
      SELECT id, email, phone, profile_image_url, first_name, last_name 
      FROM providers 
      WHERE id = ?
    `).bind(userId).first();
    
    return createApiResponse({
      success: true,
      userExists: !!user,
      user: user || null
    });
  } catch (error) {
    return createApiResponse({
      success: false,
      message: 'Failed to check user',
      error: error.message
    }, 500);
  }
});

// Debug endpoint to decode JWT token
router.get('/api/debug/token', async (request, env) => {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return createApiResponse({
        success: false,
        message: 'No authorization token provided'
      }, 401);
    }

    const token = authHeader.substring(7);
    const jwt = await import('@tsndr/cloudflare-worker-jwt');
    
    // Verify token
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    
    // Decode token (without verification for debugging)
    const decoded = jwt.decode(token);
    
    return createApiResponse({
      success: true,
      isValid: isValid,
      decoded: decoded,
      payload: decoded?.payload || null
    });
  } catch (error) {
    return createApiResponse({
      success: false,
      message: 'Failed to decode token',
      error: error.message
    }, 500);
  }
});

// Debug endpoint to list R2 objects (for development)
router.get('/api/debug/r2-list', async (request, env) => {
  try {
    const url = new URL(request.url);
    const prefix = url.searchParams.get('prefix') || '';
    
    const listResult = await env.KUDDL_STORAGE.list({
      prefix: prefix,
      limit: 50
    });
    
    return createApiResponse({
      success: true,
      objects: listResult.objects || [],
      truncated: listResult.truncated || false,
      prefix: prefix
    });
  } catch (error) {
    console.error('R2 list error:', error);
    return createApiResponse({
      success: false,
      message: 'Failed to list R2 objects',
      error: error.message
    }, 500);
  }
});

// Add pincode endpoint (for development)
router.post('/api/pincodes/add', async (request, env) => {
  try {
    const { pincode, area, city, state } = await request.json();
    
    if (!pincode || !city || !state) {
      return createApiResponse({
        success: false,
        message: 'Pincode, city, and state are required'
      }, 400);
    }

    const id = `pin_${pincode}`;
    await env.KUDDL_DB.prepare(`
      INSERT OR REPLACE INTO pincodes (id, pincode, area, city, state, is_active) 
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, pincode, area || '', city, state, 1).run();

    return createApiResponse({
      success: true,
      message: 'Pincode added successfully',
      data: { id, pincode, area, city, state }
    });
  } catch (error) {
    console.error('Add pincode error:', error);
    return createApiResponse({
      success: false,
      message: 'Failed to add pincode',
      error: error.message
    }, 500);
  }
});

// Reverse geocoding endpoint for current location
router.post('/api/location/reverse-geocode', async (request, env) => {
  try {
    const { latitude, longitude } = await request.json();
    
    if (!latitude || !longitude) {
      return createApiResponse({
        success: false,
        message: 'Latitude and longitude are required'
      }, 400);
    }

    // For now, we'll find the nearest pincode from our database
    // In production, you might want to use Google Maps Geocoding API
    
    // Simple distance calculation to find nearest pincode
    // This is a basic implementation - you might want to use a proper geocoding service
    const pincodes = await env.KUDDL_DB.prepare(`
      SELECT pincode, area, city, state 
      FROM pincodes 
      WHERE is_active = 1
    `).all();

    if (!pincodes.results || pincodes.results.length === 0) {
      return createApiResponse({
        success: false,
        message: 'No serviceable areas found'
      }, 404);
    }

    // For demo purposes, we'll return a location based on coordinates
    // In Delhi NCR area (approximate coordinates)
    let selectedLocation;
    
    if (latitude >= 28.4 && latitude <= 28.8 && longitude >= 76.8 && longitude <= 77.4) {
      // Delhi area
      selectedLocation = pincodes.results.find(p => p.city === 'New Delhi') || pincodes.results[0];
    } else if (latitude >= 28.3 && latitude <= 28.6 && longitude >= 76.9 && longitude <= 77.3) {
      // Gurgaon area
      selectedLocation = pincodes.results.find(p => p.city === 'Gurgaon') || pincodes.results[0];
    } else if (latitude >= 28.4 && latitude <= 28.7 && longitude >= 77.2 && longitude <= 77.6) {
      // Noida area
      selectedLocation = pincodes.results.find(p => p.city === 'Noida') || pincodes.results[0];
    } else {
      // Default to first available location
      selectedLocation = pincodes.results[0];
    }

    return createApiResponse({
      success: true,
      data: {
        pincode: selectedLocation.pincode,
        area: selectedLocation.area,
        city: selectedLocation.city,
        state: selectedLocation.state,
        coordinates: { latitude, longitude }
      }
    });
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return createApiResponse({
      success: false,
      message: 'Failed to get location details',
      error: error.message
    }, 500);
  }
});

// Debug endpoint to check user status
router.get('/api/debug/user/:email', async (request, env) => {
  try {
    const url = new URL(request.url);
    const email = url.pathname.split('/').pop();

    console.log('🔍 Debug: Checking user:', email);

    // Check in providers table
    const user = await env.KUDDL_DB.prepare(
      'SELECT id, email, first_name, last_name, password_hash, created_at FROM providers WHERE email = ?'
    ).bind(email).first();

    // Also check in users table (if it exists)
    let userInUsersTable = null;
    try {
      userInUsersTable = await env.KUDDL_DB.prepare(
        'SELECT id, email, first_name, last_name, password_hash, created_at FROM users WHERE email = ?'
      ).bind(email).first();
    } catch (e) {
      console.log('Users table might not exist or have different structure');
    }

    // Get total count of providers
    const providerCount = await env.KUDDL_DB.prepare('SELECT COUNT(*) as count FROM providers').first();

    const response = {
      success: true,
      userExists: !!user,
      userInUsersTable: !!userInUsersTable,
      totalProviders: providerCount?.count || 0,
      userDetails: user ? {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        hasPasswordHash: !!user.password_hash,
        passwordHashLength: user.password_hash?.length || 0,
        createdAt: user.created_at
      } : null,
      userDetailsFromUsersTable: userInUsersTable ? {
        id: userInUsersTable.id,
        email: userInUsersTable.email,
        firstName: userInUsersTable.first_name,
        lastName: userInUsersTable.last_name,
        hasPasswordHash: !!userInUsersTable.password_hash,
        passwordHashLength: userInUsersTable.password_hash?.length || 0,
        createdAt: userInUsersTable.created_at
      } : null
    };

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Debug endpoint error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// Debug password verification endpoint
router.post('/api/debug/verify-password', async (request, env) => {
  try {
    const { email, password } = await request.json();

    console.log('🔐 Debug: Testing password verification for:', email);
    console.log('Password received:', password);
    console.log('Email type:', typeof email);
    console.log('Email length:', email?.length);

    const user = await env.KUDDL_DB.prepare(
      'SELECT id, email, password_hash FROM providers WHERE email = ?'
    ).bind(email).first();

    console.log('Database query executed for email:', email);
    console.log('User found in DB:', !!user);

    if (!user) {
      return new Response(JSON.stringify({
        success: false,
        message: 'User not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('User found:', user.email);
    console.log('Password hash from DB:', user.password_hash);
    console.log('Password to verify:', password);

    const bcrypt = await import('bcryptjs');
    const isValid = await bcrypt.compare(password, user.password_hash);

    console.log('Bcrypt comparison result:', isValid);

    // Also test with URL decoded password
    const decodedPassword = decodeURIComponent(password);
    const isValidDecoded = await bcrypt.compare(decodedPassword, user.password_hash);

    console.log('Decoded password:', decodedPassword);
    console.log('Bcrypt comparison with decoded:', isValidDecoded);

    return new Response(JSON.stringify({
      success: true,
      passwordMatch: isValid,
      decodedPasswordMatch: isValidDecoded,
      originalPassword: password,
      decodedPassword: decodedPassword,
      hasPasswordHash: !!user.password_hash,
      passwordHashLength: user.password_hash?.length || 0
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Debug password error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// Debug endpoint to list all providers
router.get('/api/debug/providers', async (request, env) => {
  try {
    const providers = await env.KUDDL_DB.prepare(
      'SELECT id, email, first_name, last_name, created_at FROM providers LIMIT 10'
    ).all();

    return new Response(JSON.stringify({
      success: true,
      count: providers.results?.length || 0,
      providers: providers.results || []
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Debug providers error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// Provider Routes
router.get('/api/providers', async (request, env) => {
  return servicesController.getProviders(request, env);
});

router.post('/api/providers', async (request, env) => {
  return servicesController.addProvider(request, env);
});

// Partner profile routes - REMOVED: Duplicate route that was overriding the main profile endpoint
// The main /api/partner/profile route is handled earlier in this file (line ~387) with profile completion logic

// Dashboard stats routes
router.get('/api/admin/stats', async (request, env) => {
  return adminController.getAdminStats(request, env);
});

router.get('/api/partner/stats', async (request, env) => {
  return adminController.getPartnerStats(request, env);
});

router.get('/api/admin/analytics', async (request, env) => {
  return adminController.getAnalytics(request, env);
});

// Admin partner profile management
router.get('/api/admin/partner/:partnerId', async (request, env) => {
  return adminController.getPartnerProfileForAdmin(request, env);
});

router.post('/api/admin/partner/:partnerId/approve', async (request, env) => {
  return adminController.approvePartner(request, env);
});

router.post('/api/admin/partner/notify', async (request, env) => {
  return adminController.sendPartnerNotification(request, env);
});

router.post('/api/partner/complete-profile', async (request, env) => {
  return adminController.completePartnerProfile(request, env);
});

router.post('/api/partner/set-password', async (request, env) => {
  return adminController.setPartnerPassword(request, env);
});

// Profile Progress Routes
router.post('/api/partner/save-profile-progress', async (request, env) => {
  return profileProgressController.saveProfileProgress(request, env);
});

router.get('/api/partner/get-profile-progress', async (request, env) => {
  return profileProgressController.getProfileProgress(request, env);
});

router.delete('/api/partner/clear-profile-progress', async (request, env) => {
  return profileProgressController.clearProfileProgress(request, env);
});

// Profile Progress Database Setup Routes
router.post('/api/database/create-profile-progress-table', async (request, env) => {
  return profileProgressDatabaseController.createProfileProgressTable(request, env);
});

router.get('/api/database/check-profile-progress-table', async (request, env) => {
  return profileProgressDatabaseController.checkProfileProgressTable(request, env);
});

// Services Routes
// Public services endpoint (no auth required) - filters by pincode if provided
router.get('/api/public/services', async (request, env) => {
  return servicesController.getPublicServices(request, env);
});

// Public top subcategories endpoint (no auth required)
router.get('/api/public/top-subcategories', async (request, env) => {
  return servicesController.getTopSubcategories(request, env);
});

// IMPORTANT: /api/services/my-services must be BEFORE /api/services
router.get('/api/services/my-services', async (request, env) => {
  return servicesController.getMyServices(request, env);
});

router.get('/api/services', async (request, env) => {
  return servicesController.getServices(request, env);
});

router.get('/api/service-categories', async (request, env) => {
  return servicesController.getServiceCategories(request, env);
});

router.get('/api/database-categories', async (request, env) => {
  return servicesController.getDatabaseCategories(request, env);
});

router.delete('/api/services/:id', async (request, env) => {
  return servicesController.deleteService(request, env);
});

router.post('/api/services', async (request, env) => {
  return servicesController.createService(request, env);
});

// Lenient public services endpoint (for testing)
router.get('/api/public/services-all', async (request, env) => {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit')) || 50;

    // First check if services table exists and has data
    const serviceCount = await env.KUDDL_DB.prepare(`SELECT COUNT(*) as count FROM services`).first();
    console.log('🔍 Total services in database:', serviceCount);

    // Query for services - show all services regardless of provider status
    const services = await env.KUDDL_DB.prepare(`
      SELECT 
        s.id, s.name, s.description, s.category_id, s.subcategory_id,
        s.price_type, s.price, s.duration_minutes, s.features,
        s.available_pincodes, s.created_at, s.provider_id, s.status,
        p.id as provider_db_id, p.business_name, p.first_name, p.last_name,
        p.profile_image_url, p.city, p.state, p.experience_years, 
        p.is_active, p.kyc_status
      FROM services s
      LEFT JOIN providers p ON s.provider_id = p.id
      ORDER BY s.created_at DESC 
      LIMIT ?
    `).bind(limit).all();

    console.log('🔍 Services query result:', services.results?.length || 0, 'services found');
    console.log('🔍 First service:', JSON.stringify(services.results?.[0], null, 2));

    // Transform services data
    const transformedServices = (services.results || []).map(service => ({
      id: service.id,
      name: service.name,
      description: service.description,
      category: service.category_id,
      subcategory: service.subcategory_id,
      priceType: service.price_type,
      price: service.price,
      duration: service.duration_minutes,
      features: service.features ? JSON.parse(service.features) : {},
      availablePincodes: service.available_pincodes ? JSON.parse(service.available_pincodes) : [],
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
        experience_years: service.experience_years || 3,
        business_name: service.business_name || 'Service Provider'
      },
      createdAt: service.created_at,
      // Debug info
      debug: {
        serviceStatus: service.status,
        providerActive: service.is_active,
        providerKyc: service.kyc_status
      }
    }));

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: transformedServices,
      total: transformedServices.length
    }), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Last-Modified': new Date().toUTCString()
      }
    }));

  } catch (error) {
    console.error('Get lenient public services error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Get single public service by ID (for booking page) - Show any service
router.get('/api/public/services/:id', async (request, env) => {
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

    // Query for specific service with provider details (less restrictive)
    const service = await env.KUDDL_DB.prepare(`
      SELECT 
        s.id, s.name, s.description, s.category_id, s.subcategory_id,
        s.price_type, s.price, s.duration_minutes, s.features,
        s.available_pincodes, s.created_at, s.provider_id, s.status,
        s.image_urls, s.primary_image_url,
        p.id as provider_db_id, p.business_name, p.first_name, p.last_name,
        p.profile_image_url, p.city, p.state, p.is_active, p.kyc_status
      FROM services s
      LEFT JOIN providers p ON s.provider_id = p.id
      WHERE s.id = ? AND p.id IS NOT NULL
    `).bind(serviceId).first();

    if (!service) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Service not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Transform service data
    let imageUrls = [];
    try {
      imageUrls = service.image_urls ? JSON.parse(service.image_urls) : [];
    } catch (e) {
      imageUrls = [];
    }

    const transformedService = {
      id: service.id,
      provider_id: service.provider_id, // Add top-level provider_id for compatibility
      name: service.name,
      description: service.description,
      category: service.category_id,
      subcategory: service.subcategory_id,
      priceType: service.price_type,
      price: service.price,
      duration: service.duration_minutes,
      features: service.features ? JSON.parse(service.features) : {},
      availablePincodes: service.available_pincodes ? JSON.parse(service.available_pincodes) : [],
      images: imageUrls,
      primaryImage: service.primary_image_url,
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
        average_rating: 4.5, // Default rating since column doesn't exist
        experience_years: 3, // Default experience since column doesn't exist
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
    console.error('Get single service error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Check if email exists (for real-time validation)
router.get('/api/check-email', async (request, env) => {
  try {
    const url = new URL(request.url);
    const email = url.searchParams.get('email');
    const currentUserId = url.searchParams.get('currentUserId');

    if (!email) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Email is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Check for existing email, excluding current user if provided
    let query = 'SELECT id FROM providers WHERE email = ?';
    let params = [email];

    if (currentUserId) {
      query += ' AND id != ?';
      params.push(currentUserId);
    }

    const existingProvider = await env.KUDDL_DB.prepare(query).bind(...params).first();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      available: !existingProvider, // available is opposite of exists
      exists: !!existingProvider,
      message: existingProvider ? 'Email already exists' : 'Email available'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Check email error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Simple temp image upload for services
router.post('/api/temp/upload-image', async (request, env) => {
  try {
    // 1. Check authentication
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
        message: 'Invalid token'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    // 2. Get partner ID from token
    const decoded = jwt.decode(token);
    const payload = decoded.payload || decoded;
    const partnerId = payload.id || payload.sub || payload.userId || payload.provider_id || payload.user_id;
    
    if (!partnerId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Partner ID not found in token'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    // 3. Get image from form data
    const formData = await request.formData();
    const imageFile = formData.get('image');
    
    if (!imageFile || !imageFile.size) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'No image file provided'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    // 4. Generate unique filename
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const extension = imageFile.name.split('.').pop() || 'jpg';
    const fileName = `temp_${timestamp}_${randomId}.${extension}`;

    // 5. Create R2 path: partners/{partnerId}/services/temp/{fileName}
    const r2Path = `partners/${partnerId}/services/temp/${fileName}`;
    
    console.log(' Uploading temp image:', {
      partnerId,
      fileName,
      r2Path,
      fileSize: imageFile.size
    });

    // 6. Upload to R2
    await env.KUDDL_STORAGE.put(r2Path, imageFile.stream(), {
      httpMetadata: { contentType: imageFile.type || 'image/jpeg' }
    });

    // 7. Return success with public URL
    const publicUrl = `${env.R2_PUBLIC_URL}/${r2Path}`;
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: {
        imageUrl: publicUrl,
        tempPath: r2Path,
        fileName: fileName
      }
    }), { headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error(' Temp upload error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Upload failed: ' + error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
});

// Move temp images to service folder: partners/{partnerId}/services/{serviceId}/
router.post('/api/services/:serviceId/move-temp-images', async (request, env) => {
  try {
    const serviceId = request.url.split('/').slice(-2)[0];

    // 1. Check authentication
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
        message: 'Invalid token'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    // 2. Get partner ID from token
    const decoded = jwt.decode(token);
    const payload = decoded.payload || decoded;
    const partnerId = payload.id || payload.sub || payload.userId || payload.provider_id || payload.user_id;
    
    if (!partnerId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Partner ID not found in token'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    // 3. Get temp image URLs from request
    const requestData = await request.json();
    const tempImageUrls = requestData.tempImageUrls || [];

    if (tempImageUrls.length === 0) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: true,
        data: { movedImages: [], primaryImage: null }
      }), { headers: { 'Content-Type': 'application/json' } }));
    }

    console.log('📦 Moving images for service:', {
      serviceId,
      partnerId,
      tempImageCount: tempImageUrls.length
    });

    // 4. Move each temp image to service folder
    const movedImages = [];
    for (let i = 0; i < tempImageUrls.length; i++) {
      const tempUrl = tempImageUrls[i];
      
      // Extract filename from temp URL
      const tempPath = tempUrl.replace(env.R2_PUBLIC_URL + '/', '');
      const filename = tempPath.split('/').pop();
      
      // Create new service folder path: partners/{partnerId}/services/{serviceId}/images/{filename}
      const newPath = `partners/${partnerId}/services/${serviceId}/images/${filename}`;
      
      try {
        // Get the object from temp location
        const tempObject = await env.KUDDL_STORAGE.get(tempPath);
        
        if (tempObject) {
          // Copy to new location
          await env.KUDDL_STORAGE.put(newPath, tempObject.body, {
            httpMetadata: tempObject.httpMetadata,
          });
          
          // Delete from temp location
          await env.KUDDL_STORAGE.delete(tempPath);
          
          // Generate new public URL
          const newUrl = `${env.R2_PUBLIC_URL}/${newPath}`;
          movedImages.push(newUrl);
          
          console.log('✅ Moved image:', { from: tempPath, to: newPath });
        }
      } catch (error) {
        console.error('❌ Error moving image:', error);
        // If move fails, keep the temp URL
        movedImages.push(tempUrl);
      }
    }

    const primaryImage = movedImages.length > 0 ? movedImages[0] : null;

    // 5. Update service with new image URLs
    await env.KUDDL_DB.prepare(`
      UPDATE services 
      SET image_urls = ?, primary_image_url = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      JSON.stringify(movedImages),
      primaryImage,
      new Date().toISOString(),
      serviceId
    ).run();

    // 6. Return success response

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: {
        movedImages: movedImages,
        primaryImage: primaryImage
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Move temp images error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Debug categories endpoint
router.get('/api/debug/categories', async (request, env) => {
  try {
    // Check if categories table exists
    const tableCheck = await env.KUDDL_DB.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='categories'
    `).first();

    if (!tableCheck) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Categories table does not exist',
        tableExists: false
      }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Get all categories
    const categories = await env.KUDDL_DB.prepare('SELECT * FROM categories').all();
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      tableExists: true,
      categories: categories.results || [],
      count: categories.results?.length || 0
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to check categories',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});





// Fix categories - ensure kuddl categories exist
router.post('/api/fix-categories', async (request, env) => {
  try {
    const authedUser = await authController.verifyToken(request, env);
    if (!authedUser || authedUser.role !== 'admin') {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Admin access required'
      }), { status: 403, headers: { 'Content-Type': 'application/json' } }));
    }

    // Create categories table if it doesn't exist
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        is_active INTEGER DEFAULT 1,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // Insert kuddl categories
    const kuddlCategories = [
      { id: 'cat_care', name: 'Kuddl Care', description: 'Nannies, caregivers, and child support services', module: 'CARE', icon: 'heart', sort_order: 1 },
      { id: 'cat_bloom', name: 'Kuddl Bloom', description: 'Developmental play and early learning', module: 'BLOOM', icon: 'sprout', sort_order: 2 },
      { id: 'cat_events', name: 'Kuddl Adventure', description: 'Parties, events, and celebrations', module: 'EVENTS', icon: 'party-popper', sort_order: 3 },
      { id: 'cat_discover', name: 'Kuddl Discover', description: 'Workshops, hobbies, and activities', module: 'DISCOVER', icon: 'compass', sort_order: 4 }
    ];

    let insertedCount = 0;
    for (const category of kuddlCategories) {
      try {
        // Check if module column exists, if not add it
        try {
          await env.KUDDL_DB.prepare('ALTER TABLE categories ADD COLUMN module TEXT').run();
        } catch (e) {
          // Ignore if column exists
        }
        
        try {
          await env.KUDDL_DB.prepare('ALTER TABLE categories ADD COLUMN icon TEXT').run();
        } catch (e) {
          // Ignore if column exists
        }

        await env.KUDDL_DB.prepare(`
          INSERT OR REPLACE INTO categories (id, name, description, module, icon, is_active, sort_order, created_at) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          category.id,
          category.name,
          category.description,
          category.module,
          category.icon,
          1,
          category.sort_order,
          new Date().toISOString()
        ).run();
        insertedCount++;
      } catch (insertError) {
        console.error(`Failed to insert category ${category.id}:`, insertError);
      }
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: `Fixed categories - inserted/updated ${insertedCount} categories`,
      insertedCount,
      categories: kuddlCategories
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fix categories',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Cleanup old temp images (admin only)
router.post('/api/cleanup-temp-images', async (request, env) => {
  try {
    const authedUser = await authController.verifyToken(request, env);
    if (!authedUser || authedUser.role !== 'admin') {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Admin access required'
      }), { status: 403, headers: { 'Content-Type': 'application/json' } }));
    }

    // List all objects in temp folders
    const tempObjects = await env.KUDDL_STORAGE.list({ prefix: 'partners/' });
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago
    
    let deletedCount = 0;
    const deletedKeys = [];

    for (const obj of tempObjects.objects || []) {
      // Only process temp folder images
      if (obj.key.includes('/services/temp/') && obj.uploaded < oneDayAgo) {
        try {
          await env.KUDDL_STORAGE.delete(obj.key);
          deletedCount++;
          deletedKeys.push(obj.key);
          console.log('🗑️ Cleaned up old temp image:', obj.key);
        } catch (deleteError) {
          console.error('❌ Failed to delete temp image:', obj.key, deleteError);
        }
      }
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: `Cleaned up ${deletedCount} old temp images`,
      deletedCount,
      deletedKeys: deletedKeys.slice(0, 10) // Show first 10 as examples
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to cleanup temp images',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Delete image from R2 storage
router.delete('/api/temp/delete-image', async (request, env) => {
  try {
    const authedUser = await authController.verifyToken(request, env);
    if (!authedUser) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authorization required'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    const { imageUrl } = await request.json();
    
    if (!imageUrl) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Image URL is required'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    // Extract R2 key from the URL
    let r2Key;
    if (imageUrl.startsWith('http')) {
      // Extract path from full URL
      const url = new URL(imageUrl);
      r2Key = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
    } else {
      // Assume it's already a key
      r2Key = imageUrl;
    }

    console.log('🗑️ Deleting image from R2:', r2Key);

    // Delete from R2
    try {
      await env.KUDDL_STORAGE.delete(r2Key);
      console.log('✅ Successfully deleted image from R2:', r2Key);
    } catch (r2Error) {
      console.error('❌ Failed to delete from R2:', r2Error);
      // Continue anyway - the image might not exist in R2
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Image deleted successfully',
      deletedKey: r2Key
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Delete image error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to delete image',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Upload service image endpoint
router.post('/api/services/:serviceId/upload-image', async (request, env) => {
  try {
    const serviceId = request.url.split('/').slice(-2)[0];

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

    // Get provider ID
    let providerId = decoded.id || decoded.user_id || decoded.userId || decoded.sub;
    if (!providerId && decoded.user) {
      providerId = decoded.user.id || decoded.user.user_id || decoded.user.userId;
    }

    if (!providerId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Provider ID not found'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Verify service belongs to this provider and get partner phone
    const service = await env.KUDDL_DB.prepare(`
      SELECT s.provider_id, p.phone 
      FROM services s 
      JOIN providers p ON s.provider_id = p.id 
      WHERE s.id = ?
    `).bind(serviceId).first();

    if (!service || service.provider_id !== providerId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Service not found or access denied'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Use provider ID directly for folder structure
    const sanitizedIdentifier = getPartnerFolderPath(providerId);

    const formData = await request.formData();
    const imageFile = formData.get('image');
    const isPrimary = formData.get('isPrimary') === 'true';

    if (!imageFile) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'No image file provided'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(imageFile.type)) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid file type. Only JPEG, PNG, and WebP are allowed.'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Validate file size (max 5MB)
    if (imageFile.size > 5 * 1024 * 1024) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'File size too large. Maximum 5MB allowed.'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const fileExtension = imageFile.name.split('.').pop() || 'jpg';
    const fileName = `${timestamp}_${randomString}.${fileExtension}`;

    // Create organized folder structure: /partners/{phone}/services/{serviceId}/{fileName}
    const r2Key = `partners/${sanitizedIdentifier}/services/${serviceId}/${fileName}`;

    // Upload to R2
    await env.KUDDL_STORAGE.put(r2Key, imageFile.stream(), {
      httpMetadata: {
        contentType: imageFile.type,
      },
    });

    // Generate public URL
    const publicUrl = `${env.R2_PUBLIC_URL}/${r2Key}`;

    // Update service with image URL
    const currentService = await env.KUDDL_DB.prepare('SELECT image_urls, primary_image_url FROM services WHERE id = ?')
      .bind(serviceId).first();

    let imageUrls = [];
    try {
      imageUrls = currentService.image_urls ? JSON.parse(currentService.image_urls) : [];
    } catch (e) {
      imageUrls = [];
    }

    // Add new image URL
    imageUrls.push(publicUrl);

    // Set as primary if specified or if it's the first image
    let primaryImageUrl = currentService.primary_image_url;
    if (isPrimary || !primaryImageUrl) {
      primaryImageUrl = publicUrl;
    }

    // Update database
    await env.KUDDL_DB.prepare(`
      UPDATE services 
      SET image_urls = ?, primary_image_url = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      JSON.stringify(imageUrls),
      primaryImageUrl,
      new Date().toISOString(),
      serviceId
    ).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: {
        imageUrl: publicUrl,
        isPrimary: publicUrl === primaryImageUrl,
        allImages: imageUrls
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Service image upload error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Internal server error: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Database migration endpoint to add missing columns
router.post('/api/migrate/add-image-columns', async (request, env) => {
  try {
    console.log('🔄 Starting database migration for image columns...');

    // Add image_urls column if it doesn't exist
    try {
      await env.KUDDL_DB.prepare(`
        ALTER TABLE services ADD COLUMN image_urls TEXT
      `).run();
      console.log('✅ Added image_urls column');
    } catch (error) {
      console.log('ℹ️ image_urls column already exists or error:', error.message);
    }

    // Add primary_image_url column if it doesn't exist
    try {
      await env.KUDDL_DB.prepare(`
        ALTER TABLE services ADD COLUMN primary_image_url TEXT
      `).run();
      console.log('✅ Added primary_image_url column');
    } catch (error) {
      console.log('ℹ️ primary_image_url column already exists or error:', error.message);
    }

    // Add available_pincodes column if it doesn't exist
    try {
      await env.KUDDL_DB.prepare(`
        ALTER TABLE services ADD COLUMN available_pincodes TEXT
      `).run();
      console.log('✅ Added available_pincodes column');
    } catch (error) {
      console.log('ℹ️ available_pincodes column already exists or error:', error.message);
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Database migration completed successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Migration error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Migration failed: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Check if phone exists (for real-time validation)
router.get('/api/check-phone', async (request, env) => {
  try {
    const url = new URL(request.url);
    const phone = url.searchParams.get('phone');
    const currentUserId = url.searchParams.get('currentUserId');

    if (!phone) {
      return createApiResponse({
        success: false,
        message: 'Phone is required'
      }, 400);
    }

    // Check for existing phone, excluding current user if provided
    let query = 'SELECT id FROM providers WHERE phone = ?';
    let params = [phone];

    if (currentUserId) {
      query += ' AND id != ?';
      params.push(currentUserId);
    }

    const existingProvider = await env.KUDDL_DB.prepare(query).bind(...params).first();

    return createApiResponse({
      success: true,
      available: !existingProvider, // available is opposite of exists
      exists: !!existingProvider,
      message: existingProvider ? 'Phone number already exists' : 'Phone number available',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Check phone error:', error);
    return createApiResponse({
      success: false,
      message: 'Internal server error: ' + error.message
    }, 500);
  }
});

// Debug endpoint to test database write
router.get('/api/debug/test-db-write', async (request, env) => {
  try {
    const testId = crypto.randomUUID();
    const testPhone = '+91' + Math.floor(Math.random() * 10000000000);
    
    console.log('🧪 Testing database write...');
    console.log('📱 Test phone:', testPhone);
    console.log('🆔 Test ID:', testId);
    console.log('🗄️ Database binding:', !!env.KUDDL_DB);
    
    // First check if we can read from the database
    const countResult = await env.KUDDL_DB.prepare('SELECT COUNT(*) as count FROM providers').first();
    console.log('📊 Current provider count:', countResult?.count);
    
    // Try to insert a test record
    const insertResult = await env.KUDDL_DB.prepare(`
      INSERT INTO providers (
        id, phone, email, first_name, is_active, kyc_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      testId,
      testPhone,
      'test@example.com',
      'Test User',
      1,
      'pending',
      new Date().toISOString(),
      new Date().toISOString()
    ).run();
    
    console.log('✅ Insert successful:', insertResult);
    
    // Verify the insert
    const newCountResult = await env.KUDDL_DB.prepare('SELECT COUNT(*) as count FROM providers').first();
    console.log('📊 New provider count:', newCountResult?.count);
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Database write test successful',
      testId: testId,
      testPhone: testPhone,
      oldCount: countResult?.count,
      newCount: newCountResult?.count,
      insertResult: insertResult
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
    
  } catch (error) {
    console.error('❌ Database write test failed:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Database write test failed',
      error: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Debug endpoint to check table schema
router.get('/api/debug/table-schema', async (request, env) => {
  try {
    const schema = await env.KUDDL_DB.prepare(`
      PRAGMA table_info(providers)
    `).all();
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      schema: schema.results
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
    
  } catch (error) {
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Debug endpoint to test provider insertion
router.get('/api/debug/test-provider-insert', async (request, env) => {
  try {
    const testPhone = '+918740863299';
    const testId = crypto.randomUUID();
    
    console.log('🧪 Testing provider insertion...');
    console.log('📱 Test phone:', testPhone);
    console.log('🆔 Test ID:', testId);
    
    const result = await env.KUDDL_DB.prepare(`
      INSERT INTO providers (
        id, phone, email, is_active, kyc_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      testId,
      testPhone,
      '', // Empty email
      1,
      'pending',
      new Date().toISOString(),
      new Date().toISOString()
    ).run();
    
    console.log('✅ Insert result:', result);
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Test provider inserted',
      result: result,
      testId: testId,
      testPhone: testPhone
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
    
  } catch (error) {
    console.error('❌ Test insert error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Test insert failed',
      error: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Debug endpoint to check and create providers table
router.get('/api/debug/init-providers-table', async (request, env) => {
  try {
    console.log('🔧 Checking providers table...');
    
    // Try to create the providers table if it doesn't exist
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS providers (
        id TEXT PRIMARY KEY,
        phone TEXT UNIQUE,
        email TEXT,
        password_hash TEXT,
        first_name TEXT,
        last_name TEXT,
        business_name TEXT,
        description TEXT,
        experience_years INTEGER,
        address TEXT,
        city TEXT,
        state TEXT,
        area TEXT,
        pincode TEXT,
        date_of_birth TEXT,
        gender TEXT,
        profile_image_url TEXT,
        languages TEXT,
        service_categories TEXT,
        specific_services TEXT,
        age_groups TEXT,
        account_holder_name TEXT,
        bank_name TEXT,
        account_number TEXT,
        ifsc_code TEXT,
        account_type TEXT,
        upi_id TEXT,
        kyc_status TEXT DEFAULT 'pending',
        is_active INTEGER DEFAULT 1,
        created_at TEXT,
        updated_at TEXT
      )
    `).run();
    
    console.log('✅ Providers table created/verified');
    
    // Check if table exists and get count
    const count = await env.KUDDL_DB.prepare('SELECT COUNT(*) as count FROM providers').first();
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Providers table initialized',
      count: count?.count || 0
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
    
  } catch (error) {
    console.error('❌ Table init error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to initialize table',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Add missing categories endpoint (temporary)
router.post('/api/add-missing-categories', async (request, env) => {
  try {
    console.log('🔧 Adding missing categories...');
    
    const categoriesToAdd = [
      { id: 'cat_care', name: 'Kuddl Care', description: 'Nannies, caregivers, and child support services', module: 'CARE', icon: 'heart' },
      { id: 'cat_bloom', name: 'Kuddl Bloom', description: 'Developmental play and early learning', module: 'BLOOM', icon: 'sprout' },
      { id: 'cat_events', name: 'Kuddl Adventure', description: 'Parties, events, and celebrations', module: 'EVENTS', icon: 'party-popper' },
      { id: 'cat_discover', name: 'Kuddl Discover', description: 'Workshops, hobbies, and activities', module: 'DISCOVER', icon: 'compass' }
    ];
    
    for (const category of categoriesToAdd) {
      try {
        // Check if module column exists, if not add it
        try {
          await env.KUDDL_DB.prepare('ALTER TABLE categories ADD COLUMN module TEXT').run();
        } catch (e) {
          // Ignore if column exists
        }
        
        try {
          await env.KUDDL_DB.prepare('ALTER TABLE categories ADD COLUMN icon TEXT').run();
        } catch (e) {
          // Ignore if column exists
        }

        await env.KUDDL_DB.prepare(`
          INSERT OR IGNORE INTO categories (id, name, description, module, icon, is_active, created_at) 
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
          category.id,
          category.name,
          category.description,
          category.module,
          category.icon,
          1,
          new Date().toISOString()
        ).run();
      } catch (insertError) {
        console.error(`Failed to insert category ${category.id}:`, insertError);
      }
    }
    
    console.log('✅ All categories added successfully');
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'All categories added successfully',
      categories: categoriesToAdd.map(c => c.id)
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
    
  } catch (error) {
    console.error('❌ Error adding categories:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to add categories',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Fix admins table schema
router.post('/api/fix-admins-schema', async (request, env) => {
  try {
    console.log('🚨 Fixing admins table schema...');
    
    // Add missing columns to admins table
    const columnsToAdd = [
      'ALTER TABLE admins ADD COLUMN first_name TEXT',
      'ALTER TABLE admins ADD COLUMN last_name TEXT',
      'ALTER TABLE admins ADD COLUMN role TEXT DEFAULT "admin"',
      'ALTER TABLE admins ADD COLUMN is_active INTEGER DEFAULT 1'
    ];
    
    for (const sql of columnsToAdd) {
      try {
        await env.KUDDL_DB.prepare(sql).run();
        console.log('✅ Added column:', sql);
      } catch (error) {
        if (error.message.includes('duplicate column name')) {
          console.log('⚠️ Column already exists:', sql);
        } else {
          console.error('❌ Error adding column:', sql, error.message);
        }
      }
    }
    
    console.log('✅ Admins table schema fixed');
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Admins table schema fixed'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
    
  } catch (error) {
    console.error('❌ Admins schema fix failed:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Admins schema fix failed',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Quick login fix - create provider directly
router.post('/api/quick-login-fix', async (request, env) => {
  try {
    console.log('🔧 Quick login fix...');
    
    // Disable foreign key constraints temporarily
    await env.KUDDL_DB.prepare('PRAGMA foreign_keys = OFF').run();
    
    // Restore the provider ID from your previous working session
    const providerId = '4eaafea7-b44f-4e92-966f-a80702365635';
    const testEmail = 'prince@gmail.com';
    const testPassword = 'password123';
    const testPhone = '+919876543210';
    
    // Simple hash for testing
    const hashedPassword = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'; // bcrypt hash of 'password123'
    
    // Create provider with minimal required fields
    await env.KUDDL_DB.prepare(`
      INSERT OR REPLACE INTO providers (
        id, email, password_hash, first_name, phone, 
        is_active, kyc_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      providerId,
      testEmail,
      hashedPassword,
      'Prince',
      testPhone,
      1, // is_active
      'pending',
      new Date().toISOString(),
      new Date().toISOString()
    ).run();
    
    // Re-enable foreign key constraints
    await env.KUDDL_DB.prepare('PRAGMA foreign_keys = ON').run();
    
    console.log('✅ Provider restored with ID:', providerId);
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Login fix applied successfully',
      providerId: providerId,
      credentials: {
        email: testEmail,
        password: testPassword,
        phone: testPhone
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
    
  } catch (error) {
    console.error('❌ Error in quick login fix:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to apply login fix',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Create admin account endpoint
router.post('/api/create-admin', async (request, env) => {
  try {
    console.log('🔧 Creating admin account...');
    
    const adminEmail = 'admin@kuddl.co';
    const adminPassword = 'Admin@123';
    
    // Import bcrypt for password hashing
    const bcrypt = await import('bcryptjs');
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    
    // Disable foreign key constraints temporarily
    await env.KUDDL_DB.prepare('PRAGMA foreign_keys = OFF').run();
    
    // Create admin account
    const adminId = crypto.randomUUID();
    await env.KUDDL_DB.prepare(`
      INSERT OR REPLACE INTO admins (
        id, email, password_hash, full_name, first_name, last_name, role, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      adminId,
      adminEmail,
      hashedPassword,
      'Admin User', // full_name
      'Admin',
      'User',
      'super_admin',
      1, // is_active
      new Date().toISOString(),
      new Date().toISOString()
    ).run();
    
    // Re-enable foreign key constraints
    await env.KUDDL_DB.prepare('PRAGMA foreign_keys = ON').run();
    
    console.log('✅ Admin account created successfully');
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Admin account created successfully',
      credentials: {
        email: adminEmail,
        password: adminPassword
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
    
  } catch (error) {
    console.error('❌ Error creating admin account:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to create admin account',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Add remaining missing columns for profile completion
router.post('/api/add-remaining-columns', async (request, env) => {
  try {
    console.log('🚨 Adding remaining missing columns for profile completion...');
    
    // Add all remaining columns that might be needed for profile completion
    const columnsToAdd = [
      'ALTER TABLE providers ADD COLUMN address TEXT',
      'ALTER TABLE providers ADD COLUMN city TEXT',
      'ALTER TABLE providers ADD COLUMN state TEXT',
      'ALTER TABLE providers ADD COLUMN pincode TEXT',
      'ALTER TABLE providers ADD COLUMN date_of_birth TEXT',
      'ALTER TABLE providers ADD COLUMN gender TEXT',
      'ALTER TABLE providers ADD COLUMN emergency_contact_name TEXT',
      'ALTER TABLE providers ADD COLUMN emergency_contact_phone TEXT',
      'ALTER TABLE providers ADD COLUMN bank_account_number TEXT',
      'ALTER TABLE providers ADD COLUMN bank_ifsc_code TEXT',
      'ALTER TABLE providers ADD COLUMN bank_name TEXT',
      'ALTER TABLE providers ADD COLUMN account_holder_name TEXT'
    ];
    
    for (const sql of columnsToAdd) {
      try {
        await env.KUDDL_DB.prepare(sql).run();
        console.log('✅ Added column:', sql);
      } catch (error) {
        if (error.message.includes('duplicate column name')) {
          console.log('⚠️ Column already exists:', sql);
        } else {
          console.error('❌ Error adding column:', sql, error.message);
        }
      }
    }
    
    console.log('✅ All remaining columns added for profile completion');
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'All remaining columns added for profile completion'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
    
  } catch (error) {
    console.error('❌ Failed to add remaining columns:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to add remaining columns',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Migrate service images to new folder structure
router.post('/api/migrate-service-images', async (request, env) => {
  try {
    const authedUser = await authController.verifyToken(request, env);
    if (!authedUser || authedUser.role !== 'admin') {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Admin access required'
      }), { status: 403, headers: { 'Content-Type': 'application/json' } }));
    }

    // Get all services with image URLs that need migration
    const services = await env.KUDDL_DB.prepare(`
      SELECT s.id, s.image_urls, s.primary_image_url, s.provider_id, p.phone
      FROM services s
      JOIN providers p ON s.provider_id = p.id
      WHERE s.image_urls IS NOT NULL AND s.image_urls != ''
    `).all();

    let migratedCount = 0;
    const migrationResults = [];

    for (const service of services.results || []) {
      try {
        let imageUrls = [];
        try {
          imageUrls = service.image_urls ? JSON.parse(service.image_urls) : [];
        } catch (e) {
          continue; // Skip if can't parse
        }

        if (imageUrls.length === 0) continue;

        const folderIdentifier = service.provider_id;
        const sanitizedIdentifier = folderIdentifier.replace(/[^a-zA-Z0-9@.-]/g, '_');
        
        // Update URLs to new structure
        const newImageUrls = imageUrls.map(url => {
          // Check if it's already in new format
          if (url.includes(`partners/${sanitizedIdentifier}/services/${service.id}/`)) {
            return url; // Already migrated
          }
          
          // Extract filename from old URL
          const filename = url.split('/').pop();
          const newPath = `partners/${sanitizedIdentifier}/services/${service.id}/${filename}`;
          return `${env.R2_PUBLIC_URL}/${newPath}`;
        });

        // Update primary image URL if exists
        let newPrimaryImageUrl = service.primary_image_url;
        if (newPrimaryImageUrl && !newPrimaryImageUrl.includes(`partners/${sanitizedIdentifier}/services/${service.id}/`)) {
          const filename = newPrimaryImageUrl.split('/').pop();
          newPrimaryImageUrl = `${env.R2_PUBLIC_URL}/partners/${sanitizedIdentifier}/services/${service.id}/${filename}`;
        }

        // Update database
        await env.KUDDL_DB.prepare(`
          UPDATE services 
          SET image_urls = ?, primary_image_url = ?
          WHERE id = ?
        `).bind(
          JSON.stringify(newImageUrls),
          newPrimaryImageUrl,
          service.id
        ).run();

        migratedCount++;
        migrationResults.push({
          serviceId: service.id,
          oldUrls: imageUrls,
          newUrls: newImageUrls,
          newStructure: `partners/${sanitizedIdentifier}/services/${service.id}/`
        });

      } catch (serviceError) {
        console.error(`Error migrating service ${service.id}:`, serviceError);
      }
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: `Migrated ${migratedCount} services to new folder structure`,
      migratedCount,
      totalServices: services.results?.length || 0,
      migrationResults: migrationResults.slice(0, 5) // Show first 5 as examples
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to migrate service images',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Update all R2 URLs to use new domain
router.post('/api/update-r2-urls', async (request, env) => {
  try {
    const authedUser = await authController.verifyToken(request, env);
    if (!authedUser || authedUser.role !== 'admin') {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Admin access required'
      }), { status: 403, headers: { 'Content-Type': 'application/json' } }));
    }

    // Update all providers with old R2 URLs to use new domain
    const oldDomain = 'https://pub-1e2f4d9e2f2d4d4293f0dcf70bdff75a.r2.dev';
    const newDomain = 'https://prodassets.kuddl.co';

    const updateResult = await env.KUDDL_DB.prepare(`
      UPDATE providers 
      SET profile_image_url = REPLACE(profile_image_url, ?, ?)
      WHERE profile_image_url LIKE ?
    `).bind(oldDomain, newDomain, oldDomain + '%').run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'R2 URLs updated',
      updatedRows: updateResult.changes
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to update R2 URLs',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Fix profile picture endpoint
router.post('/api/fix-profile-picture', async (request, env) => {
  try {
    const authedUser = await authController.verifyToken(request, env);
    if (!authedUser) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authorization required'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    // Get the latest blink capture image for this user
    // Check if there are any recent profile images in R2 for this user
    // For now, let's set a default profile image URL if none exists
    
    let provider = await env.KUDDL_DB.prepare(`
      SELECT id, phone FROM providers WHERE id = ?
    `).bind(authedUser.id).first();

    if (!provider && authedUser.phone) {
      provider = await env.KUDDL_DB.prepare(`
        SELECT id, phone FROM providers WHERE phone = ?
      `).bind(authedUser.phone).first();
    }

    if (!provider) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Provider not found'
      }), { status: 404, headers: { 'Content-Type': 'application/json' } }));
    }

    // Try to find existing profile images in R2 bucket
    let profileImageUrl = null;
    
    try {
      // List objects in the user's profile folder
      const profileFolder = `partners/${provider.phone}/profile/`;
      const objects = await env.KUDDL_STORAGE.list({ prefix: profileFolder });
      
      if (objects.objects && objects.objects.length > 0) {
        // Get the most recent profile image
        const sortedObjects = objects.objects.sort((a, b) => 
          new Date(b.uploaded).getTime() - new Date(a.uploaded).getTime()
        );
        
        const latestImage = sortedObjects[0];
        profileImageUrl = latestImage.key;
        console.log('✅ Found existing profile image:', profileImageUrl);
      } else {
        // No existing image found, create a placeholder path
        profileImageUrl = `partners/${provider.phone}/profile/profile_placeholder.jpg`;
        console.log('⚠️ No existing profile image found, using placeholder');
      }
    } catch (r2Error) {
      console.error('❌ Error checking R2 bucket:', r2Error);
      // Fallback to a default path
      profileImageUrl = `partners/${provider.phone}/profile/profile_default.jpg`;
    }
    
    // Update the profile with the found or placeholder image URL
    await env.KUDDL_DB.prepare(`
      UPDATE providers 
      SET profile_image_url = ?
      WHERE id = ?
    `).bind(profileImageUrl, provider.id).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Profile picture URL updated',
      profileImageUrl: profileImageUrl
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fix profile picture',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Debug profile data endpoint
router.get('/api/debug/profile-data', async (request, env) => {
  try {
    const authedUser = await authController.verifyToken(request, env);
    if (!authedUser) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authorization required'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    // Get raw provider data
    let provider = await env.KUDDL_DB.prepare(`
      SELECT id, phone, profile_image_url, first_name, last_name, email
      FROM providers WHERE id = ?
    `).bind(authedUser.id).first();

    if (!provider && authedUser.phone) {
      provider = await env.KUDDL_DB.prepare(`
        SELECT id, phone, profile_image_url, first_name, last_name, email
        FROM providers WHERE phone = ?
      `).bind(authedUser.phone).first();
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: {
        authedUser,
        provider,
        debug: 'Raw database data for profile debugging'
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Debug failed',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Debug categories endpoint
router.get('/api/debug/categories', async (request, env) => {
  try {
    const categories = await env.KUDDL_DB.prepare(`
      SELECT * FROM categories ORDER BY id
    `).all();
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      categories: categories.results || [],
      count: categories.results?.length || 0
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
  } catch (error) {
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Debug endpoint to check database status (temporary)
router.get('/api/debug/services', async (request, env) => {
  try {
    // Check all services regardless of status
    const allServices = await env.KUDDL_DB.prepare(`
      SELECT 
        s.id, s.name, s.status, s.provider_id,
        p.id as provider_db_id, p.business_name, p.is_active, p.kyc_status
      FROM services s 
      LEFT JOIN providers p ON s.provider_id = p.id 
      ORDER BY s.created_at DESC 
      LIMIT 10
    `).all();

    // Check providers separately
    const allProviders = await env.KUDDL_DB.prepare(`
      SELECT id, business_name, first_name, last_name, is_active, kyc_status 
      FROM providers 
      ORDER BY created_at DESC 
      LIMIT 10
    `).all();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      debug: {
        services: allServices.results || [],
        providers: allProviders.results || [],
        serviceCount: allServices.results?.length || 0,
        providerCount: allProviders.results?.length || 0
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Debug services error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Debug error: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Booking Routes
router.post('/api/bookings', async (request, env) => {
  return bookingController.createBooking(request, env);
});

router.post('/api/test-booking', async (request, env) => {
  return simpleBookingController.createSimpleBooking(request, env);
});

router.post('/api/setup-tables', async (request, env) => {
  return tableSetupController.createEssentialTables(request, env);
});

router.post('/api/test-parent-children', async (request, env) => {
  return isolatedTestController.testParentChildrenCreation(request, env);
});

router.get('/api/bookings/:id', async (request, env) => {
  return bookingController.getBookingById(request, env);
});

router.get('/api/provider/bookings', async (request, env) => {
  return bookingController.getProviderBookings(request, env);
});

router.get('/api/customer/bookings', async (request, env) => {
  return bookingController.getCustomerBookings(request, env);
});

router.post('/api/bookings/:id/accept', async (request, env) => {
  return bookingController.acceptBooking(request, env);
});

router.post('/api/bookings/:id/reject', async (request, env) => {
  return bookingController.rejectBooking(request, env);
});

router.post('/api/bookings/:id/cancel', async (request, env) => {
  return bookingController.cancelBooking(request, env);
});

router.post('/api/bookings/:id/complete', async (request, env) => {
  return bookingController.completeBooking(request, env);
});

// Payment Routes
router.post('/api/payments/create-order', async (request, env) => {
  return paymentController.createPaymentOrder(request, env);
});

router.post('/api/payments/process', async (request, env) => {
  return paymentController.processPayment(request, env);
});

router.post('/api/payments/verify', async (request, env) => {
  return paymentController.verifyPayment(request, env);
});

router.get('/api/payments/status/:bookingId', async (request, env) => {
  return paymentController.getPaymentStatus(request, env);
});

// Dashboard Routes
router.get('/api/dashboard/partner/stats', async (request, env) => {
  return dashboardController.getPartnerDashboardStats(request, env);
});

router.get('/api/dashboard/partner/calendar-bookings', async (request, env) => {
  return dashboardController.getPartnerCalendarBookings(request, env);
});

router.get('/api/dashboard/admin/stats', async (request, env) => {
  return dashboardController.getAdminDashboardStats(request, env);
});

// Reviews Routes
router.get('/api/reviews/partner', async (request, env) => {
  const { getPartnerReviews } = await import('./controllers/reviewsController.js');
  return getPartnerReviews(request, env);
});

router.post('/api/reviews/reply', async (request, env) => {
  const { replyToReview } = await import('./controllers/reviewsController.js');
  return replyToReview(request, env);
});

router.get('/api/reviews/stats', async (request, env) => {
  const { getReviewStats } = await import('./controllers/reviewsController.js');
  return getReviewStats(request, env);
});

// Earnings Routes
router.get('/api/earnings/partner', async (request, env) => {
  const { getPartnerEarnings } = await import('./controllers/earningsController.js');
  return getPartnerEarnings(request, env);
});

router.get('/api/earnings/summary', async (request, env) => {
  const { getEarningsSummary } = await import('./controllers/earningsController.js');
  return getEarningsSummary(request, env);
});



// Firebase database migration endpoints
router.post('/api/database/add-firebase-uid-column', async (request, env) => {
  const { addFirebaseUidColumn } = await import('./controllers/firebaseDatabaseController.js');
  return addFirebaseUidColumn(request, env);
});

router.get('/api/database/check-providers-schema', async (request, env) => {
  const { checkProvidersSchema } = await import('./controllers/firebaseDatabaseController.js');
  return checkProvidersSchema(request, env);
});

// Database reset route - using initializeDatabase instead
router.post('/api/reset-database', async (request, env) => {
  return databaseController.initializeDatabase(env);
});

// Database management - use cleanup endpoint instead
// router.post('/api/database/reset', async (request, env) => {
//   return databaseController.resetDatabase(request, env);
// });

router.post('/api/database/create-parents-tables', async (request, env) => {
  return databaseController.createParentsAndChildrenTables(request, env);
});

// Test IFSC lookup without authentication (for testing purposes)
router.get('/api/test/ifsc/:ifscCode', async (request, env) => {
  try {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const ifscCode = pathParts[pathParts.length - 1].toUpperCase();

    if (!ifscCode || ifscCode.length !== 11) {
      return createApiResponse({ error: 'Valid 11-character IFSC code is required' }, 400);
    }

    console.log('🚀 [TEST-IFSC] Looking up IFSC:', ifscCode);

    try {
      // Try Method 1: Sandbox API with authentication
      console.log('🔄 [TEST-IFSC] Trying Sandbox API with authentication...');
      const accessToken = await getSandboxAccessToken(env);
      
      const sandboxResponse = await fetch(`${env.SANDBOX_BASE_URL}/bank/${ifscCode}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-api-key': env.SANDBOX_APPID,
          'x-api-version': '1.0'
        }
      });

      const sandboxData = await sandboxResponse.json();
      console.log('📋 [TEST-IFSC] Sandbox response:', { status: sandboxResponse.status, data: sandboxData });

      if (sandboxResponse.ok && sandboxData.data) {
        return createApiResponse({
          success: true,
          message: 'IFSC details found via Sandbox API',
          data: sandboxData.data
        });
      } else if (sandboxResponse.status === 403) {
        console.log('⚠️ [TEST-IFSC] Sandbox API insufficient privileges, trying free API...');
        // Fall through to free API
      } else {
        console.log('⚠️ [TEST-IFSC] Sandbox API failed:', sandboxData);
        return createApiResponse({
          success: false,
          message: sandboxData.message || 'IFSC code not found'
        }, 404);
      }
    } catch (sandboxError) {
      console.error('❌ [TEST-IFSC] Sandbox API error:', sandboxError.message);
      // Fall through to free API
    }

    try {
      // Method 2: Free IFSC API fallback
      console.log('🔄 [TEST-IFSC] Trying free IFSC API...');
      const freeApiResponse = await fetch(`https://ifsc.razorpay.com/${ifscCode}`);
      
      if (freeApiResponse.ok) {
        const freeApiData = await freeApiResponse.json();
        console.log('📋 [TEST-IFSC] Free API response:', freeApiData);
        
        return createApiResponse({
          success: true,
          message: 'IFSC details found via Free API',
          data: {
            IFSC: freeApiData.IFSC,
            BANK: freeApiData.BANK,
            BRANCH: freeApiData.BRANCH,
            ADDRESS: freeApiData.ADDRESS,
            CITY: freeApiData.CITY,
            STATE: freeApiData.STATE,
            CONTACT: freeApiData.CONTACT || null
          }
        });
      } else {
        console.log('⚠️ [TEST-IFSC] Free API also failed');
        return createApiResponse({
          success: false,
          message: 'IFSC code not found in any database'
        }, 404);
      }
    } catch (freeApiError) {
      console.error('❌ [TEST-IFSC] Free API error:', freeApiError.message);
      return createApiResponse({
        success: false,
        message: 'IFSC code not found in any database'
      }, 404);
    }
  } catch (error) {
    console.error('💥 [TEST-IFSC] Lookup error:', error);
    return createApiResponse({
      success: false,
      message: 'Failed to lookup IFSC code. Please try again.'
    }, 500);
  }
});

router.post("/api/database/add-service-pincodes", async (request, env) => {
  return databaseController.addServiceStatePincodes(request, env);
});

router.post("/api/database/add-subcategory-id-column", async (request, env) => {
  return subcategoryMigration.addSubcategoryIdToServices(request, env);
});

// Database schema check endpoint
router.get('/api/database/schema-check', async (request, env) => {
  try {
    console.log('🔍 Checking database schema...');
    
    // Check all tables
    const allTables = await env.KUDDL_DB.prepare(`
      SELECT name FROM sqlite_master WHERE type='table'
    `).all();
    
    // Check if bookings table exists and has provider_amount column
    let bookingsSchema = { results: [] };
    let providersSchema = { results: [] };
    let providersCount = { count: 0 };
    
    try {
      bookingsSchema = await env.KUDDL_DB.prepare(`PRAGMA table_info(bookings)`).all();
    } catch (e) {
      console.log('Bookings table does not exist');
    }
    
    try {
      providersSchema = await env.KUDDL_DB.prepare(`PRAGMA table_info(providers)`).all();
    } catch (e) {
      console.log('Providers table does not exist');
    }
    
    try {
      providersCount = await env.KUDDL_DB.prepare(`SELECT COUNT(*) as count FROM providers`).first();
    } catch (e) {
      console.log('Cannot count providers');
    }
    
    const hasProviderAmount = bookingsSchema.results?.some(col => col.name === 'provider_amount');
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      schema: {
        allTables: allTables.results?.map(t => t.name) || [],
        bookings: {
          exists: bookingsSchema.results?.length > 0,
          hasProviderAmount: hasProviderAmount,
          columns: bookingsSchema.results?.map(col => col.name) || []
        },
        providers: {
          exists: providersSchema.results?.length > 0,
          count: providersCount?.count || 0,
          columns: providersSchema.results?.map(col => col.name) || []
        }
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
  } catch (error) {
    console.error('❌ Schema check error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Schema check failed',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Utility function to ensure partner folder structure exists
async function ensurePartnerFolderStructure(env, partnerId) {
  try {
    const sanitizedId = partnerId.toString().replace(/[^a-zA-Z0-9-_]/g, '');
    
    // Create placeholder files to ensure folder structure exists
    const folders = ['profile', 'docs', 'services'];
    
    for (const folder of folders) {
      const placeholderKey = `partners/${sanitizedId}/${folder}/.placeholder`;
      
      // Check if placeholder already exists
      const existing = await env.KUDDL_STORAGE.get(placeholderKey);
      
      if (!existing) {
        await env.KUDDL_STORAGE.put(placeholderKey, `Folder created for partner ${partnerId}`, {
          httpMetadata: { contentType: 'text/plain' }
        });
        console.log(`📁 Created folder structure: partners/${sanitizedId}/${folder}/`);
      }
    }
    
    return sanitizedId;
  } catch (error) {
    console.error('❌ Error creating partner folder structure:', error);
    return partnerId.toString().replace(/[^a-zA-Z0-9-_]/g, '');
  }
}

// Profile picture upload endpoint
router.post('/api/partner/profile-picture', async (request, env) => {
  try {
    console.log('📸 Profile picture upload endpoint called');

    // Get JWT token from Authorization header
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
    const jwt = await import('@tsndr/cloudflare-worker-jwt');
    const decoded = await jwt.verify(token, env.JWT_SECRET);

    if (!decoded) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid token'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Get provider ID from token
    const decodedPayload = jwt.decode(token);
    const providerId = decodedPayload.payload.id || decodedPayload.payload.user_id || decodedPayload.payload.userId || decodedPayload.payload.sub;

    if (!providerId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Provider ID not found in token'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Ensure partner folder structure exists and get sanitized identifier
    const sanitizedIdentifier = await ensurePartnerFolderStructure(env, providerId);
    console.log('📁 Partner folder structure ensured for:', sanitizedIdentifier);

    const formData = await request.formData();
    const imageFile = formData.get('image');

    if (!imageFile || !(imageFile instanceof File)) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'No image file provided'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(imageFile.type)) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid file type. Only JPEG, PNG, and WebP are allowed.'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Validate file size (max 5MB)
    if (imageFile.size > 5 * 1024 * 1024) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'File size too large. Maximum 5MB allowed.'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    let imageUrl;

    // Upload to R2 storage
    {
      // Generate unique filename
      const uuid = crypto.randomUUID();
      const ext = imageFile.type.split('/')[1];
      const key = `partners/${sanitizedIdentifier}/profile/profile-${uuid}.${ext}`;

      // Verify R2 storage binding exists
      if (!env.KUDDL_STORAGE) {
        throw new Error('R2 storage not configured');
      }

      // Upload to R2
      await env.KUDDL_STORAGE.put(key, imageFile.stream(), {
        httpMetadata: {
          contentType: imageFile.type,
        },
      });

      // Generate public URL
      imageUrl = `${env.R2_PUBLIC_URL}/${key}`;
    }

    // Update database with new profile image URL
    await env.KUDDL_DB.prepare(`
      UPDATE providers 
      SET profile_image_url = ?, updated_at = ?
      WHERE id = ?
    `).bind(imageUrl, new Date().toISOString(), providerId).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Profile picture updated successfully',
      imageUrl: imageUrl
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Profile picture upload error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to upload profile picture',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// ===== Verification Endpoints (Blink + Document OCR) =====
// Note: Blink capture route moved to before auth routes to prevent routing conflicts

router.post('/api/verify/document/upload', async (request, env) => {
  try {
    const form = await request.formData();
    const documentType = String(form.get('documentType') || '');
    const documentSide = String(form.get('documentSide') || 'single');
    const partnerId = String(form.get('partnerId') || form.get('userId') || 'anonymous');
    const file = form.get('file');
    if (!documentType || !(file instanceof File)) {
      return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'documentType and file are required' }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    // Get partner phone for proper folder structure (consistent with profile uploads)
    let partner = null;
    try {
      partner = await env.KUDDL_DB.prepare(
        'SELECT phone FROM providers WHERE id = ?'
      ).bind(partnerId).first();
    } catch (dbError) {
      console.warn('⚠️ Database query failed:', dbError.message);
    }

    // Use partner ID directly for folder structure
    const folderIdentifier = partnerId || 'anonymous';
    console.log('✅ Using partner ID for docs folder:', folderIdentifier);

    const sanitizedIdentifier = folderIdentifier.replace(/[^a-zA-Z0-9@.-]/g, '_');

    const uuid = crypto.randomUUID();
    const ext = (file.type && file.type.includes('png')) ? 'png' : 'jpg';
    const key = `partners/${sanitizedIdentifier}/docs/${documentType}/${uuid}-${documentSide}.${ext}`;

    await env.KUDDL_STORAGE.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || 'image/jpeg' } });

    // Insert skeleton record into D1
    try {
      await env.KUDDL_DB.prepare(`
        INSERT INTO document_verifications (id, partner_id, document_type, file_name, document_url, verification_status, file_size, mime_type, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
      `).bind(
        uuid,
        partnerId,
        documentType,
        file.name || key,
        key,
        file.size || 0,
        file.type || 'image/jpeg',
        new Date().toISOString(),
        new Date().toISOString()
      ).run();
    } catch (e) {
      console.warn('document_verifications insert warn:', e.message);
    }

    const url = new URL(request.url);
    const origin = `${url.protocol}//${url.host}`;
    const viewUrl = `${origin}/api/documents/view/${encodeURIComponent(key)}`;

    return addCorsHeaders(new Response(JSON.stringify({ success: true, documentId: uuid, documentKey: key, documentUrl: viewUrl }), { headers: { 'Content-Type': 'application/json' } }));
  } catch (error) {
    console.error('document upload error:', error);
    return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'Document upload failed', error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
});

router.post('/api/verify/document/confirm', async (request, env) => {
  try {
    const { documentId, confirmedData, partnerId } = await request.json();
    if (!documentId || !confirmedData) {
      return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'documentId and confirmedData are required' }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    // Basic server-side validations
    const dt = (confirmedData?.type || '').toLowerCase();
    const number = String(confirmedData?.number || '');
    let valid = true; let reason = '';
    if (dt === 'aadhaar') {
      valid = /\b\d{4}\s?\d{4}\s?\d{4}\b/.test(number);
      if (!valid) reason = 'Invalid Aadhaar format';
    } else if (dt === 'pan') {
      valid = /\b[A-Z]{5}\d{4}[A-Z]\b/.test(number);
      if (!valid) reason = 'Invalid PAN format';
    }
    if (!valid) {
      return addCorsHeaders(new Response(JSON.stringify({ success: false, verified: false, reason }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    // Update D1 record with OCR data and mark verified
    const ocrJson = JSON.stringify(confirmedData);
    await env.KUDDL_DB.prepare(`
      UPDATE document_verifications
      SET verification_status = 'verified', ocr_data = ?, updated_at = ?
      WHERE id = ?
    `).bind(ocrJson, new Date().toISOString(), documentId).run();

    return addCorsHeaders(new Response(JSON.stringify({ success: true, verified: true, verificationId: documentId }), { headers: { 'Content-Type': 'application/json' } }));
  } catch (error) {
    console.error('document confirm error:', error);
    return addCorsHeaders(new Response(JSON.stringify({ success: false, verified: false, message: 'Document confirmation failed', error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
});


// Clean up sample services from local development
router.delete('/api/database/clean-sample-services', async (request, env) => {
  try {
    await env.KUDDL_DB.prepare(`
      DELETE FROM services
      WHERE id LIKE 'service_1768158187546_sample%'
         OR id LIKE 'seed_service_%'
    `).run();

    await env.KUDDL_DB.prepare(`
      DELETE FROM providers
      WHERE id LIKE 'provider_sample_%'
         OR id LIKE 'seed_provider_%'
    `).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Seed services and providers cleaned up successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Error cleaning sample services:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to clean sample services',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Seed sample services for local development
router.post('/api/database/seed-sample-services', async (request, env) => {
  try {
    const nowIso = new Date().toISOString();

    const sanitizeId = (value) => String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    const getTableColumns = async (tableName) => {
      const tableInfo = await env.KUDDL_DB.prepare(`PRAGMA table_info(${tableName})`).all();
      return new Set((tableInfo.results || tableInfo || []).map(col => col.name));
    };

    const buildAndRunInsert = async (tableName, columnsSet, rowData) => {
      const entries = Object.entries(rowData).filter(([column]) => columnsSet.has(column));
      if (entries.length === 0) return;

      const columns = entries.map(([column]) => column);
      const placeholders = columns.map(() => '?').join(', ');
      const values = entries.map(([, value]) => value);

      await env.KUDDL_DB.prepare(`
        INSERT OR REPLACE INTO ${tableName} (${columns.join(', ')})
        VALUES (${placeholders})
      `).bind(...values).run();
    };

    const [providerColumns, serviceColumns] = await Promise.all([
      getTableColumns('providers'),
      getTableColumns('services')
    ]);

    await env.KUDDL_DB.prepare(`DELETE FROM services WHERE id LIKE 'seed_service_%'`).run();
    await env.KUDDL_DB.prepare(`DELETE FROM providers WHERE id LIKE 'seed_provider_%'`).run();

    const categoriesResult = await env.KUDDL_DB.prepare(`
      SELECT id, name, module
      FROM categories
      WHERE COALESCE(is_active, 1) = 1
      ORDER BY name ASC
    `).all();
    const categories = categoriesResult.results || [];

    if (categories.length === 0) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'No categories found. Seed categories first, then run this endpoint.'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const subcategoriesResult = await env.KUDDL_DB.prepare(`
      SELECT
        s.id,
        s.category_id,
        s.name,
        s.description,
        s.is_parent,
        s.parent_name,
        c.name AS category_name
      FROM subcategories s
      INNER JOIN categories c ON c.id = s.category_id
      WHERE COALESCE(s.is_active, 1) = 1
      ORDER BY s.category_id, COALESCE(s.sort_order, 0), s.name
    `).all();

    const subcategories = (subcategoriesResult.results || [])
      .filter(sub => Number(sub.is_parent || 0) !== 1);

    if (subcategories.length === 0) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'No specific subcategories found to seed services.'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const providerByCategory = new Map();
    let providerIndex = 0;

    for (const category of categories) {
      providerIndex += 1;
      const providerId = `seed_provider_${sanitizeId(category.id)}`;
      providerByCategory.set(category.id, providerId);

      const providerRow = {
        id: providerId,
        email: `${providerId}@seed.kuddl.local`,
        phone: `+9190000${String(providerIndex).padStart(6, '0')}`,
        password_hash: 'seed_password_hash',
        first_name: 'Seed',
        last_name: category.name || 'Provider',
        business_name: `${category.name || category.id} Seed Services`,
        description: `Auto-generated provider for ${category.name || category.id}`,
        city: 'Delhi',
        state: 'Delhi',
        is_active: 1,
        kyc_status: 'verified',
        service_categories: category.name || category.id,
        specific_services: '',
        created_at: nowIso,
        updated_at: nowIso
      };

      await buildAndRunInsert('providers', providerColumns, providerRow);
    }

    const variants = [
      { suffix: 'Starter', priceType: 'hourly', durationMinutes: 60, multiplier: 1 },
      { suffix: 'Standard', priceType: 'hourly', durationMinutes: 90, multiplier: 1.3 },
      { suffix: 'Premium', priceType: 'fixed', durationMinutes: 120, multiplier: 1.8 }
    ];

    const categoryServiceCounter = {};
    let insertedServices = 0;

    for (const subcategory of subcategories) {
      const subcategorySlug = sanitizeId(subcategory.id || subcategory.name);
      const providerId = providerByCategory.get(subcategory.category_id);
      const categoryName = subcategory.category_name || subcategory.category_id;
      const basePrice = 350 + ((insertedServices % 6) * 50);

      for (let i = 0; i < variants.length; i += 1) {
        const variant = variants[i];
        const amount = Math.round(basePrice * variant.multiplier);
        const serviceId = `seed_service_${subcategorySlug}_${i + 1}`;

        const serviceRow = {
          id: serviceId,
          provider_id: providerId,
          name: `${subcategory.name} ${variant.suffix}`,
          description: `${variant.suffix} ${subcategory.name} service under ${categoryName}.`,
          category_id: subcategory.category_id,
          subcategory_id: subcategory.id,
          price_type: variant.priceType,
          price: amount,
          price_per_hour: amount,
          duration_minutes: variant.durationMinutes,
          min_duration_hours: 1,
          max_duration_hours: 4,
          features: JSON.stringify([
            `${subcategory.name} focused`,
            'Verified provider',
            `${variant.durationMinutes} minute session`
          ]),
          available_pincodes: JSON.stringify(['110001', '400001', '560001']),
          images: JSON.stringify([]),
          image_urls: JSON.stringify([]),
          primary_image_url: null,
          special_requirements: '',
          cancellation_policy: '24-hour notice required for cancellation.',
          status: 'active',
          created_at: nowIso,
          updated_at: nowIso
        };

        await buildAndRunInsert('services', serviceColumns, serviceRow);
        insertedServices += 1;
        categoryServiceCounter[subcategory.category_id] = (categoryServiceCounter[subcategory.category_id] || 0) + 1;
      }
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Services seeded from subcategory list successfully',
      summary: {
        categories: categories.length,
        specificSubcategories: subcategories.length,
        servicesPerSpecificSubcategory: 3,
        totalServicesInserted: insertedServices,
        categoryServiceCounter
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Error seeding sample services:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to seed sample services',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Helper function to calculate profile completion percentage
export async function calculateProfileCompletion(provider, env = null) {
  try {
    // Ensure provider is an object
    if (!provider || typeof provider !== 'object') {
      console.warn('⚠️ Invalid provider object for completion calculation');
      return {
        percentage: 0,
        missingFields: ['Invalid profile data'],
        completedFields: 0,
        totalFields: 25
      };
    }

    // Check for uploaded documents if env is provided
    let hasDocuments = { panCard: false, aadhaarCard: false };
    if (env && env.KUDDL_DB) {
      try {
        const documents = await env.KUDDL_DB.prepare(`
          SELECT document_type FROM document_verifications 
          WHERE partner_id = ?
        `).bind(provider.id).all();

        const docTypes = documents.results.map(doc => doc.document_type?.toLowerCase());
        hasDocuments.panCard = docTypes.some(type =>
          type === 'pan_card' || type === 'pancard'
        );
        hasDocuments.aadhaarCard = docTypes.some(type =>
          type === 'aadhaar_card' || type === 'aadhaarcard'
        );

        console.log('📄 Document check:', hasDocuments);
      } catch (docError) {
        console.warn('⚠️ Could not check documents:', docError);
      }
    }

    // EXACT field list as specified by user
    // aligning with frontend CompleteProfileModal required fields
    const requiredFields = [
      { field: 'first_name', label: 'Full Name (First)' },
      { field: 'last_name', label: 'Full Name (Last)' },
      { field: 'email', label: 'Email' },
      { field: 'phone', label: 'Phone Number' },
      { field: 'gender', label: 'Gender' },
      { field: 'date_of_birth', label: 'Date of Birth' },
      { field: 'pincode', label: 'Pincode' },
      { field: 'city', label: 'City' },
      { field: 'state', label: 'State' },
      { field: 'service_categories', label: 'Primary Service Category' },
      { field: 'specific_services', label: 'Specific Category' },
      { field: 'age_groups', label: 'Age Group You Serve' },
      { field: 'experience_years', label: 'Experience' },
      { field: 'languages', label: 'Language Spoken' },
      { field: 'description', label: 'Service Description' }
    ];

    // Optional fields (for 100% completion but not blocking)
    const optionalFields = [
      { field: 'address', label: 'Address' },
      { field: 'area', label: 'Area' },
      { field: 'qualifications', label: 'Qualifications' },
      { field: 'pan_card_url', label: 'PAN Card', checkDocument: 'panCard' },
      { field: 'aadhaar_card_url', label: 'Aadhaar Card', checkDocument: 'aadhaarCard' },
      { field: 'account_holder_name', label: 'Account Holder Name' },
      { field: 'account_number', label: 'Account Number' },
      { field: 'ifsc_code', label: 'IFSC Code' },
      { field: 'bank_name', label: 'Bank Name' }
    ];

    const missingFields = [];
    let completedFields = 0;

    // Check required fields
    requiredFields.forEach(({ field, label }) => {
      try {
        const value = provider[field];
        // Check if field has meaningful value
        if (value &&
          value !== '' &&
          value !== 0 &&
          value !== 'New' &&
          value !== 'Partner' &&
          !String(value).includes('@temp.kuddl.com')) {
          completedFields++;
        } else {
          missingFields.push(label);
        }
      } catch (fieldError) {
        console.warn(`⚠️ Error checking field ${field}:`, fieldError);
        missingFields.push(label);
      }
    });

    // Check optional fields (just to add to score, but don't list as missing for basic completion)
    // We'll treat required fields as 80% of the score, and optional as the remaining 20%
    let completedOptional = 0;
    optionalFields.forEach(({ field, label, checkDocument }) => {
      try {
        if (checkDocument && hasDocuments[checkDocument]) {
          completedOptional++;
          return;
        }

        const value = provider[field];
        if (value && value !== '' && value !== 0 && !String(value).includes('@temp.kuddl.com')) {
          completedOptional++;
        }
      } catch (e) {}
    });

    const totalRequired = requiredFields.length;
    const totalOptional = optionalFields.length;
    
    // Calculate weighted percentage
    // Required fields = 80% weight
    // Optional fields = 20% weight
    const requiredScore = (completedFields / totalRequired) * 80;
    const optionalScore = totalOptional > 0 ? (completedOptional / totalOptional) * 20 : 20;
    
    const percentage = Math.round(requiredScore + optionalScore);

    console.log(`📊 Profile completion: ${completedFields}/${totalRequired} required, ${completedOptional}/${totalOptional} optional = ${percentage}%`);
    console.log(`📋 Missing required fields: ${missingFields.join(', ')}`);

    return {
      percentage: Math.min(Math.max(percentage, 0), 100), // Cap between 0-100%
      missingFields,
      completedFields,
      totalFields: totalRequired
    };

  } catch (error) {
    console.error('❌ Error in calculateProfileCompletion:', error);
    // Return fallback data
    return {
      percentage: 25,
      missingFields: ['Profile completion calculation failed'],
      completedFields: 5,
      totalFields: 27
    };
  }
};

router.all('*', async (request) => {
  if (request.method === 'OPTIONS') {
    return handleCorsOptions(request);
  }
  
  return addCorsHeaders(new Response(JSON.stringify({
    success: false,
    message: 'Route not found',
    path: new URL(request.url).pathname
  }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' }
  }));
});

// Debug endpoint to check services and pincodes
router.get('/api/debug/services', async (request, env) => {
  try {
    const result = await debugServices(env);
    return addCorsHeaders(new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    }));
  } catch (error) {
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

// Global OPTIONS handler for CORS preflight
router.options('*', () => {
  return addCorsHeaders(new Response(null, { status: 200 }));
});

// Main worker handler
export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight at the top level
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, Pragma, Expires, Access-Control-Allow-Headers, X-API-Key, X-Client-Version',
          'Access-Control-Max-Age': '86400',
          'Access-Control-Allow-Credentials': 'false',
        }
      });
    }
    
    try {
      const response = await router.handle(request, env, ctx);
      
      // If no route matched, return 404 with CORS
      if (!response) {
        return new Response(JSON.stringify({
          success: false,
          message: 'Route not found',
          path: new URL(request.url).pathname
        }), {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, Pragma, Expires, Access-Control-Allow-Headers, X-API-Key, X-Client-Version',
            'Access-Control-Max-Age': '86400',
          }
        });
      }
      
      // Ensure CORS headers on every response
      response.headers.set('Access-Control-Allow-Origin', '*');
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, Pragma, Expires, Access-Control-Allow-Headers, X-API-Key, X-Client-Version');
      return response;
    } catch (error) {
      console.error('❌ Unhandled worker error:', error.message, error.stack);
      return new Response(JSON.stringify({
        success: false,
        message: 'Internal server error: ' + error.message
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, Pragma, Expires, Access-Control-Allow-Headers, X-API-Key, X-Client-Version',
        }
      });
    }
  }
};
