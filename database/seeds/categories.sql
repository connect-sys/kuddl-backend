-- Categories Seed Data
-- Insert main service categories

INSERT OR REPLACE INTO categories (id, name, slug, description, icon, color, is_active, sort_order) VALUES
('cat_adventure', 'Kuddl Adventure', 'adventure', 'Kids parties, events and celebration experiences', 'PartyPopper', '#FF6B6B', true, 1),
('cat_bloom', 'Kuddl Bloom', 'bloom', 'Kids learning, sports and developmental classes', 'Sparkles', '#4ECDC4', true, 2),
('cat_care', 'Kuddl Care', 'care', 'Care & Therapy services for children', 'Heart', '#45B7D1', true, 3),
('cat_discover', 'Kuddl Discover', 'discover', 'Kids workshops and events near you', 'Search', '#96CEB4', true, 4);

-- Subcategories Seed Data
-- Adventure subcategories
INSERT OR REPLACE INTO subcategories (id, category_id, name, slug, description, is_active, sort_order) VALUES
('sub_birthday_parties', 'cat_adventure', 'Birthday Parties', 'birthday-parties', 'Memorable birthday celebrations for kids', true, 1),
('sub_themed_parties', 'cat_adventure', 'Themed Parties', 'themed-parties', 'Superhero, princess, and other themed parties', true, 2),
('sub_event_planning', 'cat_adventure', 'Event Planning', 'event-planning', 'Complete event planning and management', true, 3),
('sub_entertainment', 'cat_adventure', 'Entertainment', 'entertainment', 'Clowns, magicians, and performers', true, 4);

-- Bloom subcategories
INSERT OR REPLACE INTO subcategories (id, category_id, name, slug, description, is_active, sort_order) VALUES
('sub_academic_tutoring', 'cat_bloom', 'Academic Tutoring', 'academic-tutoring', 'Subject-wise tutoring and homework help', true, 1),
('sub_sports_coaching', 'cat_bloom', 'Sports Coaching', 'sports-coaching', 'Cricket, football, swimming and other sports', true, 2),
('sub_music_lessons', 'cat_bloom', 'Music Lessons', 'music-lessons', 'Piano, guitar, vocals and music theory', true, 3),
('sub_art_craft', 'cat_bloom', 'Art & Craft', 'art-craft', 'Drawing, painting, and creative activities', true, 4),
('sub_dance_classes', 'cat_bloom', 'Dance Classes', 'dance-classes', 'Classical, contemporary, and folk dance', true, 5),
('sub_coding_robotics', 'cat_bloom', 'Coding & Robotics', 'coding-robotics', 'Programming and robotics for kids', true, 6);

-- Care subcategories
INSERT OR REPLACE INTO subcategories (id, category_id, name, slug, description, is_active, sort_order) VALUES
('sub_babysitting', 'cat_care', 'Babysitting', 'babysitting', 'Professional childcare and babysitting', true, 1),
('sub_nanny_services', 'cat_care', 'Nanny Services', 'nanny-services', 'Full-time and part-time nanny services', true, 2),
('sub_special_needs', 'cat_care', 'Special Needs Support', 'special-needs', 'Care for children with special needs', true, 3),
('sub_therapy', 'cat_care', 'Therapy Sessions', 'therapy', 'Speech, occupational, and behavioral therapy', true, 4),
('sub_elderly_care', 'cat_care', 'Elderly Care', 'elderly-care', 'Care services for elderly family members', true, 5);

-- Discover subcategories
INSERT OR REPLACE INTO subcategories (id, category_id, name, slug, description, is_active, sort_order) VALUES
('sub_workshops', 'cat_discover', 'Workshops', 'workshops', 'Educational and fun workshops for kids', true, 1),
('sub_camps', 'cat_discover', 'Summer Camps', 'camps', 'Day camps and activity programs', true, 2),
('sub_local_events', 'cat_discover', 'Local Events', 'local-events', 'Community events and activities', true, 3),
('sub_field_trips', 'cat_discover', 'Field Trips', 'field-trips', 'Educational outings and excursions', true, 4);
