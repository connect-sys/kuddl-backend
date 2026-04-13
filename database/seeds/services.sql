-- Services Seed Data
-- Insert popular services for each subcategory

-- Birthday Party Services
INSERT OR REPLACE INTO services (id, subcategory_id, name, slug, description, short_description, price_range, duration, age_group, is_active, sort_order) VALUES
('srv_birthday_basic', 'sub_birthday_parties', 'Basic Birthday Package', 'basic-birthday-package', 'Complete birthday party setup with decorations, cake, and entertainment', 'Basic party package with decorations and cake', '₹5,000 - ₹10,000', '3-4 hours', '3-12 years', true, 1),
('srv_birthday_premium', 'sub_birthday_parties', 'Premium Birthday Package', 'premium-birthday-package', 'Luxury birthday celebration with premium decorations, entertainment, and catering', 'Premium party with entertainment and catering', '₹15,000 - ₹25,000', '4-5 hours', '3-12 years', true, 2),
('srv_birthday_custom', 'sub_birthday_parties', 'Custom Birthday Theme', 'custom-birthday-theme', 'Fully customized birthday party based on child preferences', 'Personalized themed birthday celebration', '₹8,000 - ₹20,000', '3-5 hours', '3-12 years', true, 3);

-- Themed Party Services
INSERT OR REPLACE INTO services (id, subcategory_id, name, slug, description, short_description, price_range, duration, age_group, is_active, sort_order) VALUES
('srv_superhero_party', 'sub_themed_parties', 'Superhero Theme Party', 'superhero-theme-party', 'Action-packed superhero themed party with costumes and activities', 'Superhero themed celebration', '₹6,000 - ₹12,000', '3-4 hours', '4-10 years', true, 1),
('srv_princess_party', 'sub_themed_parties', 'Princess Theme Party', 'princess-theme-party', 'Magical princess party with royal decorations and dress-up', 'Royal princess themed party', '₹6,000 - ₹12,000', '3-4 hours', '3-8 years', true, 2),
('srv_cartoon_party', 'sub_themed_parties', 'Cartoon Character Party', 'cartoon-character-party', 'Fun party featuring popular cartoon characters', 'Cartoon character themed celebration', '₹5,500 - ₹11,000', '3-4 hours', '2-8 years', true, 3);

-- Babysitting Services
INSERT OR REPLACE INTO services (id, subcategory_id, name, slug, description, short_description, price_range, duration, age_group, is_active, sort_order) VALUES
('srv_babysitting_hourly', 'sub_babysitting', 'Hourly Babysitting', 'hourly-babysitting', 'Professional babysitting services on hourly basis', 'Flexible hourly childcare', '₹200 - ₹400/hour', 'Flexible', '6 months - 12 years', true, 1),
('srv_babysitting_overnight', 'sub_babysitting', 'Overnight Babysitting', 'overnight-babysitting', 'Overnight care for children when parents are away', 'Overnight childcare service', '₹1,500 - ₹2,500/night', '8-12 hours', '1-12 years', true, 2),
('srv_babysitting_emergency', 'sub_babysitting', 'Emergency Babysitting', 'emergency-babysitting', 'Last-minute babysitting for urgent situations', 'Emergency childcare support', '₹300 - ₹500/hour', 'As needed', '6 months - 12 years', true, 3);

-- Academic Tutoring Services
INSERT OR REPLACE INTO services (id, subcategory_id, name, slug, description, short_description, price_range, duration, age_group, is_active, sort_order) VALUES
('srv_math_tutoring', 'sub_academic_tutoring', 'Mathematics Tutoring', 'mathematics-tutoring', 'Comprehensive math tutoring for all grades', 'Expert math tutoring', '₹500 - ₹1,000/session', '1-2 hours', '5-18 years', true, 1),
('srv_english_tutoring', 'sub_academic_tutoring', 'English Language Tutoring', 'english-tutoring', 'English grammar, writing, and literature tutoring', 'English language support', '₹400 - ₹800/session', '1-2 hours', '5-18 years', true, 2),
('srv_science_tutoring', 'sub_academic_tutoring', 'Science Tutoring', 'science-tutoring', 'Physics, Chemistry, and Biology tutoring', 'Science subject tutoring', '₹600 - ₹1,200/session', '1-2 hours', '8-18 years', true, 3),
('srv_homework_help', 'sub_academic_tutoring', 'Homework Assistance', 'homework-assistance', 'Daily homework help and study support', 'Homework help and guidance', '₹300 - ₹600/session', '1-2 hours', '5-15 years', true, 4);

-- Sports Coaching Services
INSERT OR REPLACE INTO services (id, subcategory_id, name, slug, description, short_description, price_range, duration, age_group, is_active, sort_order) VALUES
('srv_cricket_coaching', 'sub_sports_coaching', 'Cricket Coaching', 'cricket-coaching', 'Professional cricket training and coaching', 'Cricket skills development', '₹800 - ₹1,500/session', '1-2 hours', '6-16 years', true, 1),
('srv_football_coaching', 'sub_sports_coaching', 'Football Coaching', 'football-coaching', 'Football training for beginners to advanced', 'Football skills training', '₹700 - ₹1,300/session', '1-2 hours', '5-16 years', true, 2),
('srv_swimming_lessons', 'sub_sports_coaching', 'Swimming Lessons', 'swimming-lessons', 'Learn to swim with certified instructors', 'Swimming instruction', '₹1,000 - ₹2,000/session', '45-60 minutes', '4-16 years', true, 3),
('srv_badminton_coaching', 'sub_sports_coaching', 'Badminton Coaching', 'badminton-coaching', 'Badminton technique and gameplay training', 'Badminton skills development', '₹600 - ₹1,200/session', '1-1.5 hours', '6-16 years', true, 4);

-- Music Lessons Services
INSERT OR REPLACE INTO services (id, subcategory_id, name, slug, description, short_description, price_range, duration, age_group, is_active, sort_order) VALUES
('srv_piano_lessons', 'sub_music_lessons', 'Piano Lessons', 'piano-lessons', 'Learn piano from beginner to advanced levels', 'Piano instruction', '₹800 - ₹1,500/session', '45-60 minutes', '5-18 years', true, 1),
('srv_guitar_lessons', 'sub_music_lessons', 'Guitar Lessons', 'guitar-lessons', 'Acoustic and electric guitar lessons', 'Guitar instruction', '₹700 - ₹1,300/session', '45-60 minutes', '6-18 years', true, 2),
('srv_vocal_training', 'sub_music_lessons', 'Vocal Training', 'vocal-training', 'Voice training and singing lessons', 'Singing lessons', '₹600 - ₹1,200/session', '45-60 minutes', '5-18 years', true, 3),
('srv_violin_lessons', 'sub_music_lessons', 'Violin Lessons', 'violin-lessons', 'Classical violin instruction', 'Violin instruction', '₹800 - ₹1,500/session', '45-60 minutes', '6-18 years', true, 4);

-- Nanny Services
INSERT OR REPLACE INTO services (id, subcategory_id, name, slug, description, short_description, price_range, duration, age_group, is_active, sort_order) VALUES
('srv_nanny_fulltime', 'sub_nanny_services', 'Full-time Nanny', 'fulltime-nanny', 'Dedicated full-time nanny for complete childcare', 'Full-time childcare', '₹15,000 - ₹30,000/month', 'Full-time', '0-12 years', true, 1),
('srv_nanny_parttime', 'sub_nanny_services', 'Part-time Nanny', 'parttime-nanny', 'Part-time nanny for specific hours', 'Part-time childcare', '₹8,000 - ₹18,000/month', 'Part-time', '0-12 years', true, 2),
('srv_nanny_weekend', 'sub_nanny_services', 'Weekend Nanny', 'weekend-nanny', 'Weekend childcare services', 'Weekend childcare', '₹1,000 - ₹2,000/day', 'Weekends', '0-12 years', true, 3);

-- Workshop Services
INSERT OR REPLACE INTO services (id, subcategory_id, name, slug, description, short_description, price_range, duration, age_group, is_active, sort_order) VALUES
('srv_art_workshop', 'sub_workshops', 'Art & Craft Workshop', 'art-craft-workshop', 'Creative art and craft activities for kids', 'Creative art activities', '₹500 - ₹1,000/session', '2-3 hours', '4-12 years', true, 1),
('srv_cooking_workshop', 'sub_workshops', 'Kids Cooking Workshop', 'cooking-workshop', 'Fun cooking activities for children', 'Kids cooking class', '₹800 - ₹1,500/session', '2-3 hours', '6-14 years', true, 2),
('srv_science_workshop', 'sub_workshops', 'Science Experiment Workshop', 'science-workshop', 'Hands-on science experiments and learning', 'Science experiments', '₹700 - ₹1,300/session', '2-3 hours', '6-14 years', true, 3),
('srv_robotics_workshop', 'sub_workshops', 'Robotics Workshop', 'robotics-workshop', 'Introduction to robotics and programming', 'Robotics and coding', '₹1,000 - ₹2,000/session', '3-4 hours', '8-16 years', true, 4);
