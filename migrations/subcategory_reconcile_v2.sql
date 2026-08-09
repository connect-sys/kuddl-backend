-- =====================================================================
-- Subcategory reconciliation to Partner Form Mockups v2.
-- Safe + reversible: renames display names, ADDs 3 new Adventure rows, and
-- DEACTIVATES the excluded types (Decorators · Daycare · Japa). No deletes, so
-- no existing service is orphaned. Run on kuddl-dev first, then kuddl-prod.
-- =====================================================================

-- ---- Care: align display names to the mockup's fixed list --------------------
UPDATE subcategories SET name = 'Speech & Language Therapy'            WHERE id = 'care_speech_therapy';
UPDATE subcategories SET name = 'Pediatric Physiotherapy'             WHERE id = 'care_physiotherapy';
UPDATE subcategories SET name = 'Pediatric Nutrition'                 WHERE id = 'care_pediatric_nutrition_diet_planning';
UPDATE subcategories SET name = 'Sleep Consultation'                  WHERE id = 'care_pediatric_sleep_consulting';
UPDATE subcategories SET name = 'Infant Massage'                      WHERE id = 'care_infant_massage_therapy';
UPDATE subcategories SET name = 'Infant Grooming'                     WHERE id = 'care_infant_grooming_hygiene_care';
UPDATE subcategories SET name = 'Infant Ear Piercing'                 WHERE id = 'care_infant_ear_piercing_services';

-- ---- Care: deactivate excluded types (never on the platform) -----------------
UPDATE subcategories SET is_active = 0 WHERE id = 'care_daycare';
UPDATE subcategories SET is_active = 0 WHERE id = 'care_postnatal_caregiver_japa_services_';

-- ---- Adventure: align display names to the mockup's 9 party types ------------
UPDATE subcategories SET name = 'Performer'                           WHERE id = 'adventure_entertainment_live_performers';
UPDATE subcategories SET name = 'Photography — event coverage'        WHERE id = 'adventure_photographers';
UPDATE subcategories SET name = 'Bouncy / games zone'                 WHERE id = 'adventure_games_interaction_zones';
UPDATE subcategories SET name = 'DIY station'                         WHERE id = 'adventure_creative_diy_activities';
UPDATE subcategories SET name = 'Return favors'                       WHERE id = 'adventure_cakes_return_gifts';
UPDATE subcategories SET name = 'Premium add-on'                      WHERE id = 'adventure_premium_experience_add_ons';

-- ---- Adventure: deactivate Decorators (off the platform) ---------------------
UPDATE subcategories SET is_active = 0 WHERE id = 'adventure_party_decor_setups';

-- ---- Adventure: add the 3 new party-service types ---------------------------
INSERT OR IGNORE INTO subcategories (id, category_id, name, slug, is_active, sort_order, created_at, updated_at) VALUES
  ('adventure_party_host',   'cat_adventure', 'Party host / anchor',              'adventure-party-host-anchor',        1, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('adventure_photo_studio', 'cat_adventure', 'Photography — studio / milestone', 'adventure-photography-studio',       1, 21, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('adventure_play_venue',   'cat_adventure', 'Play-venue package',               'adventure-play-venue-package',       1, 22, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
