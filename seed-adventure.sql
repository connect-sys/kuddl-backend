-- Demo Adventure (party) service for live end-to-end verification.
-- Everything party-shaped lives in the adventure_pricing JSON blob.
INSERT OR REPLACE INTO services
  (id, provider_id, name, slug, status, is_active, price_type, price, created_at, updated_at, adventure_pricing)
VALUES (
  'svc_adv_demo_1',
  'prov_bloom_002',
  'The Birthday Magic Show',
  'the-birthday-magic-show',
  'active',
  1,
  'fixed',
  4500,
  datetime('now'),
  datetime('now'),
  '{"variants":[{"label":"30 min","price":4500,"note":"travel included"},{"label":"45 min","price":6000},{"label":"60 min","price":7500}],"add_ons":[{"label":"Face painting station","price":2500},{"label":"30-min extension","price":1500}],"setup_questions":["How much open space is available?","Is there a power socket nearby?"],"age_min":3,"age_max":10,"capacity":40,"space":"medium"}'
);
