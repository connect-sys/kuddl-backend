/**
 * Service Wizard Controller
 * Handles service creation wizard API endpoints
 */

import { addCorsHeaders, createApiResponse } from '../utils/cors.js';
import { generateId } from '../utils/helpers.js';

/**
 * Initialize service wizard tables
 * Run this once to set up the database schema
 */
export async function initServiceWizardTables(request, env) {
  try {
    console.log('🚀 Initializing Service Wizard tables...');

    // 1. Locations table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS locations (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        name TEXT NOT NULL,
        address TEXT NOT NULL,
        city TEXT NOT NULL,
        state TEXT,
        pincode TEXT NOT NULL,
        latitude REAL,
        longitude REAL,
        is_primary INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
      )
    `).run();

    await env.KUDDL_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_locations_provider ON locations(provider_id)`).run();
    await env.KUDDL_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_locations_pincode ON locations(pincode)`).run();

    // 2. Services table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS services (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        name TEXT NOT NULL CHECK(length(name) >= 3 AND length(name) <= 80),
        description TEXT NOT NULL CHECK(length(description) >= 50 AND length(description) <= 2000),
        category_id TEXT NOT NULL,
        subcategory_id TEXT,
        cover_image_url TEXT NOT NULL,
        gallery_images TEXT,
        tags TEXT,
        status TEXT CHECK(status IN ('draft', 'published', 'paused', 'archived')) DEFAULT 'draft',
        published_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
      )
    `).run();

    await env.KUDDL_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_services_provider ON services(provider_id)`).run();
    await env.KUDDL_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_services_status ON services(status)`).run();
    await env.KUDDL_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_services_category ON services(category_id)`).run();

    // 3. Offerings table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS offerings (
        id TEXT PRIMARY KEY,
        service_id TEXT NOT NULL,
        location_id TEXT NOT NULL,
        archetype TEXT NOT NULL CHECK(archetype IN ('workshop', 'camp', 'class', 'event', 'drop_in', 'appointment')),
        mode TEXT NOT NULL CHECK(mode IN ('online', 'offline', 'hybrid')),
        virtual_link TEXT,
        tech_requirements TEXT,
        recording_policy INTEGER DEFAULT 0,
        age_min INTEGER NOT NULL,
        age_max INTEGER NOT NULL,
        per_session_capacity INTEGER,
        cohort_capacity INTEGER,
        online_capacity INTEGER,
        offline_capacity INTEGER,
        booking_cutoff_hours INTEGER NOT NULL DEFAULT 24,
        cancellation_policy TEXT NOT NULL CHECK(cancellation_policy IN ('flexible', 'moderate', 'strict', 'no_refund')),
        min_advance_booking_hours INTEGER DEFAULT 0,
        max_advance_booking_days INTEGER,
        instructor_name TEXT,
        instructor_bio TEXT,
        instructor_image_url TEXT,
        materials_provided TEXT,
        prerequisites TEXT,
        what_to_bring TEXT,
        special_instructions TEXT,
        status TEXT CHECK(status IN ('active', 'paused', 'archived')) DEFAULT 'active',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
        FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
        CHECK (age_min < age_max)
      )
    `).run();

    await env.KUDDL_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_offerings_service ON offerings(service_id)`).run();
    await env.KUDDL_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_offerings_location ON offerings(location_id)`).run();
    await env.KUDDL_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_offerings_archetype ON offerings(archetype)`).run();

    // 4. Schedules table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS schedules (
        id TEXT PRIMARY KEY,
        offering_id TEXT NOT NULL,
        name TEXT,
        start_date TEXT NOT NULL,
        end_date TEXT,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL,
        buffer_minutes INTEGER DEFAULT 0,
        recurrence_type TEXT CHECK(recurrence_type IN ('once', 'daily', 'weekly', 'custom')),
        recurrence_days TEXT,
        recurrence_interval INTEGER DEFAULT 1,
        skip_dates TEXT,
        respect_holidays INTEGER DEFAULT 1,
        capacity_override INTEGER,
        availability_windows TEXT,
        status TEXT CHECK(status IN ('active', 'paused', 'completed', 'cancelled')) DEFAULT 'active',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (offering_id) REFERENCES offerings(id) ON DELETE CASCADE,
        CHECK (duration_minutes > 0)
      )
    `).run();

    await env.KUDDL_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_schedules_offering ON schedules(offering_id)`).run();
    await env.KUDDL_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_schedules_dates ON schedules(start_date, end_date)`).run();

    // 5. Sessions table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        schedule_id TEXT NOT NULL,
        offering_id TEXT NOT NULL,
        session_date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        capacity INTEGER NOT NULL,
        booked_count INTEGER DEFAULT 0,
        waitlist_count INTEGER DEFAULT 0,
        status TEXT CHECK(status IN ('scheduled', 'ongoing', 'completed', 'cancelled', 'rescheduled')) DEFAULT 'scheduled',
        cancellation_reason TEXT,
        instructor_override TEXT,
        internal_notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
        FOREIGN KEY (offering_id) REFERENCES offerings(id) ON DELETE CASCADE,
        CHECK (booked_count <= capacity)
      )
    `).run();

    await env.KUDDL_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_sessions_schedule ON sessions(schedule_id)`).run();
    await env.KUDDL_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_sessions_offering ON sessions(offering_id)`).run();
    await env.KUDDL_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(session_date)`).run();

    // 6. Price Rules table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS price_rules (
        id TEXT PRIMARY KEY,
        offering_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('standard', 'discount')),
        unit TEXT NOT NULL CHECK(unit IN ('per_session', 'per_day', 'per_month', 'per_term', 'per_visit', 'per_pass', 'per_camp')),
        amount REAL NOT NULL CHECK(amount >= 0),
        currency TEXT DEFAULT 'INR',
        discount_type TEXT CHECK(discount_type IN ('early_bird', 'sibling', 'group', 'trial', 'custom')),
        discount_percentage REAL,
        discount_amount REAL,
        min_quantity INTEGER,
        availability TEXT NOT NULL CHECK(availability IN ('always', 'between_dates', 'until_date')),
        available_from TEXT,
        available_until TEXT,
        priority INTEGER DEFAULT 100,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (offering_id) REFERENCES offerings(id) ON DELETE CASCADE
      )
    `).run();

    await env.KUDDL_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_price_rules_offering ON price_rules(offering_id)`).run();

    // 7. Service Drafts table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS service_drafts (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        draft_data TEXT NOT NULL,
        current_step INTEGER DEFAULT 1,
        completed_steps TEXT,
        validation_errors TEXT,
        last_saved_at TEXT DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
      )
    `).run();

    await env.KUDDL_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_service_drafts_provider ON service_drafts(provider_id)`).run();

    // 8. Holiday Calendar table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS holiday_calendar (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        type TEXT CHECK(type IN ('national', 'regional', 'custom')) DEFAULT 'national',
        region TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await env.KUDDL_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_holidays_date ON holiday_calendar(date)`).run();

    // Seed holidays for 2026
    const holidays = [
      { id: 'hol_2026_rep_day', date: '2026-01-26', name: 'Republic Day' },
      { id: 'hol_2026_holi', date: '2026-03-14', name: 'Holi' },
      { id: 'hol_2026_good_fri', date: '2026-04-03', name: 'Good Friday' },
      { id: 'hol_2026_eid', date: '2026-04-21', name: 'Eid ul-Fitr' },
      { id: 'hol_2026_ind_day', date: '2026-08-15', name: 'Independence Day' },
      { id: 'hol_2026_gandhi', date: '2026-10-02', name: 'Gandhi Jayanti' },
      { id: 'hol_2026_dussehra', date: '2026-10-22', name: 'Dussehra' },
      { id: 'hol_2026_diwali', date: '2026-11-11', name: 'Diwali' },
      { id: 'hol_2026_christmas', date: '2026-12-25', name: 'Christmas' },
    ];

    for (const holiday of holidays) {
      await env.KUDDL_DB.prepare(`
        INSERT OR IGNORE INTO holiday_calendar (id, date, name, type) VALUES (?, ?, ?, 'national')
      `).bind(holiday.id, holiday.date, holiday.name).run();
    }

    console.log('✅ Service Wizard tables initialized successfully');

    return createApiResponse({
      success: true,
      message: 'Service Wizard tables initialized successfully',
      tables: [
        'locations',
        'services',
        'offerings',
        'schedules',
        'sessions',
        'price_rules',
        'service_drafts',
        'holiday_calendar',
      ],
    });
  } catch (error) {
    console.error('❌ Error initializing Service Wizard tables:', error);
    return createApiResponse({
      success: false,
      message: 'Failed to initialize Service Wizard tables',
      error: error.message,
    }, 500);
  }
}

/**
 * Save draft (autosave)
 */
export async function saveDraft(request, env) {
  try {
    const { provider_id, draft_data, current_step, completed_steps } = await request.json();

    if (!provider_id || !draft_data) {
      return createApiResponse({
        success: false,
        message: 'Provider ID and draft data are required',
      }, 400);
    }

    // Check if draft exists
    const existingDraft = await env.KUDDL_DB.prepare(
      'SELECT id FROM service_drafts WHERE provider_id = ?'
    ).bind(provider_id).first();

    const draftId = existingDraft?.id || generateId('draft');
    const now = new Date().toISOString();

    if (existingDraft) {
      // Update existing draft
      await env.KUDDL_DB.prepare(`
        UPDATE service_drafts 
        SET draft_data = ?, current_step = ?, completed_steps = ?, last_saved_at = ?
        WHERE id = ?
      `).bind(
        JSON.stringify(draft_data),
        current_step || 1,
        JSON.stringify(completed_steps || []),
        now,
        draftId
      ).run();
    } else {
      // Create new draft
      await env.KUDDL_DB.prepare(`
        INSERT INTO service_drafts (id, provider_id, draft_data, current_step, completed_steps, last_saved_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        draftId,
        provider_id,
        JSON.stringify(draft_data),
        current_step || 1,
        JSON.stringify(completed_steps || []),
        now,
        now
      ).run();
    }

    return createApiResponse({
      success: true,
      message: 'Draft saved successfully',
      data: { draft_id: draftId, last_saved_at: now },
    });
  } catch (error) {
    console.error('Error saving draft:', error);
    return createApiResponse({
      success: false,
      message: 'Failed to save draft',
      error: error.message,
    }, 500);
  }
}

/**
 * Load draft
 */
export async function loadDraft(request, env) {
  try {
    const url = new URL(request.url);
    const provider_id = url.searchParams.get('provider_id');

    if (!provider_id) {
      return createApiResponse({
        success: false,
        message: 'Provider ID is required',
      }, 400);
    }

    const draft = await env.KUDDL_DB.prepare(
      'SELECT * FROM service_drafts WHERE provider_id = ? ORDER BY last_saved_at DESC LIMIT 1'
    ).bind(provider_id).first();

    if (!draft) {
      return createApiResponse({
        success: true,
        message: 'No draft found',
        data: null,
      });
    }

    return createApiResponse({
      success: true,
      message: 'Draft loaded successfully',
      data: {
        id: draft.id,
        draft_data: JSON.parse(draft.draft_data),
        current_step: draft.current_step,
        completed_steps: JSON.parse(draft.completed_steps || '[]'),
        last_saved_at: draft.last_saved_at,
      },
    });
  } catch (error) {
    console.error('Error loading draft:', error);
    return createApiResponse({
      success: false,
      message: 'Failed to load draft',
      error: error.message,
    }, 500);
  }
}

/**
 * Delete draft
 */
export async function deleteDraft(request, env) {
  try {
    const { draft_id } = await request.json();

    if (!draft_id) {
      return createApiResponse({
        success: false,
        message: 'Draft ID is required',
      }, 400);
    }

    await env.KUDDL_DB.prepare('DELETE FROM service_drafts WHERE id = ?').bind(draft_id).run();

    return createApiResponse({
      success: true,
      message: 'Draft deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting draft:', error);
    return createApiResponse({
      success: false,
      message: 'Failed to delete draft',
      error: error.message,
    }, 500);
  }
}
