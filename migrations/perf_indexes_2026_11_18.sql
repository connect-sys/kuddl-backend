-- 2026-11-18: D1 free-tier read quota was exhausted by full-table scans.
-- Lookups by provider and the admin list's per-service MIN(batch price) had no index.
-- Additive only: creates indexes, changes no data.
CREATE INDEX IF NOT EXISTS idx_services_provider ON services(provider_id);
CREATE INDEX IF NOT EXISTS idx_camps_provider ON camps(provider_id);
CREATE INDEX IF NOT EXISTS idx_batches_parent ON batches(parent_id);
CREATE INDEX IF NOT EXISTS idx_services_created ON services(created_at);
