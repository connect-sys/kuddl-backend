-- Categories Seed Data
-- Insert main service categories

INSERT OR REPLACE INTO categories (id, name, slug, description, icon, color, is_active, sort_order) VALUES
('cat_adventure', 'Kuddl Adventure', 'adventure', 'Kids parties, events and celebration experiences', 'PartyPopper', '#FF6B6B', true, 1),
('cat_bloom', 'Kuddl Bloom', 'bloom', 'Kids learning, sports and developmental classes', 'Sparkles', '#4ECDC4', true, 2),
('cat_care', 'Kuddl Care', 'care', 'Care & Therapy services for children', 'Heart', '#45B7D1', true, 3),
('cat_discover', 'Kuddl Discover', 'discover', 'Kids workshops and events near you', 'Search', '#96CEB4', true, 4);

-- Subcategories Seed Data (from actual platform data)
-- Adventure subcategories
INSERT OR REPLACE INTO subcategories (id, category_id, name, slug, description, is_active, sort_order) VALUES
('adventure_kids_parties', 'cat_adventure', 'Kids Parties', 'kids-parties', 'Birthday parties and celebration events for children', true, 1),
('adventure_events_and_celebrations', 'cat_adventure', 'Events and Celebrations', 'events-and-celebrations', 'Special events and celebration experiences', true, 2),
('adventure_party_decor_setups', 'cat_adventure', 'Party Decor & Setups', 'party-decor-setups', 'Professional party decoration and setup services', true, 3),
('adventure_entertainment_live_performers', 'cat_adventure', 'Entertainment & Live Performers', 'entertainment-live-performers', 'Live entertainment and performers for events', true, 4),
('adventure_active_play_bouncies', 'cat_adventure', 'Active Play & Bouncies', 'active-play-bouncies', 'Bouncy castles and active play equipment', true, 5),
('adventure_creative_diy_activities', 'cat_adventure', 'Creative & DIY Activities', 'creative-diy-activities', 'Creative and do-it-yourself activity stations', true, 6),
('adventure_games_interaction_zones', 'cat_adventure', 'Games & Interaction Zones', 'games-interaction-zones', 'Interactive games and activity zones', true, 7),
('adventure_cakes_return_gifts', 'cat_adventure', 'Cakes & Return Gifts', 'cakes-return-gifts', 'Custom cakes and return gift services', true, 8),
('adventure_photographers', 'cat_adventure', 'Photographers', 'photographers', 'Professional photography services for events', true, 9),
('adventure_videographers', 'cat_adventure', 'Videographers', 'videographers', 'Professional videography services for events', true, 10),
('adventure_premium_experience_add_ons', 'cat_adventure', 'Premium Experience Add-ons', 'premium-experience-add-ons', 'Premium add-on experiences for special events', true, 11),
('adventure_other', 'cat_adventure', 'Other', 'other', 'Other party and event services', true, 12);

-- Bloom subcategories
INSERT OR REPLACE INTO subcategories (id, category_id, name, slug, description, is_active, sort_order) VALUES
('bloom_kids_classes_for_brain_development', 'cat_bloom', 'Kids Classes for Brain Development', 'kids-classes-for-brain-development', 'Classes focused on cognitive and brain development', true, 1),
('bloom_kids_learning_programmes', 'cat_bloom', 'Kids Learning Programmes', 'kids-learning-programmes', 'Educational learning programmes for children', true, 2),
('bloom_sports_coaching', 'cat_bloom', 'Sports Coaching', 'sports-coaching', 'Sports training and coaching programmes', true, 3),
('bloom_developmental_classes', 'cat_bloom', 'Developmental Classes', 'developmental-classes', 'Classes for overall child development', true, 4),
('bloom_sensory_integration_therapy', 'cat_bloom', 'Sensory Integration Therapy', 'sensory-integration-therapy', 'Therapy for sensory processing development', true, 5),
('bloom_early_childhood_education', 'cat_bloom', 'Early Childhood Education', 'early-childhood-education', 'Foundational education for young children', true, 6),
('bloom_phonics_literacy_classes', 'cat_bloom', 'Phonics & Literacy Classes', 'phonics-literacy-classes', 'Reading and literacy skill development', true, 7),
('bloom_music_classes', 'cat_bloom', 'Music Classes', 'music-classes', 'Musical education and instrument training', true, 8),
('bloom_child_yoga_mindfulness_classes', 'cat_bloom', 'Child Yoga & Mindfulness Classes', 'child-yoga-mindfulness-classes', 'Yoga and mindfulness practices for children', true, 9),
('bloom_visual_arts_creative_classes', 'cat_bloom', 'Visual Arts & Creative Classes', 'visual-arts-creative-classes', 'Art and creative expression classes', true, 10),
('bloom_dance_movement_classes', 'cat_bloom', 'Dance & Movement Classes', 'dance-movement-classes', 'Dance and movement education', true, 11),
('bloom_montessori_education_programmes', 'cat_bloom', 'Montessori Education Programmes', 'montessori-education-programmes', 'Montessori-based educational programmes', true, 12),
('bloom_other', 'cat_bloom', 'Other', 'other', 'Other learning and developmental programmes', true, 13);

-- Care subcategories
INSERT OR REPLACE INTO subcategories (id, category_id, name, slug, description, is_active, sort_order) VALUES
('care_infant_postnatal_care', 'cat_care', 'Infant & Postnatal Care', 'infant-postnatal-care', 'Comprehensive infant and postnatal care services', true, 1),
('care_infant_massage_therapy', 'cat_care', 'Infant Massage Therapy', 'infant-massage-therapy', 'Therapeutic massage for infants', true, 2),
('care_postnatal_caregiver_japa_services_', 'cat_care', 'Postnatal Caregiver (Japa Services)', 'postnatal-caregiver-japa-services', 'Traditional postnatal care and support', true, 3),
('care_pediatric_home_nursing_care', 'cat_care', 'Pediatric Home Nursing Care', 'pediatric-home-nursing-care', 'Professional nursing care at home', true, 4),
('care_lactation_consultation', 'cat_care', 'Lactation Consultation', 'lactation-consultation', 'Expert lactation support and consultation', true, 5),
('care_infant_grooming_hygiene_care', 'cat_care', 'Infant Grooming & Hygiene Care', 'infant-grooming-hygiene-care', 'Professional infant grooming and hygiene services', true, 6),
('care_infant_ear_piercing_services', 'cat_care', 'Infant Ear Piercing Services', 'infant-ear-piercing-services', 'Safe and hygienic ear piercing for infants', true, 7),
('care_therapy_clinical_support', 'cat_care', 'Therapy & Clinical Support', 'therapy-clinical-support', 'Professional therapy and clinical services', true, 8),
('care_speech_therapy', 'cat_care', 'Speech Therapy', 'speech-therapy', 'Speech and language development therapy', true, 9),
('care_physiotherapy', 'cat_care', 'Physiotherapy', 'physiotherapy', 'Pediatric physiotherapy services', true, 10),
('care_pediatric_occupational_therapy_ot_', 'cat_care', 'Pediatric Occupational Therapy (OT)', 'pediatric-occupational-therapy-ot', 'Occupational therapy for children', true, 11),
('care_child_psychology_counselling', 'cat_care', 'Child Psychology & Counselling', 'child-psychology-counselling', 'Psychological support and counseling for children', true, 12),
('care_special_education_early_intervention', 'cat_care', 'Special Education & Early Intervention', 'special-education-early-intervention', 'Special education and early intervention programs', true, 13),
('care_wellness_nutrition', 'cat_care', 'Wellness & Nutrition', 'wellness-nutrition', 'Health, wellness and nutrition services', true, 14),
('care_pediatric_nutrition_diet_planning', 'cat_care', 'Pediatric Nutrition & Diet Planning', 'pediatric-nutrition-diet-planning', 'Professional nutrition and diet planning for children', true, 15),
('care_pediatric_sleep_consulting', 'cat_care', 'Pediatric Sleep Consulting', 'pediatric-sleep-consulting', 'Expert sleep consultation and support', true, 16),
('care_other', 'cat_care', 'Other', 'other', 'Other care and therapy services', true, 17);

-- Discover subcategories
INSERT OR REPLACE INTO subcategories (id, category_id, name, slug, description, is_active, sort_order) VALUES
('discover_workshops_events', 'cat_discover', 'Workshops & Events', 'workshops-events', 'Educational workshops and skill-building events', true, 1),
('discover_camps_holiday_programs', 'cat_discover', 'Camps & Holiday Programs', 'camps-holiday-programs', 'Seasonal camps and holiday programs', true, 2),
('discover_community_social_activities', 'cat_discover', 'Community & Social Activities', 'community-social-activities', 'Community engagement and social activities', true, 3),
('discover_other', 'cat_discover', 'Other', 'other', 'Other discovery and enrichment activities', true, 4);
