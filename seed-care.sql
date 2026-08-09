-- Demo Care (specialist) service for live end-to-end verification.
-- Mark the provider verified so the protected clinical title can render (§07.2).
UPDATE providers SET is_verified = 1 WHERE id = 'prov_bloom_002';

INSERT OR REPLACE INTO services
  (id, provider_id, name, slug, status, is_active, price_type, price, created_at, updated_at, care_pricing)
VALUES (
  'svc_care_demo_1',
  'prov_bloom_002',
  'Child Speech Therapy',
  'child-speech-therapy',
  'active',
  1,
  'per_session_flat',
  1200,
  datetime('now'),
  datetime('now'),
  '{"session_price":1200,"session_duration_minutes":45,"packages":[{"label":"6-session plan","sessions":6,"price":6600}],"claimed_title":"Clinical Psychologist","registration_number":"RCI-12345","age_min":2,"age_max":12,"mode":"offline"}'
);
