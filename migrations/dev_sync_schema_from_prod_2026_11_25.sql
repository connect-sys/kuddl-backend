-- Bring kuddl-dev schema up to prod (additive only). Generated 2026-11-25.
CREATE TABLE IF NOT EXISTS job_applications (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  job_title TEXT,
  applicant_name TEXT NOT NULL,
  applicant_email TEXT NOT NULL,
  applicant_phone TEXT,
  resume_url TEXT,
  cover_letter TEXT,
  linkedin_url TEXT,
  portfolio_url TEXT,
  experience_years INTEGER,
  current_company TEXT,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES job_postings(id)
);
CREATE TABLE IF NOT EXISTS academy_batch_timings (
              id TEXT PRIMARY KEY,
              provider_id TEXT NOT NULL,
              batch_name TEXT NOT NULL,
              day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
              start_time TEXT NOT NULL,
              duration_minutes INTEGER NOT NULL DEFAULT 120,
              max_capacity INTEGER NOT NULL DEFAULT 15,
              current_bookings INTEGER DEFAULT 0,
              is_active BOOLEAN DEFAULT TRUE,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (provider_id) REFERENCES providers(id)
            );
CREATE TABLE IF NOT EXISTS digilocker_sessions (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      status TEXT DEFAULT 'created',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
ALTER TABLE providers ADD COLUMN profile_image_url TEXT;
ALTER TABLE providers ADD COLUMN registration_number TEXT;
ALTER TABLE providers ADD COLUMN aadhaar_method TEXT;
ALTER TABLE providers ADD COLUMN aadhaar_review_status TEXT;
ALTER TABLE providers ADD COLUMN aadhaar_card_url TEXT;
ALTER TABLE providers ADD COLUMN aadhaar_card_back_url TEXT;
ALTER TABLE providers ADD COLUMN gst_details TEXT;
ALTER TABLE providers ADD COLUMN cin_number TEXT;
ALTER TABLE providers ADD COLUMN is_cin_verified INTEGER DEFAULT 0;
ALTER TABLE providers ADD COLUMN cin_details TEXT;
ALTER TABLE partner_availability ADD COLUMN working_hours TEXT;
ALTER TABLE partner_availability ADD COLUMN updated_at DATETIME;
ALTER TABLE bookings ADD COLUMN cancellation_reason TEXT;
ALTER TABLE parents ADD COLUMN full_name TEXT;
ALTER TABLE parents ADD COLUMN google_id TEXT;
ALTER TABLE services ADD COLUMN images TEXT;
ALTER TABLE services ADD COLUMN tags TEXT;
ALTER TABLE services ADD COLUMN deleted_at TEXT;
ALTER TABLE customer_reviews ADD COLUMN photos TEXT;
CREATE INDEX IF NOT EXISTS idx_parents_google_id ON parents(google_id);
CREATE INDEX IF NOT EXISTS idx_services_provider ON services(provider_id);
CREATE INDEX IF NOT EXISTS idx_services_created ON services(created_at);
