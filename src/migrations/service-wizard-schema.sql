-- =====================================================
-- Küddl Service Creation Wizard - Database Schema
-- Version: 1.0
-- Date: 20 May 2026
-- =====================================================

-- =====================================================
-- 1. LOCATIONS TABLE
-- Stores partner service locations
-- =====================================================
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
);

CREATE INDEX IF NOT EXISTS idx_locations_provider ON locations(provider_id);
CREATE INDEX IF NOT EXISTS idx_locations_pincode ON locations(pincode);

-- =====================================================
-- 2. SERVICES TABLE
-- Main service entity (e.g., "Summer Art Camp", "Piano Lessons")
-- =====================================================
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK(length(name) >= 3 AND length(name) <= 80),
  description TEXT NOT NULL CHECK(length(description) >= 50 AND length(description) <= 2000),
  category_id TEXT NOT NULL,
  subcategory_id TEXT,
  cover_image_url TEXT NOT NULL,
  gallery_images TEXT, -- JSON array of image URLs
  tags TEXT, -- JSON array of tags
  status TEXT CHECK(status IN ('draft', 'published', 'paused', 'archived')) DEFAULT 'draft',
  published_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_services_provider ON services(provider_id);
CREATE INDEX IF NOT EXISTS idx_services_status ON services(status);
CREATE INDEX IF NOT EXISTS idx_services_category ON services(category_id);

-- =====================================================
-- 3. OFFERINGS TABLE
-- Variants of a service (age/mode/location specific)
-- Each offering represents a bookable variant
-- =====================================================
CREATE TABLE IF NOT EXISTS offerings (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  
  -- Archetype (determines field visibility and behavior)
  archetype TEXT NOT NULL CHECK(archetype IN ('workshop', 'camp', 'class', 'event', 'drop_in', 'appointment')),
  
  -- Mode
  mode TEXT NOT NULL CHECK(mode IN ('online', 'offline', 'hybrid')),
  virtual_link TEXT,
  tech_requirements TEXT,
  recording_policy INTEGER DEFAULT 0,
  
  -- Age range
  age_min INTEGER NOT NULL,
  age_max INTEGER NOT NULL,
  
  -- Capacity
  per_session_capacity INTEGER, -- For workshop/event/drop-in
  cohort_capacity INTEGER, -- For camp/class
  online_capacity INTEGER, -- For hybrid mode
  offline_capacity INTEGER, -- For hybrid mode
  
  -- Booking settings
  booking_cutoff_hours INTEGER NOT NULL DEFAULT 24,
  cancellation_policy TEXT NOT NULL CHECK(cancellation_policy IN ('flexible', 'moderate', 'strict', 'no_refund')),
  min_advance_booking_hours INTEGER DEFAULT 0,
  max_advance_booking_days INTEGER,
  
  -- Instructor/facilitator
  instructor_name TEXT,
  instructor_bio TEXT,
  instructor_image_url TEXT,
  
  -- Additional settings
  materials_provided TEXT, -- JSON array
  prerequisites TEXT,
  what_to_bring TEXT,
  special_instructions TEXT,
  
  status TEXT CHECK(status IN ('active', 'paused', 'archived')) DEFAULT 'active',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
  CHECK (age_min < age_max),
  CHECK (per_session_capacity IS NULL OR per_session_capacity > 0),
  CHECK (cohort_capacity IS NULL OR cohort_capacity > 0)
);

CREATE INDEX IF NOT EXISTS idx_offerings_service ON offerings(service_id);
CREATE INDEX IF NOT EXISTS idx_offerings_location ON offerings(location_id);
CREATE INDEX IF NOT EXISTS idx_offerings_archetype ON offerings(archetype);
CREATE INDEX IF NOT EXISTS idx_offerings_age ON offerings(age_min, age_max);

-- =====================================================
-- 4. SCHEDULES TABLE
-- Schedule configurations (batches/cohorts)
-- =====================================================
CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  offering_id TEXT NOT NULL,
  
  -- Schedule metadata
  name TEXT, -- Batch/cohort name (e.g., "Morning Batch", "Summer 2026")
  
  -- Date range
  start_date TEXT NOT NULL, -- ISO date
  end_date TEXT, -- ISO date (NULL for ongoing)
  
  -- Timing
  start_time TEXT NOT NULL, -- HH:MM format
  end_time TEXT NOT NULL, -- HH:MM format
  duration_minutes INTEGER NOT NULL,
  buffer_minutes INTEGER DEFAULT 0,
  
  -- Recurrence (for classes)
  recurrence_type TEXT CHECK(recurrence_type IN ('once', 'daily', 'weekly', 'custom')),
  recurrence_days TEXT, -- JSON array of day numbers [0-6] where 0=Sunday
  recurrence_interval INTEGER DEFAULT 1,
  
  -- Exceptions
  skip_dates TEXT, -- JSON array of ISO dates to skip
  respect_holidays INTEGER DEFAULT 1,
  
  -- Capacity override (for this batch)
  capacity_override INTEGER,
  
  -- Availability windows (for appointments)
  availability_windows TEXT, -- JSON array of {day, start, end, slots}
  
  status TEXT CHECK(status IN ('active', 'paused', 'completed', 'cancelled')) DEFAULT 'active',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (offering_id) REFERENCES offerings(id) ON DELETE CASCADE,
  CHECK (duration_minutes > 0)
);

CREATE INDEX IF NOT EXISTS idx_schedules_offering ON schedules(offering_id);
CREATE INDEX IF NOT EXISTS idx_schedules_dates ON schedules(start_date, end_date);

-- =====================================================
-- 5. SESSIONS TABLE
-- Individual session instances (materialized from schedules)
-- =====================================================
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL,
  offering_id TEXT NOT NULL,
  
  -- Session details
  session_date TEXT NOT NULL, -- ISO date
  start_time TEXT NOT NULL, -- HH:MM
  end_time TEXT NOT NULL, -- HH:MM
  
  -- Capacity
  capacity INTEGER NOT NULL,
  booked_count INTEGER DEFAULT 0,
  waitlist_count INTEGER DEFAULT 0,
  
  -- Status
  status TEXT CHECK(status IN ('scheduled', 'ongoing', 'completed', 'cancelled', 'rescheduled')) DEFAULT 'scheduled',
  cancellation_reason TEXT,
  
  -- Instructor override
  instructor_override TEXT,
  
  -- Notes
  internal_notes TEXT,
  
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
  FOREIGN KEY (offering_id) REFERENCES offerings(id) ON DELETE CASCADE,
  CHECK (booked_count <= capacity)
);

CREATE INDEX IF NOT EXISTS idx_sessions_schedule ON sessions(schedule_id);
CREATE INDEX IF NOT EXISTS idx_sessions_offering ON sessions(offering_id);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

-- =====================================================
-- 6. PRICE_RULES TABLE
-- Pricing configurations for offerings
-- =====================================================
CREATE TABLE IF NOT EXISTS price_rules (
  id TEXT PRIMARY KEY,
  offering_id TEXT NOT NULL,
  
  -- Rule metadata
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('standard', 'discount')),
  
  -- Pricing unit
  unit TEXT NOT NULL CHECK(unit IN ('per_session', 'per_day', 'per_month', 'per_term', 'per_visit', 'per_pass', 'per_camp')),
  
  -- Amount
  amount REAL NOT NULL CHECK(amount >= 0),
  currency TEXT DEFAULT 'INR',
  
  -- Discount details (if type = 'discount')
  discount_type TEXT CHECK(discount_type IN ('early_bird', 'sibling', 'group', 'trial', 'custom')),
  discount_percentage REAL,
  discount_amount REAL,
  min_quantity INTEGER, -- For group discounts
  
  -- Availability
  availability TEXT NOT NULL CHECK(availability IN ('always', 'between_dates', 'until_date')),
  available_from TEXT, -- ISO date
  available_until TEXT, -- ISO date
  
  -- Priority (lower number = higher priority)
  priority INTEGER DEFAULT 100,
  
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (offering_id) REFERENCES offerings(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_price_rules_offering ON price_rules(offering_id);
CREATE INDEX IF NOT EXISTS idx_price_rules_type ON price_rules(type);
CREATE INDEX IF NOT EXISTS idx_price_rules_availability ON price_rules(availability, available_from, available_until);

-- =====================================================
-- 7. SERVICE_DRAFTS TABLE
-- Autosave state for wizard
-- =====================================================
CREATE TABLE IF NOT EXISTS service_drafts (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  
  -- Draft data (JSON)
  draft_data TEXT NOT NULL, -- Complete wizard state as JSON
  
  -- Progress tracking
  current_step INTEGER DEFAULT 1,
  completed_steps TEXT, -- JSON array of completed step numbers
  
  -- Validation state
  validation_errors TEXT, -- JSON object of errors by step
  
  -- Metadata
  last_saved_at TEXT DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_service_drafts_provider ON service_drafts(provider_id);
CREATE INDEX IF NOT EXISTS idx_service_drafts_updated ON service_drafts(last_saved_at);

-- =====================================================
-- 8. SERVICE_CONFLICTS TABLE
-- Track scheduling conflicts for calendar preview
-- =====================================================
CREATE TABLE IF NOT EXISTS service_conflicts (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  conflict_type TEXT NOT NULL CHECK(conflict_type IN ('location', 'instructor', 'time')),
  conflict_with_session_id TEXT,
  conflict_details TEXT,
  severity TEXT CHECK(severity IN ('warning', 'error')) DEFAULT 'warning',
  resolved INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conflicts_provider ON service_conflicts(provider_id);
CREATE INDEX IF NOT EXISTS idx_conflicts_session ON service_conflicts(session_id);
CREATE INDEX IF NOT EXISTS idx_conflicts_resolved ON service_conflicts(resolved);

-- =====================================================
-- 9. HOLIDAY_CALENDAR TABLE
-- Holiday dates to skip in scheduling
-- =====================================================
CREATE TABLE IF NOT EXISTS holiday_calendar (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL UNIQUE, -- ISO date
  name TEXT NOT NULL,
  type TEXT CHECK(type IN ('national', 'regional', 'custom')) DEFAULT 'national',
  region TEXT, -- State/city for regional holidays
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_holidays_date ON holiday_calendar(date);
CREATE INDEX IF NOT EXISTS idx_holidays_region ON holiday_calendar(region);

-- =====================================================
-- 10. SERVICE_ANALYTICS TABLE
-- Track service performance metrics
-- =====================================================
CREATE TABLE IF NOT EXISTS service_analytics (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,
  offering_id TEXT,
  
  -- Metrics
  views_count INTEGER DEFAULT 0,
  bookings_count INTEGER DEFAULT 0,
  revenue_total REAL DEFAULT 0,
  rating_average REAL,
  rating_count INTEGER DEFAULT 0,
  
  -- Date tracking
  date TEXT NOT NULL, -- ISO date for daily aggregation
  
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
  FOREIGN KEY (offering_id) REFERENCES offerings(id) ON DELETE CASCADE,
  UNIQUE(service_id, offering_id, date)
);

CREATE INDEX IF NOT EXISTS idx_analytics_service ON service_analytics(service_id);
CREATE INDEX IF NOT EXISTS idx_analytics_offering ON service_analytics(offering_id);
CREATE INDEX IF NOT EXISTS idx_analytics_date ON service_analytics(date);

-- =====================================================
-- SEED DATA: Holiday Calendar (2026)
-- =====================================================
INSERT OR IGNORE INTO holiday_calendar (id, date, name, type) VALUES
  ('hol_2026_rep_day', '2026-01-26', 'Republic Day', 'national'),
  ('hol_2026_holi', '2026-03-14', 'Holi', 'national'),
  ('hol_2026_good_fri', '2026-04-03', 'Good Friday', 'national'),
  ('hol_2026_eid', '2026-04-21', 'Eid ul-Fitr', 'national'),
  ('hol_2026_ind_day', '2026-08-15', 'Independence Day', 'national'),
  ('hol_2026_gandhi', '2026-10-02', 'Gandhi Jayanti', 'national'),
  ('hol_2026_dussehra', '2026-10-22', 'Dussehra', 'national'),
  ('hol_2026_diwali', '2026-11-11', 'Diwali', 'national'),
  ('hol_2026_christmas', '2026-12-25', 'Christmas', 'national');
