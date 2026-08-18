-- Bloom Build Spec v3.0 · Part A — batches carry the price.
-- Adds the three fields the batch model gains (A1/A5). Non-breaking:
-- new columns are nullable/defaulted, existing rows keep working.
--   class_type        group | solo   (existing batches are group)
--   sessions_per_month integer        (per-batch frequency; was service-level)
--   schedule_type     fixed | teacher_scheduled (solo can be teacher-scheduled)
ALTER TABLE batches ADD COLUMN class_type TEXT DEFAULT 'group';
ALTER TABLE batches ADD COLUMN sessions_per_month INTEGER;
ALTER TABLE batches ADD COLUMN schedule_type TEXT DEFAULT 'fixed';
