-- Replace all subcategories with the latest approved list
-- Runs safely on both kuddl-dev and kuddl-prod

-- 1. Remove all existing subcategories
DELETE FROM subcategories;

-- 2. Adventure subcategories
INSERT OR REPLACE INTO subcategories (id, category_id, name, slug, description, is_active, sort_order) VALUES
('adventure_kids_parties',                    'cat_adventure', 'Kid'' Parties',                  'kids-parties',                  'Birthday parties and celebration events for children',  1, 1),
('adventure_events_and_celebrations',         'cat_adventure', 'Events & Celebrations',           'events-and-celebrations',       'Special events and celebration experiences',            1, 2),
('adventure_party_decor_setups',              'cat_adventure', 'Party Decor & Setups',            'party-decor-setups',            'Professional party decoration and setup services',      1, 3),
('adventure_entertainment_live_performers',   'cat_adventure', 'Entertainment & Live Performers', 'entertainment-live-performers', 'Live entertainment and performers for events',           1, 4),
('adventure_active_play_bouncies',            'cat_adventure', 'Active Play & Bouncies',          'active-play-bouncies',          'Bouncy castles and active play equipment',              1, 5),
('adventure_creative_diy_activities',         'cat_adventure', 'Creative & DIY Activities',       'creative-diy-activities',       'Creative and do-it-yourself activity stations',         1, 6),
('adventure_games_interaction_zones',         'cat_adventure', 'Games & Interaction Zones',       'games-interaction-zones',       'Interactive games and activity zones',                  1, 7),
('adventure_cakes_return_gifts',              'cat_adventure', 'Cakes & Return Gifts',            'cakes-return-gifts',            'Custom cakes and return gift services',                 1, 8),
('adventure_photographers',                   'cat_adventure', 'Photographers',                   'photographers',                 'Professional photography services for events',          1, 9),
('adventure_videographers',                   'cat_adventure', 'Videographers',                   'videographers',                 'Professional videography services for events',          1, 10),
('adventure_premium_experience_add_ons',      'cat_adventure', 'Premium Experience Add-ons',      'premium-experience-add-ons',    'Premium add-on experiences for special events',         1, 11),
('adventure_other',                           'cat_adventure', 'Other',                           'adventure-other',               'Other party and event services',                        1, 12);

-- 3. Bloom subcategories
INSERT OR REPLACE INTO subcategories (id, category_id, name, slug, description, is_active, sort_order) VALUES
('bloom_kids_classes_for_brain_development',  'cat_bloom', 'Kids Classes for Brain Development',  'kids-classes-for-brain-development',  'Classes focused on cognitive and brain development',    1, 1),
('bloom_kids_learning_programmes',            'cat_bloom', 'Kids Learning Programmes',            'kids-learning-programmes',            'Educational learning programmes for children',         1, 2),
('bloom_sports_coaching',                     'cat_bloom', 'Sports Coaching',                     'sports-coaching',                     'Sports training and coaching programmes',              1, 3),
('bloom_developmental_classes',               'cat_bloom', 'Developmental Classes',               'developmental-classes',               'Classes for overall child development',                1, 4),
('bloom_sensory_integration_therapy',         'cat_bloom', 'Sensory Integration Therapy',         'sensory-integration-therapy',         'Therapy for sensory processing development',           1, 5),
('bloom_early_childhood_education',           'cat_bloom', 'Early Childhood Education',           'early-childhood-education',           'Foundational education for young children',            1, 6),
('bloom_phonics_literacy_classes',            'cat_bloom', 'Phonics & Literacy Classes',          'phonics-literacy-classes',            'Reading and literacy skill development',               1, 7),
('bloom_music_classes',                       'cat_bloom', 'Music Classes',                       'music-classes',                       'Musical education and instrument training',            1, 8),
('bloom_child_yoga_mindfulness_classes',      'cat_bloom', 'Child Yoga & Mindfulness Classes',    'child-yoga-mindfulness-classes',      'Yoga and mindfulness practices for children',          1, 9),
('bloom_visual_arts_creative_classes',        'cat_bloom', 'Visual Arts & Creative Classes',      'visual-arts-creative-classes',        'Art and creative expression classes',                 1, 10),
('bloom_dance_movement_classes',              'cat_bloom', 'Dance & Movement Classes',             'dance-movement-classes',              'Dance and movement education',                        1, 11),
('bloom_montessori_education_programmes',     'cat_bloom', 'Montessori Education Programmes',     'montessori-education-programmes',     'Montessori-based educational programmes',             1, 12),
('bloom_other',                               'cat_bloom', 'Other',                               'bloom-other',                         'Other learning and developmental programmes',          1, 13);

-- 4. Care subcategories
INSERT OR REPLACE INTO subcategories (id, category_id, name, slug, description, is_active, sort_order) VALUES
('care_infant_postnatal_care',                         'cat_care', 'Infant & Postnatal Care',                  'infant-postnatal-care',                  'Comprehensive infant and postnatal care services',                   1, 1),
('care_infant_massage_therapy',                        'cat_care', 'Infant Massage Therapy',                   'infant-massage-therapy',                 'Therapeutic massage for infants',                                    1, 2),
('care_postnatal_caregiver_japa_services_',            'cat_care', 'Postnatal Caregiver (Japa Services)',      'postnatal-caregiver-japa-services',      'Traditional postnatal care and support',                             1, 3),
('care_pediatric_home_nursing_care',                   'cat_care', 'Pediatric Home Nursing Care',              'pediatric-home-nursing-care',            'Professional nursing care at home',                                  1, 4),
('care_lactation_consultation',                        'cat_care', 'Lactation Consultation',                   'lactation-consultation',                 'Expert lactation support and consultation',                          1, 5),
('care_infant_grooming_hygiene_care',                  'cat_care', 'Infant Grooming & Hygiene Care',           'infant-grooming-hygiene-care',           'Professional infant grooming and hygiene services',                  1, 6),
('care_infant_ear_piercing_services',                  'cat_care', 'Infant Ear Piercing Services',             'infant-ear-piercing-services',           'Safe and hygienic ear piercing for infants',                         1, 7),
('care_therapy_clinical_support',                      'cat_care', 'Therapy & Clinical Support',               'therapy-clinical-support',               'Professional therapy and clinical services',                         1, 8),
('care_speech_therapy',                                'cat_care', 'Speech Therapy',                           'speech-therapy',                         'Speech and language development therapy',                            1, 9),
('care_physiotherapy',                                 'cat_care', 'Physiotherapy',                            'physiotherapy',                          'Pediatric physiotherapy services',                                   1, 10),
('care_pediatric_occupational_therapy_ot_',            'cat_care', 'Pediatric Occupational Therapy (OT)',      'pediatric-occupational-therapy-ot',      'Occupational therapy for children',                                  1, 11),
('care_child_psychology_counselling',                  'cat_care', 'Child Psychology & Counselling',           'child-psychology-counselling',           'Psychological support and counseling for children',                  1, 12),
('care_special_education_early_intervention',          'cat_care', 'Special Education & Early Intervention',   'special-education-early-intervention',   'Special education and early intervention programs',                  1, 13),
('care_wellness_nutrition',                            'cat_care', 'Wellness & Nutrition',                     'wellness-nutrition',                     'Health, wellness and nutrition services',                            1, 14),
('care_pediatric_nutrition_diet_planning',             'cat_care', 'Pediatric Nutrition & Diet Planning',      'pediatric-nutrition-diet-planning',      'Professional nutrition and diet planning for children',              1, 15),
('care_pediatric_sleep_consulting',                    'cat_care', 'Pediatric Sleep Consulting',               'pediatric-sleep-consulting',             'Expert sleep consultation and support',                             1, 16),
('care_other',                                         'cat_care', 'Other',                                    'care-other',                             'Other care and therapy services',                                    1, 17);

-- 5. Discover subcategories
INSERT OR REPLACE INTO subcategories (id, category_id, name, slug, description, is_active, sort_order) VALUES
('discover_workshops_events',           'cat_discover', 'Workshops & Events',            'workshops-events',           'Educational workshops and skill-building events',      1, 1),
('discover_camps_holiday_programs',     'cat_discover', 'Camps & Holiday Programs',      'camps-holiday-programs',     'Seasonal camps and holiday programs',                  1, 2),
('discover_community_social_activities','cat_discover', 'Community & Social Activities', 'community-social-activities','Community engagement and social activities',           1, 3),
('discover_other',                      'cat_discover', 'Other',                         'discover-other',             'Other discovery and enrichment activities',            1, 4);
