-- ============================================================
-- kuddl-prod sync migration: make prod match kuddl-dev schema
-- Generated: 2026-05-11
-- ============================================================

-- ─── 1. NEW TABLES ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS camps (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  camp_type TEXT NOT NULL CHECK (camp_type IN ('summer_camp','winter_camp','adventure_camp','art_camp','sports_camp','coding_camp','dance_camp','music_camp','theatre_camp','other')),
  category_id TEXT,
  subcategory_id TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  duration_days INTEGER,
  schedule_time TEXT,
  schedule_days TEXT,
  max_members INTEGER NOT NULL DEFAULT 20,
  current_enrolled INTEGER DEFAULT 0,
  price REAL NOT NULL DEFAULT 0,
  price_type TEXT DEFAULT 'camp' CHECK (price_type IN ('camp','per_day','per_week')),
  age_min INTEGER DEFAULT 4,
  age_max INTEGER DEFAULT 16,
  location TEXT,
  address TEXT,
  city TEXT,
  pincode TEXT,
  image_urls TEXT DEFAULT '[]',
  primary_image_url TEXT,
  features TEXT DEFAULT '[]',
  status TEXT DEFAULT 'active' CHECK (status IN ('active','inactive','full','completed','cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS camp_bookings (
  id TEXT PRIMARY KEY,
  camp_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  parent_id TEXT NOT NULL,
  child_id TEXT,
  child_name TEXT,
  child_age INTEGER,
  selected_start_date TEXT NOT NULL,
  selected_end_date TEXT NOT NULL,
  total_days INTEGER,
  total_amount REAL NOT NULL DEFAULT 0,
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending','paid','failed','refunded')),
  booking_status TEXT DEFAULT 'confirmed' CHECK (booking_status IN ('confirmed','attended','cancelled','no_show')),
  invoice_id TEXT UNIQUE,
  invoice_qr_url TEXT,
  invoice_data TEXT,
  special_requirements TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_subscriptions (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL UNIQUE,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('free', 'basic', 'premium', 'enterprise')),
  max_workers INTEGER DEFAULT 2,
  billing_cycle TEXT CHECK (billing_cycle IN ('monthly', 'yearly')),
  price_per_month REAL DEFAULT 0,
  subscription_start_date TEXT,
  subscription_end_date TEXT,
  is_active INTEGER DEFAULT 1,
  auto_renew INTEGER DEFAULT 0,
  payment_status TEXT CHECK (payment_status IN ('pending', 'paid', 'failed', 'cancelled')) DEFAULT 'paid',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscription_plans (
  id TEXT PRIMARY KEY,
  plan_name TEXT NOT NULL,
  plan_type TEXT NOT NULL UNIQUE CHECK (plan_type IN ('free', 'basic', 'premium', 'enterprise')),
  max_workers INTEGER NOT NULL,
  monthly_price REAL NOT NULL,
  yearly_price REAL NOT NULL,
  features TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ─── 2. MISSING COLUMNS: bookings ───────────────────────────

ALTER TABLE bookings ADD COLUMN selected_date TEXT;
ALTER TABLE bookings ADD COLUMN duration_minutes INTEGER;
ALTER TABLE bookings ADD COLUMN platform_fee REAL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN provider_amount REAL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN invoice_id TEXT;
ALTER TABLE bookings ADD COLUMN invoice_qr_url TEXT;
ALTER TABLE bookings ADD COLUMN invoice_data TEXT;

-- ─── 3. MISSING COLUMNS: service_type_registry ──────────────

ALTER TABLE service_type_registry ADD COLUMN title_placeholder TEXT;
ALTER TABLE service_type_registry ADD COLUMN pricing_units TEXT;

-- ─── 4. MISSING COLUMNS: providers ──────────────────────────

ALTER TABLE providers ADD COLUMN partner_type TEXT DEFAULT 'solo';
ALTER TABLE providers ADD COLUMN buffer_time_minutes INTEGER DEFAULT 15;
ALTER TABLE providers ADD COLUMN working_hours TEXT;
ALTER TABLE providers ADD COLUMN batch_timings TEXT;
