-- =====================================================================
-- KLAY module v2 — multi-centre partner organisations.
-- A KLAY-model organisation belongs to a normal partner account
-- (providers.id = the HQ login). Kuddl admin switches the model on and sets
-- the subscription limits (users / centres). Team members (City Manager,
-- Centre Director, Coach) live in klay_staff with the org's id.
-- Only touches klay_* tables.
-- =====================================================================
CREATE TABLE IF NOT EXISTS klay_orgs (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL UNIQUE,        -- the HQ partner account
  name TEXT NOT NULL,                      -- 'KLAY'
  brand_name TEXT,                         -- 'Klub House by KLAY'
  status TEXT NOT NULL DEFAULT 'active',   -- active | disabled
  plan_label TEXT,                         -- e.g. 'Pilot'
  max_users INTEGER NOT NULL DEFAULT 5,    -- team logins allowed (HQ itself not counted)
  max_centres INTEGER NOT NULL DEFAULT 1,
  enabled_by TEXT,
  enabled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE klay_staff ADD COLUMN org_id TEXT;
ALTER TABLE klay_staff ADD COLUMN provider_id TEXT;   -- set only for the HQ row
ALTER TABLE klay_centres ADD COLUMN org_id TEXT;
ALTER TABLE klay_approvals ADD COLUMN org_id TEXT;
ALTER TABLE klay_audit_log ADD COLUMN org_id TEXT;
CREATE INDEX IF NOT EXISTS idx_klay_staff_org ON klay_staff(org_id);
CREATE INDEX IF NOT EXISTS idx_klay_staff_phone ON klay_staff(phone);
CREATE INDEX IF NOT EXISTS idx_klay_staff_provider ON klay_staff(provider_id);
CREATE INDEX IF NOT EXISTS idx_klay_centres_org ON klay_centres(org_id);
