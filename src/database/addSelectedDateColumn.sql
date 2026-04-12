-- Migration: Add selected_date column to bookings table
-- Date: 2026-03-23
-- Purpose: Fix "no such column: selected_date" error in availability queries

-- Add selected_date column to bookings table if it doesn't exist
ALTER TABLE bookings ADD COLUMN selected_date TEXT;

-- Update existing rows to copy booking_date to selected_date if null
UPDATE bookings SET selected_date = booking_date WHERE selected_date IS NULL;
