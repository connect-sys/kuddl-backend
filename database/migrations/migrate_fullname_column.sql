-- Migration: Copy data from full_name to fullname and drop full_name column
-- Date: 2026-04-27

-- Step 1: Copy data from full_name to fullname
UPDATE parents 
SET fullname = full_name 
WHERE full_name IS NOT NULL AND (fullname IS NULL OR fullname = '');

-- Step 2: SQLite doesn't support DROP COLUMN directly in older versions
-- We need to recreate the table without the full_name column

-- Create new table without full_name
CREATE TABLE parents_new (
  id TEXT PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  email TEXT,
  fullname TEXT,
  address TEXT,
  alternate_contact_name TEXT,
  alternate_contact_phone TEXT,
  gender TEXT,
  date_of_birth TEXT,
  profile_picture TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,
  country TEXT DEFAULT 'India',
  is_verified INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  total_bookings INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Copy data from old table to new table
INSERT INTO parents_new (
  id, phone, email, fullname, address, alternate_contact_name, alternate_contact_phone,
  gender, date_of_birth, profile_picture, city, state, pincode, country,
  is_verified, is_active, total_bookings, created_at, updated_at
)
SELECT 
  id, phone, email, 
  COALESCE(fullname, full_name) as fullname,  -- Use fullname if exists, otherwise full_name
  address, alternate_contact_name, alternate_contact_phone,
  gender, date_of_birth, profile_picture, city, state, pincode, country,
  is_verified, is_active, total_bookings, created_at, updated_at
FROM parents;

-- Drop old table
DROP TABLE parents;

-- Rename new table to parents
ALTER TABLE parents_new RENAME TO parents;
