-- Migration: Rename 'name' column to 'fullname' in parents table
-- SQLite doesn't support direct column rename, so we need to recreate the table

-- Step 1: Create new parents table with 'fullname' column
CREATE TABLE IF NOT EXISTS parents_new (
    id TEXT PRIMARY KEY,
    phone TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    fullname TEXT,
    gender TEXT,
    date_of_birth DATE,
    profile_picture TEXT,
    address TEXT, -- JSON with full address
    alternate_contact TEXT, -- JSON with name and phone
    is_verified BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    total_bookings INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Step 2: Copy data from old table to new table
INSERT INTO parents_new (id, phone, email, fullname, gender, date_of_birth, profile_picture, address, alternate_contact, is_verified, is_active, total_bookings, created_at, updated_at)
SELECT id, phone, email, name, gender, date_of_birth, profile_picture, address, alternate_contact, is_verified, is_active, total_bookings, created_at, updated_at
FROM parents;

-- Step 3: Drop old table
DROP TABLE parents;

-- Step 4: Rename new table to parents
ALTER TABLE parents_new RENAME TO parents;
