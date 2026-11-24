-- =====================================================================
-- KLAY module (Klub House by KLAY, powered by Kuddl Kin) — schema v1
-- Self-contained: only NEW klay_* tables. No existing table is altered,
-- so applying this to any database cannot change current behaviour.
-- Hierarchy: city -> centre -> programme (a club at a centre) -> batch.
-- =====================================================================

-- Cities where KLAY runs. Pages populate from these rows (nothing hard-coded).
CREATE TABLE IF NOT EXISTS klay_cities (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,               -- 'pune' -> /klay/pune
  name TEXT NOT NULL,
  state TEXT,
  status TEXT NOT NULL DEFAULT 'live',     -- live | hidden
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Club types (activities) shown in "Explore by activity". Global catalogue;
-- a centre runs a club through a klay_programmes row.
CREATE TABLE IF NOT EXISTS klay_clubs (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,               -- 'dance'
  name TEXT NOT NULL,                      -- 'Dance'
  category_label TEXT,                     -- 'DANCE' | 'SPORT' | 'EARLY READING'
  category_group TEXT,                     -- 'PERFORMING ARTS' (booking eyebrow)
  tagline TEXT,                            -- one-line description
  color TEXT,                              -- card colour (hex)
  icon TEXT,                               -- dance | globe | book | ...
  levels TEXT,                             -- JSON [{code,name}] e.g. L1 Explorer…
  levels_note TEXT,                        -- 'skill grades', 'reading stages'
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- A KLAY centre. Created by self-serve onboarding (status 'onboarding'),
-- goes 'pending' on submit and 'live' once a City Manager / HQ approves.
CREATE TABLE IF NOT EXISTS klay_centres (
  id TEXT PRIMARY KEY,
  city_id TEXT NOT NULL,
  slug TEXT NOT NULL,                      -- unique within the city
  name TEXT NOT NULL,                      -- 'KLAY Kalyani Nagar'
  area TEXT,                               -- 'Kalyani Nagar'
  address TEXT,
  pincode TEXT,
  lat REAL,
  lng REAL,
  rating REAL,                             -- shown only when set
  hours_note TEXT,                         -- 'after-school, from 4 PM'
  director_name TEXT,
  director_phone TEXT,
  director_email TEXT,
  status TEXT NOT NULL DEFAULT 'onboarding', -- onboarding | pending | live | paused
  agreement_signed_at TEXT,
  agreement_signed_by TEXT,
  submitted_at TEXT,
  approved_at TEXT,
  approved_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (city_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_klay_centres_city ON klay_centres(city_id, status);

-- Coaches. Full KYC lives in klay_coach_documents.
CREATE TABLE IF NOT EXISTS klay_coaches (
  id TEXT PRIMARY KEY,
  centre_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  qualifications TEXT,                     -- 'Trinity-trained · 8 yrs with kids'
  quote TEXT,
  rating REAL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | verified | rejected | inactive
  verified_at TEXT,
  verified_by TEXT,
  joined_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_klay_coaches_centre ON klay_coaches(centre_id);

-- One row per KYC item per coach. doc_type:
-- aadhaar | pan | address_proof | police_verification | bank_details | agreement
CREATE TABLE IF NOT EXISTS klay_coach_documents (
  id TEXT PRIMARY KEY,
  coach_id TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  file_key TEXT,                           -- R2 key (private; served via signed route)
  file_name TEXT,
  status TEXT NOT NULL DEFAULT 'uploaded', -- uploaded | verified | rejected
  note TEXT,
  uploaded_at TEXT,
  verified_at TEXT,
  verified_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (coach_id, doc_type)
);

-- A club as run at one centre ("Dance at KLAY Kalyani Nagar").
-- status: draft | pending (awaiting City Manager) | live | paused
CREATE TABLE IF NOT EXISTS klay_programmes (
  id TEXT PRIMARY KEY,
  centre_id TEXT NOT NULL,
  club_id TEXT NOT NULL,
  slug TEXT NOT NULL,                      -- 'dance' -> /klay/pune/kalyani-nagar/dance
  name TEXT NOT NULL,
  description TEXT,
  age_min INTEGER,
  age_max INTEGER,
  coach_id TEXT,
  what_to_bring TEXT,
  format_note TEXT,                        -- '8 sessions a month · small batch …'
  status TEXT NOT NULL DEFAULT 'pending',
  approved_at TEXT,
  approved_by TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (centre_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_klay_programmes_centre ON klay_programmes(centre_id, status);

-- Batches of a programme. Seats left =
--   capacity - booked_offline - (confirmed online seat bookings) - (active holds)
-- booked_offline is the Centre Director's manual count for seats KLAY sold
-- off-platform (not exclusive yet).
CREATE TABLE IF NOT EXISTS klay_batches (
  id TEXT PRIMARY KEY,
  programme_id TEXT NOT NULL,
  days TEXT NOT NULL,                      -- JSON ["wed","fri"]
  start_time TEXT NOT NULL,                -- 'HH:MM' 24h
  end_time TEXT NOT NULL,
  age_min INTEGER,
  age_max INTEGER,
  capacity INTEGER NOT NULL DEFAULT 0,
  booked_offline INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'live',     -- live | paused
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_klay_batches_programme ON klay_batches(programme_id);

-- Plans per programme: demo (free trial class), monthly, quarterly.
-- Price changes go through klay_approvals (pending_price).
CREATE TABLE IF NOT EXISTS klay_plans (
  id TEXT PRIMARY KEY,
  programme_id TEXT NOT NULL,
  kind TEXT NOT NULL,                      -- demo | monthly | quarterly
  label TEXT NOT NULL,                     -- 'Free demo'
  subtitle TEXT,                           -- 'Try one class'
  sessions INTEGER,
  months INTEGER,
  price INTEGER NOT NULL DEFAULT 0,        -- rupees
  discount_pct INTEGER DEFAULT 0,
  takes_seat INTEGER NOT NULL DEFAULT 1,   -- demo = 0 (does not use a seat)
  status TEXT NOT NULL DEFAULT 'live',
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (programme_id, kind)
);

-- Parent bookings. status: held -> confirmed (paid / free demo) | expired | cancelled.
-- A 'held' row reserves a seat until hold_expires_at (10 min).
CREATE TABLE IF NOT EXISTS klay_bookings (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,          -- short human code e.g. KLAY-7H3K2Q
  programme_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  centre_id TEXT NOT NULL,
  city_id TEXT NOT NULL,
  plan_kind TEXT NOT NULL,
  takes_seat INTEGER NOT NULL DEFAULT 1,
  parent_name TEXT NOT NULL,
  parent_phone TEXT NOT NULL,
  parent_email TEXT,
  child_name TEXT NOT NULL,
  child_age INTEGER,
  customer_id TEXT,                        -- Kuddl customer account, when logged in
  amount INTEGER NOT NULL DEFAULT 0,       -- rupees
  status TEXT NOT NULL,
  hold_expires_at TEXT,
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  consent_at TEXT,                         -- parental consent (DPDP)
  source TEXT NOT NULL DEFAULT 'online',   -- online
  confirmed_at TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_klay_bookings_batch ON klay_bookings(batch_id, status);
CREATE INDEX IF NOT EXISTS idx_klay_bookings_centre ON klay_bookings(centre_id, status);
CREATE INDEX IF NOT EXISTS idx_klay_bookings_order ON klay_bookings(razorpay_order_id);

-- Waitlist when a batch is full.
CREATE TABLE IF NOT EXISTS klay_waitlist (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  programme_id TEXT NOT NULL,
  parent_name TEXT NOT NULL,
  parent_phone TEXT NOT NULL,
  parent_email TEXT,
  child_name TEXT,
  status TEXT NOT NULL DEFAULT 'waiting',  -- waiting | notified | converted | removed
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_klay_waitlist_batch ON klay_waitlist(batch_id, status);

-- Levels & certificates: a child's progress up the club's level ladder.
CREATE TABLE IF NOT EXISTS klay_level_awards (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  programme_id TEXT NOT NULL,
  level_code TEXT NOT NULL,                -- 'L1'
  level_name TEXT NOT NULL,                -- 'Explorer'
  certificate_no TEXT NOT NULL UNIQUE,
  awarded_by TEXT,
  awarded_at TEXT NOT NULL,
  UNIQUE (booking_id, level_code)
);

-- Console accounts. role: hq | city | centre | coach.
-- Scope: city -> city_id; centre -> centre_id; coach -> coach_id (+centre_id).
CREATE TABLE IF NOT EXISTS klay_staff (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  role TEXT NOT NULL,
  city_id TEXT,
  centre_id TEXT,
  coach_id TEXT,
  password_hash TEXT NOT NULL,             -- pbkdf2$<iter>$<salt b64>$<hash b64>
  status TEXT NOT NULL DEFAULT 'active',   -- active | disabled
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Approvals: new programmes, price changes, centre go-live.
-- type: programme | price | centre
CREATE TABLE IF NOT EXISTS klay_approvals (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  ref_id TEXT NOT NULL,                    -- programme / plan / centre id
  centre_id TEXT,
  city_id TEXT,
  payload TEXT,                            -- JSON (e.g. {old_price,new_price})
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  requested_by TEXT,
  decided_by TEXT,
  decided_at TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_klay_approvals_status ON klay_approvals(status, city_id);

-- Funnel events for "where parents drop off": page_view (national/city),
-- centre_view, booking_start, paid. Anonymous session id only (no PII).
CREATE TABLE IF NOT EXISTS klay_events (
  id TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  session_id TEXT,
  city_id TEXT,
  centre_id TEXT,
  programme_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_klay_events_event ON klay_events(event, created_at);

-- Audit trail: every console change (who did what, when).
CREATE TABLE IF NOT EXISTS klay_audit_log (
  id TEXT PRIMARY KEY,
  staff_id TEXT,
  staff_role TEXT,
  action TEXT NOT NULL,                    -- e.g. batch.seats.update
  entity TEXT,
  entity_id TEXT,
  detail TEXT,                             -- JSON
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_klay_audit_entity ON klay_audit_log(entity, entity_id);
