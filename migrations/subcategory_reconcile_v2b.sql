-- =====================================================================
-- Subcategory reconciliation v2b — the remaining Screen-H purge items.
-- · Planners ("Kids' Birthday Party Planners") are OFF the platform → archive
--   any services under them (deferred, not deleted) and deactivate the row.
-- · Rename "Tech Classes" → "Coding & Tech".
-- Safe + reversible. Run on kuddl-dev then kuddl-prod.
-- =====================================================================

-- Archive (unpublish) services under planners — deferred, not deleted.
UPDATE services SET status = 'archived', is_active = 0 WHERE subcategory_id = 'adventure_kids_parties';

-- Deactivate the planners subcategory.
UPDATE subcategories SET is_active = 0 WHERE id = 'adventure_kids_parties';

-- Rename Tech Classes → Coding & Tech (Screen H).
UPDATE subcategories SET name = 'Coding & Tech' WHERE id = 'bloom_tech_classes';
