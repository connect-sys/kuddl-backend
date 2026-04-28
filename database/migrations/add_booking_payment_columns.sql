-- Add platform_fee and provider_amount columns to bookings table
ALTER TABLE bookings ADD COLUMN platform_fee REAL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN provider_amount REAL DEFAULT 0;

-- Update existing bookings to calculate platform_fee and provider_amount
-- Platform fee is 10% of total_amount, provider gets 90%
UPDATE bookings 
SET platform_fee = total_amount * 0.10,
    provider_amount = total_amount * 0.90
WHERE platform_fee IS NULL OR provider_amount IS NULL;
