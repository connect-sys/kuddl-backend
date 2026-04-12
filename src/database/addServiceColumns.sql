-- Add missing columns to services table
-- This migration adds columns that are referenced in the service creation flow
-- Safe to run multiple times (SQLite will error if column exists, but won't break)

ALTER TABLE services ADD COLUMN special_requirements TEXT;
ALTER TABLE services ADD COLUMN cancellation_policy TEXT;
ALTER TABLE services ADD COLUMN age_group_min INTEGER;
ALTER TABLE services ADD COLUMN age_group_max INTEGER;
ALTER TABLE services ADD COLUMN max_children INTEGER DEFAULT 1;
