-- Add duration_minutes column to bookings table
ALTER TABLE bookings ADD COLUMN duration_minutes INTEGER;

-- Update existing bookings to calculate duration_minutes from duration_hours
UPDATE bookings SET duration_minutes = CAST(duration_hours * 60 AS INTEGER) WHERE duration_minutes IS NULL;
