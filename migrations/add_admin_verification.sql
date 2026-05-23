-- Add admin verification gate for services and camps.
-- Newly created items default to is_verified = 0 (hidden from public).
-- Admin must flip is_verified = 1 for the item to appear on the customer portal.

-- SQLite doesn't allow ADD COLUMN IF NOT EXISTS; the runner should ignore
-- "duplicate column" errors on re-run.

ALTER TABLE services ADD COLUMN is_verified INTEGER DEFAULT 0;
ALTER TABLE camps    ADD COLUMN is_verified INTEGER DEFAULT 0;

-- Track who verified and when (nullable).
ALTER TABLE services ADD COLUMN verified_by TEXT;
ALTER TABLE services ADD COLUMN verified_at TEXT;
ALTER TABLE camps    ADD COLUMN verified_by TEXT;
ALTER TABLE camps    ADD COLUMN verified_at TEXT;

-- Backfill: existing rows are NOT auto-approved. Admin will need to verify them.
-- If you want to auto-approve existing rows for the current launch, run separately:
-- UPDATE services SET is_verified = 1 WHERE is_verified IS NULL OR is_verified = 0;
-- UPDATE camps    SET is_verified = 1 WHERE is_verified IS NULL OR is_verified = 0;
