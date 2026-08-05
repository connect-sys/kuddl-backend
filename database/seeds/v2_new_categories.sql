-- V2 new categories seed — Drama & Theatre, Tech Classes (Bloom) + Daycare (Care).
-- Idempotent: safe to run multiple times. Apply to BOTH the Cloudflare D1 prod DB
-- and the GCP Postgres DB (adjust boolean/`INSERT OR REPLACE` syntax for Postgres:
-- use `INSERT ... ON CONFLICT (id) DO UPDATE SET ...` and `true` booleans).
--
-- These make the new partner service-types resolve their ABCD category server-side
-- (service_type_registry) and give customers clean subcategory labels/filter chips
-- (subcategories) so Drama & Theatre / Tech Classes appear under Bloom and Daycare
-- under Care.

-- ── service_type_registry (partner picker + category derivation) ───────────────
INSERT OR REPLACE INTO service_type_registry (id, label, category, is_active, sort_order) VALUES
  ('drama_theatre', 'Drama & Theatre', 'bloom', true, 20),
  ('tech_classes',  'Tech Classes',    'bloom', true, 21),
  ('daycare',       'Daycare',         'care',  true, 22);

-- ── subcategories (customer-facing labels + filter chips) ──────────────────────
INSERT OR REPLACE INTO subcategories (id, category_id, name, slug, description, is_active, sort_order) VALUES
  ('bloom_drama_theatre', 'cat_bloom', 'Drama & Theatre', 'drama-theatre', 'Acting, storytelling and performing arts classes for kids', true, 20),
  ('bloom_tech_classes',  'cat_bloom', 'Tech Classes',    'tech-classes',  'Coding, Robotics, AI, STEM and Electronics classes for kids', true, 21),
  ('care_daycare',        'cat_care',  'Daycare',         'daycare',       'Full-day and half-day daycare programmes', true, 20);
