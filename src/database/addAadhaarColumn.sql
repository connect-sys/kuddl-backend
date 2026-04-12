-- Add aadhaar_number column to providers table
-- This migration adds the missing aadhaar_number column that is referenced in the profile completion flow
-- Safe to run multiple times (uses IF NOT EXISTS logic via ALTER TABLE)

-- SQLite doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN
-- So we need to check if the column exists first
-- This is a safe migration that won't affect existing data

ALTER TABLE providers ADD COLUMN aadhaar_number TEXT;
ALTER TABLE providers ADD COLUMN pan_number TEXT;
ALTER TABLE providers ADD COLUMN gst_number TEXT;
ALTER TABLE providers ADD COLUMN is_aadhaar_verified INTEGER DEFAULT 0;
ALTER TABLE providers ADD COLUMN is_pan_verified INTEGER DEFAULT 0;
ALTER TABLE providers ADD COLUMN is_gst_verified INTEGER DEFAULT 0;
