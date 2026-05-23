-- Public "Become a partner" form submissions.
-- Used by the marketing landing page so prospects can be triaged by the team
-- without creating an actual provider account.

CREATE TABLE IF NOT EXISTS partner_applications (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  phone         TEXT NOT NULL,
  company_name  TEXT,
  description   TEXT,
  documents     TEXT,           -- JSON array of {name, url, type, size}
  photos        TEXT,           -- JSON array of {name, url}
  source        TEXT DEFAULT 'become_partner_form',
  status        TEXT DEFAULT 'new',   -- new | contacted | converted | rejected
  notes         TEXT,
  created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at    TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_partner_applications_status     ON partner_applications(status);
CREATE INDEX IF NOT EXISTS idx_partner_applications_created_at ON partner_applications(created_at);
