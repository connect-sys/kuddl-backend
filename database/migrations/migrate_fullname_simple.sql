-- Migration: Copy data from full_name to fullname and drop full_name column
-- Date: 2026-04-27

-- Step 1: Copy data from full_name to fullname
UPDATE parents 
SET fullname = full_name 
WHERE full_name IS NOT NULL;

-- Step 2: Create new table without full_name
CREATE TABLE parents_new (
  id TEXT PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  email TEXT,
  fullname TEXT,
  gender TEXT,
  date_of_birth DATE,
  profile_picture TEXT,
  address TEXT,
  alternate_contact TEXT,
  is_verified BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  total_bookings INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Step 3: Copy all data to new table
INSERT INTO parents_new (
  id, phone, email, fullname, gender, date_of_birth, profile_picture,
  address, alternate_contact, is_verified, is_active, total_bookings,
  created_at, updated_at
)
SELECT 
  id, phone, email, 
  COALESCE(fullname, full_name) as fullname,
  gender, date_of_birth, profile_picture,
  address, alternate_contact, is_verified, is_active, total_bookings,
  created_at, updated_at
FROM parents;

-- Step 4: Drop old table
DROP TABLE parents;

-- Step 5: Rename new table
ALTER TABLE parents_new RENAME TO parents;
